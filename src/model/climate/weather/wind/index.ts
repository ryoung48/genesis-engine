import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND as LOCKED_WIND } from "@/model/climate/weather/tidal-locked"
import type {
	CellSegment,
	ComputeWindVectorsInput,
	FlowGrid,
	RasterizeVectorGridInput,
	WindGrid,
	WindSurface,
} from "@/model/climate/weather/wind/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

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
		case CLASSIFICATION.topoFlat:
			base = 1.0
			break
		case CLASSIFICATION.topoMarsh:
			base = 0.93
			break
		case CLASSIFICATION.topoHill:
			base = 0.88
			break
		case CLASSIFICATION.topoPlateau:
			base = 0.93
			break
		case CLASSIFICATION.topoMountain:
			base = 0.58
			break
		case CLASSIFICATION.topoOcean:
			base = 1.1
			break
		case CLASSIFICATION.topoLake:
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
	const isWater =
		topoCode === CLASSIFICATION.topoOcean ||
		topoCode === CLASSIFICATION.topoLake
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

const CELL_BOUNDARY_PRESSURES = [-1.0, 1.0, -0.7, -0.4, -0.55, -0.45]
// Each successive cell boundary is progressively less coupled to the thermal
// equator: the ITCZ trough follows it fully, the subtropical ridges only
// partially, the polar front barely at all.
const BOUNDARY_TEQ_COUPLING = 0.35
// Boundary-layer friction relative to Earth's Coriolis parameter at the pole.
const FRICTION = 0.3
// Inside the deep tropics the surface flow is set by upstream momentum rather
// than the vanishing local Coriolis, so the effective Coriolis is floored at
// this fraction of a Hadley-cell width.
const EQUATORIAL_FLOOR_FRACTION = 2 / 3
const THERMAL_COUPLING = 0.1
const KATABATIC_FORCE = 20.0
const KATABATIC_FRICTION = 1.0
const SPEED_SCALE = 0.55
// Longitude smoothing (in 3-degree bins) of the surface trough. Narrower
// than the rain module's so monsoon troughs over summer continents survive.
const TROUGH_HALF_WINDOW_BINS = 5
// Low heat capacity lets the trough over land follow the sub-solar latitude
// (monsoon) instead of the sea-surface temperature maximum.
const LAND_TROUGH_PULL = 0.5
// A narrow summer-hemisphere cell keeps even less of the ridge than its width
// alone implies: summer continents replace the subtropical high with a
// thermal low, so its amplitude falls off faster than linearly.
const SUMMER_RIDGE_EXPONENT = 2
// Broad high terrain heats the air above it more than free-atmosphere lapse
// implies (the elevated heat source that builds the Tibetan heat low), so
// the trough sees a warmer sea-level-reduced surface there in the warm season.
const PLATEAU_HEAT_PER_KM = 3
// A summer continent warmer than the ocean at its own latitude carries a
// heat low on top of the Hadley template (the Mongolian and Iranian lows),
// drawing in flow from the surrounding oceans. Only anomalies past the
// threshold count, so ordinary land-sea noise does not.
const HEAT_LOW_COUPLING = 0.8
const HEAT_LOW_THRESHOLD_C = 5
// Ice sheets have a large sea-level-reduced anomaly that means nothing at the
// surface, so a heat low needs the actual surface to be warm.
const HEAT_LOW_MIN_SURFACE_C = 5
// The land trough lags the sun by about a month (monsoon onset follows the
// solstice).
const LAND_TROUGH_LAG_MONTHS = 1
// Fraction of the subtropical ridge / polar-front trough amplitude kept where
// the boundary's latitude band is entirely land; the rest is ocean-only.
const RIDGE_LAND_AMPLITUDE = 0.6
const POLAR_TROUGH_LAND_AMPLITUDE = 0
const DEG2RAD = Math.PI / 180

function cellSegment({
	lat,
	teq,
	hw,
}: {
	lat: number
	teq: number
	hw: number
}): CellSegment {
	const s = lat >= teq ? 1 : -1
	const d = s * (lat - teq)
	let lo = 0
	const lastCell = CELL_BOUNDARY_PRESSURES.length - 2
	for (let k = 0; k <= lastCell; k++) {
		const coupling = BOUNDARY_TEQ_COUPLING ** (k + 1)
		const hi = Math.max(lo + 1, (k + 1) * hw + s * teq * (coupling - 1))
		if (d <= hi || k === lastCell) {
			return {
				k,
				hemisphere: s,
				ridgeScale: hi < hw ? (hi / hw) ** SUMMER_RIDGE_EXPONENT : hi / hw,
				t: MATH.smoothstep({ edge0: lo, edge1: hi, x: d }),
			}
		}
		lo = hi
	}
	return { k: lastCell, hemisphere: s, ridgeScale: 1, t: 1 }
}

