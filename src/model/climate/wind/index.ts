import type { SphereMesh } from "@/model"
import { WIND as LOCKED_WIND } from "@/model/climate/locked/wind"
import { RAIN } from "@/model/climate/rain"
import type {
	ComputeWindVectorsInput,
	FlowGrid,
	RasterizeVectorGridInput,
	WindGrid,
	WindSurface,
} from "@/model/climate/wind/types"
import {
	clamp,
	HOURS_PER_DAY,
	isRetrogradeObliquity,
	smoothstep,
} from "@/model/shared"
import {
	TOPO_FLAT,
	TOPO_HILL,
	TOPO_LAKE,
	TOPO_MARSH,
	TOPO_MOUNTAIN,
	TOPO_OCEAN,
	TOPO_PLATEAU,
} from "@/model/terrain"

function vegetationDragFactor(biomeCode: number | undefined): number {
	switch (biomeCode) {
		case 1:
			return 1.03 // desert — bare sand/rock, low roughness
		case 2:
			return 1.0 // sparse
		case 3:
			return 0.93 // grasslands
		case 4:
			return 0.84 // woods
		case 5:
			return 0.75 // forest
		case 6:
			return 0.66 // jungle — dense multi-layer canopy
		default:
			return 1.0
	}
}

function topographyWindFactor({
	topoCode,
	slope,
}: {
	topoCode: number | undefined
	slope: number
}): number {
	let base: number
	switch (topoCode) {
		case TOPO_FLAT:
			base = 1.0
			break
		case TOPO_MARSH:
			base = 0.93
			break
		case TOPO_HILL:
			base = 0.88
			break
		case TOPO_PLATEAU:
			base = 0.93
			break
		case TOPO_MOUNTAIN:
			base = 0.58
			break
		case TOPO_OCEAN:
			base = 1.1
			break
		case TOPO_LAKE:
			base = 1.08
			break
		default:
			base = 1.0
			break
	}
	return base * (1.0 - 0.12 * slope)
}

function surfaceWindFactor({
	r,
	surface,
}: {
	r: number
	surface: WindSurface
}): number {
	const topoCode = surface.topography?.[r]
	const isWater = topoCode === TOPO_OCEAN || topoCode === TOPO_LAKE
	const slope = surface.slopeScore?.[r] ?? 0

	const vegFactor = isWater
		? 1.0
		: vegetationDragFactor(surface.vegetation?.[r])
	const topoFactor = topographyWindFactor({ topoCode, slope })
	// Sea-breeze / fetch bonus: up to +12 % at coast, decaying over ~800 km inland.
	const coastalFactor = isWater
		? 1.0
		: 1.0 + 0.12 * Math.exp(-(surface.oceanDist?.[r] ?? 0) / 800.0)

	return vegFactor * topoFactor * coastalFactor
}

function rasterizeVectorGrid({
	mesh,
	vectorU,
	vectorV,
	vectorSpeed,
	options = {},
}: RasterizeVectorGridInput): FlowGrid {
	const W = 360
	const H = 181
	const u = new Float32Array(W * H)
	const v = new Float32Array(W * H)
	const speed = new Float32Array(W * H)
	const cnt = new Int32Array(W * H)
	const scalar = options.scalar ? new Float32Array(W * H) : undefined
	const activeMask = options.allowCell ? new Uint8Array(W * H) : undefined
	const blockedVotes = options.isBlockedRegion
		? new Int16Array(W * H)
		: undefined

	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const N = mesh.numRegions
	for (let r = 0; r < N; r++) {
		const li = Math.max(0, Math.min(H - 1, Math.round(latDeg[r] + 90)))
		const ci = Math.max(0, Math.min(W - 1, Math.round(lonDeg[r] + 180)))
		const idx = li * W + ci
		if (blockedVotes) blockedVotes[idx] += options.isBlockedRegion?.(r) ? 1 : -1
		if (options.allowCell && !options.allowCell(r)) continue
		u[idx] += vectorU[r]
		v[idx] += vectorV[r]
		speed[idx] += vectorSpeed[r]
		if (scalar) scalar[idx] += options.scalar?.[r] ?? 0
		cnt[idx]++
		if (activeMask) activeMask[idx] = 1
	}
	for (let i = 0; i < W * H; i++) {
		if (cnt[i] > 1) {
			u[i] /= cnt[i]
			v[i] /= cnt[i]
			speed[i] /= cnt[i]
			if (scalar) scalar[i] /= cnt[i]
		}
	}

	// 3 passes of neighbour diffusion to fill sparse polar/edge gaps
	const tmpU = u.slice()
	const tmpV = v.slice()
	const tmpS = speed.slice()
	const tmpScalar = scalar?.slice()
	for (let pass = 0; pass < 3; pass++) {
		for (let li = 0; li < H; li++) {
			for (let ci = 0; ci < W; ci++) {
				const idx = li * W + ci
				if (cnt[idx] > 0) continue
				if (blockedVotes && blockedVotes[idx] > 0) continue
				let su = 0,
					sv = 0,
					ss = 0,
					sc = 0,
					n = 0
				const neighbours = [
					[li - 1, ci],
					[li + 1, ci],
					[li, (ci - 1 + W) % W],
					[li, (ci + 1) % W],
				] as const
				for (const [nl, nc] of neighbours) {
					if (nl < 0 || nl >= H) continue
					const ni = nl * W + nc
					if (cnt[ni] > 0) {
						su += tmpU[ni]
						sv += tmpV[ni]
						ss += tmpS[ni]
						if (tmpScalar) sc += tmpScalar[ni] ?? 0
						n++
					}
				}
				if (n > 0) {
					u[idx] = su / n
					v[idx] = sv / n
					speed[idx] = ss / n
					if (scalar) scalar[idx] = sc / n
					cnt[idx] = 1
				}
			}
		}
		tmpU.set(u)
		tmpV.set(v)
		tmpS.set(speed)
		tmpScalar?.set(scalar ?? new Float32Array())
	}

	if (blockedVotes) {
		for (let i = 0; i < W * H; i++) {
			if (blockedVotes[i] <= 0) continue
			u[i] = 0
			v[i] = 0
			speed[i] = 0
			if (scalar) scalar[i] = 0
		}
	}

	return {
		u,
		v,
		speed,
		scalar,
		mask: activeMask,
		width: W as 360,
		height: H as 181,
	}
}

