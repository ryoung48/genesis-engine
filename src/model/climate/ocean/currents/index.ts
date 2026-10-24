import type {
	BuildOceanCurrentGridParams,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/types"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import { WIND } from "@/model/climate/weather/wind"
import type { FlowGrid } from "@/model/climate/weather/wind/types"

// SST anomaly (°C vs zonal mean) at which the observed (NOAA) overlay's
// warm/cold color scale saturates to ±1 -- tuned to the magnitude of real
// western-boundary currents like the Gulf Stream/Kuroshio.
const SST_ANOMALY_SATURATION_C = 4

function buildOceanCurrentGrid({
	mesh,
	isLand,
	oceanCurrents,
	month,
}: BuildOceanCurrentGridParams): FlowGrid {
	return SURFACE_FLOW.toGrid({
		mesh,
		isLand,
		fields: SURFACE_FLOW.forDisplayMonth({
			oceanCurrents,
			numRegions: mesh.numRegions,
			month,
		}),
		allowCell: (region) => !isLand[region],
	})
}

// Same FlowGrid shape as buildOceanCurrentGrid, sourced from the observed
// GODAS surface current and OISST anomaly for comparison against the model.
function observedOceanCurrentGridForMonth({
	mesh,
	isLand,
	observedCurrent,
	month,
}: ObservedOceanCurrentGridParams): FlowGrid {
	const N = mesh.numRegions
	const currentU = new Float32Array(N)
	const currentV = new Float32Array(N)
	const currentSpeed = new Float32Array(N)
	const warmth = new Float32Array(N)

	const realU = observedCurrent?.real_u_monthly
	const realV = observedCurrent?.real_v_monthly
	const realSst = observedCurrent?.real_sst_anomaly_monthly
	if (realU && realV) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			let u: number
			let v: number
			if (month !== undefined && month >= 0 && month < 12) {
				u = realU[month * N + r]
				v = realV[month * N + r]
			} else {
				let uSum = 0
				let vSum = 0
				let count = 0
				for (let m = 0; m < 12; m++) {
					const uu = realU[m * N + r]
					const vv = realV[m * N + r]
					if (Number.isFinite(uu) && Number.isFinite(vv)) {
						uSum += uu
						vSum += vv
						count++
					}
				}
				u = count > 0 ? uSum / count : NaN
				v = count > 0 ? vSum / count : NaN
			}
			if (!Number.isFinite(u) || !Number.isFinite(v)) continue
			currentU[r] = u
			currentV[r] = v
			currentSpeed[r] = Math.hypot(u, v)
		}
	}
	if (realSst) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			let sst: number
			if (month !== undefined && month >= 0 && month < 12) {
				sst = realSst[month * N + r]
			} else {
				let sum = 0
				let count = 0
				for (let m = 0; m < 12; m++) {
					const v = realSst[m * N + r]
					if (Number.isFinite(v)) {
						sum += v
						count++
					}
				}
				sst = count > 0 ? sum / count : NaN
			}
			if (!Number.isFinite(sst)) continue
			warmth[r] = Math.max(-1, Math.min(1, sst / SST_ANOMALY_SATURATION_C))
		}
	}

	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: currentU,
		vectorV: currentV,
		vectorSpeed: currentSpeed,
		options: {
			scalar: warmth,
			allowCell: (region) => !isLand[region] && currentSpeed[region] > 0,
			isBlockedRegion: (region) => !!isLand[region],
		},
	})
}

export const OCEAN_CURRENTS = {
	buildOceanCurrentGrid,
	observedOceanCurrentGridForMonth,
	sstAnomalySaturationC: SST_ANOMALY_SATURATION_C,
}
