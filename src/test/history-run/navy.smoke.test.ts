import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"
import type { Battle, SiegeBeat } from "@/model/history/record/types"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import type { Siege } from "@/model/history/sim/engine/events/siege/types"
import { WAR_SCORE } from "@/model/history/sim/engine/events/war/score"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import { NAVY } from "@/model/history/sim/engine/military/navy"
import { RECOVERY } from "@/model/history/sim/engine/military/recovery"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { ARMY_STRENGTH } from "@/model/history/sim/engine/military/strength"
import type { NavalBattleResult } from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import { MATH } from "@/model/shared/math/core"
import { HISTORY_RUN } from "@/test/history-run"
import { SIEGE_FIXTURE } from "@/test/history-run/fixtures/siege"
import { battleSite } from "@/ui/genesis/wiki-bridge/nation-wiki-timeline-format"
import { SIEGE_TIMELINE } from "@/ui/genesis/wiki-bridge/siege-timeline"

let state: HistoryState
let nations: number[]

const STALEMATE = [0.99, (7 - 0.5) / 20]

const BASE = {
	manpower: 1_000_000,
	tribal: false,
	knowledge: 1,
	surplus: 1_000_000,
	outputPerHead: 450,
}

beforeAll(() => {
	state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
	nations = [...state.militaryIntervals.keys()]
		.filter((nation) => STATE.isSovereign({ state, p: nation }))
		.sort(
			(a, b) =>
				MILITARY.armySize({ state, nation: b }) -
				MILITARY.armySize({ state, nation: a }),
		)
		.slice(0, 4)
	for (const nation of nations)
		for (const other of [...state.relationColumns[nation]])
			STATE.setRelation({ state, a: nation, b: other, rel: STATE.rel.NONE })
}, 120000)

afterEach(() => vi.restoreAllMocks())

function fleet({ nation, ships }: { nation: number; ships: number }): void {
	NAVY.initialize({
		state,
		nation,
		target: { ships, home: 10, campaign: 30 },
	})
}

function port({ nation, body }: { nation: number; body: number }): void {
	state.provinceWaterBody[nation] = body
}

function rural(roots: number[]): number {
	return roots
		.flatMap((root) => STATE.getNationProvinces({ state, root }))
		.reduce((sum, p) => sum + state.popRuralCurrent[p], 0)
}

function expectClose(actual: number, expected: number): void {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
		1e-9 * Math.max(1, Math.abs(expected)),
	)
}

describe("FR1 naval budget", () => {
	it("applies the exposure formula and gives landlocked realms nothing", () => {
		expect(NAVY.share({ exposure: { ports: 0, hostile: 0.5 } })).toBe(0)
		expectClose(
			NAVY.share({ exposure: { ports: 0.7, hostile: 0.05 } }),
			(0.35 * 0.7) / 0.75,
		)
		expectClose(
			NAVY.share({ exposure: { ports: 0.3, hostile: 0.25 } }),
			(0.35 * 0.3) / 0.55,
		)
	})

	it("buys whole ships out of the army's regular outlay", () => {
		const none = RECRUITMENT.targets({ ...BASE, navalShare: 0 })
		const navy = RECRUITMENT.targets({ ...BASE, navalShare: 0.2 })
		const money = 0.2 * none.funding * none.budget
		expect(none.ships).toBe(0)
		expect(navy.ships).toBe(Math.floor(money / navy.shipHome))
		expect(navy.ships).toBeGreaterThan(0)
		expect(navy.fleetCost).toBeLessThanOrEqual(money)
		expect(navy.fleetCost).toBeGreaterThan(money - navy.shipHome)
		expectClose(
			navy.uncapped.regular * navy.home.regular + navy.fleetCost,
			none.uncapped.regular * none.home.regular,
		)
	})

	it("sends a budget too small for one ship to the army", () => {
		const small = RECRUITMENT.targets({ ...BASE, surplus: 10, navalShare: 0.2 })
		const none = RECRUITMENT.targets({ ...BASE, surplus: 10, navalShare: 0 })
		expect(small.ships).toBe(0)
		expect(small.uncapped.regular).toBe(none.uncapped.regular)
	})

	it("counts only unrelated and warring neighbours as hostile", () => {
		const nation = nations[0]
		const provinces = STATE.getNationProvinces({ state, root: nation })
		const hostile = NAVY.exposureOf({ state, nation, provinces }).hostile
		expect(hostile).toBeGreaterThan(0)
		const neighbours = new Set<number>()
		for (const p of provinces)
			for (const nb of STATE.getProvinceNeighbors({ state, p })) {
				const other = STATE.getSovereign({ state, p: nb })
				if (other >= 0 && other !== nation) neighbours.add(other)
			}
		for (const other of neighbours)
			FIELDS.rel.set({ state, a: nation, b: other, rel: STATE.rel.ALLY })
		expect(NAVY.exposure({ state, nation }).hostile).toBe(0)
		for (const other of neighbours)
			FIELDS.rel.set({ state, a: nation, b: other, rel: STATE.rel.WAR })
		expect(NAVY.exposure({ state, nation }).hostile).toBe(hostile)
		for (const other of neighbours)
			FIELDS.rel.set({ state, a: nation, b: other, rel: STATE.rel.NONE })
	})
})

