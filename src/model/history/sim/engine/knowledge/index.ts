import type {
	AdvanceKnowledgeParams,
	FillLiveParams,
	InitKnowledgeParams,
	KnowledgeLevelParams,
	LogisticsScaleParams,
	MaxCitySizeParams,
	OwnAdvanceParams,
	PopulationMeanParams,
	RealmKnowledgeParams,
	SovereignsParams,
	StartBaselineParams,
	StepParams,
	UrbanKnowledgeParams,
} from "@/model/history/sim/engine/knowledge/types"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"
import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import type { UrbanKnowledge } from "@/model/society/urbanization/types"

const ERA_BASELINE: Record<SocietyEra, number> = {
	paleolithic: -3,
	neolithic: -2,
	bronze: -1,
	iron: 0,
	lateMedieval: 1,
	earlyModern: 2,
	industrial: 3,
	information: 4,
}

const YEAR_BASELINE = {
	domain: [867, 1300, 1500, 1800],
	range: [0.42, 1, 1.44, 2.38],
}

const REALM_REFERENCE_POPULATION = 10_000_000

const REALM_EXPONENT = 0.3

const MAX_REALM_FACTOR = 2.5

const SPIN_UP_STEP_YEARS = 10

const DOMESTIC_DIFFUSION = 0.04

const FOREIGN_DIFFUSION = 0.015

const SELF_ADVANCE_CURVE = {
	domain: [0, 0.5, 1, 2, 3, 4],
	range: [0.0015, 0.003, 0.005, 0.006, 0.009, 0.005],
}

const MAX_LEAD_CURVE = {
	domain: [0.5, 1, 1.5, 2, 2.5],
	range: [0.45, 0.55, 1.0, 1.6, 2.0],
}

const GROWTH_CURVE = {
	domain: [0, 1, 2, 2.5, 3, 3.5, 4],
	range: [0.0008, 0.001, 0.0025, 0.004, 0.008, 0.01, 0.005],
}

const URBAN_FACTOR_CURVE = {
	domain: [0, 1, 2, 3, 4],
	range: [0.7, 1, 1.1, 1.6, 4],
}

const DEVELOPMENT_FLOOR_CURVE = {
	domain: [1, 2, 3, 4],
	range: [0.05, 0.1, 0.25, 0.45],
}

const CITY_SIZE_CURVE = {
	domain: [1, 2, 3, 3.5, 4],
	range: [350_000, 550_000, 650_000, 1_600_000, 5_000_000],
}

const PRODUCTIVITY_CURVE = {
	domain: [2, 3, 4],
	range: [1, 1.3, 3],
}

const EXTRACTION_CURVE = {
	domain: [1, 2, 3, 4],
	range: [0.015, 0.03, 0.1, 0.15],
}

// Foraging area grows with army size, so the distance a foraging army can
// sustain grows with the square root of its numbers (van Creveld, Supplying
// War, 1977, ch. 1): beyond the knee, extra troops add force as their square
// root. A design value, not a measured one.
const FIELD_ARMY_RETURNS = 0.5

const FIELD_ARMY_CURVE = {
	domain: [0, 1, 2, 3, 4],
	range: [25_000, 40_000, 120_000, 250_000, 600_000],
}

function populationMean({
	state,
	provinces,
	values,
}: PopulationMeanParams): number {
	let pop = 0
	let mass = 0
	for (const p of provinces) {
		if (state.desolate[p]) continue
		const provincePop = state.popRuralCurrent[p] + state.popUrbanCurrent[p]
		pop += provincePop
		mass += provincePop * values[p]
	}
	return pop > 0 ? mass / pop : 0
}

function allProvinces({ state }: InitKnowledgeParams): number[] {
	return Array.from({ length: state.P }, (_, p) => p)
}

function realmKnowledge({ state, provinces }: RealmKnowledgeParams): number {
	return populationMean({ state, provinces, values: state.knowledgeCurrent })
}

function sovereigns({ state }: SovereignsParams): Int32Array {
	const sovereign = new Int32Array(state.P)
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p]) sovereign[p] = STATE.getSovereign({ state, p })
	return sovereign
}

function fillLive({ state, value }: FillLiveParams): void {
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p]) state.knowledgeCurrent[p] = value
}

function initKnowledge({ state }: InitKnowledgeParams): void {
	const baseline = state.knowledgeBaseline
	const origin = ERA_BASELINE[state.era] - 1
	const provinces = allProvinces({ state })
	state.knowledgeSpinUp = { origin, years: 0 }
	fillLive({ state, value: origin })
	let mean = populationMean({
		state,
		provinces,
		values: state.knowledgeCurrent,
	})
	if (baseline <= origin || mean >= baseline) {
		fillLive({ state, value: baseline })
		return
	}
	const sovereign = sovereigns({ state })
	let current: Float32Array = state.knowledgeCurrent
	let next: Float32Array = state.knowledgeCurrent.slice()
	let years = 0
	for (;;) {
		step({
			state,
			current,
			next,
			sovereign,
			yearFraction: SPIN_UP_STEP_YEARS,
			worldKnowledge: mean,
		})
		const after = populationMean({ state, provinces, values: next })
		if (after <= mean) {
			fillLive({ state, value: baseline })
			state.knowledgeSpinUp = { origin, years: 0 }
			return
		}
		if (after >= baseline) {
			const fraction = (baseline - mean) / (after - mean)
			for (let p = 0; p < state.P; p++)
				if (!state.desolate[p]) current[p] += (next[p] - current[p]) * fraction
			years += SPIN_UP_STEP_YEARS * fraction
			break
		}
		years += SPIN_UP_STEP_YEARS
		mean = after
		const done = current
		current = next
		next = done
	}
	if (current !== state.knowledgeCurrent) state.knowledgeCurrent.set(current)
	state.knowledgeSpinUp = { origin, years }
}

