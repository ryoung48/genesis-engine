import { beforeAll, describe, expect, it, vi } from "vitest"
import { BATTLE } from "@/model/history/sim/engine/events/battle"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import { TERRAIN } from "@/model/history/sim/engine/terrain"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import type { SharedRng } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"

let engine: HistoryState
let war: War
let levies: Float64Array
let rural: Float32Array

function isolated(p: number): boolean {
	return (
		!engine.desolate[p] &&
		STATE.isSovereign({ state: engine, p }) &&
		GOVERNMENT.govFamilyOfIndex(engine.governmentType[p]) !== "tribal" &&
		MILITARY.armySize({ state: engine, nation: p }) > 0
	)
}

function setup(): void {
	engine = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	for (const id of [...engine.activeWarIds])
		STATE.resolveWar({
			state: engine,
			war: engine.wars[id],
			transferred: [],
			receiver: engine.wars[id].attacker,
		})
	let attacker = -1
	let defender = -1
	for (let p = 0; p < engine.P && defender < 0; p++) {
		if (!isolated(p)) continue
		for (const nb of STATE.getNationNeighbors({ state: engine, nation: p }))
			if (isolated(nb)) {
				attacker = p
				defender = nb
				break
			}
	}
	if (defender < 0) throw new Error("no isolated settled neighbors")
	for (const nation of [attacker, defender])
		for (const other of [...engine.relationColumns[nation]])
			STATE.setRelation({
				state: engine,
				a: nation,
				b: other,
				rel: STATE.rel.NONE,
			})
	war = STATE.createActiveWar({
		state: engine,
		attacker,
		defender,
		rng: HISTORY_RNG.createHistoryRng(1),
	})
	levies = engine.levyCurrent.slice()
	rural = engine.popRuralCurrent.slice()
}

beforeAll(setup)

function reset({ attack, defend }: { attack: number; defend: number }): void {
	engine.levyCurrent.set(levies)
	engine.popRuralCurrent.set(rural)
	engine.levyCurrent[war.attacker] = attack
	engine.levyCurrent[war.defender] = defend
	war.deployed[war.attacker] = { levy: attack, regular: 0 }
	war.deployed[war.defender] = { levy: defend, regular: 0 }
	for (const nation of [war.attacker, war.defender]) {
		engine.regularCurrent[nation] = 0
		const interval = engine.militaryIntervals.get(nation)
		if (!interval) throw new Error("missing interval")
		interval.time = engine.time
		interval.reference = { levy: engine.levyCurrent[nation], regular: 0 }
		war.allocation[nation] = 1
		war.participants[nation] = nation === war.attacker ? "attacker" : "defender"
	}
	engine.militaryDirty.clear()
	engine.occupationCurrent.fill(-1)
	war.occupied.length = 0
	war.endTime = undefined
	engine.activeWarIds.add(war.idx)
}

function sequenceRng(values: number[]): SharedRng {
	const rng = HISTORY_RNG.createHistoryRng(7)
	let i = 0
	rng.random = () => values[Math.min(i++, values.length - 1)]
	return rng
}