describe("FR2 fleet holdings", () => {
	it("interpolates the crew curve", () => {
		for (const [knowledge, crew] of [
			[0.42, 60],
			[1, 200],
			[1.44, 250],
			[2.38, 375],
			[0.71, 130],
		])
			expectClose(NAVY.crew({ knowledge }), crew)
	})

	it("delivers a one-ship target after about two and a half years and bills whole ships", () => {
		const nation = nations[0]
		fleet({ nation, ships: 1 })
		state.shipsCurrent[nation] = 0
		const start = state.time
		state.time = start + STATE.deltaYear(2.3)
		NAVY.advance({ state, nation })
		expect(NAVY.ships({ state, nation })).toBe(0)
		expect(NAVY.pending({ state, nation })).toBe(0)
		state.time = start + STATE.deltaYear(2.5)
		NAVY.advance({ state, nation })
		expect(NAVY.ships({ state, nation })).toBe(1)
		const crossing = Math.log(2) / -Math.log1p(-0.25)
		expectClose(NAVY.pending({ state, nation }), 10 * (2.5 - crossing))
		state.time = start
	})

	it("recovers at a quarter of the shortfall a year", () => {
		const nation = nations[0]
		fleet({ nation, ships: 4 })
		state.shipsCurrent[nation] = 0
		const start = state.time
		state.time = start + STATE.deltaYear(1)
		NAVY.advance({ state, nation })
		expectClose(
			state.shipsCurrent[nation],
			RECOVERY.recover({ holdings: 0, target: 4, rate: 0.25, years: 1 })
				.holdings,
		)
		expectClose(state.shipsCurrent[nation], 1)
		state.time = start
	})

	it("decommissions at once when the target falls", () => {
		const nation = nations[0]
		fleet({ nation, ships: 5 })
		const before = state.navalTotals.decommissions
		NAVY.refresh({
			state,
			nation,
			target: { ships: 2, home: 10, campaign: 30 },
			wars: [],
		})
		expect(NAVY.ships({ state, nation })).toBe(2)
		expect(state.navalTotals.decommissions - before).toBe(3)
	})

	it("charges committed ships the campaign price", () => {
		const nation = nations[0]
		fleet({ nation, ships: 3 })
		expect(NAVY.upkeep({ state, nation })).toBe(30)
		const war = { allocation: { [nation]: 1 }, ships: {} } as unknown as War
		NAVY.commit({ state, nation, wars: [war] })
		expect(war.ships[nation]).toBe(3)
		expect(NAVY.upkeep({ state, nation })).toBe(90)
	})
})

