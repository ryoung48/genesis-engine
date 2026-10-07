import { writeFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { EventHeap } from "@/model/history/sim/engine/event-heap"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import { SIEGE_FIXTURE } from "@/test/history-run/fixtures/siege"
import type { SiegeCalibrationScenario } from "@/test/history-run/types"

let state: HistoryState
let war: War
let caps: number[]
function fixture(): void {
	;({ state, war, caps } = SIEGE_FIXTURE.create())
}
beforeEach(() => {
	fixture()
	SIEGE_FIXTURE.mock({ caps: () => caps })
})
afterEach(() => vi.restoreAllMocks())

it("calibrates the production siege loop across ratios, relief and logistics caps", () => {
	const rng = HISTORY_RNG.createHistoryRng(2025)
	// 2,000 trials keep worst-case binomial standard error near 1.1%; output
	// requests retain the full 20,000-trial calibration and its tail resolution.
	const samples = process.env.SIEGE_CALIBRATION_OUT ? 20000 : 2000
	const results: SiegeCalibrationScenario[] = []
	for (const terrain of [0, 1])
		for (const multiple of [1, 10])
			for (const ratio of SIEGE_FIXTURE.ratios)
				for (const field of [0, 0.5]) {
					const phases: number[] = []
					const outcomes: Record<string, number> = {}
					for (let run = 0; run < samples; run++) {
						fixture()
						state.provinceTopography[1] = terrain
						const army = 100 * ratio
						const outside = army * field
						caps = [army, outside]
						war.deployed[0].levy = army * multiple
						war.deployed[1].levy = 100 + outside * multiple
						state.levyCurrent[0] = war.deployed[0].levy
						state.levyCurrent[1] = war.deployed[1].levy
						war.siege = {
							province: 1,
							startTime: 0,
							phase: 0,
							besieger: 0,
							besiegerSide: "attacker",
							startBesiegerStrength: army * 0.75,
							garrison: { 1: { levy: 100, regular: 0 } },
							startGarrison: 100,
							shortages: [],
							breaches: 0,
						}
						while (war.siege !== null) {
							state.time += 30 * 86400000
							state.heap = new EventHeap()
							state.events.length = 0
							SIEGE.tick({ state, warIdx: 0, rng })
						}
						const end = SIEGE_FIXTURE.result({ state })!
						phases.push(end.phases as number)
						const outcome = end.outcome as string
						outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
						vi.clearAllMocks()
					}
					phases.sort((a, b) => a - b)
					const median = phases[Math.floor(samples / 2)]
					const p99 = phases[Math.floor(samples * 0.99)]
					const max = phases.at(-1)!
					const failures =
						((outcomes.lifted ?? 0) + (outcomes.relieved ?? 0)) / samples
					const storms = (outcomes.stormed ?? 0) / samples
					results.push({
						terrain,
						multiple,
						ratio,
						field,
						median,
						p99,
						max,
						failures,
						storms,
						outcomes,
					})
					expect(median).toBeGreaterThanOrEqual(3)
					expect(median).toBeLessThanOrEqual(7)
					expect(p99).toBeLessThanOrEqual(17)
					expect(max).toBeLessThanOrEqual(30)
					expect(failures).toBeLessThanOrEqual(0.1)
					expect((outcomes.betrayed ?? 0) / samples).toBeLessThanOrEqual(0.09)
					if (ratio >= 2) {
						expect(storms).toBeGreaterThanOrEqual(0.1)
						expect(storms).toBeLessThanOrEqual(0.25)
					}
				}
	if (process.env.SIEGE_CALIBRATION_OUT)
		writeFileSync(
			process.env.SIEGE_CALIBRATION_OUT,
			JSON.stringify(results, null, "\t"),
		)
}, 600000)