describe("battle odds", () => {
	it("weights levies at 0.75 and regulars at 1 while reporting soldier counts", () => {
		reset({ attack: 100, defend: 0 })
		engine.regularCurrent[war.defender] = 100
		war.deployed[war.defender] = { levy: 0, regular: 100 }
		engine.militaryIntervals.get(war.defender)!.reference = {
			levy: 0,
			regular: 100,
		}
		const result = MILITARY.fight({
			state: engine,
			war,
			eventAttacker: war.attacker,
			attackerMultiplier: 1,
			defenderMultiplier: 1,
			rng: HISTORY_RNG.createHistoryRng(101),
		})
		expect(result.attackerArmy).toBe(100)
		expect(result.defenderArmy).toBe(100)
		expect(result.preBattleWinProbability).toBeCloseTo(
			0.75 ** 3 / (1 + 0.75 ** 3),
			12,
		)
		expect(engine.levyCurrent[war.attacker]).toBeCloseTo(
			100 * (1 - result.attackerLossShare),
			9,
		)
		expect(engine.regularCurrent[war.defender]).toBeCloseTo(
			100 * (1 - result.defenderLossShare),
			9,
		)
	})

	it("caps battle attendance in soldiers before applying troop strength", () => {
		reset({ attack: 1000, defend: 1000 })
		const limit = vi.spyOn(KNOWLEDGE, "maxFieldArmy").mockReturnValue(500)
		try {
			const result = MILITARY.fight({
				state: engine,
				war,
				eventAttacker: war.attacker,
				attackerMultiplier: 1,
				defenderMultiplier: 1,
				rng: HISTORY_RNG.createHistoryRng(102),
			})
			expect(result.attackerArmy).toBe(500)
			expect(result.defenderArmy).toBe(500)
			expect(result.preBattleWinProbability).toBeCloseTo(0.5, 12)
		} finally {
			limit.mockRestore()
		}
	})

	it("matches exponent-3 win probabilities analytically and empirically", () => {
		const rng = HISTORY_RNG.createHistoryRng(99)
		const expected: [number, number][] = [
			[0.5, 0.111],
			[1, 0.5],
			[1.5, 0.771],
			[2, 0.889],
		]
		for (const [ratio, probability] of expected) {
			let wins = 0
			const trials = 4000
			for (let t = 0; t < trials; t++) {
				reset({ attack: 1000 * ratio, defend: 1000 })
				const result = MILITARY.fight({
					state: engine,
					war,
					eventAttacker: war.attacker,
					attackerMultiplier: 1,
					defenderMultiplier: 1,
					rng,
				})
				expect(result.attackerArmy).toBeCloseTo(1000 * ratio, 6)
				expect(result.preBattleWinProbability).toBeCloseTo(probability, 3)
				if (result.attackerWon) wins++
			}
			expect(wins / trials).toBeCloseTo(probability, 1)
		}
	})

	it("applies the terrain defense to strength, not to troop counts", () => {
		const rng = HISTORY_RNG.createHistoryRng(3)
		reset({ attack: 3000, defend: 1200 })
		const result = MILITARY.fight({
			state: engine,
			war,
			eventAttacker: war.attacker,
			attackerMultiplier: 1,
			defenderMultiplier: 1.3,
			rng,
		})
		expect(result.attackerArmy).toBeCloseTo(3000, 6)
		expect(result.defenderArmy).toBeCloseTo(1200, 6)
		const strength = (3000 / (1200 * 1.3)) ** 3
		expect(result.preBattleWinProbability).toBeCloseTo(
			strength / (1 + strength),
			9,
		)
	})

	it("splits outcomes by the realized margin", () => {
		const rng = HISTORY_RNG.createHistoryRng(11)
		let inconclusive = 0
		let decisive = 0
		const trials = 8000
		for (let t = 0; t < trials; t++) {
			reset({ attack: 1000, defend: 1000 })
			const result = MILITARY.fight({
				state: engine,
				war,
				eventAttacker: war.attacker,
				attackerMultiplier: 1,
				defenderMultiplier: 1,
				rng,
			})
			expect(result.loserShortfall).toBe(0)
			if (result.initialOutcome === "inconclusive") inconclusive++
			if (result.initialOutcome === "decisive") decisive++
		}
		expect(inconclusive / trials).toBeCloseTo(0.29, 1)
		expect(decisive / trials).toBeCloseTo(0.13, 1)
	})

	it("routs losers at the rate the rout curve predicts", () => {
		const rng = HISTORY_RNG.createHistoryRng(13)
		for (const attack of [1000, 4000]) {
			let routs = 0
			let expected = 0
			const trials = 6000
			for (let t = 0; t < trials; t++) {
				reset({ attack, defend: 1000 })
				const result = MILITARY.fight({
					state: engine,
					war,
					eventAttacker: war.attacker,
					attackerMultiplier: 1,
					defenderMultiplier: 1,
					rng,
				})
				const balance = result.powerShare
				const loss = 0.2 * (result.attackerWon ? balance : 1 - balance) ** 1.5
				const margin = Math.abs(Math.log(balance / (1 - balance)))
				expected += 1 / (1 + Math.exp(-20 * (loss + 0.15 * margin - 0.4)))
				if (result.outcome === "rout") routs++
			}
			expect(Math.abs(routs - expected) / trials).toBeLessThan(0.015)
		}
	})

	it("uses one roll for winner and casualties and pursues the routed loser", () => {
		reset({ attack: 1000, defend: 1000 })
		const held = MILITARY.fight({
			state: engine,
			war,
			eventAttacker: war.attacker,
			attackerMultiplier: 1,
			defenderMultiplier: 1,
			rng: sequenceRng([0.55, 0.99]),
		})
		const balance = held.powerShare
		expect(held.outcome).toBe("inconclusive")
		expect(held.attackerWon).toBe(true)
		expect(held.attackerLossShare).toBeCloseTo(0.2 * (1 - balance) ** 1.5, 9)
		expect(held.defenderLossShare).toBeCloseTo(0.2 * balance ** 1.5, 9)

		reset({ attack: 1000, defend: 1000 })
		const rng = sequenceRng([0.55, 0])
		rng.uniform = () => 0.1
		const routed = MILITARY.fight({
			state: engine,
			war,
			eventAttacker: war.attacker,
			attackerMultiplier: 1,
			defenderMultiplier: 1,
			rng,
		})
		const base = 0.2 * routed.powerShare ** 1.5
		expect(routed.outcome).toBe("rout")
		expect(routed.initialOutcome).toBe("inconclusive")
		expect(routed.defenderLossShare).toBeCloseTo(base + 0.1 * (1 - base), 9)
	})

	it("lets the side with troops win uncontested without losses", () => {
		reset({ attack: 1000, defend: 0 })
		const result = MILITARY.fight({
			state: engine,
			war,
			eventAttacker: war.attacker,
			attackerMultiplier: 1,
			defenderMultiplier: 1,
			rng: HISTORY_RNG.createHistoryRng(5),
		})
		expect(result.outcome).toBe("uncontested")
		expect(result.attackerWon).toBe(true)
		expect(result.attackerLossShare).toBe(0)
	})
})