function selfAdvanceRate({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: SELF_ADVANCE_CURVE.domain,
		range: SELF_ADVANCE_CURVE.range,
		x: knowledge,
	})
}

function maxLead({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: MAX_LEAD_CURVE.domain,
		range: MAX_LEAD_CURVE.range,
		x: knowledge,
	})
}

function ownAdvance({
	knowledge,
	worldKnowledge,
	development,
}: OwnAdvanceParams): number {
	const drag = Math.max(
		0,
		1 - (knowledge - worldKnowledge) / maxLead({ knowledge: worldKnowledge }),
	)
	return selfAdvanceRate({ knowledge }) * development * Math.min(1, drag)
}
function step({
	state,
	current,
	next,
	sovereign,
	yearFraction,
	worldKnowledge,
}: StepParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const knowledge = current[p]
		const own = ownAdvance({
			knowledge,
			worldKnowledge,
			development: state.developmentCurrent[p],
		})
		let pull = 0
		for (
			let i = state.provinceAdjOffset[p];
			i < state.provinceAdjOffset[p + 1];
			i++
		) {
			const nb = state.provinceAdjList[i]
			if (state.desolate[nb]) continue
			const gap = current[nb] - knowledge
			if (gap <= 0) continue
			const rate =
				sovereign[nb] === sovereign[p] ? DOMESTIC_DIFFUSION : FOREIGN_DIFFUSION
			pull = Math.max(pull, gap * rate)
		}
		next[p] = knowledge + (own + pull) * yearFraction
	}
}

function advanceKnowledge({
	state,
	yearFraction,
}: AdvanceKnowledgeParams): void {
	const next = state.knowledgeCurrent.slice()
	step({
		state,
		current: state.knowledgeCurrent,
		next,
		sovereign: sovereigns({ state }),
		yearFraction,
		worldKnowledge: realmKnowledge({
			state,
			provinces: allProvinces({ state }),
		}),
	})
	state.knowledgeCurrent.set(next)
}

function growthRate({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: GROWTH_CURVE.domain,
		range: GROWTH_CURVE.range,
		x: knowledge,
	})
}

function urbanFactor({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: URBAN_FACTOR_CURVE.domain,
		range: URBAN_FACTOR_CURVE.range,
		x: knowledge,
	})
}

function developmentFloor({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: DEVELOPMENT_FLOOR_CURVE.domain,
		range: DEVELOPMENT_FLOOR_CURVE.range,
		x: knowledge,
	})
}

function maxCitySize({
	knowledge,
	realmPopulation,
}: MaxCitySizeParams): number {
	const base = MATH.piecewise({
		domain: CITY_SIZE_CURVE.domain,
		range: CITY_SIZE_CURVE.range,
		x: knowledge,
	})
	const realmFactor = Math.min(
		MAX_REALM_FACTOR,
		(realmPopulation / REALM_REFERENCE_POPULATION) ** REALM_EXPONENT,
	)
	return base * realmFactor
}

function productivity({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: PRODUCTIVITY_CURVE.domain,
		range: PRODUCTIVITY_CURVE.range,
		x: knowledge,
	})
}

function extractionRate({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: EXTRACTION_CURVE.domain,
		range: EXTRACTION_CURVE.range,
		x: knowledge,
	})
}

function fieldArmyKnee({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: FIELD_ARMY_CURVE.domain,
		range: FIELD_ARMY_CURVE.range,
		x: knowledge,
	})
}

function logisticsScale({ knee, troops }: LogisticsScaleParams): number {
	if (troops <= knee) return 1
	return (knee / troops) ** (1 - FIELD_ARMY_RETURNS)
}

function eraBaseline(era: SocietyEra): number {
	return ERA_BASELINE[era]
}

function startBaseline({ era, startYear }: StartBaselineParams): number {
	return startYear === undefined && era !== ERAS.defaultEra
		? eraBaseline(era)
		: yearBaseline(startYear ?? STATE.defaultStartYear)
}

function urbanKnowledge({
	era,
	baseline,
}: UrbanKnowledgeParams): UrbanKnowledge {
	return {
		urbanFactor:
			urbanFactor({ knowledge: baseline }) /
			urbanFactor({ knowledge: eraBaseline(era) }),
		maxCitySize: (realmPopulation) =>
			maxCitySize({ knowledge: baseline, realmPopulation }),
	}
}

function yearBaseline(year: number): number {
	return MATH.piecewise({
		domain: YEAR_BASELINE.domain,
		range: YEAR_BASELINE.range,
		x: year,
	})
}

export const KNOWLEDGE = {
	ownAdvance,
	initKnowledge,
	advanceKnowledge,
	growthRate,
	urbanFactor,
	developmentFloor,
	maxCitySize,
	productivity,
	extractionRate,
	fieldArmyKnee,
	logisticsScale,
	realmKnowledge,
	eraBaseline,
	yearBaseline,
	startBaseline,
	urbanKnowledge,
}
