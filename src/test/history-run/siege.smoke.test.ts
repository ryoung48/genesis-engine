import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { BATTLE_KIND } from "@/model/history/sim/engine/events/battle/kind"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import type { Siege } from "@/model/history/sim/engine/events/siege/types"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import type { ClashResult } from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import { SIEGE_FIXTURE } from "@/test/history-run/fixtures/siege"

let state: HistoryState
let war: War
let caps: number[]
function fixture(): void {
	;({ state, war, caps } = SIEGE_FIXTURE.create())
}
function start(): Siege {
	const siege = SIEGE.prepare({ state, war, attacker: 0, province: 1 })
	if (!siege) throw new Error("ineligible fixture")
	SIEGE.begin({ state, war, siege })
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
	state.time += 30 * 86400000
	SIEGE.tick({ state, warIdx: 0, rng: scripted(values) })
}
function result() {
	return SIEGE_FIXTURE.result({ state })
}
function clashResult(): ClashResult {
	return {
		attackerWon: true,
		outcome: "normal",
		initialOutcome: "normal",
		powerShare: 0.7,
		preBattleWinProbability: 0.7,
		attackerLosses: 5,
		defenderLosses: 10,
		loserShortfall: 0,
	}
}
beforeEach(() => {
	fixture()
	SIEGE_FIXTURE.mock({ caps: () => caps })
})
afterEach(() => vi.restoreAllMocks())

