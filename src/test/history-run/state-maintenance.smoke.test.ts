import { beforeAll, describe, expect, it } from "vitest"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { UNITS } from "@/model/shared/units"
import { HISTORY_RUN } from "@/test/history-run"

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
		provinceEconomyCache: {
			capital: new Int32Array(2).fill(-1),
			distanceMultiplier: new Float64Array(2),
		},
	} as HistoryState
}

function withOutputPerHead(grams: number): number {
	const nation = sovereigns().find(
		(p) => GOVERNMENT.govFamilyOfIndex(engine.governmentType[p]) !== "tribal",
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
			const rate = KNOWLEDGE.extractionRate({
				knowledge: ECONOMY.realmKnowledge({ state: engine, p: nation }),
			})
			const provincial = provinces.reduce(
				(sum, p) => sum + ECONOMY.provinceOutput({ state: engine, p }) * rate,
				0,
			)
			const revenue = ECONOMY.revenue({ state: engine, p: nation })
			expect(provincial).toBeCloseTo(revenue, 12)
			if (revenue <= 0) continue
			const share =
				ECONOMY.stateMaintenance({ state: engine, p: nation }) / revenue
			expect(share).toBeGreaterThanOrEqual(0.35 - 1e-12)
			expect(share).toBeLessThan(0.66)
		}
	})
})

describe("army maintenance", () => {
	it("prices both recruitment types from output per resident", () => {
		for (const grams of [150, 250, 450, 700]) {
			const nation = withOutputPerHead(grams)
			const targets = RECRUITMENT.realmTargets({ state: engine, nation })
			const adjustment = Math.sqrt(grams / 450) * ECONOMY.ducatsPerGram
			expect(targets.home.levy).toBeCloseTo(20 * adjustment, 12)
			expect(targets.home.regular).toBeCloseTo(200 * adjustment, 12)
			expect(targets.campaign.levy).toBeCloseTo(62.5 * adjustment, 12)
			expect(targets.campaign.regular).toBeCloseTo(625 * adjustment, 12)
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
			0
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
				GOVERNMENT.govFamilyOfIndex(engine.governmentType[p]) !== "tribal" &&
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

	it("charges tribal and steppe realms the full expense and permits debt", () => {
		for (const nation of sovereigns()) {
			if (
				GOVERNMENT.govFamilyOfIndex(engine.governmentType[nation]) !== "tribal"
			)
				continue
			engine.treasuryCurrent[nation] = -1000000
			const interval = engine.militaryIntervals.get(nation)!
			interval.pending = { levy: 7, regular: 11 }
			TAX.runTax({
				state: engine,
				nation,
				previousTime: engine.time - STATE.yearMs,
			})
			const budget = TREASURY_BUDGET.get({ state: engine, p: nation })
			expect(budget.armyExpenses).toBe(-18)
			expect(engine.treasuryCurrent[nation]).toBeCloseTo(
				-1000000 + budget.annualBalance,
				9,
			)
			expect(engine.treasuryCurrent[nation]).toBeLessThan(0)
		}
	})
})
