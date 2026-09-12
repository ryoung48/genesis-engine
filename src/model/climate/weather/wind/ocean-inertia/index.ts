import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import type { LaggedSeaLevelTempsParams } from "@/model/climate/weather/wind/ocean-inertia/types"

const MONTHS = 12

// Sea-level temperature with the ocean's thermal inertia applied: each ocean
// cell is a first-order (exponentially weighted) response to its preceding
// months, on the mixed layer's relaxation time, which damps and delays its
// seasonal cycle. Land responds within the month and is left as is.
function laggedSeaLevelTemps({
	climate,
	elevation_km,
	month,
	monthSeconds,
}: LaggedSeaLevelTempsParams): Float32Array {
	const N = elevation_km.length
	const monthly = climate.temperature_monthly_nolapse
	const decay = Math.exp(-monthSeconds / MIXED_LAYER.relaxationSeconds)
	const weights = Array.from({ length: MONTHS }, (_, k) => decay ** k)
	const total = weights.reduce((sum, w) => sum + w, 0)
	const out = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0) {
			out[r] = monthly[month * N + r]
			continue
		}
		let sum = 0
		for (let k = 0; k < MONTHS; k++)
			sum += weights[k] * monthly[((month - k + MONTHS) % MONTHS) * N + r]
		out[r] = sum / total
	}
	return out
}

export const OCEAN_INERTIA = {
	laggedSeaLevelTemps,
}