describe("FR3 war commitment", () => {
	it("commits whole ships by largest remainder across wars", () => {
		const nation = nations[0]
		fleet({ nation, ships: 7 })
		const wars = [0.6, 0.4].map(
			(share) =>
				({ allocation: { [nation]: share }, ships: {} }) as unknown as War,
		)
		NAVY.commit({ state, nation, wars })
		expect(wars.map((war) => war.ships[nation])).toEqual([4, 3])
		expect(MATH.apportion({ shares: [1, 1, 1], total: 4 })).toEqual([2, 1, 1])
	})
})

describe("FR4 naval engagement", () => {
	it("admits only committed ships of realms that own a port on the water body", () => {
		const [a, b, c] = nations
		port({ nation: a, body: 900 })
		port({ nation: b, body: 900 })
		port({ nation: c, body: 901 })
		const war = { ships: { [a]: 3, [b]: 4, [c]: 5 } } as unknown as War
		const there = NAVY.coalition({
			state,
			war,
			nations: [a, b, c],
			waterBody: 900,
		})
		expect(there.members.map((member) => member.nation)).toEqual([a, b])
		expect(there.ships).toBe(7)
		expect(
			NAVY.coalition({ state, war, nations: [a, b, c], waterBody: 902 }).ships,
		).toBe(0)
	})

	it("loses whole ships, kills 40% of their crews and occupies nothing", () => {
		const [a, b] = nations
		port({ nation: a, body: 900 })
		port({ nation: b, body: 900 })
		vi.spyOn(NAVY, "refresh").mockReturnValue(undefined)
		const rng = HISTORY_RNG.createHistoryRng(7)
		for (let run = 0; run < 40; run++) {
			const war = STATE.createActiveWar({
				state,
				attacker: a,
				defender: b,
				rng,
			})
			war.participants = { [a]: "attacker", [b]: "defender" }
			fleet({ nation: a, ships: 20 })
			fleet({ nation: b, ships: 20 })
			war.ships = { [a]: 20, [b]: 20 }
			const deaths = state.navalTotals.crewDeaths
			const ruralBefore = rural([a, b])
			const result = MILITARY.fightNaval({
				state,
				war,
				eventAttacker: a,
				waterBody: 900,
				rng,
			})
			if (result === null) throw new Error("engagement refused")
			expect(Number.isInteger(result.attackerShipsLost)).toBe(true)
			expect(Number.isInteger(result.defenderShipsLost)).toBe(true)
			expect(result.attackerShipsLost).toBeLessThanOrEqual(20)
			expect(NAVY.ships({ state, nation: a })).toBe(
				20 - result.attackerShipsLost,
			)
			expect(NAVY.ships({ state, nation: b })).toBe(
				20 - result.defenderShipsLost,
			)
			expect(result.crewDeaths).toBeGreaterThanOrEqual(0)
			expect(state.navalTotals.crewDeaths - deaths).toBeCloseTo(
				result.crewDeaths,
				6,
			)
			expect(war.occupied).toEqual([])
			if (result.crewDeaths > 0) expect(rural([a, b])).toBeLessThan(ruralBefore)
			STATE.resolveWar({ state, war, transferred: [], receiver: a })
		}
	})

	it("refuses an engagement when a side has no ship in reach", () => {
		const [a, b] = nations
		port({ nation: a, body: 900 })
		port({ nation: b, body: 901 })
		const war = STATE.createActiveWar({
			state,
			attacker: a,
			defender: b,
			rng: HISTORY_RNG.createHistoryRng(1),
		})
		war.participants = { [a]: "attacker", [b]: "defender" }
		war.ships = { [a]: 3, [b]: 3 }
		const before = state.navalTotals.reachViolations
		expect(
			MILITARY.fightNaval({
				state,
				war,
				eventAttacker: a,
				waterBody: 900,
				rng: HISTORY_RNG.createHistoryRng(2),
			}),
		).toBeNull()
		expect(state.navalTotals.reachViolations - before).toBe(1)
		STATE.resolveWar({ state, war, transferred: [], receiver: a })
	})

	it("scales clash losses and pursuit by the engagement parameters", () => {
		const rng = HISTORY_RNG.createHistoryRng(3)
		rng.random = () => 0.5
		rng.uniform = (lo, hi) => (lo + hi) / 2
		const side = [{ nation: 0, levy: 0, regular: 1000, force: 1000 }]
		const run = (params: {
			lossScale: number
			pursuit: { min: number; max: number }
		}) =>
			MILITARY.clash({
				attackers: side,
				defenders: side,
				attackerShortfall: 0,
				defenderShortfall: 0,
				attackerMultiplier: 1,
				defenderMultiplier: 1,
				...params,
				rng,
			})
		const land = run(MILITARY.landEngagement)
		const naval = run({ lossScale: 0.1, pursuit: { min: 0.3, max: 0.7 } })
		expectClose(land.attackerLosses, 1000 * 0.2 * 0.5 ** 1.5)
		expectClose(naval.attackerLosses, 1000 * 0.1 * 0.5 ** 1.5)
	})

	it("moves no land and scores a naval win at half the loss share", () => {
		const [a, b] = nations
		const rng = HISTORY_RNG.createHistoryRng(11)
		const score = vi.spyOn(WAR_SCORE, "battle")
		vi.spyOn(PEACE, "conclude").mockReturnValue(undefined)
		vi.spyOn(PEACE, "negotiate").mockReturnValue(false)
		vi.spyOn(PEACE, "acceptBuyoff").mockReturnValue(false)
		const results: boolean[] = []
		for (const occupies of [false, true]) {
			const war = STATE.createActiveWar({
				state,
				attacker: a,
				defender: b,
				rng,
			})
			war.participants = { [a]: "attacker", [b]: "defender" }
			CONQUEST.apply({
				state,
				war,
				attacker: a,
				defender: b,
				province: b,
				attackerWon: true,
				outcome: "normal",
				loserLossShare: 0.2,
				occupies,
				sack: false,
				record: () => undefined,
				rng,
			})
			results.push(state.occupationCurrent[b] === war.idx)
			expect(score).toHaveBeenLastCalledWith({
				war,
				winner: a,
				loserLossShare: occupies ? 0.2 : 0.1,
			})
			if (war.endTime === undefined)
				STATE.resolveWar({ state, war, transferred: [], receiver: a })
			FIELDS.prov.occupation.set({ state, p: b, value: -1 })
		}
		expect(results).toEqual([false, true])
	})
})