describe("siege phases", () => {
	it.each([
		{ roll: 4, beat: "disease", garrison: 100, camp: 190.08 },
		{ roll: 10, beat: "supplies shortage", garrison: 97, camp: 198 },
		{ roll: 12, beat: "food shortage", garrison: 95, camp: 198 },
		{ roll: 14, beat: "water shortage", garrison: 95, camp: 198 },
		{ roll: 16, beat: "breach", garrison: 98, camp: 198 },
		{ roll: 18, beat: "desertion", garrison: 90, camp: 198 },
	])("applies $beat once with its own snapshot", ({
		roll,
		beat,
		garrison,
		camp,
	}) => {
		const siege = start()
		phase([0.99, (roll - 0.5) / 20])
		expect(siege.garrison[1].levy).toBeCloseTo(garrison)
		expect(war.deployed[0].levy).toBeCloseTo(camp)
		const note = state.events.find((n) => n.data.beat === beat)
		expect(note).toBeDefined()
		expect(note?.data.deployedTroops).toEqual([
			war.deployed[0].levy,
			war.deployed[1].levy,
		])
	})
	it("does not repeat a shortage and counts unlogged stalemate phases", () => {
		const siege = start()
		phase([0.99, 0.475])
		phase([0.99, 0.425])
		expect(siege.shortages).toEqual(["supplies"])
		expect(state.events.filter((n) => n.tag === "siege beat")).toHaveLength(1)
		phase([0.99, 0.99])
		expect(result()?.phases).toBe(3)
		expect(result()?.outcome).toBe("starved out")
	})
	it("betrays the town before rolling dice", () => {
		start()
		phase([0])
		expect(result()?.outcome).toBe("betrayed")
		expect(state.events.map((n) => n.tag)).toEqual([
			"siege started",
			"siege beat",
			"siege ended",
		])
	})
	it.each([
		false,
		true,
	])("resolves an empty garrison before gates, shortage=%s", (shortage) => {
		const siege = start()
		if (shortage) siege.shortages.push("food")
		war.deployed[1] = { levy: 0, regular: 0 }
		const rng = scripted([])
		const random = vi.spyOn(rng, "random")
		SIEGE.tick({ state, warIdx: 0, rng })
		expect(random).not.toHaveBeenCalled()
		expect(result()?.outcome).toBe(shortage ? "starved out" : "surrendered")
	})
	it("lifts when both sides are empty", () => {
		start()
		war.deployed[0].levy = 0
		war.deployed[1].levy = 0
		phase([])
		expect(result()?.reason).toBe("besiegers spent")
	})
	it("clamps and drops garrison members after allocation and membership changes", () => {
		const siege = start()
		siege.garrison[5] = { levy: 100, regular: 10 }
		war.deployed[1] = { levy: 40, regular: 0 }
		phase([0.99, 0])
		expect(siege.garrison).toEqual({ 1: { levy: 40, regular: 0 } })
	})
	it("charges losses to the garrison's mix, holdings, totals and population", () => {
		const siege = start()
		siege.garrison[1] = { levy: 0, regular: 100 }
		war.deployed[1] = { levy: 1000, regular: 100 }
		state.levyCurrent[1] = 1000
		state.regularCurrent[1] = 100
		phase([0.99, 0.475])
		expect(siege.garrison[1]).toEqual({ levy: 0, regular: 97 })
		expect(war.deployed[1]).toEqual({ levy: 1000, regular: 97 })
		expect(state.regularCurrent[1]).toBe(97)
		expect(state.militaryTotals.casualties.regular).toBe(3)
		expect(state.popRuralCurrent[1]).toBe(999997)
	})
	it("sorties use only the parties and repair a breach", () => {
		const siege = start()
		siege.breaches = 1
		const clash = vi.spyOn(MILITARY, "clash").mockReturnValue(clashResult())
		phase([0.99, 0, 0.15])
		const call = clash.mock.calls[0][0]
		expect(call.attackers[0].levy).toBe(20)
		expect(call.defenders[0].levy).toBeCloseTo(39.6)
		expect(call.attackerMultiplier).toBe(1.3)
		expect(siege.garrison[1].levy).toBe(95)
		expect(siege.breaches).toBe(0)
		expect(
			state.events.find((n) => n.data.beat === "sortie")?.data.effect,
		).toBe("breach repaired")
	})
	it("a successful sortie without a breach burns works", () => {
		start()
		vi.spyOn(MILITARY, "clash").mockReturnValue(clashResult())
		phase([0.99, 0, 0])
		expect(
			state.events.find((n) => n.data.beat === "sortie")?.data.effect,
		).toBe("works burned")
		expect(war.deployed[0].levy).toBeCloseTo((198 - 10) * 0.97)
	})
	it("does not sortie at a ratio of three or more", () => {
		war.deployed[0].levy = 1000
		state.levyCurrent[0] = 1000
		start()
		const clash = vi.spyOn(MILITARY, "clash")
		phase([0.99, 0, 0.99, 0.99])
		expect(clash).not.toHaveBeenCalled()
	})
	it.each([
		{ won: true, outcome: "normal", losses: 10, effect: "stormed" },
		{ won: false, outcome: "normal", losses: 10, effect: "repelled" },
		{ won: true, outcome: "inconclusive", losses: 10, effect: "none" },
		{ won: false, outcome: "normal", losses: 100, effect: "stormed" },
		{ won: true, outcome: "inconclusive", losses: 100, effect: "stormed" },
	] as const)("assault resolves $won / $outcome / $losses as $effect", ({
		won,
		outcome,
		losses,
		effect,
	}) => {
		const siege = start()
		siege.breaches = 1
		vi.spyOn(MILITARY, "clash").mockReturnValue({
			...clashResult(),
			attackerWon: won,
			outcome,
			defenderLosses: losses,
		})
		phase([0.99, 0, 0.99, 0, 0.99])
		expect(
			state.events.find((n) => n.data.beat === "assault")?.data.effect,
		).toBe(effect)
		expect(result()?.outcome).toBe(
			effect === "stormed"
				? "stormed"
				: effect === "repelled"
					? "lifted"
					: undefined,
		)
		if (effect === "stormed") expect(state.popUrbanCurrent[1]).toBe(4500)
	})
	it.each([
		true,
		false,
	])("relief win=%s excludes and preserves the garrison", (won) => {
		start()
		vi.spyOn(MILITARY, "clash").mockReturnValue({
			...clashResult(),
			attackerWon: won,
		})
		phase([0.99, 0, 0.99, 0.99, 0])
		expect(war.siege?.garrison[1].levy ?? 100).toBe(100)
		expect(war.deployed[1].levy).toBe(195)
		expect(result()?.outcome).toBe(won ? "relieved" : undefined)
	})
	it("keeps the lead's own field force after excluding the physical garrison", () => {
		war.deployed[1].levy = 10000
		state.levyCurrent[1] = 10000
		caps[1] = 1000
		const siege = start()
		expect(siege.startGarrison).toBe(100)
		expect(
			MILITARY.coalition({
				state,
				war,
				side: "defender",
				excluded: siege.garrison,
			}).members[0].levy,
		).toBe(9900)
		const physical = MILITARY.deploymentData({
			state,
			war,
			attackerSide: "defender",
		})
		expect(physical.deployedTroops).toEqual([10000, 200])
		MILITARY.mobilize({ state, war })
		expect(state.events.at(-1)?.data.deployedTroops).toEqual([200, 10000])
	})
	it("orders restoration snapshots with the besieging defender first", () => {
		war.deployed[1].levy = 1000
		state.levyCurrent[1] = 1000
		state.occupationCurrent[1] = 0
		war.occupied.push(1)
		const siege = SIEGE.prepare({ state, war, attacker: 1, province: 1 })!
		expect(siege.besiegerSide).toBe("defender")
		SIEGE.begin({ state, war, siege })
		expect(state.events[0].data.deployedNations).toEqual([1, 0])
		phase([0])
		expect(CONQUEST.apply).toHaveBeenCalledWith(
			expect.objectContaining({ attacker: 1, defender: 0, attackerWon: true }),
		)
	})
	it("lifts a siege whose target this war already holds", () => {
		start()
		state.occupationCurrent[1] = 0
		phase([])
		expect(result()?.reason).toBe("invalid")
		expect(CONQUEST.apply).toHaveBeenCalledWith(
			expect.objectContaining({ attackerWon: false, loserLossShare: 0 }),
		)
	})
	it("ends the war before the siege phase when the score is settled", () => {
		start()
		vi.mocked(CONQUEST.settle).mockReturnValue(true)
		const rng = scripted([])
		const random = vi.spyOn(rng, "random")
		state.time += 30 * 86400000
		SIEGE.tick({ state, warIdx: 0, rng })
		expect(random).not.toHaveBeenCalled()
		expect(CONQUEST.apply).not.toHaveBeenCalled()
	})
	it("lapses the war on changed sovereignty and ignores a stale tick without randomness or effects", () => {
		start()
		vi.mocked(STATE.isSovereign).mockReturnValue(false)
		const conclude = vi.spyOn(PEACE, "conclude").mockImplementation(() => {
			SIEGE.end({ state, war, outcome: "lifted", reason: "war ended" })
			war.endTime = state.time
			return {
				outcome: "lapsed",
				winner: -1,
				transferred: [],
				receiver: 0,
				payment: 0,
				payer: -1,
			}
		})
		phase([])
		expect(conclude).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "not sovereign" }),
		)
		expect(CONQUEST.settle).not.toHaveBeenCalled()
		expect(CONQUEST.apply).not.toHaveBeenCalled()
		expect(result()?.reason).toBe("war ended")
		const notes = state.events.length
		const size = state.heap.size
		const rng = scripted([])
		const random = vi.spyOn(rng, "random")
		SIEGE.tick({ state, warIdx: 0, rng })
		expect(state.events).toHaveLength(notes)
		expect(state.heap.size).toBe(size)
		expect(random).not.toHaveBeenCalled()
	})
	it("ending a war records phase zero and queues no new event", () => {
		start()
		const size = state.heap.size
		SIEGE.end({ state, war, outcome: "lifted", reason: "war ended" })
		war.endTime = state.time
		expect(result()?.phases).toBe(0)
		expect(state.heap.size).toBe(size)
		expect(CONQUEST.apply).not.toHaveBeenCalled()
		expect(war.siege).toBeNull()
		const rng = scripted([])
		const random = vi.spyOn(rng, "random")
		SIEGE.tick({ state, warIdx: 0, rng })
		expect(random).not.toHaveBeenCalled()
	})
})

