import { beforeAll, describe, expect, it } from "vitest"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { UNITS } from "@/model/shared/units"
import { HISTORY_RUN } from "@/test/history-run"

const SETTLED_COST_SHARE = 0.5

let engine: HistoryState

beforeAll(() => {
	engine = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
})

function sovereigns(): number[] {
	return Array.from({ length: engine.P }, (_, p) => p).filter(
		(p) => !engine.desolate[p] && STATE.isSovereign({ state: engine, p }),
	)
}

function twoPointState(days: number): HistoryState {
	const angle = (days * 30) / UNITS.defaultPlanetRadiusKm
	return {
		province_xyz: new Float32Array([
			1,
			0,
			0,
			Math.cos(angle),
			Math.sin(angle),
			0,
		]),
		planetRadiusKm: UNITS.defaultPlanetRadiusKm,
	} as HistoryState
}

function withOutputPerHead(grams: number): number {
	const nation = sovereigns().find(
		(p) => ECONOMY.armyTradition({ state: engine, p }) === "settled",
	)
	if (nation === undefined) throw new Error("no settled realm")
	ECONOMY.revenue({ state: engine, p: nation })
	const entry = engine.realmCache.get(nation)
	if (!entry) throw new Error("no realm entry")
	entry.outputPerHead = grams
	return nation
}

describe("state maintenance", () => {
	it("resolves the planet radius and measures great-circle distance", () => {
		expect(engine.planetRadiusKm).toBeGreaterThan(0)
		for (let p = 0; p < engine.P; p++) {
			const length = Math.hypot(
				engine.province_xyz[p * 3],
				engine.province_xyz[p * 3 + 1],
				engine.province_xyz[p * 3 + 2],
			)
			expect(length).toBeCloseTo(1, 4)
		}
		const nation = sovereigns()[0]
		expect(
			ECONOMY.travelDays({ state: engine, capital: nation, p: nation }),
		).toBe(0)
	})

	it("matches the distance multiplier anchors", () => {
		const anchors: [number, number][] = [
			[0, 1],
			[30, 1.15],
			[60, 1.24],
			[120, 1.4],
			[240, 1.64],
			[365, 1.86],
		]
		for (const [days, multiplier] of anchors) {
			const state = twoPointState(days)
			expect(ECONOMY.travelDays({ state, capital: 0, p: 1 })).toBeCloseTo(
				days,
				1,
			)
			expect(
				ECONOMY.distanceMultiplier({ state, capital: 0, p: 1 }),
			).toBeCloseTo(multiplier, 2)
		}
		expect(
			0.35 *
				ECONOMY.distanceMultiplier({
					state: twoPointState(240),
					capital: 0,
					p: 1,
				}),
		).toBeCloseTo(0.575, 2)
	})

	it("sums provincial revenue to the realm line and charges 35-65% of it", () => {
		for (const nation of sovereigns()) {
			const provinces = STATE.getNationProvinces({
				state: engine,
				root: nation,
			}).filter((p) => !engine.desolate[p])
			const rate =
				KNOWLEDGE.extractionRate({
					knowledge: ECONOMY.realmKnowledge({ state: engine, p: nation }),
				}) *
				(ECONOMY.armyTradition({ state: engine, p: nation }) === "settled"
					? 1
					: 1 / 3)
			const provincial = provinces.reduce(
				(sum, p) => sum + ECONOMY.provinceOutput({ state: engine, p }) * rate,
				0,
			)
			const revenue = ECONOMY.revenue({ state: engine, p: nation })
			expect(provincial).toBeCloseTo(revenue, 12)
			if (revenue <= 0) continue
			const share =
				ECONOMY.stateMaintenance({ state: engine, p: nation }) / revenue
			expect(share).toBeGreaterThanOrEqual(0.35)
			expect(share).toBeLessThan(0.66)
		}
	})
})

