import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"
import { WAR } from "@/model/history/sim/engine/events/war"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { OPINION } from "@/model/history/sim/people/opinion"
import { HISTORY_RUN } from "@/test/history-run"
import { REBEL_LOGISTICS_REPORT } from "@/test/history-run/report/military/rebel-logistics"
import type { RebelLogisticsObservation } from "@/test/history-run/report/military/rebel-logistics/types"

let state: HistoryState
let crown: number
let rebel: number
let supporter: number

beforeAll(() => {
	state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	}).engine
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
	crown = [...state.militaryIntervals.keys()]
		.filter((p) => STATE.getChildren({ state, p }).length >= 2)
		.sort(
			(a, b) =>
				STATE.getNationPopulation({ state, root: b }) -
				STATE.getNationPopulation({ state, root: a }),
		)[0]
	if (crown === undefined) throw new Error("missing faction fixture")
	;[rebel, supporter] = STATE.getChildren({ state, p: crown })
}, 120000)

describe("independent breakaway armies", () => {
	it("recalculates both territories without inheriting the depleted crown army", () => {
		const rebelProvinces = [
			...STATE.getNationProvinces({ state, root: rebel }),
			...STATE.getNationProvinces({ state, root: supporter }),
		]
		const excluded = new Set(rebelProvinces)
		const crownProvinces = STATE.getNationProvinces({
			state,
			root: crown,
		}).filter((p) => !excluded.has(p))
		const expectedCrown = RECRUITMENT.territoryTargets({
			state,
			nation: crown,
			provinces: crownProvinces,
		})
		const expectedRebel = RECRUITMENT.territoryTargets({
			state,
			nation: rebel,
			provinces: rebelProvinces,
		})
		expect(expectedCrown.levy + expectedCrown.regular).toBeGreaterThan(0)
		expect(expectedRebel.levy + expectedRebel.regular).toBeGreaterThan(0)
		state.levyCurrent[crown] = 0
		state.regularCurrent[crown] = 0
		const interval = state.militaryIntervals.get(crown)!
		interval.pending = { levy: 3, regular: 7 }
		const settled = { ...state.militaryTotals.settled }
		const recruited = { ...state.militaryTotals.recruited }
		STATE.releaseFaction({
			state,
			p: rebel,
			supporters: [supporter],
			rng: HISTORY_RNG.createHistoryRng(41),
			reason: "rebellion",
		})
		for (const [nation, target] of [
			[crown, expectedCrown],
			[rebel, expectedRebel],
		] as const) {
			expect(state.levyCurrent[nation]).toBeCloseTo(target.levy, 7)
			expect(state.regularCurrent[nation]).toBeCloseTo(target.regular, 7)
			expect(RECRUITMENT.realmTargets({ state, nation }).logistics).toBe(
				target.logistics,
			)
			expect(state.militaryIntervals.get(nation)!.pending).toEqual({
				levy: 0,
				regular: 0,
			})
			expect(state.militaryIntervals.get(nation)!.reference).toEqual({
				levy: 0,
				regular: 0,
			})
		}
		expect(STATE.getSovereign({ state, p: supporter })).toBe(rebel)
		expect(state.militaryTotals.settled.levy - settled.levy).toBeCloseTo(3, 9)
		expect(state.militaryTotals.settled.regular - settled.regular).toBeCloseTo(
			7,
			9,
		)
		expect(state.militaryTotals.recruited.levy - recruited.levy).toBeCloseTo(
			expectedCrown.levy + expectedRebel.levy,
			7,
		)
		expect(
			state.militaryTotals.recruited.regular - recruited.regular,
		).toBeCloseTo(expectedCrown.regular + expectedRebel.regular, 7)
		MILITARY.validate({ state })
	})

	it("retains individual rebel-war cap observations and disables subsequent wartime levy recovery", () => {
		const observations: RebelLogisticsObservation[] = []
		const diagnostics = REBEL_LOGISTICS_REPORT.attach({
			engine: state,
			record: (observation) => observations.push(observation),
		})
		try {
			const war = STATE.createActiveWar({
				state,
				attacker: crown,
				defender: rebel,
				options: { goal: "independence" },
				rng: HISTORY_RNG.createHistoryRng(42),
			})
			MILITARY.mobilize({ state, war })
			diagnostics.sample({ source: "annual" })
			const rows = observations.filter((row) => row.war === war.idx)
			expect(rows.some((row) => row.role === "crown")).toBe(true)
			expect(rows.some((row) => row.role === "rebel")).toBe(true)
			for (const row of rows) {
				const raw = row.uncappedTargets.levy + row.uncappedTargets.regular
				expect(row.targets.levy + row.targets.regular).toBeLessThanOrEqual(
					Math.min(raw, row.logistics) * (1 + 1e-9),
				)
				expect(row.targetLimited).toBe(row.limits.logistics)
				expect(row.fieldLimited).toBe(
					row.coalitionDeployed >
						row.fieldLimit + Math.max(1, row.fieldLimit) * 1e-9,
				)
			}
			const levy = state.levyCurrent[rebel] * 0.5
			state.levyCurrent[rebel] = levy
			state.militaryDirty.add(rebel)
			MILITARY.reconcile({ state })
			state.time += STATE.deltaYear(0.5)
			MILITARY.advance({ state, nation: rebel })
			expect(state.levyCurrent[rebel]).toBe(levy)
			expect(state.militaryTotals.levyReplacementsAtWar).toBe(0)
			MILITARY.validate({ state })
		} finally {
			diagnostics.detach()
		}
	})
})