describe("FR5 sea supply and blockade", () => {
	let siegeState: HistoryState
	let siegeWar: War
	let caps: number[]
	let reaching: { attacker: number; defender: number }

	function build(): void {
		;({ state: siegeState, war: siegeWar, caps } = SIEGE_FIXTURE.create())
		siegeState.provinceWaterBody = new Int32Array([-1, 0])
		SIEGE_FIXTURE.mock({ caps: () => caps })
		vi.spyOn(MILITARY, "reachingShips").mockImplementation(
			({ side }) => reaching[side],
		)
	}
	function begin(): Siege {
		const siege = SIEGE.prepare({
			state: siegeState,
			war: siegeWar,
			attacker: 0,
			province: 1,
		})
		if (!siege) throw new Error("ineligible fixture")
		SIEGE.begin({ state: siegeState, war: siegeWar, siege })
		return siege
	}
	function scripted(values: number[]) {
		const rng = HISTORY_RNG.createHistoryRng(2025)
		let i = 0
		rng.random = () => values[i++] ?? 0.99
		rng.uniform = () => 0.1
		return rng
	}
	function phase(values: number[]): void {
		siegeState.time += 30 * 86400000
		SIEGE.tick({ state: siegeState, warIdx: 0, rng: scripted(values) })
	}
	function draws(setup: () => void): number {
		build()
		setup()
		const siege = begin()
		void siege
		let count = 0
		const rng = HISTORY_RNG.createHistoryRng(2025)
		rng.random = () => STALEMATE[count++] ?? 0.99
		rng.uniform = () => 0.1
		siegeState.time += 30 * 86400000
		SIEGE.tick({ state: siegeState, warIdx: 0, rng })
		return count
	}
	function blockadeDraws(length: number): number[] {
		const values = Array.from({ length }, (_, i) => STALEMATE[i] ?? 0.99)
		values[length - 1] = 0.01
		return values
	}
	function beatOf(name: string) {
		return siegeState.events.find((note) => note.data.beat === name)
	}
	function mockFight(result: Partial<NavalBattleResult>): void {
		vi.spyOn(MILITARY, "fightNaval").mockReturnValue({
			attackerWon: true,
			outcome: "normal",
			initialOutcome: "normal",
			powerShare: 0.7,
			preBattleWinProbability: 0.7,
			waterBody: 0,
			attackerShips: 5,
			defenderShips: 3,
			attackerShipsLost: 1,
			defenderShipsLost: 2,
			attackerCrew: 1000,
			defenderCrew: 600,
			attackerLossShare: 0.2,
			defenderLossShare: 0.6,
			crewDeaths: 100,
			deployedNations: [],
			deployedShips: [],
			deployedRelations: [],
			deployedRoles: [],
			...result,
		})
	}

	beforeEach(() => {
		reaching = { attacker: 0, defender: 0 }
		build()
	})

	it.each([
		{ besiegers: 5, defenders: 0, supplied: false },
		{ besiegers: 5, defenders: 3, supplied: true },
		{ besiegers: 0, defenders: 0, supplied: true },
		{ besiegers: 0, defenders: 2, supplied: true },
	])("starts supplied=$supplied with $besiegers/$defenders reaching ships", ({
		besiegers,
		defenders,
		supplied,
	}) => {
		reaching = { attacker: besiegers, defender: defenders }
		expect(begin().seaSupplied).toBe(supplied)
	})

	it("turns supply and food rolls into stalemates for a supplied port but keeps water", () => {
		const siege = begin()
		phase([0.99, (12 - 0.5) / 20])
		expect(siege.shortages).toEqual([])
		expect(
			siegeState.events.filter((n) => n.tag === "siege beat"),
		).toHaveLength(0)
		phase([0.99, (10 - 0.5) / 20])
		expect(siege.shortages).toEqual([])
		phase([0.99, (14 - 0.5) / 20])
		expect(siege.shortages).toEqual(["water"])
	})

	it("starves a blockaded port as before", () => {
		reaching = { attacker: 5, defender: 0 }
		const siege = begin()
		phase([0.99, (12 - 0.5) / 20])
		expect(siege.shortages).toEqual(["food"])
	})

	it("returns a blockaded siege to supplied once the besiegers lose their ships", () => {
		reaching = { attacker: 5, defender: 0 }
		const siege = begin()
		expect(siege.seaSupplied).toBe(false)
		reaching = { attacker: 0, defender: 0 }
		phase([0.99, 0.99])
		expect(siege.seaSupplied).toBe(true)
	})

	it.each([
		{ outcome: "normal", won: true, flips: true },
		{ outcome: "inconclusive", won: true, flips: false },
		{ outcome: "normal", won: false, flips: false },
	] as const)("imposes a contested blockade only on a decisive win ($outcome, won=$won)", ({
		outcome,
		won,
		flips,
	}) => {
		reaching = { attacker: 5, defender: 3 }
		const count = draws(() => {
			reaching = { attacker: 5, defender: 3 }
		})
		build()
		reaching = { attacker: 5, defender: 3 }
		mockFight({ outcome, attackerWon: won })
		const siege = begin()
		expect(siege.seaSupplied).toBe(true)
		phase(blockadeDraws(count))
		expect(siege.seaSupplied).toBe(!flips)
		expect(beatOf("blockade imposed")?.data.effect).toBe(
			flips ? "blockaded" : "none",
		)
	})

	it("imposes an uncontested blockade", () => {
		const count = draws(() => {
			reaching = { attacker: 5, defender: 2 }
		})
		build()
		reaching = { attacker: 5, defender: 2 }
		const siege = begin()
		reaching = { attacker: 5, defender: 0 }
		phase(blockadeDraws(count))
		expect(siege.seaSupplied).toBe(false)
		expect(beatOf("blockade imposed")?.data.outcome).toBe("uncontested")
	})

	it("breaks a blockade only with a decisive defender win", () => {
		reaching = { attacker: 5, defender: 0 }
		const count = draws(() => {
			reaching = { attacker: 5, defender: 0 }
		})
		for (const flips of [true, false]) {
			build()
			reaching = { attacker: 5, defender: 0 }
			mockFight({ outcome: flips ? "normal" : "inconclusive" })
			const siege = begin()
			expect(siege.seaSupplied).toBe(false)
			reaching = { attacker: 5, defender: 3 }
			phase(blockadeDraws(count + 1))
			expect(siege.seaSupplied).toBe(flips)
			expect(beatOf("blockade broken")?.data.effect).toBe(
				flips ? "supplied" : "none",
			)
			vi.restoreAllMocks()
		}
	})
})