describe("battle progress", () => {
	it("rolls to end an offensive after a defensive rout", () => {
		const fight = vi.spyOn(MILITARY, "fight").mockReturnValue({
			outcome: "rout",
			initialOutcome: "decisive",
			attackerWon: false,
			preBattleWinProbability: 0.5,
			powerShare: 0.1,
			attackerArmy: 1000,
			defenderArmy: 1000,
			attackerDeployed: 1000,
			defenderDeployed: 1000,
			deployments: [],
			relations: [],
			roles: [],
			attackerLossShare: 0.2,
			defenderLossShare: 0.01,
			loserShortfall: 0,
		})
		const exhausted = vi.spyOn(MILITARY, "exhausted").mockReturnValue(false)
		for (const [roll, settled] of [
			[0.5, true],
			[0.9, false],
		] as const) {
			setup()
			const rng = HISTORY_RNG.createHistoryRng(7)
			rng.random = () => roll
			BATTLE.runBattle({
				state: engine,
				warIdx: war.idx,
				eventAttacker: war.attacker,
				rng,
			})
			expect(war.endTime !== undefined).toBe(settled)
			if (settled)
				expect(
					engine.events.find(
						(event) =>
							event.tag === "war ended" &&
							event.data.reason === "offensive repelled",
					),
				).toBeDefined()
		}
		fight.mockRestore()
		exhausted.mockRestore()
	}, 120_000)

	function battleWith(values: number[]) {
		setup()
		reset({ attack: 1000, defend: 1000 })
		engine.levyCurrent.set(levies)
		engine.provinceTopography.fill(0)
		engine.provinceVegetation.fill(3)
		const note = engine.events.length
		BATTLE.runBattle({
			state: engine,
			warIdx: war.idx,
			eventAttacker: war.attacker,
			rng: sequenceRng([0, ...values]),
		})
		const notes = engine.events.slice(note)
		return {
			battle: notes.find((n) => n.tag === "battle"),
			progressed:
				war.occupied.length > 0 ||
				notes.some(
					(n) =>
						n.tag === "war ended" &&
						((n.data.transferred as number[]).length > 0 ||
							n.data.outcome === "bought peace"),
				),
		}
	}

	it("blocks progress on an inconclusive battle unless the loser routs", () => {
		const held = battleWith([0.55, 0.99, 0.5])
		expect(held.battle?.data.result).toBe("inconclusive")
		expect(held.battle?.data.plunder).toBe(0)
		expect(held.progressed).toBe(false)
		const routed = battleWith([0.55, 0, 0.5])
		expect(routed.battle?.data.result).toBe("rout")
		expect(routed.progressed).toBe(true)
		const won = battleWith([0.9999, 0.9999, 0.5])
		expect(won.battle?.data.initialResult).toBe("decisive")
		expect(won.progressed).toBe(true)
	}, 120_000)
})

describe("terrain", () => {
	function field({
		topography,
		vegetation,
	}: {
		topography: number
		vegetation: number
	}) {
		return TERRAIN.battlefield({
			state: {
				provinceTopography: new Uint8Array([topography]),
				provinceVegetation: new Uint8Array([vegetation]),
			} as HistoryState,
			p: 0,
		})
	}

	it("keys defense bonuses by generator labels", () => {
		expect(field({ topography: 1, vegetation: 3 }).topography).toBe("hill")
		expect(field({ topography: 2, vegetation: 3 }).topography).toBe("plateau")
		expect(field({ topography: 1, vegetation: 5 }).defense).toBeCloseTo(1.2, 9)
		expect(field({ topography: 3, vegetation: 5 }).defense).toBeCloseTo(1.3, 9)
		expect(field({ topography: 3, vegetation: 6 }).defense).toBeCloseTo(1.35, 9)
		expect(field({ topography: 0, vegetation: 3 }).defense).toBe(1)
	})

	it("reads water codes at a land target as neutral ground", () => {
		const ocean = field({ topography: 5, vegetation: 0 })
		expect(ocean.topography).toBe("flat")
		expect(ocean.vegetation).toBe("grasslands")
		expect(ocean.water).toBe(true)
		expect(ocean.defense).toBe(1)
		expect(field({ topography: 6, vegetation: 4 }).water).toBe(true)
	})

	it("fills missing generated terrain with neutral codes", () => {
		const terrain = TERRAIN.provinceTerrain({
			topography: null,
			vegetation: null,
			seeds: new Int32Array([0, 1]),
		})
		expect(Array.from(terrain.topography)).toEqual([0, 0])
		expect(Array.from(terrain.vegetation)).toEqual([3, 3])
	})
})
