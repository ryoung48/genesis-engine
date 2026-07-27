import { SimplexNoise } from "@/model/shared"
import type {
	ApplyTemperatureNoiseParams,
	RecomputeAnnualTemperatureStatsParams,
} from "@/model/climate/temperature-shared/types"

function applyTemperatureNoise({
	mesh,
	N,
	seed,
	temperature_monthly,
	temperature_monthly_nolapse,
	computeTaper,
	includeCell,
	temperature_avg,
	temperature_min,
	temperature_max,
}: ApplyTemperatureNoiseParams): void {
	const sn1 = new SimplexNoise(seed + 3001)
	const sn2 = new SimplexNoise(seed + 3002)
	const FREQ1 = 3.0
	const FREQ2 = 7.0
	const AMP1 = 3.0
	const AMP2 = 1.2

	for (let r = 0; r < N; r++) {
		if (!includeCell(r)) continue
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		const taper = computeTaper(r, x, y, z)
		const n =
			sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
			sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
		const offset = n * Math.max(0, taper)

		if (temperature_avg) temperature_avg[r] += offset
		if (temperature_min) temperature_min[r] += offset
		if (temperature_max) temperature_max[r] += offset
		for (let month = 0; month < 12; month++) {
			temperature_monthly[month * N + r] += offset
			temperature_monthly_nolapse[month * N + r] += offset
		}
	}
}

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
	applyTemperatureNoise,
	recomputeAnnualTemperatureStats,
}
