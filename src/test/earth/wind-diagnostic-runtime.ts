export const EXPERIMENT = {
	name: "baseline",
	heat: 1,
	thermal: 1,
	plateau: 1,
	west: 1,
	east: 1,
	floor: 1,
	dynamics: true,
	lag: true,
	torque: true,
	freeze: false,
	scales: [],
	trace: null,
}

import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND as LOCKED_WIND } from "@/model/climate/weather/tidal-locked"
import { DYNAMICS } from "@/model/climate/weather/wind/dynamics"
import { OCEAN_INERTIA } from "@/model/climate/weather/wind/ocean-inertia"
import { ROUGHNESS } from "@/model/climate/weather/wind/roughness"
import { SHALLOW_WATER } from "@/model/climate/weather/wind/shallow-water"
import { SIMPLE_WIND } from "@/model/climate/weather/wind/simple"
import { SURFACE_BALANCE } from "@/model/climate/weather/wind/surface-balance"
import { TORQUE_BALANCE } from "@/model/climate/weather/wind/torque-balance"
import { MATH } from "@/model/shared/math/core"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

function rasterizeVectorGrid({
	mesh,
	vectorU,
	vectorV,
	vectorSpeed,
	options = {},
}) {
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
				]
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
		width: W,
		height: H,
	}
}
function computeWindGrid({ mesh, windU, windV, windSpeed }) {
	return rasterizeVectorGrid({
		mesh,
		vectorU: windU,
		vectorV: windV,
		vectorSpeed: windSpeed,
	})
}
const NUM_BOUNDARIES = 6
const DIRECT_CELL_PRESSURE_PER_C = 0.22
const INDIRECT_CELL_PRESSURE_PER_C = 0.22
const POLAR_CELL_PRESSURE_PER_C = 0.15
const BOUNDARY_TEQ_COUPLING = 0.35
const FRICTION = 0.3
const STORM_GUST_THERMAL_WIND_FRACTION = 0.25
const DRY_AIR_GAS_CONSTANT_J_KG_K = 287
const MAX_STORM_GUST_MS = 10
const STORM_TRACK_ONSET_HADLEY_FRACTION = 0.75
const EQUATORIAL_FLOOR_FRACTION = 2 / 3
const THERMAL_COUPLING = 0.1
const KATABATIC_FORCE = 20.0
const KATABATIC_FRICTION = 1.0
const SPEED_SCALE = 0.45
const OPEN_OCEAN_FETCH_BOOST = 0.7
const TROUGH_HALF_WINDOW_BINS = 5
const PLATEAU_HEAT_PER_KM = 3
const HEAT_LOW_COUPLING = 0.8
const HEAT_LOW_THRESHOLD_C = 5
const HEAT_LOW_MIN_SURFACE_C = 5
const RIDGE_LAND_AMPLITUDE = 0.6
const POLAR_TROUGH_LAND_AMPLITUDE = 0
const COLLAPSE_HOURS_EDGE0 = 60
const COLLAPSE_HOURS_EDGE1 = 300
const COLLAPSE_TILT_EDGE0 = 50
const COLLAPSE_TILT_EDGE1 = 75
const WAVE_COUPLING = 0.002
const LARGE_SCALE_SOLVER = "linear"
const EARTH_POLAR_CORIOLIS = 1.458e-4
const BOUNDARY_FLOW_MS = 8
const BOUNDARY_TURN_DEG = 30
const BOUNDARY_DECAY_BINS = 3
const BOUNDARY_REACH_BINS = 6
const BOUNDARY_LAND_MIN = 0.5
const EAST_BOUNDARY_FLOW_MS = 6
const EAST_BOUNDARY_TURN_DEG = 20
const EAST_BOUNDARY_HIGH_FULL = 0.15
const DEG2RAD = Math.PI / 180
function rotationCollapse(hoursPerDay) {
	return MATH.smoothstep({
		edge0: COLLAPSE_HOURS_EDGE0,
		edge1: COLLAPSE_HOURS_EDGE1,
		x: hoursPerDay,
	})
}
function cellBoundaries({ teq, ridgeTeq, hw, hemisphere }) {
	const offsets = []
	let lo = 0
	for (let k = 0; k < NUM_BOUNDARIES - 1; k++) {
		const coupling = BOUNDARY_TEQ_COUPLING ** (k + 1)
		const hi = Math.max(
			lo + 1,
			(k + 1) * hw + hemisphere * (coupling * ridgeTeq - teq),
		)
		offsets.push(hi)
		lo = hi
	}
	return offsets
}
function cellSegment({ lat, teq, ridgeTeq, hw }) {
	const s = lat >= teq ? 1 : -1
	const d = s * (lat - teq)
	const offsets = cellBoundaries({ teq, ridgeTeq, hw, hemisphere: s })
	const lastCell = offsets.length - 1
	let lo = 0
	for (let k = 0; k <= lastCell; k++) {
		const hi = offsets[k]
		if (d <= hi || k === lastCell) {
			return {
				k,
				hemisphere: s,
				t: MATH.smoothstep({ edge0: lo, edge1: hi, x: d }),
			}
		}
		lo = hi
	}
	return { k: lastCell, hemisphere: s, t: 1 }
}
function cellPressurePerC({ k, cellCollapse }) {
	let perC
	if (k === 1) perC = DIRECT_CELL_PRESSURE_PER_C
	else if (k === 2) perC = -INDIRECT_CELL_PRESSURE_PER_C
	else
		perC = k % 2 === 1 ? POLAR_CELL_PRESSURE_PER_C : -POLAR_CELL_PRESSURE_PER_C
	return (1 - cellCollapse) * perC + cellCollapse * DIRECT_CELL_PRESSURE_PER_C
}
function boundaryPressure({ base, k, oceanFrac, cellCollapse }) {
	if (k === 0) return base
	const rawLandAmp =
		k === 1 ? RIDGE_LAND_AMPLITUDE : k === 2 ? POLAR_TROUGH_LAND_AMPLITUDE : 1
	const landAmplitude = rawLandAmp + (1 - rawLandAmp) * cellCollapse
	return base * (landAmplitude + (1 - landAmplitude) * oceanFrac)
}
function computeTroughByLon({ mesh, seaLevelTemps }) {
	return RAIN.computeThermalEquator({
		mesh,
		temps: seaLevelTemps,
		halfWindowBins: TROUGH_HALF_WINDOW_BINS,
	})
}
function computePressureField({
	mesh,
	seaLevelTemps,
	elevation_km,
	heatLow,
	teqByLon,
	ridgeTeqByLon,
	hoursPerDay,
	cellCollapse,
}) {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)
	const hw = RAIN.hadleyWidth(hoursPerDay)
	const LAT_BINS = 60
	const latBinOf = (lat) =>
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
	const zonalMeanAt = (lat) => {
		const x = Math.max(
			0,
			Math.min(LAT_BINS - 1, ((lat + 90) / 180) * LAT_BINS - 0.5),
		)
		const i0 = Math.floor(x)
		const i1 = Math.min(LAT_BINS - 1, i0 + 1)
		return latBinMean[i0] + (latBinMean[i1] - latBinMean[i0]) * (x - i0)
	}
	const lonBins = teqByLon.length
	const boundaries = NUM_BOUNDARIES
	const segments = new Array(N)
	const slot = ({ bin, hemisphere, k }) =>
		(bin * 2 + (hemisphere > 0 ? 1 : 0)) * boundaries + k
	const oceanCount = new Float32Array(lonBins * 2 * boundaries)
	const cellCount = new Float32Array(lonBins * 2 * boundaries)
	for (let r = 0; r < N; r++) {
		const seg = cellSegment({
			lat: latDeg[r],
			teq: teqByLon[regionBin[r]],
			ridgeTeq: ridgeTeqByLon[regionBin[r]],
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
	const boundaryBase = new Float32Array(lonBins * 2 * boundaries)
	for (let bin = 0; bin < lonBins; bin++) {
		const teq = teqByLon[bin]
		const ridgeTeq = ridgeTeqByLon[bin]
		for (const hemisphere of [-1, 1]) {
			const offsets = cellBoundaries({ teq, ridgeTeq, hw, hemisphere })
			let pressureAt = 0
			let latPrev = teq
			for (let k = 1; k < boundaries; k++) {
				const latK = Math.max(
					-90,
					Math.min(90, teq + hemisphere * offsets[k - 1]),
				)
				const contrast = zonalMeanAt(latPrev) - zonalMeanAt(latK)
				pressureAt += cellPressurePerC({ k, cellCollapse }) * contrast
				boundaryBase[slot({ bin, hemisphere, k })] = pressureAt
				latPrev = latK
			}
		}
	}
	const hadley = new Float32Array(N)
	const rest = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const lat = latDeg[r]
		const seg = segments[r]
		const at = (k) => slot({ bin: regionBin[r], hemisphere: seg.hemisphere, k })
		const pLo = boundaryPressure({
			base: boundaryBase[at(seg.k)],
			k: seg.k,
			oceanFrac: oceanFrac[at(seg.k)],
			cellCollapse,
		})
		const pHi = boundaryPressure({
			base: boundaryBase[at(seg.k + 1)],
			k: seg.k + 1,
			oceanFrac: oceanFrac[at(seg.k + 1)],
			cellCollapse,
		})
		const ridge = boundaryPressure({
			base: boundaryBase[at(1)],
			k: 1,
			oceanFrac: oceanFrac[at(1)],
			cellCollapse,
		})
		const thermalAnomaly =
			(-THERMAL_COUPLING *
				EXPERIMENT.thermal *
				(seaLevelTemps[r] - latBinMean[latBinOf(lat)])) /
			15
		hadley[r] = seg.k === 0 ? ridge * seg.t : ridge
		rest[r] =
			pLo + (pHi - pLo) * seg.t - hadley[r] + thermalAnomaly + heatLow[r]
	}
	const buf = new Float32Array(N)
	for (const field of [hadley, rest]) {
		for (let pass = 0; pass < 4; pass++) {
			for (let r = 0; r < N; r++) {
				let sum = field[r]
				let count = 1
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					sum += field[adjList[j]]
					count++
				}
				buf[r] = sum / count
			}
			field.set(buf)
		}
	}
	return { hadley, rest }
}
function computeWindVectors({
	mesh,
	climate,
	elevation_km,
	params,
	month,
	surface,
}) {
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
	if (LARGE_SCALE_SOLVER === "simple") {
		return SIMPLE_WIND.computeWindVectors({
			mesh,
			climate,
			elevation_km,
			params,
			month,
			surface,
		})
	}
	const N = mesh.numRegions
	const {
		absLatDeg,
		sinLat: sinLatArr,
		regionBin,
	} = RAIN.getClimateGeometry(mesh)
	const hoursPerDay = params?.hoursPerDay ?? TIME.hoursPerDay
	const planetRadiusKm = params?.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm
	const hw = RAIN.hadleyWidth(hoursPerDay)
	const axialTilt = Math.abs(params?.obliquity ?? 23.4) % 360
	const uprightTilt = axialTilt > 180 ? 360 - axialTilt : axialTilt
	const effTilt = uprightTilt > 90 ? 180 - uprightTilt : uprightTilt
	const cellCollapse = Math.max(
		rotationCollapse(hoursPerDay),
		MATH.smoothstep({
			edge0: COLLAPSE_TILT_EDGE0,
			edge1: COLLAPSE_TILT_EDGE1,
			x: effTilt,
		}),
	)
	const omegaRatio = TIME.hoursPerDay / hoursPerDay
	const coriolisSign = UNITS.isRetrogradeObliquity(params?.obliquity ?? 0)
		? -1
		: 1
	const floorSin =
		EXPERIMENT.floor * Math.sin(DEG2RAD * hw * EQUATORIAL_FLOOR_FRACTION)
	const radiusFactor = UNITS.defaultPlanetRadiusKm / planetRadiusKm
	const pressureFactor =
		1.0 / Math.sqrt(Math.max(params?.pressure ?? 1.0, 0.01))
	const rawPerMs = 1 / (SPEED_SCALE * radiusFactor * pressureFactor)
	const hasMonth = month !== undefined && month >= 0 && month < 12
	const temps = hasMonth
		? climate.temperature_monthly.subarray(month * N, (month + 1) * N)
		: climate.temperature_avg
	let seaLevelTemps
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
	const { latDeg } = RAIN.getClimateGeometry(mesh)
	const OCEAN_BINS = 60
	const oceanBinOf = (lat) =>
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
	const daysPerYear = params?.daysPerYear ?? UNITS.defaultDaysPerYear
	const surfaceTemps =
		hasMonth && EXPERIMENT.lag
			? OCEAN_INERTIA.laggedSeaLevelTemps({
					climate,
					elevation_km,
					month,
					monthSeconds: (daysPerYear * hoursPerDay * 3600) / 12,
				})
			: seaLevelTemps
	const troughTemps = new Float32Array(N)
	const oceanTemps = new Float32Array(N)
	const heatLow = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const warmSeason = MATH.clamp01((temps[r] - climate.temperature_avg[r]) / 8)
		troughTemps[r] =
			surfaceTemps[r] +
			PLATEAU_HEAT_PER_KM *
				EXPERIMENT.plateau *
				Math.max(0, elevation_km[r]) *
				warmSeason
		oceanTemps[r] = elevation_km[r] > 0 ? -Infinity : seaLevelTemps[r]
		const anomaly = troughTemps[r] - oceanZonal[oceanBinOf(latDeg[r])]
		const warmSurface = MATH.smoothstep({
			edge0: HEAT_LOW_MIN_SURFACE_C,
			edge1: HEAT_LOW_MIN_SURFACE_C + 10,
			x: temps[r],
		})
		const excess = warmSurface * Math.max(0, anomaly - HEAT_LOW_THRESHOLD_C)
		heatLow[r] = (-HEAT_LOW_COUPLING * EXPERIMENT.heat * excess) / 15
	}
	const teqByLon = computeTroughByLon({
		mesh,
		seaLevelTemps: EXPERIMENT.oceanTrough
			? Float32Array.from(troughTemps, (value, r) =>
					elevation_km[r] > 0 ? -Infinity : value,
				)
			: troughTemps,
	})
	const ridgeTeqByLon = RAIN.computeThermalEquator({ mesh, temps: oceanTemps })
	const components = computePressureField({
		mesh,
		seaLevelTemps,
		elevation_km,
		heatLow,
		teqByLon,
		ridgeTeqByLon,
		hoursPerDay,
		cellCollapse,
	})
	const { lonDeg } = RAIN.getClimateGeometry(mesh)
	const binDeg = 180 / OCEAN_BINS
	const metersPerDeg = planetRadiusKm * 1000 * DEG2RAD
	const rotationRate = (2 * Math.PI) / (hoursPerDay * 3600)
	const gustByBin = new Float32Array(OCEAN_BINS)
	for (let i = 0; i < OCEAN_BINS; i++) {
		const lo = Math.max(0, i - 1)
		const hi = Math.min(OCEAN_BINS - 1, i + 1)
		const gradientPerM =
			Math.abs(oceanZonal[hi] - oceanZonal[lo]) /
			((hi - lo) * binDeg * metersPerDeg)
		const binLat = -90 + (i + 0.5) * binDeg
		const f =
			2 *
			rotationRate *
			Math.max(Math.abs(Math.sin(binLat * DEG2RAD)), floorSin)
		const thermalWind = (DRY_AIR_GAS_CONSTANT_J_KG_K * gradientPerM) / f
		const gustMs =
			Math.min(
				MAX_STORM_GUST_MS,
				STORM_GUST_THERMAL_WIND_FRACTION * thermalWind,
			) *
			(1 - cellCollapse)
		gustByBin[i] = gustMs * rawPerMs
	}
	const gust = new Float32Array(N)
	const coriolis = new Float32Array(N)
	const hemisphere = new Int8Array(N)
	const northHadley = new Float32Array(N)
	const southHadley = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const effSin = Math.max(
			Math.abs(sinLatArr[r]),
			floorSin * MATH.smoothstep({ edge0: 0, edge1: 5, x: absLatDeg[r] }),
		)
		coriolis[r] = coriolisSign * Math.sign(sinLatArr[r]) * effSin * omegaRatio
		hemisphere[r] = latDeg[r] >= teqByLon[regionBin[r]] ? 1 : -1
		gust[r] =
			gustByBin[oceanBinOf(latDeg[r])] *
			MATH.smoothstep({
				edge0: STORM_TRACK_ONSET_HADLEY_FRACTION * hw,
				edge1: hw,
				x: Math.abs(latDeg[r] - teqByLon[regionBin[r]]),
			})
		if (hemisphere[r] > 0) northHadley[r] = components.hadley[r]
		else southHadley[r] = components.hadley[r]
	}
	const withDynamics = (field) => {
		if (!EXPERIMENT.dynamics) return field
		if (LARGE_SCALE_SOLVER === "shallow-water") return field
		const dynamic = DYNAMICS.correction({
			latDeg,
			lonDeg,
			pressure: field,
			friction: FRICTION,
			coriolisScale: coriolisSign * omegaRatio,
			waveCoupling: WAVE_COUPLING,
		})
		const out = new Float32Array(N)
		for (let r = 0; r < N; r++) out[r] = field[r] + dynamic[r]
		return out
	}
	const restPressure = withDynamics(components.rest)
	const northPressure = withDynamics(northHadley)
	const southPressure = withDynamics(southHadley)
	let hadleyScale = TORQUE_BALANCE.hadleyScales({
		mesh,
		rest: restPressure,
		north: northPressure,
		south: southPressure,
		coriolis,
		friction: FRICTION,
		hemisphere,
		gust,
	})
	if (EXPERIMENT.name === "baseline")
		EXPERIMENT.scales[month] = { ...hadleyScale }
	if (EXPERIMENT.freeze) hadleyScale = EXPERIMENT.scales[month]
	if (!EXPERIMENT.torque) hadleyScale = { north: 1, south: 1 }
	EXPERIMENT.trace = {
		teqByLon,
		northHadley,
		southHadley,
		rest: components.rest,
		coriolis,
		rawPerMs,
		hadleyScale,
	}
	const pressure = new Float32Array(N)
	for (let r = 0; r < N; r++)
		pressure[r] =
			restPressure[r] +
			hadleyScale.north * northPressure[r] +
			hadleyScale.south * southPressure[r]
	let largeScaleU = null
	let largeScaleV = null
	if (LARGE_SCALE_SOLVER === "shallow-water") {
		const sw = SHALLOW_WATER.surfaceWind({
			latDeg,
			lonDeg,
			pressure,
			elevation_km,
			planetRadiusM: planetRadiusKm * 1000,
			coriolisPolar: coriolisSign * omegaRatio * EARTH_POLAR_CORIOLIS,
		})
		largeScaleU = sw.u
		largeScaleV = sw.v
		for (let r = 0; r < N; r++) pressure[r] -= sw.coarsePressure[r]
	}
	const lonBinCount = teqByLon.length
	const latBinCount = OCEAN_BINS
	const landCount = new Float32Array(lonBinCount * latBinCount)
	const cellCount = new Float32Array(lonBinCount * latBinCount)
	for (let r = 0; r < N; r++) {
		const idx = oceanBinOf(latDeg[r]) * lonBinCount + regionBin[r]
		cellCount[idx]++
		if (elevation_km[r] > 0) landCount[idx]++
	}
	const landFracAt = (latBin, lonBin) => {
		const idx =
			latBin * lonBinCount +
			(((lonBin % lonBinCount) + lonBinCount) % lonBinCount)
		return cellCount[idx] > 0 ? landCount[idx] / cellCount[idx] : 0
	}
	const oceanPSum = new Float64Array(lonBinCount * latBinCount)
	const oceanPCnt = new Float32Array(lonBinCount * latBinCount)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0) continue
		const idx = oceanBinOf(latDeg[r]) * lonBinCount + regionBin[r]
		oceanPSum[idx] += pressure[r]
		oceanPCnt[idx]++
	}
	const latPMean = new Float32Array(latBinCount)
	for (let lb = 0; lb < latBinCount; lb++) {
		let s = 0
		let c = 0
		for (let xb = 0; xb < lonBinCount; xb++) {
			const idx = lb * lonBinCount + xb
			if (oceanPCnt[idx] > 0) {
				s += oceanPSum[idx]
				c += oceanPCnt[idx]
			}
		}
		latPMean[lb] = c > 0 ? s / c : 0
	}
	const oceanPAt = (latBin, lonBin) => {
		const idx =
			latBin * lonBinCount +
			(((lonBin % lonBinCount) + lonBinCount) % lonBinCount)
		return oceanPCnt[idx] > 0
			? oceanPSum[idx] / oceanPCnt[idx]
			: latPMean[latBin]
	}
	const boundaryStrength = new Float32Array(N)
	const eastBoundaryStrength = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const latBin = oceanBinOf(latDeg[r])
		const own = landFracAt(latBin, regionBin[r])
		if (own >= BOUNDARY_LAND_MIN) {
			const eastIsOcean =
				landFracAt(latBin, regionBin[r] + 1) < BOUNDARY_LAND_MIN ? 1 : 0
			boundaryStrength[r] = (1 - own) * eastIsOcean
			const westIsOcean =
				landFracAt(latBin, regionBin[r] - 1) < BOUNDARY_LAND_MIN ? 1 : 0
			if (westIsOcean) {
				const offshore =
					(oceanPAt(latBin, regionBin[r] - 2) +
						oceanPAt(latBin, regionBin[r] - 3)) *
					0.5
				const highFactor = MATH.smoothstep({
					edge0: 0,
					edge1: EAST_BOUNDARY_HIGH_FULL,
					x: offshore - latPMean[latBin],
				})
				eastBoundaryStrength[r] = (1 - own) * highFactor
			}
			continue
		}
		for (let k = 1; k <= BOUNDARY_REACH_BINS; k++) {
			if (landFracAt(latBin, regionBin[r] - k) < BOUNDARY_LAND_MIN) continue
			boundaryStrength[r] = Math.exp(-(k - 1) / BOUNDARY_DECAY_BINS)
			break
		}
	}
	const declination = hasMonth ? climate.declination_monthly[month] : 0
	const obliquity = Math.max(1, Math.abs(params?.obliquity ?? 23.4))
	const seasonSign = Math.sign(declination)
	const seasonMag = Math.min(1, Math.abs(declination) / obliquity)
	const boundaryTurn = BOUNDARY_TURN_DEG * DEG2RAD
	const eastBoundaryTurn = EAST_BOUNDARY_TURN_DEG * DEG2RAD
	const windU = new Float32Array(N)
	const windV = new Float32Array(N)
	const rawSpeed = new Float32Array(N)
	const pressureGradient = SURFACE_BALANCE.meshGradient({
		mesh,
		field: pressure,
	})
	const elevationGradient = SURFACE_BALANCE.meshGradient({
		mesh,
		field: elevation_km,
	})
	for (let r = 0; r < N; r++) {
		const forceEast = -pressureGradient.east[r]
		const forceNorth = -pressureGradient.north[r]
		const gradEEast = elevationGradient.east[r] / planetRadiusKm
		const gradENorth = elevationGradient.north[r] / planetRadiusKm
		const slopeMag = Math.hypot(gradEEast, gradENorth)
		const gEastHat = slopeMag > 1e-9 ? gradEEast / slopeMag : 0
		const gNorthHat = slopeMag > 1e-9 ? gradENorth / slopeMag : 0
		const f = coriolis[r]
		const bl = SURFACE_BALANCE.balance({
			friction: FRICTION,
			coriolis: f,
			forceEast,
			forceNorth,
		})
		const roughness = surface ? ROUGHNESS.surfaceFactor({ r, surface }) : 1
		let u = bl.u * roughness
		let v = bl.v * roughness
		if (seasonSign !== 0 && boundaryStrength[r] > 0) {
			const lat = latDeg[r]
			const tropical = Math.exp(-((lat / (0.5 * hw)) ** 2))
			const summerSide = Math.sign(lat) === seasonSign ? 1 : 0
			const subtropical =
				summerSide * Math.exp(-(((Math.abs(lat) - hw) / (hw / 3)) ** 2))
			const weight = Math.min(
				1,
				tropical * EXPERIMENT.westTropical +
					subtropical * EXPERIMENT.westSubtropical,
			)
			const speed =
				BOUNDARY_FLOW_MS *
				EXPERIMENT.west *
				seasonMag *
				weight *
				boundaryStrength[r] *
				rawPerMs
			const east =
				seasonSign * Math.sign(lat) * coriolisSign * Math.sin(boundaryTurn)
			u += speed * east * roughness
			v += speed * seasonSign * Math.cos(boundaryTurn) * roughness
		}
		if (seasonSign !== 0 && eastBoundaryStrength[r] > 0) {
			const lat = latDeg[r]
			const summerSide = Math.sign(lat) === seasonSign ? 1 : 0
			const weight =
				summerSide * Math.exp(-(((Math.abs(lat) - 0.9 * hw) / (0.7 * hw)) ** 2))
			const speed =
				EAST_BOUNDARY_FLOW_MS *
				EXPERIMENT.east *
				seasonMag *
				weight *
				eastBoundaryStrength[r] *
				rawPerMs
			u += speed * Math.sin(eastBoundaryTurn) * roughness
			v -= speed * Math.sign(lat) * Math.cos(eastBoundaryTurn) * roughness
		}
		if (largeScaleU && largeScaleV) {
			u += largeScaleU[r] * rawPerMs * roughness
			v += largeScaleV[r] * rawPerMs * roughness
		}
		if (slopeMag > 1e-9 && elevation_km[r] > 0.2) {
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
				const k = SURFACE_BALANCE.balance({
					friction: KATABATIC_FRICTION,
					coriolis: f,
					forceEast: -gEastHat * kMag,
					forceNorth: -gNorthHat * kMag,
				})
				u += k.u
				v += k.v
			}
		}
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
	const latTotal = new Int32Array(OCEAN_BINS)
	const latOcean = new Int32Array(OCEAN_BINS)
	for (let r = 0; r < N; r++) {
		const b = oceanBinOf(latDeg[r])
		latTotal[b]++
		if (elevation_km[r] <= 0) latOcean[b]++
	}
	const windSpeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let fetch = 1
		if (elevation_km[r] <= 0) {
			const b = oceanBinOf(latDeg[r])
			const zonalOcean = latTotal[b] > 0 ? latOcean[b] / latTotal[b] : 1
			fetch =
				1 +
				OPEN_OCEAN_FETCH_BOOST *
					MATH.smoothstep({ edge0: 0.65, edge1: 0.98, x: zonalOcean })
		}
		windSpeed[r] =
			rawSpeed[r] * SPEED_SCALE * radiusFactor * pressureFactor * fetch
	}
	return { windU, windV, pressure, windSpeed }
}
function observedWindVectorsForMonth({ observedWind, numRegions, month }) {
	const windU = new Float32Array(numRegions)
	const windV = new Float32Array(numRegions)
	const pressure = new Float32Array(numRegions)
	const windSpeed = new Float32Array(numRegions)
	const realU = observedWind?.real_u_monthly
	const realV = observedWind?.real_v_monthly
	if (!realU || !realV) return { windU, windV, pressure, windSpeed }
	for (let r = 0; r < numRegions; r++) {
		let u
		let v
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
	rotationCollapse,
}