function boundaryPressure({
	k,
	ridgeScale,
	oceanFrac,
}: {
	k: number
	ridgeScale: number
	oceanFrac: number
}): number {
	const base = CELL_BOUNDARY_PRESSURES[k]
	if (k === 0) return base
	// The Hadley cell reaching across the equator (winter hemisphere) is the
	// strong one: its ridge scales with the width it spans, so the narrow
	// summer cell stays weak.
	const seasonal = k === 1 ? ridgeScale : 1
	// The subtropical ridge and the polar-front trough are ocean features:
	// over land the surface temperature swings far more than the cells'
	// dynamics assume, so their template amplitude is held only over ocean.
	const landAmplitude =
		k === 1 ? RIDGE_LAND_AMPLITUDE : k === 2 ? POLAR_TROUGH_LAND_AMPLITUDE : 1
	return base * seasonal * (landAmplitude + (1 - landAmplitude) * oceanFrac)
}

function computeTroughByLon({
	mesh,
	seaLevelTemps,
	elevation_km,
	sunLat,
}: {
	mesh: SphereMesh
	seaLevelTemps: Float32Array
	elevation_km: Float32Array
	sunLat: number
}): Float32Array {
	const trough = RAIN.computeThermalEquator({
		mesh,
		temps: seaLevelTemps,
		halfWindowBins: TROUGH_HALF_WINDOW_BINS,
	})
	const bins = trough.length
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)
	// Only land lying between the sea-surface trough and the sub-solar
	// latitude can carry the trough poleward: the Sahara does, the Caribbean
	// does not.
	const landCount = new Int32Array(bins)
	const cellCount = new Int32Array(bins)
	for (let r = 0; r < mesh.numRegions; r++) {
		const bin = regionBin[r]
		const lo = Math.min(trough[bin], sunLat)
		const hi = Math.max(trough[bin], sunLat)
		if (latDeg[r] < lo || latDeg[r] > hi) continue
		cellCount[bin]++
		if (elevation_km[r] > 0) landCount[bin]++
	}
	for (let i = 0; i < bins; i++) {
		let land = 0
		let cells = 0
		for (let d = -TROUGH_HALF_WINDOW_BINS; d <= TROUGH_HALF_WINDOW_BINS; d++) {
			const j = (((i + d) % bins) + bins) % bins
			land += landCount[j]
			cells += cellCount[j]
		}
		const landFrac = cells > 0 ? land / cells : 0
		trough[i] += LAND_TROUGH_PULL * landFrac * (sunLat - trough[i])
	}
	return trough
}

