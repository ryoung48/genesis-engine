import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	DevelopmentParams,
	InitPopulationParams,
	RunPopulationParams,
	UrbanizationParams,
} from "@/model/history/sim/engine/events/population/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import { URBANIZATION } from "@/model/society/urbanization"

const MAX_ADJUSTMENT_RATE = 0.005

const URBAN_GROWTH = 0.1

function devToGrowthRate(dev: number): number {
	return MATH.piecewise({
		domain: [0.0, 0.15, 0.35, 0.55, 0.75, 0.95],
		range: [0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.002],
		x: dev,
	})
}

function urbanization({ state, init }: UrbanizationParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !STATE.isSovereign({ state, p })) continue

		const provinces = STATE.getNationProvinces({ state, root: p })
		let totalPop = 0
		for (const prov of provinces) {
			totalPop +=
				FIELDS.prov.population.rural.get({ state, p: prov }) +
				FIELDS.prov.population.urban.get({ state, p: prov })
		}

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
		})

		for (let idx = 0; idx < sorted.length; idx++) {
			const prov = sorted[idx]
			state.leaderRuntime.targetUrban[prov] = sizes[idx] ?? 0
			if (init) {
				FIELDS.prov.population.urban.set({
					state,
					p: prov,
					value: state.leaderRuntime.targetUrban[prov],
				})
			}
		}
	}
}

function development({ state, init }: DevelopmentParams): void {
	const { cityMin } = SETTLEMENT_TUNING.getSettlementEraTuning(state.era)
	const devFromCities = URBANIZATION.spreadDevelopment({
		count: state.P,
		cityMin,
		desolate: state.desolate,
		waterAccess: state.waterAccess,
		urbanAt: (p) => FIELDS.prov.population.urban.get({ state, p }),
		sovereignAt: (p) => STATE.getSovereign({ state, p }),
		neighborsAt: (p) => STATE.getProvinceNeighbors({ state, p }),
	})

	const DEV_RISE = 0.1
	const DEV_FALL = 0.05
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const localDev = URBANIZATION.urbanPopToDev(
			FIELDS.prov.population.urban.get({ state, p }),
		)
		const targetDev = Math.max(devFromCities[p], localDev)

		if (init) {
			FIELDS.prov.development.set({
				state,
				p,
				value: targetDev,
			})
		} else {
			const currentDev = FIELDS.prov.development.get({ state, p })
			const gap = targetDev - currentDev
			const rate = gap > 0 ? DEV_RISE : DEV_FALL
			FIELDS.prov.development.set({
				state,
				p,
				value: currentDev + gap * rate,
			})
		}
	}
}

function initPopulation({ state }: InitPopulationParams): void {
	urbanization({ state, init: true })
	development({ state, init: true })
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
	const duration = state.time - previousTime
	const yearFraction = duration / STATE.yearMs

	urbanization({ state, init: false })
	development({ state, init: false })

	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue

		const growth =
			1 +
			devToGrowthRate(FIELDS.prov.development.get({ state, p })) * yearFraction
		const rural = FIELDS.prov.population.rural.get({ state, p })
		FIELDS.prov.population.rural.set({
			state,
			p,
			value: rural * growth,
		})

		const urban = FIELDS.prov.population.urban.get({ state, p })
		const targetPop = state.leaderRuntime.targetUrban[p]
		const urbanGrowth = urban * growth
		const maxAdjustment = urbanGrowth * MAX_ADJUSTMENT_RATE * yearFraction

		let finalPop: number
		if (targetPop >= urbanGrowth) {
			const gap = targetPop - urbanGrowth
			const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
			finalPop = Math.min(urbanGrowth + adjustment, targetPop)
		} else {
			const gap = urbanGrowth - targetPop
			const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
			finalPop = Math.max(urbanGrowth - adjustment, targetPop)
		}

		FIELDS.prov.population.urban.set({
			state,
			p,
			value: finalPop,
		})
	}

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
	runPopulation,
}