describe("FR6 realm changes", () => {
	it("splits whole ships by port count and sums to the original", () => {
		expect(NAVY.split({ ships: 7, ports: [3, 1, 1] })).toEqual([4, 2, 1])
		expect(NAVY.split({ ships: 7, ports: [0, 0] })).toEqual([7, 0])
		const parts = NAVY.split({ ships: 11, ports: [5, 3, 2, 7] })
		expect(parts.reduce((sum, count) => sum + count, 0)).toBe(11)
	})

	it("divides a realm's ships among it and a released district by port provinces", () => {
		const crown = [...state.militaryIntervals.keys()]
			.filter((p) => STATE.getChildren({ state, p }).length >= 1)
			.sort(
				(a, b) =>
					STATE.getNationPopulation({ state, root: b }) -
					STATE.getNationPopulation({ state, root: a }),
			)[0]
		const child = STATE.getChildren({ state, p: crown })[0]
		const childProvinces = new Set(
			STATE.getNationProvinces({ state, root: child }),
		)
		const crownProvinces = STATE.getNationProvinces({ state, root: crown })
		for (const p of crownProvinces) state.provinceWaterBody[p] = 800
		state.shipsCurrent[crown] = 10.4
		state.shipsCurrent[child] = 0
		NAVY.release({ state, from: crown, to: [child] })
		const ports = [crownProvinces.length, childProvinces.size]
		const expected = NAVY.split({ ships: 10, ports })
		expect(NAVY.ships({ state, nation: child })).toBe(expected[1])
		expectClose(state.shipsCurrent[crown] + state.shipsCurrent[child], 10.4)
		expectClose(state.shipsCurrent[crown], 10.4 - expected[1])
	})

	it("clears the fleet and its commitments when a realm is annexed", () => {
		const nation = nations[3]
		fleet({ nation, ships: 6 })
		const war = STATE.createActiveWar({
			state,
			attacker: nation,
			defender: nations[2],
			rng: HISTORY_RNG.createHistoryRng(5),
		})
		war.participants = { [nation]: "attacker", [nations[2]]: "defender" }
		war.ships = { [nation]: 6 }
		RECRUITMENT.disband({ state, nation })
		expect(NAVY.ships({ state, nation })).toBe(0)
		expect(war.ships[nation]).toBeUndefined()
	})
})