describe("observational rebellion evaluation notes", () => {
	beforeEach(() => {
		vi.spyOn(GOVERNOR, "attribute").mockReturnValue(
			ATTRIBUTES.neutral("diplomacy"),
		)
		vi.spyOn(GOVERNOR, "personHas").mockReturnValue(false)
		vi.spyOn(OPINION, "of").mockReturnValue(null)
	})
	afterEach(() => vi.restoreAllMocks())

	it("rejects the threshold boundary without consuming randomness or changing armies", () => {
		const overlord = [...state.militaryIntervals.keys()].find(
			(p) =>
				STATE.isSovereign({ state, p }) &&
				STATE.getChildren({ state, p }).length > 0,
		)
		if (overlord === undefined) throw new Error("missing evaluation fixture")
		const subject = STATE.getChildren({ state, p: overlord })[0]
		const preview = MILITARY.rebellionPreview({ state, overlord, subject })
		const snapshot = [
			state.levyCurrent[overlord],
			state.regularCurrent[overlord],
			state.treasuryCurrent[overlord],
			state.parentCurrent[subject],
		]
		const mock = vi
			.spyOn(MILITARY, "rebellionPreview")
			.mockReturnValue({ ...preview, threat: 0.45 })
		const rng = HISTORY_RNG.createHistoryRng(73)
		const draw = vi.spyOn(rng, "random")
		try {
			expect(
				WAR.rebel({
					state,
					overlord,
					subject,
					laxity: 0,
					succession: false,
					rng,
				}),
			).toBe(false)
			expect(draw).not.toHaveBeenCalled()
			const note = state.events.at(-1)!
			expect(note.tag).toBe("rebellion evaluated")
			expect(note.data.decision).toBe("threshold")
			expect(note.data.roll).toBe(-1)
			expect(note.data.threshold).toBe(0.45)
			expect(note.data.rebelBudgetLimited).toBe(preview.rebel.limits.budget)
			expect([
				state.levyCurrent[overlord],
				state.regularCurrent[overlord],
				state.treasuryCurrent[overlord],
				state.parentCurrent[subject],
			]).toEqual(snapshot)
		} finally {
			mock.mockRestore()
			draw.mockRestore()
		}
	})

	it("records the single existing random draw for a probabilistic rejection", () => {
		const overlord = [...state.militaryIntervals.keys()].find(
			(p) =>
				STATE.isSovereign({ state, p }) &&
				STATE.getChildren({ state, p }).length > 0,
		)
		if (overlord === undefined) throw new Error("missing evaluation fixture")
		const subject = STATE.getChildren({ state, p: overlord })[0]
		const preview = MILITARY.rebellionPreview({ state, overlord, subject })
		const mock = vi
			.spyOn(MILITARY, "rebellionPreview")
			.mockReturnValue({ ...preview, threat: 0.8 })
		const rng = HISTORY_RNG.createHistoryRng(74)
		const draw = vi.spyOn(rng, "random").mockReturnValue(0.9)
		try {
			expect(
				WAR.rebel({
					state,
					overlord,
					subject,
					laxity: 0.1,
					succession: true,
					rng,
				}),
			).toBe(false)
			expect(draw).toHaveBeenCalledTimes(1)
			const data = state.events.at(-1)!.data
			expect(data.decision).toBe("random")
			expect(data.roll).toBe(0.9)
			expect(data.threshold).toBeCloseTo(0.35, 12)
			expect(data.succession).toBe(true)
		} finally {
			mock.mockRestore()
			draw.mockRestore()
		}
	})
})
