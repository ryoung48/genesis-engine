import { expect, it } from "vitest"
import { DISTRIBUTION_ATTACKS as A } from "@/model/history/distribution/attacks"
import { DISTRIBUTION_TARGETS as T } from "@/model/history/distribution/targets"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import { RNG } from "@/model/shared/random/rng"
import { DISTRIBUTION_FIXTURE } from "@/test/history-run/fixtures/distribution"

it("discourages quarter-size attackers and divides resistance across fronts", () => {
	expect(
		A.weight({ attackerSize: 25, defenderSize: 100, border: 1, gain: 0 }),
	).toBe(1 / 256)
	expect(
		A.captureProbability({ attackStrength: 25, defenseStrength: 100 / 4 }),
	).toBe(0.5)
	expect(
		A.captureProbability({ attackStrength: 25, defenseStrength: 100 }),
	).toBe(1 / 17)
	expect(A.bias({ gain: 0 })).toBe(1)
})

it("estimates completion from the existing annual capture budget and timeout", () => {
	expect(
		A.completionRatio({
			attackerSize: 100,
			defenderSize: 100,
			attackerFronts: 1,
			defenderFronts: 1,
		}),
	).toBe(0.4)
	expect(
		A.completionRatio({
			attackerSize: 100,
			defenderSize: 10,
			attackerFronts: 1,
			defenderFronts: 1,
		}),
	).toBe(1)
	expect(
		A.completionRatio({
			attackerSize: 100,
			defenderSize: 100,
			attackerFronts: 4,
			defenderFronts: 1,
		}),
	).toBeCloseTo(40 / 17 / 100)
})

it("retains the size penalty when an attacker has only one eligible neighbor", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: Array.from({ length: 126 }, (_, i) =>
			[i - 1, i + 1].filter((id) => id >= 0 && id < 126),
		),
		desolate: [],
		seed: 42,
	})
	if (!world.provinces || !world.nations) throw new Error("Missing fixture")
	world.nations.assignment = Int32Array.from({ length: 126 }, (_, i) =>
		i < 25 ? 0 : i < 125 ? 1 : 2,
	)
	world.nations.seeds = Int32Array.from([0, 124, 125])
	world.nations.count = 3
	const territory = DISTRIBUTION_TERRITORY.initialize({
		provinces: world.provinces,
		nations: world.nations,
	})
	const attacks = A.create()
	attacks.active.set(0, { id: 0, attacker: 1, defender: 2, start: 2 })
	attacks.nextId = 1
	A.declare({
		attacks,
		territory,
		target: T.project({ capacities: [126], year: 2 }),
		year: 3,
		rng: RNG.fromSource({
			random: () => 0.001,
			nonPositiveWeightBehavior: "undefined",
		}),
	})
	expect(attacks.declared).toHaveLength(0)
})

it("removes blocked attacks before dividing a defender's opening strength", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2, 3], [1, 4], [1], [2]],
		desolate: [],
		seed: 42,
	})
	if (!world.provinces || !world.nations) throw new Error("Missing fixture")
	world.nations.assignment = Int32Array.from([0, 0, 0, 1, 2])
	world.nations.seeds = Int32Array.from([0, 3, 4])
	world.nations.count = 3
	const territory = DISTRIBUTION_TERRITORY.initialize({
			provinces: world.provinces,
			nations: world.nations,
		}),
		attacks = A.create()
	attacks.active.set(0, { id: 0, attacker: 1, defender: 0, start: 2 })
	attacks.active.set(1, { id: 1, attacker: 2, defender: 0, start: 2 })
	A.resolve({
		attacks,
		territory,
		target: T.project({ capacities: [5], year: 3 }),
		year: 3,
		rng: RNG.fromSource({
			random: () => 0.2,
			nonPositiveWeightBehavior: "undefined",
		}),
	})
	expect(attacks.endReasons.blocked).toBe(1)
	expect(territory.owner[2]).toBe(0)
	expect(attacks.active.has(1)).toBe(true)
})

it("permits multiple incoming attacks with one outgoing target and no reciprocal pair", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2, 3], [1], [1]],
		desolate: [],
		seed: 42,
	})
	if (!world.provinces || !world.nations) throw new Error("Missing fixture")
	world.nations.assignment = Int32Array.from([0, 1, 2, 3])
	world.nations.seeds = Int32Array.from([0, 1, 2, 3])
	world.nations.count = 4
	const territory = DISTRIBUTION_TERRITORY.initialize({
		provinces: world.provinces,
		nations: world.nations,
	})
	const attacks = A.create()
	attacks.active.set(0, { id: 0, attacker: 0, defender: 1, start: 2 })
	attacks.nextId = 1
	A.declare({
		attacks,
		territory,
		target: T.project({ capacities: [4], year: 2 }),
		year: 3,
		rng: RNG.fromSource({
			random: () => 0,
			nonPositiveWeightBehavior: "undefined",
		}),
	})
	const rows = [...attacks.active.values()]
	expect(new Set(rows.map((a) => a.attacker)).size).toBe(rows.length)
	expect(rows.filter((a) => a.defender === 1).length).toBeGreaterThan(1)
	expect(rows.some((a) => a.attacker === 1 && a.defender === 0)).toBe(false)
	expect(
		rows.every((a) =>
			territory.countries.get(a.attacker)?.contacts.has(a.defender),
		),
	).toBe(true)
})
it("normalizes the same improving merger at both world scales", () => {
	for (const mass of [8, 8000]) {
		const before = T.histogram({ sizes: new Array<number>(mass).fill(1) })
		const target = {
			...T.project({ capacities: [], year: 2 }),
			targetN: mass / 2,
			targetMean: 2,
			countryShares: [0, 1, 0, 0, 0, 0, 0],
			territoryShares: [0, 1, 0, 0, 0, 0, 0],
			distributionApplicable: true,
		}
		const after = T.action({ observed: before, remove: [1, 1], add: [2] })
		const gain = T.gain({ before, after, target })
		expect(gain).toBeCloseTo(1, 9)
		expect(A.bias({ gain })).toBe(4)
	}
})