function computeWindGrid({
	mesh,
	windU,
	windV,
	windSpeed,
}: {
	mesh: SphereMesh
	windU: Float32Array
	windV: Float32Array
	windSpeed: Float32Array
}): WindGrid {
	return rasterizeVectorGrid({
		mesh,
		vectorU: windU,
		vectorV: windV,
		vectorSpeed: windSpeed,
	})
}

const CELL_BOUNDARY_PRESSURES = [-1.0, 1.0, -0.45, 0.25, -0.15, 0.1]

function bgPressureForRotation({
	distFromTeq,
	hoursPerDay,
}: {
	distFromTeq: number
	hoursPerDay: number
}): number {
	const hw = RAIN.hadleyWidth(hoursPerDay)
	const d = Math.min(distFromTeq, 90)
	const cellIndex = Math.min(
		Math.floor(d / hw),
		CELL_BOUNDARY_PRESSURES.length - 2,
	)
	const d0 = cellIndex * hw
	const d1 = (cellIndex + 1) * hw
	const p0 = CELL_BOUNDARY_PRESSURES[cellIndex]
	const p1 = CELL_BOUNDARY_PRESSURES[cellIndex + 1]
	return p0 + (p1 - p0) * smoothstep(d0, d1, d)
}

function computePressureField({
	mesh,
	temps,
	elevation_km,
	teqByLon,
	hoursPerDay,
}: {
	mesh: SphereMesh
	temps: Float32Array
	elevation_km: Float32Array
	teqByLon: Float32Array
	hoursPerDay: number
}): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)

	// Zonal-mean temperature from low-elevation cells only (<0.5 km) so that
	// cold mountain tops don't skew the reference and create gradient spikes.
	const LAT_BINS = 60
	const latBinSum = new Float64Array(LAT_BINS)
	const latBinCount = new Int32Array(LAT_BINS)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0.5) continue
		const bin = Math.max(
			0,
			Math.min(LAT_BINS - 1, Math.floor(((latDeg[r] + 90) / 180) * LAT_BINS)),
		)
		latBinSum[bin] += temps[r]
		latBinCount[bin]++
	}
	const latBinMean = new Float32Array(LAT_BINS)
	for (let i = 0; i < LAT_BINS; i++) {
		latBinMean[i] = latBinCount[i] > 0 ? latBinSum[i] / latBinCount[i] : 15
	}

	const pressure = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const lat = latDeg[r]
		const teq = teqByLon[regionBin[r]]
		const distFromTeq = Math.abs(lat - teq)

		// Background cell pattern: width and count scale with rotation so fast
		// rotators produce many narrow cells and slow rotators a single broad
		// Hadley cell. Smoothstep between each boundary avoids hard speed jumps.
		const bgPressure = bgPressureForRotation({ distFromTeq, hoursPerDay })

		// Thermal anomaly from low-elevation cells only — high terrain is excluded
		// so cold mountain peaks don't create artificial pressure spikes.
		if (elevation_km[r] > 0.5) {
			pressure[r] = bgPressure
			continue
		}
		const latBin = Math.max(
			0,
			Math.min(LAT_BINS - 1, Math.floor(((lat + 90) / 180) * LAT_BINS)),
		)
		const thermalAnomaly = (-0.3 * (temps[r] - latBinMean[latBin])) / 15

		pressure[r] = bgPressure + thermalAnomaly
	}

	// Smooth the pressure field to ensure clean gradients (4 passes)
	const buf = new Float32Array(N)
	for (let pass = 0; pass < 4; pass++) {
		for (let r = 0; r < N; r++) {
			let sum = pressure[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				sum += pressure[adjList[j]]
				count++
			}
			buf[r] = sum / count
		}
		for (let r = 0; r < N; r++) pressure[r] = buf[r]
	}

	return pressure
}

