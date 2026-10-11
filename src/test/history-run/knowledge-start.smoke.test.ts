import { expect, it } from "vitest"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { HISTORY_RUN } from "@/test/history-run"

const SEED = 14963991
const POINTS = 30_000

function populationMean(engine: HistoryState): number {
	let pop = 0
	let mass = 0
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p]) continue
		const provincePop = engine.popRuralCurrent[p] + engine.popUrbanCurrent[p]
		pop += provincePop
		mass += provincePop * engine.knowledgeCurrent[p]
	}
	return mass / pop
}

it.each([
	867, 1500,
])("spins knowledge up from the preceding era and lands on the %i baseline", (startYear) => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: SEED,
		era: "lateMedieval",
		numPoints: POINTS,
		startYear,
	})
	const origin = KNOWLEDGE.eraBaseline("lateMedieval") - 1
	let below = 0
	let lowest = Number.POSITIVE_INFINITY
	let highest = Number.NEGATIVE_INFINITY
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p]) continue
		const knowledge = engine.knowledgeCurrent[p]
		if (knowledge < origin) below++
		lowest = Math.min(lowest, knowledge)
		highest = Math.max(highest, knowledge)
	}
	expect(below).toBe(0)
	expect(highest).toBeGreaterThan(lowest)
	expect(
		Math.abs(populationMean(engine) - engine.knowledgeBaseline),
	).toBeLessThan(1e-4)
	expect(engine.knowledgeSpinUp.origin).toBe(origin)
	expect(engine.knowledgeSpinUp.years).toBeGreaterThan(0)
})

it("is deterministic and falls back to the uniform baseline without population", () => {
	const params = {
		seed: SEED,
		era: "lateMedieval",
		numPoints: POINTS,
	} as const
	const first = HISTORY_RUN.createEngine(params).engine
	const second = HISTORY_RUN.createEngine(params).engine
	expect(second.knowledgeCurrent).toEqual(first.knowledgeCurrent)
	expect(second.knowledgeSpinUp).toEqual(first.knowledgeSpinUp)

	first.popRuralCurrent.fill(0)
	first.popUrbanCurrent.fill(0)
	KNOWLEDGE.initKnowledge({ state: first })
	let off = 0
	for (let p = 0; p < first.P; p++)
		if (
			!first.desolate[p] &&
			Math.abs(first.knowledgeCurrent[p] - first.knowledgeBaseline) > 1e-6
		)
			off++
	expect(off).toBe(0)
	expect(first.knowledgeSpinUp.years).toBe(0)
})
