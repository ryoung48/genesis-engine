import type { RecomputeAnnualTemperatureStatsParams } from "@/model/climate/shared/temperature/types"

function recomputeAnnualTemperatureStats({
	temperature_monthly,
	temperature_avg,
	temperature_min,
	temperature_max,
	N,
}: RecomputeAnnualTemperatureStatsParams): void {
	for (let r = 0; r < N; r++) {
		let sum = 0
		let min = Infinity
		let max = -Infinity
		for (let month = 0; month < 12; month++) {
			const value = temperature_monthly[month * N + r]
			sum += value
			if (value < min) min = value
			if (value > max) max = value
		}
		temperature_avg[r] = sum / 12
		temperature_min[r] = min
		temperature_max[r] = max
	}
}

export const TEMPERATURE_SHARED = {
	recomputeAnnualTemperatureStats,
}