function computeWindVectors({
	mesh,
	climate,
	elevation_km,
	params,
	month,
	surface,
}: ComputeWindVectorsInput): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	if (params?.tideLock?.type === "solar") {
		return LOCKED_WIND.computeLockedWindVectors({
			mesh,
			climate,
			elevation_km,
			params,
			month,
			surface,
		})
	}
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const {
		absLatDeg,
		sinLat: sinLatArr,
		edgeEastward,
		edgeNorthward,
	} = RAIN.getClimateGeometry(mesh)

	// Geostrophic onset latitude scales with rotation period:
	// faster rotation (short day) → narrower ageostrophic belt near equator.
	// Clamped so very slow rotators stay ageostrophic almost everywhere.
	const hoursPerDay = params?.hoursPerDay ?? 24
	const geoTransitionLat = clamp((15 * hoursPerDay) / HOURS_PER_DAY, 2, 75)

	// Retrograde planets rotate opposite direction → Coriolis deflects the
	// other way, so trades blow eastward and westerlies blow westward.
	const coriolisSign = isRetrogradeObliquity(params?.obliquity ?? 0) ? -1 : 1

	const temps =
		month !== undefined && month >= 0 && month < 12
			? climate.temperature_monthly.subarray(month * N, (month + 1) * N)
			: climate.temperature_avg

	const teqByLon = RAIN.computeThermalEquator({ mesh, temps })
	const pressure = computePressureField({
		mesh,
		temps,
		elevation_km,
		teqByLon,
		hoursPerDay,
	})

	const windU = new Float32Array(N)
	const windV = new Float32Array(N)
	const rawSpeed = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		const absLat = absLatDeg[r]
		// Effective Coriolis: sign flipped for retrograde rotation
		const effSinLat = coriolisSign * sinLatArr[r]

		// Pressure gradient in (east, north) from neighbor differences
		let gradPEast = 0
		let gradPNorth = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const dP = pressure[adjList[j]] - pressure[r]
			gradPEast += dP * edgeEastward[j]
			gradPNorth += dP * edgeNorthward[j]
			count++
		}
		if (count > 0) {
			gradPEast /= count
			gradPNorth /= count
		}

		// Geostrophic: perpendicular to ∇P, Coriolis-deflected
		const windGeoEast = -effSinLat * gradPNorth
		const windGeoNorth = effSinLat * gradPEast

		// Ageostrophic (boundary-layer friction): direct flow toward low pressure
		const windFricEast = -gradPEast
		const windFricNorth = -gradPNorth

		// Blend: geostrophic dominates above geoTransitionLat, friction always 30%
		const geoWeight = smoothstep(0, geoTransitionLat, absLat)
		const u = geoWeight * windGeoEast + 0.3 * windFricEast
		const v = geoWeight * windGeoNorth + 0.3 * windFricNorth

		// Raw speed proxy = pressure gradient magnitude (same for both geo+friction)
		rawSpeed[r] = Math.hypot(gradPEast, gradPNorth)

		const mag = Math.hypot(u, v)
		if (mag > 1e-9) {
			windU[r] = u / mag
			windV[r] = v / mag
		}
	}

	// Calibrate to approximate m/s:
	// - 90th percentile of |∇P| → reference speed (10 m/s, typical trades/westerlies)
	// - Rotation factor: slower rotation → faster surface winds, but boundary layer
	//   friction decouples from geostrophic scaling, so âˆ log(hoursPerDay).
	// - Pressure factor: thinner atmosphere → less air mass resisting the same thermal
	//   gradient → faster surface winds. 1 bar = neutral; scales as 1/√pressure.
	const sorted = rawSpeed.slice().sort()
	const pct90 = sorted[Math.floor(0.9 * N)] ?? 1e-6
	const ref = Math.max(pct90, 1e-6)
	const rotationFactor = Math.min(
		Math.log(clamp(hoursPerDay, 6, 192)) / Math.log(HOURS_PER_DAY),
		1.8,
	)
	const pressureFactor =
		1.0 / Math.sqrt(Math.max(params?.pressure ?? 1.0, 0.01))
	const windSpeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const base = (rawSpeed[r] / ref) * 10 * rotationFactor * pressureFactor
		windSpeed[r] = surface ? base * surfaceWindFactor({ r, surface }) : base
	}

	return { windU, windV, pressure, windSpeed }
}

export const WIND = {
	rasterizeVectorGrid,
	computeWindGrid,
	computeWindVectors,
}
