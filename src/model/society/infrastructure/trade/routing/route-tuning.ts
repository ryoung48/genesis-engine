import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { SocietyEra } from "@/model/society/types"

export const ROUTE_TUNING = {
	land: {
		minBodyShare: 0.001,
		majorMaxLengthKm: 3_000,
		minorMaxLengthKm: 1_000,
		newEdgeCost: 1,
		existingEdgeCost: 0.25,
	},
	sea: {
		maxLengthKm: 5_000,
		shortRouteMaxLengthKm: 2_500,
		minBodyShare: 0.001,
		coastalPenalty: 10,
		nearCoastPenalty: 1,
		newEdgeCost: 1,
		existingEdgeCost: 0.25,
	},
} as const

export function routePopulationThresholds(era: SocietyEra) {
	const tuning = SETTLEMENT_TUNING.getSettlementEraTuning(era)
	return {
		majorSettlementMin: tuning.cityMin * 2,
		minorSettlementMin: tuning.townMin,
		portSettlementMin: tuning.townMin,
		shortRouteMaxPop: tuning.cityMin,
	}
}
