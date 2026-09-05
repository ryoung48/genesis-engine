import type {
	BuildOceanCurrentGridParams,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/display/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import type { FlowGrid } from "@/model/climate/weather/wind/types"
import { UNITS } from "@/model/shared/units"

const SST_ANOMALY_SATURATION_C = 4
const OCEAN_CURRENT_SMOOTHING_PASSES = 2

function buildOceanCurrentGrid({
	mesh,
	isLand,
	oceanCurrents,
	month,
	params,
}: BuildOceanCurrentGridParams): FlowGrid {
	const n = mesh.numRegions
	const sst =
		month !== undefined
			? oceanCurrents.sstMonthly.subarray(month * n, (month + 1) * n)
			: oceanCurrents.sst
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const planetRadiusKm = params.planetRadiusKm
	const reverseCirculation = UNITS.isRetrogradeObliquity(params.obliquity)
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const gradX = new Float32Array(N)
	const gradY = new Float32Array(N)
	const smoothedX = new Float32Array(N)
	const smoothedY = new Float32Array(N)
	const currentU = new Float32Array(N)
	const currentV = new Float32Array(N)
	const currentSpeed = new Float32Array(N)

	const wrapLonDeltaDeg = (delta: number): number => {
		if (delta > 180) return delta - 360
		if (delta < -180) return delta + 360
		return delta
	}

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		let gx = 0
		let gy = 0
		let weightSum = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dx =
				wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r]) *
				Math.cos((((latDeg[r] + latDeg[nb]) * 0.5) / 180) * Math.PI)
			const dy = latDeg[nb] - latDeg[r]
			const distSq = dx * dx + dy * dy
			if (distSq <= 1e-6) continue
			const neighbourSst = isLand[nb] ? 0 : sst[nb]
			const dw = neighbourSst - sst[r]
			gx += (dw * dx) / distSq
			gy += (dw * dy) / distSq
			weightSum += 1
		}
		if (weightSum > 0) {
			gradX[r] = gx / weightSum
			gradY[r] = gy / weightSum
		}
	}

	let srcX = gradX
	let srcY = gradY
	let dstX = smoothedX
	let dstY = smoothedY
	for (let pass = 0; pass < OCEAN_CURRENT_SMOOTHING_PASSES; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) {
				dstX[r] = 0
				dstY[r] = 0
				continue
			}
			let sumX = srcX[r]
			let sumY = srcY[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) continue
				sumX += srcX[nb]
				sumY += srcY[nb]
				count++
			}
			dstX[r] = sumX / count
			dstY[r] = sumY / count
		}
		;[srcX, dstX] = [dstX, srcX]
		;[srcY, dstY] = [dstY, srcY]
	}

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		const hemisphereTurn =
			params.tideLock?.type === "solar"
				? 1
				: (latDeg[r] >= 0 ? 1 : -1) * (reverseCirculation ? -1 : 1)
		const u = srcY[r] * hemisphereTurn
		const v = -srcX[r] * hemisphereTurn
		const speed = Math.hypot(u, v)
		currentU[r] = u
		currentV[r] = v
		currentSpeed[r] = speed
	}

	const maxCoastHops = Math.round(
		600 / UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm }),
	)
	const coastalOcean = new Uint8Array(N)
	const bfsQueue = new Int32Array(N)
	const bfsDist = new Int32Array(N).fill(-1)
	let head = 0
	let tail = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && bfsDist[nb] < 0) {
				bfsDist[nb] = 0
				coastalOcean[nb] = 1
				bfsQueue[tail++] = nb
			}
		}
	}
	while (head < tail) {
		const r = bfsQueue[head++]
		if (bfsDist[r] >= maxCoastHops) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && bfsDist[nb] < 0) {
				bfsDist[nb] = bfsDist[r] + 1
				coastalOcean[nb] = 1
				bfsQueue[tail++] = nb
			}
		}
	}

	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: currentU,
		vectorV: currentV,
		vectorSpeed: currentSpeed,
		options: {
			scalar: sst,
			allowCell: (region) => !isLand[region] && coastalOcean[region] === 1,
			isBlockedRegion: (region) => !!isLand[region],
		},
	})
}

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

export const OCEAN_CURRENT_DISPLAY = {
	buildOceanCurrentGrid,
	observedOceanCurrentGridForMonth,
}