function computePressureField({
	mesh,
	seaLevelTemps,
	elevation_km,
	heatLow,
	teqByLon,
	hoursPerDay,
}: {
	mesh: SphereMesh
	seaLevelTemps: Float32Array
	elevation_km: Float32Array
	heatLow: Float32Array
	teqByLon: Float32Array
	hoursPerDay: number
}): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)
	const hw = RAIN.hadleyWidth(hoursPerDay)

	const LAT_BINS = 60
	const latBinOf = (lat: number) =>
		Math.max(
			0,
			Math.min(LAT_BINS - 1, Math.floor(((lat + 90) / 180) * LAT_BINS)),
		)
	const latBinSum = new Float64Array(LAT_BINS)
	const latBinCount = new Int32Array(LAT_BINS)
	for (let r = 0; r < N; r++) {
		const bin = latBinOf(latDeg[r])
		latBinSum[bin] += seaLevelTemps[r]
		latBinCount[bin]++
	}
	const latBinMean = new Float32Array(LAT_BINS)
	for (let i = 0; i < LAT_BINS; i++) {
		latBinMean[i] = latBinCount[i] > 0 ? latBinSum[i] / latBinCount[i] : 15
	}

	// Ocean fraction per (longitude bin, hemisphere, cell boundary): the cells
	// whose nearest boundary is k contribute to boundary k's land-sea mix.
	const lonBins = teqByLon.length
	const boundaries = CELL_BOUNDARY_PRESSURES.length
	const segments: CellSegment[] = new Array(N)
	const slot = ({
		bin,
		hemisphere,
		k,
	}: {
		bin: number
		hemisphere: number
		k: number
	}) => (bin * 2 + (hemisphere > 0 ? 1 : 0)) * boundaries + k
	const oceanCount = new Float32Array(lonBins * 2 * boundaries)
	const cellCount = new Float32Array(lonBins * 2 * boundaries)
	for (let r = 0; r < N; r++) {
		const seg = cellSegment({
			lat: latDeg[r],
			teq: teqByLon[regionBin[r]],
			hw,
		})
		segments[r] = seg
		const nearest = seg.t < 0.5 ? seg.k : seg.k + 1
		const i = slot({
			bin: regionBin[r],
			hemisphere: seg.hemisphere,
			k: nearest,
		})
		cellCount[i]++
		if (elevation_km[r] <= 0) oceanCount[i]++
	}
	const oceanFrac = new Float32Array(lonBins * 2 * boundaries)
	for (let bin = 0; bin < lonBins; bin++) {
		for (let h = 0; h < 2; h++) {
			for (let k = 0; k < boundaries; k++) {
				let ocean = 0
				let cells = 0
				for (
					let d = -TROUGH_HALF_WINDOW_BINS;
					d <= TROUGH_HALF_WINDOW_BINS;
					d++
				) {
					const j = (((bin + d) % lonBins) + lonBins) % lonBins
					const i = (j * 2 + h) * boundaries + k
					ocean += oceanCount[i]
					cells += cellCount[i]
				}
				oceanFrac[(bin * 2 + h) * boundaries + k] =
					cells > 0 ? ocean / cells : 1
			}
		}
	}

	const pressure = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const lat = latDeg[r]
		const seg = segments[r]
		const fracAt = (k: number) =>
			oceanFrac[slot({ bin: regionBin[r], hemisphere: seg.hemisphere, k })]
		const pLo = boundaryPressure({
			k: seg.k,
			ridgeScale: seg.ridgeScale,
			oceanFrac: fracAt(seg.k),
		})
		const pHi = boundaryPressure({
			k: seg.k + 1,
			ridgeScale: seg.ridgeScale,
			oceanFrac: fracAt(seg.k + 1),
		})
		const bgPressure = pLo + (pHi - pLo) * seg.t
		// Warm-relative-to-zonal-mean surfaces (summer continents) are thermal
		// lows, cold ones (winter continents) thermal highs. Uses sea-level-
		// reduced temperature so plateaus register as heat sources instead of
		// as spurious cold highs.
		const thermalAnomaly =
			(-THERMAL_COUPLING * (seaLevelTemps[r] - latBinMean[latBinOf(lat)])) / 15
		pressure[r] = bgPressure + thermalAnomaly + heatLow[r]
	}

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
		pressure.set(buf)
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
	const { adjOffset, adjList, neighborDist } = mesh
	const {
		absLatDeg,
		sinLat: sinLatArr,
		edgeEastward,
		edgeNorthward,
	} = RAIN.getClimateGeometry(mesh)

	const hoursPerDay = params?.hoursPerDay ?? TIME.hoursPerDay
	const planetRadiusKm = params?.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm
	const hw = RAIN.hadleyWidth(hoursPerDay)
	// Coriolis parameter relative to Earth's polar value; retrograde rotation
	// flips the deflection.
	const omegaRatio = TIME.hoursPerDay / hoursPerDay
	const coriolisSign = UNITS.isRetrogradeObliquity(params?.obliquity ?? 0)
		? -1
		: 1
	const floorSin = Math.sin(DEG2RAD * hw * EQUATORIAL_FLOOR_FRACTION)

	const hasMonth = month !== undefined && month >= 0 && month < 12
	const temps = hasMonth
		? climate.temperature_monthly.subarray(month * N, (month + 1) * N)
		: climate.temperature_avg
	let seaLevelTemps: Float32Array
	if (hasMonth) {
		seaLevelTemps = climate.temperature_monthly_nolapse.subarray(
			month * N,
			(month + 1) * N,
		)
	} else {
		seaLevelTemps = new Float32Array(N)
		for (let m = 0; m < 12; m++) {
			for (let r = 0; r < N; r++) {
				seaLevelTemps[r] += climate.temperature_monthly_nolapse[m * N + r] / 12
			}
		}
	}

	const sunLat = hasMonth
		? climate.declination_monthly[(month - LAND_TROUGH_LAG_MONTHS + 12) % 12]
		: 0
	const { latDeg } = RAIN.getClimateGeometry(mesh)
	const OCEAN_BINS = 60
	const oceanBinOf = (lat: number) =>
		Math.max(
			0,
			Math.min(OCEAN_BINS - 1, Math.floor(((lat + 90) / 180) * OCEAN_BINS)),
		)
	const oceanSum = new Float64Array(OCEAN_BINS)
	const oceanCount = new Int32Array(OCEAN_BINS)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0) continue
		oceanSum[oceanBinOf(latDeg[r])] += seaLevelTemps[r]
		oceanCount[oceanBinOf(latDeg[r])]++
	}
	const oceanZonal = new Float32Array(OCEAN_BINS)
	for (let i = 0; i < OCEAN_BINS; i++) {
		let j = i
		let step = 0
		while (oceanCount[j] === 0 && step < OCEAN_BINS) {
			step++
			j = i + (step % 2 === 1 ? Math.ceil(step / 2) : -step / 2)
			j = Math.max(0, Math.min(OCEAN_BINS - 1, j))
		}
		oceanZonal[i] = oceanCount[j] > 0 ? oceanSum[j] / oceanCount[j] : 15
	}
	const troughTemps = new Float32Array(N)
	const heatLow = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const warmSeason = MATH.clamp01((temps[r] - climate.temperature_avg[r]) / 8)
		troughTemps[r] =
			seaLevelTemps[r] +
			PLATEAU_HEAT_PER_KM * Math.max(0, elevation_km[r]) * warmSeason
		const anomaly = troughTemps[r] - oceanZonal[oceanBinOf(latDeg[r])]
		const warmSurface = MATH.smoothstep({
			edge0: HEAT_LOW_MIN_SURFACE_C,
			edge1: HEAT_LOW_MIN_SURFACE_C + 10,
			x: temps[r],
		})
		const excess = warmSurface * Math.max(0, anomaly - HEAT_LOW_THRESHOLD_C)
		heatLow[r] = (-HEAT_LOW_COUPLING * excess) / 15
	}
	const teqByLon = computeTroughByLon({
		mesh,
		seaLevelTemps: troughTemps,
		elevation_km,
		sunLat,
	})
	const pressure = computePressureField({
		mesh,
		seaLevelTemps,
		elevation_km,
		heatLow,
		teqByLon,
		hoursPerDay,
	})

	const windU = new Float32Array(N)
	const windV = new Float32Array(N)
	const rawSpeed = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		const absLat = absLatDeg[r]
		const sinLat = sinLatArr[r]

		// Pressure gradient (template units per radian) and terrain slope
		// (km per km) in (east, north) from neighbor differences.
		let gradPEast = 0
		let gradPNorth = 0
		let gradEEast = 0
		let gradENorth = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dist = Math.max(neighborDist[j], 1e-6)
			const dP = (pressure[nb] - pressure[r]) / dist
			gradPEast += dP * edgeEastward[j]
			gradPNorth += dP * edgeNorthward[j]
			const dE = (elevation_km[nb] - elevation_km[r]) / (dist * planetRadiusKm)
			gradEEast += dE * edgeEastward[j]
			gradENorth += dE * edgeNorthward[j]
			count++
		}
		if (count > 0) {
			gradPEast /= count
			gradPNorth /= count
			gradEEast /= count
			gradENorth /= count
		}

		const forceEast = -gradPEast
		const forceNorth = -gradPNorth

		const slopeMag = Math.hypot(gradEEast, gradENorth)
		const gEastHat = slopeMag > 1e-9 ? gradEEast / slopeMag : 0
		const gNorthHat = slopeMag > 1e-9 ? gradENorth / slopeMag : 0

		// Steady boundary-layer balance: friction*V + f k×V = F. Friction
		// turns the flow across isobars toward low pressure, Coriolis turns it
		// along them; the cross-isobar angle is atan(friction/f).
		const effSin = Math.max(
			Math.abs(sinLat),
			floorSin * MATH.smoothstep({ edge0: 0, edge1: 5, x: absLat }),
		)
		const f = coriolisSign * Math.sign(sinLat) * effSin * omegaRatio
		const balance = ({
			friction,
			forceEast,
			forceNorth,
		}: {
			friction: number
			forceEast: number
			forceNorth: number
		}) => {
			const denom = friction * friction + f * f
			return {
				u: (friction * forceEast + f * forceNorth) / denom,
				v: (friction * forceNorth - f * forceEast) / denom,
			}
		}
		const bl = balance({ friction: FRICTION, forceEast, forceNorth })
		const roughness = surface ? surfaceWindFactor({ r, surface }) : 1
		let u = bl.u * roughness
		let v = bl.v * roughness

		// Katabatic drainage: over cold sloped surfaces (ice sheets, high
		// plateaus) dense surface air is pushed downhill. It is a shallow,
		// strongly frictional layer, so it is balanced with its own higher
		// friction: Coriolis still deflects it (Antarctic outflow becomes
		// coastal easterlies) but it keeps a large downslope component. It is
		// already a surface flow, so terrain roughness is not applied again.
		if (slopeMag > 1e-9 && elevation_km[r] > 0.2) {
			// Perennially cold surfaces (ice sheets) hold the persistent
			// inversion that drives drainage; seasonally cold continents don't.
			const iceFactor = MATH.smoothstep({
				edge0: -5,
				edge1: -15,
				x: climate.temperature_avg[r],
			})
			const coldFactor = MATH.smoothstep({
				edge0: 0,
				edge1: -25,
				x: temps[r],
			})
			const kMag =
				KATABATIC_FORCE *
				iceFactor *
				coldFactor *
				MATH.smoothstep({ edge0: 0.0001, edge1: 0.0013, x: slopeMag })
			if (kMag > 0) {
				const k = balance({
					friction: KATABATIC_FRICTION,
					forceEast: -gEastHat * kMag,
					forceNorth: -gNorthHat * kMag,
				})
				u += k.u
				v += k.v
			}
		}

		// Orographic blocking: air moving into rising terrain is partly
		// stopped and steered along the contour rather than lifted over.
		if (slopeMag > 1e-9 && elevation_km[r] > 0) {
			const upComp = u * gEastHat + v * gNorthHat
			if (upComp > 0) {
				const block = MATH.smoothstep({
					edge0: 0.00016,
					edge1: 0.0021,
					x: slopeMag,
				})
				const tEast = -gNorthHat
				const tNorth = gEastHat
				const s = u * tEast + v * tNorth >= 0 ? 1 : -1
				u += block * (-0.7 * upComp * gEastHat + 0.35 * upComp * s * tEast)
				v += block * (-0.7 * upComp * gNorthHat + 0.35 * upComp * s * tNorth)
			}
		}

		const mag = Math.hypot(u, v)
		rawSpeed[r] = mag
		if (mag > 1e-9) {
			windU[r] = u / mag
			windV[r] = v / mag
		}
	}

	// Template gradients are per radian, so the same pressure contrast spread
	// over a larger planet drives weaker winds. Thinner atmospheres have less
	// air mass resisting the same forcing; 1 bar is neutral.
	const radiusFactor = UNITS.defaultPlanetRadiusKm / planetRadiusKm
	const pressureFactor =
		1.0 / Math.sqrt(Math.max(params?.pressure ?? 1.0, 0.01))
	const windSpeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		windSpeed[r] = rawSpeed[r] * SPEED_SCALE * radiusFactor * pressureFactor
	}

	return { windU, windV, pressure, windSpeed }
}

