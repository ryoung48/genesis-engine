import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	CityTargetsParams,
	DevelopmentParams,
	InitPopulationParams,
	RunPopulationParams,
	UrbanizationParams,
} from "@/model/history/sim/engine/events/population/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import { URBANIZATION } from "@/model/society/urbanization"

const MAX_ADJUSTMENT_RATE = 0.03

const URBAN_GROWTH = 0.1

const TOWN_SEED = 1_000

const TOWN_LIMIT = 25_000

const RANK_CAP_EXPONENT = 1.3

function cityTargets({
	state,
	sorted,
	sizes,
	init,
	realmPopulation,
}: CityTargetsParams): number[] {
	const targets = sorted.map((prov, idx) =>
		Math.min(
			sizes[idx] ?? 0,
			KNOWLEDGE.maxCitySize({
				knowledge: init
					? state.knowledgeBaseline
					: FIELDS.prov.knowledge.get({ state, p: prov }),
				realmPopulation,
			}) /
				(idx + 1) ** RANK_CAP_EXPONENT,
		),
	)
	let excess = 0
	for (let idx = 0; idx < sizes.length; idx++)
		excess += sizes[idx] - targets[idx]
	let ruralMass = 0
	for (let idx = 0; idx < sorted.length; idx++)
		if (targets[idx] < TOWN_LIMIT)
			ruralMass += FIELDS.prov.population.rural.get({ state, p: sorted[idx] })
	if (excess <= 0 || ruralMass <= 0) return targets
	for (let idx = 0; idx < sorted.length; idx++) {
		if (targets[idx] >= TOWN_LIMIT) continue
		const share =
			(excess * FIELDS.prov.population.rural.get({ state, p: sorted[idx] })) /
			ruralMass
		targets[idx] = Math.min(TOWN_LIMIT, targets[idx] + share)
	}
	return targets
}

function urbanization({ state, init, yearFraction }: UrbanizationParams): void {
	const eraFactor = KNOWLEDGE.urbanFactor({
		knowledge: KNOWLEDGE.eraBaseline(state.era),
	})
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !STATE.isSovereign({ state, p })) continue

		const provinces = STATE.getNationProvinces({ state, root: p })
		let totalPop = 0
		let totalRural = 0
		for (const prov of provinces) {
			const rural = FIELDS.prov.population.rural.get({ state, p: prov })
			totalPop += rural + FIELDS.prov.population.urban.get({ state, p: prov })
			totalRural += rural
		}
		const knowledge = KNOWLEDGE.realmKnowledge({ state, provinces })

		const sorted = URBANIZATION.sortByRank({
			provinces,
			root: p,
			seatRank: state.seatRank,
			habitability: state.habitability,
		})
		const sizes = URBANIZATION.rankSizesForNation({
			governmentTypeIndex: state.governmentType[p],
			totalPopulation: totalPop,
			provinceCount: sorted.length,
			urbanFactor:
				KNOWLEDGE.urbanFactor({
					knowledge: init ? state.knowledgeBaseline : knowledge,
				}) / eraFactor,
		})

		const targets = cityTargets({
			state,
			sorted,
			sizes,
			init,
			realmPopulation: totalPop,
		})
		let migrants = 0
		for (let idx = 0; idx < sorted.length; idx++) {
			const prov = sorted[idx]
			const target = targets[idx]
			state.leaderRuntime.targetUrban[prov] = target
			if (init) {
				state.popUrbanCurrent[prov] = target
				continue
			}
			const urban = FIELDS.prov.population.urban.get({ state, p: prov })
			const maxAdjustment =
				Math.max(urban, TOWN_SEED) * MAX_ADJUSTMENT_RATE * yearFraction
			const gap = target - urban
			const adjustment =
				Math.sign(gap) * Math.min(Math.abs(gap) * URBAN_GROWTH, maxAdjustment)
			state.popUrbanCurrent[prov] = urban + adjustment
			migrants += adjustment
		}
		if (init || totalRural <= 0) continue

		const ruralScale = Math.max(0, 1 - migrants / totalRural)
		for (const prov of provinces)
			state.popRuralCurrent[prov] = state.popRuralCurrent[prov] * ruralScale
	}
}

function development({ state, init }: DevelopmentParams): void {
	const { cityMin } = SETTLEMENT_TUNING.getSettlementEraTuning(state.era)
	const devFromCities = URBANIZATION.spreadDevelopment({
		count: state.P,
		cityMin,
		desolate: state.desolate,
		waterAccess: state.waterAccess,
		adjOffset: state.provinceAdjOffset,
		adjList: state.provinceAdjList,
		urbanAt: (p) => FIELDS.prov.population.urban.get({ state, p }),
		sovereignAt: (p) => STATE.getSovereign({ state, p }),
	})

	const DEV_RISE = 0.1
	const DEV_FALL = 0.05
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const localDev = URBANIZATION.urbanPopToDev(
			FIELDS.prov.population.urban.get({ state, p }),
		)
		const floor = init
			? 0
			: KNOWLEDGE.developmentFloor({
					knowledge: FIELDS.prov.knowledge.get({ state, p }),
				})
		const targetDev = Math.max(devFromCities[p], localDev, floor)

		if (init) {
			state.developmentCurrent[p] = targetDev
		} else {
			const currentDev = state.developmentCurrent[p]
			const gap = targetDev - currentDev
			const rate = gap > 0 ? DEV_RISE : DEV_FALL
			state.developmentCurrent[p] = currentDev + gap * rate
		}
	}
}

function initPopulation({ state }: InitPopulationParams): void {
	urbanization({ state, init: true, yearFraction: 0 })
	development({ state, init: true })
	KNOWLEDGE.initKnowledge({ state })
	state.heap.enqueue(
		state.time + STATE.yearMs,
		EVENT_HEAP.evt.CENSUS,
		0,
		0,
		0,
		0,
		state.time,
	)
}

function runPopulation({ state, previousTime }: RunPopulationParams): void {
	state.censusVersion++
	MILITARY.beforeCensus({ state })
	const yearFraction = (state.time - previousTime) / STATE.yearMs

	const factors = new Map<number, number>()
	KNOWLEDGE.advanceKnowledge({
		state,
		yearFraction,
		ownFactor: (realm) => {
			let factor = factors.get(realm)
			if (factor === undefined) {
				factor = GOVERNOR.factor({
					attribute: "learning",
					value: GOVERNOR.attribute({ state, realm, attribute: "learning" }),
				})
				factors.set(realm, factor)
			}
			return factor
		},
	})

	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const growth =
			1 +
			KNOWLEDGE.growthRate({
				knowledge: FIELDS.prov.knowledge.get({ state, p }),
			}) *
				yearFraction
		state.popRuralCurrent[p] = state.popRuralCurrent[p] * growth
		state.popUrbanCurrent[p] = state.popUrbanCurrent[p] * growth
	}

	urbanization({ state, init: false, yearFraction })
	development({ state, init: false })

	// Schedule next census
	state.heap.enqueue(
		state.time + STATE.yearMs,
		EVENT_HEAP.evt.CENSUS,
		0,
		0,
		0,
		0,
		state.time,
	)
}

export const POPULATION = {
	initPopulation,
	runPopulation: (params: RunPopulationParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => runPopulation(params),
		}),
}