describe("FR7 record and display", () => {
	it("names naval battles by the coast and renders the blockade beats", () => {
		const battle = {
			name: "Marsh Point",
			simulated: {
				naval: {
					waterBody: 1,
					attackerShips: 5,
					defenderShips: 4,
					attackerShipsLost: 1,
					defenderShipsLost: 2,
					crewDeaths: 50,
				},
			},
		} as unknown as Battle
		expect(battleSite(battle)).toBe(
			"in a naval battle off the coast of Marsh Point",
		)
		const beat = (
			name: "blockade imposed" | "blockade broken",
			effect: string,
		) =>
			({
				beat: name,
				timeMs: 0,
				phase: 1,
				besiegerLosses: 0,
				garrisonLosses: 0,
				contributions: [],
				won: true,
				outcome: "normal",
				powerShare: 0.6,
				effect,
				besiegerShips: 5,
				defenderShips: 3,
				besiegerShipsLost: 1,
				defenderShipsLost: 2,
			}) as unknown as SiegeBeat
		const entries = SIEGE_TIMELINE.build({
			war: {
				id: 1,
				name: "War",
				sieges: [
					{
						timeMs: 0,
						province: 3,
						besieger: 0,
						defender: 1,
						besiegers: 100,
						garrisonTroops: 100,
						seaSupplied: true,
						contributions: [],
						beats: [
							beat("blockade imposed", "blockaded"),
							beat("blockade broken", "supplied"),
						],
						outcome: null,
						reason: null,
						endTimeMs: null,
						endContributions: null,
						phases: null,
					},
				],
			} as never,
			viewpoint: null,
			nationNameOf: (id) => `Nation ${id}`,
			provinceName: (id) => `Province ${id}`,
		}).map((entry) => entry.description)
		expect(entries[0]).toContain("kept supplied")
		expect(entries[1]).toContain("closes the harbour")
		expect(entries[2]).toContain("breaks the blockade")
	})

	it("carries ships and naval upkeep in the census snapshot", () => {
		const nation = nations[0]
		fleet({ nation, ships: 4 })
		JOURNAL.flush({
			state,
			noteCursor: state.events.length,
			census: true,
			initial: false,
		})
		const economy = state.journal.at(-1)?.census?.economy
		const index = economy?.nations.indexOf(nation) ?? -1
		expect(index).toBeGreaterThanOrEqual(0)
		expect(economy?.ships[index]).toBe(4)
		expect(economy?.budgets[index]?.navalExpenses).toBeDefined()
	})
})