describe("army maintenance", () => {
	it("prices a soldier from output per resident", () => {
		const anchors: [number, number, number][] = [
			[150, 0.23, 0.72],
			[250, 0.3, 0.93],
			[450, 0.4, 1.25],
			[700, 0.5, 1.56],
		]
		for (const [grams, peaceKg, warKg] of anchors) {
			const nation = withOutputPerHead(grams)
			const size = MILITARY.armySize({ state: engine, nation })
			expect(size).toBeGreaterThan(0)
			const atWar = MILITARY.atWar({ state: engine, nation })
			const price =
				MILITARY.upkeep({ state: engine, nation }) /
				size /
				ECONOMY.ducatsPerGram /
				1000
			expect(price).toBeCloseTo(
				SETTLED_COST_SHARE * (atWar ? warKg : peaceKg),
				2,
			)
			engine.realmCache.delete(nation)
		}
	})

	it("keeps an affordability-bound realm's peace army within 75% of its surplus", () => {
		for (const nation of sovereigns()) {
			if (MILITARY.atWar({ state: engine, nation })) continue
			const surplus = ECONOMY.surplus({ state: engine, p: nation })
			expect(MILITARY.upkeep({ state: engine, nation })).toBeLessThanOrEqual(
				0.75 * Math.max(0, surplus) * (1 + 1e-9),
			)
		}
	})
})

describe("treasury leakage", () => {
	function settleAt({
		nation,
		treasury,
	}: {
		nation: number
		treasury: number
	}) {
		const flows =
			ECONOMY.revenue({ state: engine, p: nation }) -
			ECONOMY.stateMaintenance({ state: engine, p: nation }) -
			MILITARY.upkeep({ state: engine, nation })
		engine.treasuryCurrent[nation] = treasury - flows
		TAX.runTax({
			state: engine,
			nation,
			previousTime: engine.time - STATE.yearMs,
		})
		return TREASURY_BUDGET.get({ state: engine, p: nation })
	}

	it("matches the leakage examples and never leaks below safe or in debt", () => {
		const nation = sovereigns().find(
			(p) =>
				ECONOMY.armyTradition({ state: engine, p }) === "settled" &&
				STATE.diplomaticOverlord({ state: engine, nation: p }) < 0 &&
				ECONOMY.treasurySafe({ state: engine, p }) > 0,
		)
		if (nation === undefined) throw new Error("no settled realm")
		const safe = ECONOMY.treasurySafe({ state: engine, p: nation })
		const examples: [number, number][] = [
			[1, 0],
			[1.5, 20],
			[2, 80],
			[3, 320],
			[5, 1280],
			[10, 6480],
		]
		for (const [multiple, perTwoThousand] of examples) {
			const budget = settleAt({ nation, treasury: multiple * safe })
			expect(-budget.treasuryLeakage / safe).toBeCloseTo(
				perTwoThousand / 2000,
				6,
			)
			expect(engine.treasuryCurrent[nation]).toBeCloseTo(
				multiple * safe + budget.treasuryLeakage,
				6,
			)
		}
		expect(
			settleAt({ nation, treasury: 0.5 * safe }).treasuryLeakage,
		).toBeCloseTo(0, 12)
		expect(settleAt({ nation, treasury: -safe }).treasuryLeakage).toBeCloseTo(
			0,
			12,
		)
		expect(engine.treasuryCurrent[nation]).toBeCloseTo(-safe, 6)
	})

	it("books only what a tribal or steppe realm pays and keeps it solvent", () => {
		for (const nation of sovereigns()) {
			if (ECONOMY.armyTradition({ state: engine, p: nation }) === "settled")
				continue
			engine.treasuryCurrent[nation] = 0
			TAX.runTax({
				state: engine,
				nation,
				previousTime: engine.time - STATE.yearMs,
			})
			const budget = TREASURY_BUDGET.get({ state: engine, p: nation })
			expect(engine.treasuryCurrent[nation]).toBeGreaterThanOrEqual(0)
			expect(engine.treasuryCurrent[nation]).toBeCloseTo(
				budget.annualBalance,
				9,
			)
			expect(-budget.armyExpenses).toBeLessThanOrEqual(
				budget.taxes + budget.stateMaintenance + 1e-12,
			)
		}
	})
})
