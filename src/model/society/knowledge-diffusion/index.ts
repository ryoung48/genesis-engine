import { MATH } from "@/model/shared/math/core"
import type {
	DiffusionStepParams,
	KnowledgeLevelParams,
	OwnAdvanceParams,
	PopulationMeanParams,
	SpinUpParams,
} from "@/model/society/knowledge-diffusion/types"

const SPIN_UP_STEP_YEARS = 10

const DOMESTIC_DIFFUSION = 0.04

const FOREIGN_DIFFUSION = 0.015

const SELF_ADVANCE_CURVE = {
	domain: [0, 0.5, 1],
	range: [0.0018, 0.0036, 0.006],
}

const MAX_LEAD_CURVE = {
	domain: [0.5, 1, 1.5, 2, 2.5],
	range: [0.45, 0.55, 1.0, 1.6, 2.0],
}

function selfAdvanceRate({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({ ...SELF_ADVANCE_CURVE, x: knowledge })
}

function maxLead({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({ ...MAX_LEAD_CURVE, x: knowledge })
}

function ownAdvance({
	knowledge,
	heldKnowledge,
	development,
}: OwnAdvanceParams): number {
	const drag = Math.max(
		0,
		1 - (knowledge - heldKnowledge) / maxLead({ knowledge: heldKnowledge }),
	)
	return selfAdvanceRate({ knowledge }) * development * Math.min(1, drag)
}

function step({
	graph,
	current,
	next,
	yearFraction,
	heldKnowledge,
}: DiffusionStepParams): void {
	for (let p = 0; p < graph.count; p++) {
		if (graph.desolate[p]) continue
		const knowledge = current[p]
		const own = ownAdvance({
			knowledge,
			heldKnowledge,
			development: graph.development[p],
		})
		let pull = 0
		for (let i = graph.adjOffset[p]; i < graph.adjOffset[p + 1]; i++) {
			const nb = graph.adjList[i]
			if (graph.desolate[nb]) continue
			const gap = current[nb] - knowledge
			if (gap <= 0) continue
			const rate =
				graph.sovereign[nb] === graph.sovereign[p]
					? DOMESTIC_DIFFUSION
					: FOREIGN_DIFFUSION
			pull = Math.max(pull, gap * rate)
		}
		next[p] = knowledge + (own + pull) * yearFraction
	}
}

function populationMean({
	values,
	population,
	include,
}: PopulationMeanParams): number {
	let pop = 0
	let mass = 0
	for (let p = 0; p < include.length; p++) {
		if (!include[p]) continue
		pop += population[p]
		mass += population[p] * values[p]
	}
	return pop > 0 ? mass / pop : 0
}

function spinUp({
	graph,
	values,
	population,
	held,
	baseline,
}: SpinUpParams): number {
	const live = Uint8Array.from(graph.desolate, (desolate) => (desolate ? 0 : 1))
	const fill = (value: number) => {
		for (let p = 0; p < graph.count; p++) if (live[p]) values[p] = value
	}
	let mean = populationMean({ values, population, include: live })
	if (mean >= baseline) {
		fill(baseline)
		return 0
	}
	let current: Float32Array = values
	let next: Float32Array = values.slice()
	let years = 0
	for (;;) {
		step({
			graph,
			current,
			next,
			yearFraction: SPIN_UP_STEP_YEARS,
			heldKnowledge: populationMean({
				values: current,
				population,
				include: held,
			}),
		})
		const after = populationMean({ values: next, population, include: live })
		if (after <= mean) {
			fill(baseline)
			return 0
		}
		if (after >= baseline) {
			const fraction = (baseline - mean) / (after - mean)
			for (let p = 0; p < graph.count; p++)
				if (live[p]) current[p] += (next[p] - current[p]) * fraction
			years += SPIN_UP_STEP_YEARS * fraction
			break
		}
		years += SPIN_UP_STEP_YEARS
		mean = after
		const done = current
		current = next
		next = done
	}
	if (current !== values) values.set(current)
	return years
}

export const KNOWLEDGE_DIFFUSION = { step, populationMean, spinUp }
