import { expect, it, vi } from "vitest"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { HISTORY_REPORT } from "@/test/history-run/report"
import { SETTLEMENT_CHANGE_REPORT } from "@/test/history-run/report/settlement-change"

it("classifies exact band boundaries, excludes small settlements and orders falls", () => {
	const ratios = [0.49, 0.5, 0.737, 0.738, 1, 1.485, 1.486]
	const before = Float32Array.from(
		[1000, 2000, 10000].flatMap((pop) => ratios.map(() => pop)).concat(999),
	)
	const after = Float32Array.from(
		Array.from(before, (pop, i) => pop * ratios[i % ratios.length]),
	)
	const steps = SETTLEMENT_CHANGE_REPORT.classify({
		before,
		after,
		townMin: 1000,
		year: 877,
		roadMembers: new Set([0]),
	})
	expect(steps).toHaveLength(21)
	const bands = [
		"halved",
		"shockFall",
		"normal",
		"normal",
		"normal",
		"normal",
		"surge",
	]
	for (let i = 0; i < 3; i++)
		expect(steps.slice(i * 7, (i + 1) * 7).map((step) => step.band)).toEqual(
			bands,
		)
	const report = SETTLEMENT_CHANGE_REPORT.of({
		tracker: { previous: after, steps },
		from: 867,
		to: 897,
	})
	expect(report.bands.halved.count).toBe(3)
	expect(report.largestRatioFalls[0].ratio).toBeCloseTo(0.49)
	expect(report.largestPeopleFalls[0].lost).toBe(5100)
})

it("reports an injected settlement collapse in a thirty-year history window", () => {
	const simulate = SIM_ENGINE.simulateUntil
	let province = -1
	let before = 0
	let after = 0
	const spy = vi
		.spyOn(SIM_ENGINE, "simulateUntil")
		.mockImplementation((params) => {
			if (province < 0) {
				province = params.state.popUrbanCurrent.findIndex((pop) => pop >= 1000)
				before = params.state.popUrbanCurrent[province]
			}
			const result = simulate(params)
			if (
				params.targetTimeMs ===
				(STATE.defaultStartYear + 10) * STATE.yearMs
			) {
				after = before * 0.1
				params.state.popUrbanCurrent[province] = after
			}
			return result
		})
	try {
		const reports = HISTORY_REPORT.run({
			seeds: [42],
			era: "lateMedieval",
			numPoints: 12000,
			years: 30,
			lateKnowledgeBand: 2.366478320318625,
			outPath: "",
			baselinePath: null,
			log: vi.fn(),
		})
		const report = reports.get(42)![0].settlementChange
		expect(report.bands.halved.count).toBeGreaterThanOrEqual(1)
		expect(
			report.largestRatioFalls.find((change) => change.province === province),
		).toMatchObject({ before, after: Math.fround(after) })
	} finally {
		spy.mockRestore()
	}
}, 300000)