/** Builds the same {windU, windV, pressure, windSpeed} shape as
 * computeWindVectors (windU/windV are unit direction vectors, windSpeed the
 * magnitude in m/s; pressure is unused for observed data and left zeroed)
 * but sourced from GenesisWorld.observedWind (NCEP/NCAR reanalysis, sampled
 * onto mesh regions by attachObservedEarthWind) instead of the procedural
 * pressure-gradient model -- lets the wind particle overlay render real
 * Earth wind for comparison/tuning against the model (see the "Wind" ->
 * "Observed (NCEP)" toggle in OverlayControls). */
function observedWindVectorsForMonth({
	observedWind,
	numRegions,
	month,
}: {
	observedWind:
		| { real_u_monthly?: Float32Array; real_v_monthly?: Float32Array }
		| undefined
	numRegions: number
	month?: number
}): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	const windU = new Float32Array(numRegions)
	const windV = new Float32Array(numRegions)
	const pressure = new Float32Array(numRegions)
	const windSpeed = new Float32Array(numRegions)
	const realU = observedWind?.real_u_monthly
	const realV = observedWind?.real_v_monthly
	if (!realU || !realV) return { windU, windV, pressure, windSpeed }

	for (let r = 0; r < numRegions; r++) {
		let u: number
		let v: number
		if (month !== undefined && month >= 0 && month < 12) {
			u = realU[month * numRegions + r]
			v = realV[month * numRegions + r]
		} else {
			let uSum = 0
			let vSum = 0
			let count = 0
			for (let m = 0; m < 12; m++) {
				const uu = realU[m * numRegions + r]
				const vv = realV[m * numRegions + r]
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
		const speed = Math.hypot(u, v)
		windSpeed[r] = speed
		if (speed > 1e-9) {
			windU[r] = u / speed
			windV[r] = v / speed
		}
	}

	return { windU, windV, pressure, windSpeed }
}

export const WIND = {
	rasterizeVectorGrid,
	computeWindGrid,
	computeWindVectors,
	observedWindVectorsForMonth,
}
