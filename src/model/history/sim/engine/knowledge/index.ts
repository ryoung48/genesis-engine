import { FIELDS } from "@/model/history/sim/engine/fields"
import type {
	AdvanceKnowledgeParams,
	InitKnowledgeParams,
	KnowledgeLevelParams,
	MaxCitySizeParams,
	PopulationMeanParams,
	RealmKnowledgeParams,
} from "@/model/history/sim/engine/knowledge/types"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"
import type { SocietyEra } from "@/model/society/types"

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

const INITIAL_LEAD = 0.5

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

const FIELD_ARMY_CURVE = {
	domain: [0, 1, 2, 3, 4],
	range: [25_000, 40_000, 120_000, 400_000, 1_500_000],
}

function populationMean({
	state,
	provinces,
	value,
}: PopulationMeanParams): number {
	let pop = 0
	let mass = 0
	for (const p of provinces) {
		if (state.desolate[p]) continue
		const provincePop = state.popRuralCurrent[p] + state.popUrbanCurrent[p]
		pop += provincePop
		mass += provincePop * value(p)
	}
	return pop > 0 ? mass / pop : 0
}

function allProvinces({ state }: InitKnowledgeParams): number[] {
	return Array.from({ length: state.P }, (_, p) => p)
}

function realmKnowledge({ state, provinces }: RealmKnowledgeParams): number {
	return populationMean({
		state,
		provinces,
		value: (p) => FIELDS.prov.knowledge.get({ state, p }),
	})
}

function initKnowledge({ state }: InitKnowledgeParams): void {
	const meanDev = populationMean({
		state,
		provinces: allProvinces({ state }),
		value: (p) => FIELDS.prov.development.get({ state, p }),
	})
	const baseline = state.knowledgeBaseline
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		FIELDS.prov.knowledge.set({
			state,
			p,
			value:
				baseline +
				INITIAL_LEAD * (FIELDS.prov.development.get({ state, p }) - meanDev),
		})
	}
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

function advanceKnowledge({
	state,
	yearFraction,
}: AdvanceKnowledgeParams): void {
	const worldKnowledge = realmKnowledge({
		state,
		provinces: allProvinces({ state }),
	})
	const leadLimit = maxLead({ knowledge: worldKnowledge })
	const next = state.knowledgeCurrent.slice()
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const knowledge = FIELDS.prov.knowledge.get({ state, p })
		const drag = Math.max(0, 1 - (knowledge - worldKnowledge) / leadLimit)
		const own =
			selfAdvanceRate({ knowledge }) *
			FIELDS.prov.development.get({ state, p }) *
			Math.min(1, drag)
		const sovereign = STATE.getSovereign({ state, p })
		let pull = 0
		for (const nb of STATE.getProvinceNeighbors({ state, p })) {
			if (state.desolate[nb]) continue
			const gap = FIELDS.prov.knowledge.get({ state, p: nb }) - knowledge
			if (gap <= 0) continue
			const rate =
				STATE.getSovereign({ state, p: nb }) === sovereign
					? DOMESTIC_DIFFUSION
					: FOREIGN_DIFFUSION
			pull = Math.max(pull, gap * rate)
		}
		next[p] = knowledge + (own + pull) * yearFraction
	}
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p])
			FIELDS.prov.knowledge.set({ state, p, value: next[p] })
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

function maxFieldArmy({ knowledge }: KnowledgeLevelParams): number {
	return MATH.piecewise({
		domain: FIELD_ARMY_CURVE.domain,
		range: FIELD_ARMY_CURVE.range,
		x: knowledge,
	})
}

function eraBaseline(era: SocietyEra): number {
	return ERA_BASELINE[era]
}

function yearBaseline(year: number): number {
	return MATH.piecewise({
		domain: YEAR_BASELINE.domain,
		range: YEAR_BASELINE.range,
		x: year,
	})
}

export const KNOWLEDGE = {
	initKnowledge,
	advanceKnowledge,
	growthRate,
	urbanFactor,
	developmentFloor,
	maxCitySize,
	productivity,
	extractionRate,
	maxFieldArmy,
	realmKnowledge,
	eraBaseline,
	yearBaseline,
}