describe("battle kinds and shared resolver", () => {
	it("chooses siege 95% of the time at the 2000-person urban threshold", () => {
		state.popUrbanCurrent[1] = 2000
		for (const river of [false, true]) {
			state.riverByProvince[1] = Number(river)
			const counts = { open: 0, ambush: 0, "river crossing": 0, siege: 0 }
			const rng = HISTORY_RNG.createHistoryRng(2025)
			for (let i = 0; i < 10000; i++) {
				rng.random = () => (i + 0.5) / 10000
				counts[
					BATTLE_KIND.choose({ state, province: 1, siegeEligible: true, rng })
						.kind
				]++
			}
			const fieldTotal = river ? 0.87 : 0.75
			expect(counts.open / 10000).toBeCloseTo((0.05 * 0.7) / fieldTotal, 3)
			expect(counts.siege).toBe(9500)
			expect(counts.ambush / 10000).toBeCloseTo((0.05 * 0.05) / fieldTotal, 3)
			expect(counts["river crossing"] / 10000).toBeCloseTo(
				river ? (0.05 * 0.12) / fieldTotal : 0,
				3,
			)
		}
	})
	it("preserves the original distribution when a siege is ineligible", () => {
		for (const river of [false, true])
			for (const urban of [1999, 2000]) {
				state.riverByProvince[1] = Number(river)
				state.popUrbanCurrent[1] = urban
				const counts = { open: 0, ambush: 0, "river crossing": 0, siege: 0 }
				const rng = HISTORY_RNG.createHistoryRng(2025)
				for (let i = 0; i < 10000; i++) {
					rng.random = () => (i + 0.5) / 10000
					counts[
						BATTLE_KIND.choose({
							state,
							province: 1,
							siegeEligible: urban < 2000,
							rng,
						}).kind
					]++
				}
				const total = river ? 0.87 : 0.75
				expect(counts.open / 10000).toBeCloseTo(0.7 / total, 3)
				expect(counts.ambush / 10000).toBeCloseTo(0.05 / total, 3)
				expect(counts["river crossing"] / 10000).toBeCloseTo(
					river ? 0.12 / total : 0,
					3,
				)
				expect(counts.siege).toBe(0)
			}
	})
	it("lets either equal-force ambusher win within the calibrated band", () => {
		const members = [{ nation: 0, levy: 100, regular: 0, force: 75 }]
		for (const ambusher of ["attacker", "defender"] as const) {
			const rng = HISTORY_RNG.createHistoryRng(2025)
			let wins = 0
			const terrain = {
				defense: 1,
				topography: "flat",
				vegetation: "grasslands",
				water: false,
			} as const
			for (let run = 0; run < 20000; run++) {
				const result = MILITARY.clash({
					attackers: members,
					defenders: members,
					attackerShortfall: 0,
					defenderShortfall: 0,
					...BATTLE_KIND.modifiers({ kind: "ambush", ambusher, terrain }),
					rng,
				})
				if (result.attackerWon === (ambusher === "attacker")) wins++
			}
			expect(wins / 20000).toBeGreaterThan(0.6)
			expect(wins / 20000).toBeLessThan(0.75)
		}
	})
	it("drops ineligible kinds and stacks every defender bonus with terrain", () => {
		state.popUrbanCurrent[1] = 0
		const rng = HISTORY_RNG.createHistoryRng(2025)
		const counts = { open: 0, ambush: 0, "river crossing": 0, siege: 0 }
		for (let i = 0; i < 20000; i++)
			counts[
				BATTLE_KIND.choose({ state, province: 1, siegeEligible: false, rng })
					.kind
			]++
		expect(counts.ambush / 20000).toBeGreaterThan(0.03)
		expect(counts.ambush / 20000).toBeLessThan(0.09)
		expect(counts["river crossing"]).toBe(0)
		expect(counts.siege).toBe(0)
		const terrain = {
			defense: 1.35,
			topography: "mountains",
			vegetation: "jungle",
			water: false,
		} as const
		expect(
			BATTLE_KIND.modifiers({ kind: "ambush", ambusher: "defender", terrain })
				.defenderMultiplier,
		).toBeCloseTo(1.35 * 1.3)
		expect(
			BATTLE_KIND.modifiers({ kind: "ambush", ambusher: "attacker", terrain }),
		).toEqual({ attackerMultiplier: 1.3, defenderMultiplier: 1.35 })
		expect(
			BATTLE_KIND.modifiers({
				kind: "river crossing",
				ambusher: "none",
				terrain,
			}).defenderMultiplier,
		).toBeCloseTo(1.35 * 1.2)
	})
	it("clash preserves fight's roll and shortfall while remaining pure", () => {
		const attackers = MILITARY.coalition({
			state,
			war,
			side: "attacker",
			excluded: {},
		})
		const defenders = MILITARY.coalition({
			state,
			war,
			side: "defender",
			excluded: {},
		})
		const before = structuredClone(war.deployed)
		const pure = MILITARY.clash({
			attackers: attackers.members,
			defenders: defenders.members,
			attackerShortfall: attackers.shortfall,
			defenderShortfall: defenders.shortfall,
			attackerMultiplier: 1,
			defenderMultiplier: 1.35,
			rng: HISTORY_RNG.createHistoryRng(2025),
		})
		expect(war.deployed).toEqual(before)
		const fight = MILITARY.fight({
			state,
			war,
			eventAttacker: 0,
			attackerMultiplier: 1,
			defenderMultiplier: 1.35,
			rng: HISTORY_RNG.createHistoryRng(2025),
		})
		expect(fight.outcome).toBe(pure.outcome)
		expect(fight.powerShare).toBe(pure.powerShare)
		expect(fight.attackerLossShare).toBe(pure.attackerLosses / 200)
		expect(war.deployed[0].levy).toBeCloseTo(200 - pure.attackerLosses)
	})
})
