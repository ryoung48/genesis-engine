import { expect, it } from "vitest"
import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import { DISTRIBUTION_TERRITORY as T } from "@/model/history/distribution/territory"
import { DISTRIBUTION_FIXTURE } from "@/test/history-run/fixtures/distribution"

it("offers substantial connected cuts away from the capital", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: Array.from({ length: 10 }, (_, i) =>
			[i - 1, i + 1].filter((n) => n >= 0 && n < 10),
		),
		desolate: [],
		seed: 42,
	})
	if (!world.provinces || !world.nations) throw new Error("Missing fixture")
	world.nations.assignment = new Int32Array(10)
	world.nations.seeds = Int32Array.from([0])
	world.nations.count = 1
	const territory = T.initialize({
		provinces: world.provinces,
		nations: world.nations,
	})
	const country = territory.countries.get(0)
	if (!country) throw new Error("Missing country")
	const cuts = T.cuts({ territory, country })
	const root = cuts.roots.find((id) => cuts.sizes.get(id) === 5)
	if (root === undefined) throw new Error("Missing balanced cut")
	const provinces = T.cutMembers({ cuts, root })
	expect(provinces).toHaveLength(5)
	T.split({ territory, country, provinces })
	expect(T.validate({ territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})

it("rechecks articulation revisions after sequential opposing captures", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1, 3], [0, 2, 4], [1, 3], [0, 2, 5], [1], [3]],
		desolate: [],
		seed: 42,
	})
	if (!world.provinces || !world.nations) throw new Error("Missing fixture")
	world.nations.assignment = Int32Array.from([0, 0, 0, 0, 1, 2])
	world.nations.seeds = Int32Array.from([0, 4, 5])
	world.nations.count = 3
	const territory = T.initialize({
		provinces: world.provinces,
		nations: world.nations,
	})
	expect(
		T.transfer({
			territory,
			attacker: 1,
			defender: 0,
			province: 1,
			ceiling: 10,
		}),
	).toBe(true)
	expect(
		T.transfer({
			territory,
			attacker: 2,
			defender: 0,
			province: 3,
			ceiling: 10,
		}),
	).toBe(false)
	expect(territory.countries.get(0)?.cacheRevision).toBe(1)
	expect(T.validate({ territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})

it("enforces an oversized star ceiling while retaining the core", () => {
	const count = 501,
		world = DISTRIBUTION_FIXTURE.world({
			neighbors: Array.from({ length: count }, (_, i) =>
				i === 0 ? Array.from({ length: count - 1 }, (_, j) => j + 1) : [0],
			),
			desolate: [],
			seed: 42,
		})
	if (!world.nations) throw new Error("Missing fixture")
	world.nations.assignment.fill(0)
	world.nations.count = 1
	world.nations.seeds = Int32Array.from([0])
	world.nations.colors = new Float32Array(3)
	const engine = DISTRIBUTION_ENGINE.create({ world })
	DISTRIBUTION_ENGINE.advanceYear({ engine })
	expect(
		Math.max(
			...[...engine.territory.countries.values()].map((c) => c.members.size),
		),
	).toBeLessThanOrEqual(500)
	expect(engine.territory.countries.get(0)?.capital).toBe(0)
	expect(T.validate({ territory: engine.territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})
it("partitions isolated residuals and keeps capitals through connected subtree cuts", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2], []],
		desolate: [],
		seed: 42,
	})
	if (!world.provinces || !world.nations) throw new Error("Missing fixture")
	const territory = T.initialize({
		provinces: world.provinces,
		nations: world.nations,
	})
	const c = [...territory.countries.values()].find((c) => c.members.size > 1)
	if (c) {
		const cuts = T.cuts({ territory, country: c })
		const cut = T.cutMembers({ cuts, root: cuts.roots[0] })
		const capital = c.capital
		T.split({ territory, country: c, provinces: cut })
		expect(c.capital).toBe(capital)
	}
	expect(T.validate({ territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})