describe("FR8 threat", () => {
	it("adds whole ships times crew to each side's attended troop force", () => {
		const [a, b] = nations
		for (const nation of [a, b]) {
			state.levyCurrent[nation] = 100
			state.regularCurrent[nation] = 100
			fleet({ nation, ships: 0 })
		}
		state.shipsCurrent[a] = 0
		state.shipsCurrent[b] = 0
		const troops = ARMY_STRENGTH.of({ levy: 100, regular: 100 })
		const share = (x: number, y: number) =>
			1 / (1 + Math.exp(3 * (Math.log(x) - Math.log(y))))
		expectClose(
			MILITARY.threat({ state, attacker: a, defender: b }),
			share(troops, troops),
		)
		state.shipsCurrent[a] = 3
		const crew = NAVY.crew({
			knowledge: ECONOMY.realmKnowledge({ state, p: a }),
		})
		expectClose(
			MILITARY.threat({ state, attacker: a, defender: b }),
			share(troops + 3 * crew, troops),
		)
		state.shipsCurrent[a] = 0
	})

	it("gives each side of a rebellion its port share of the old realm's ships", () => {
		const crown = [...state.militaryIntervals.keys()]
			.filter((p) => STATE.getChildren({ state, p }).length >= 2)
			.sort(
				(a, b) =>
					STATE.getNationPopulation({ state, root: b }) -
					STATE.getNationPopulation({ state, root: a }),
			)[0]
		const rebel = STATE.getChildren({ state, p: crown })[0]
		const rebelProvinces = STATE.getNationProvinces({ state, root: rebel })
		const excluded = new Set(rebelProvinces)
		const crownProvinces = STATE.getNationProvinces({
			state,
			root: crown,
		}).filter((p) => !excluded.has(p))
		state.shipsCurrent[crown] = 12
		const preview = MILITARY.rebellionPreview({
			state,
			overlord: crown,
			subject: rebel,
		})
		const [crownShips, rebelShips] = NAVY.split({
			ships: 12,
			ports: [
				NAVY.portCount({ state, provinces: crownProvinces }),
				NAVY.portCount({ state, provinces: rebelProvinces }),
			],
		})
		expect(preview.crownShips).toBe(crownShips)
		expect(preview.rebelShips).toBe(rebelShips)
		expect(preview.crownShips + preview.rebelShips).toBe(12)
		state.shipsCurrent[crown] = 0
	})
})
