import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type {
	ApplyDtrToClimateMinMaxParams,
	ComputeLandFractionParams,
	ComputeMonthlyDaylightHoursParams,
	ComputeTemperatureParams,
	MeshLatitudeGeometry,
} from "@/model/climate/classification/climate/types"
import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import { CONFIG } from "@/model/climate/temperature/ebm/config"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"
import { HEAT } from "@/model/climate/temperature/tidal-locked"
import type { GenesisClimate } from "@/model/climate/types"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

function getStellarCls(params: GenesisParams): MainSequenceClass {
	return STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
}

const NUM_LAT = CONSTANTS.embConstants.grid.NUM_LAT

const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const LAT_STEP_INV = (NUM_LAT - 1) / 180

const RAD_TO_DEG = 180 / Math.PI
const meshLatitudeGeometryCache = new WeakMap<
	SphereMesh,
	MeshLatitudeGeometry
>()

function getMeshLatitudeGeometry(mesh: SphereMesh): MeshLatitudeGeometry {
	const cached = meshLatitudeGeometryCache.get(mesh)
	if (cached) return cached

	const latDegByRegion = new Float64Array(mesh.numRegions)
	const latBandByRegion = new Uint8Array(mesh.numRegions)

	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * RAD_TO_DEG
		latDegByRegion[r] = latDeg
		latBandByRegion[r] = Math.max(
			0,
			Math.min(NUM_LAT - 1, Math.floor(((latDeg + 90) / 180) * NUM_LAT)),
		)
	}

	const geometry = { latDegByRegion, latBandByRegion }
	meshLatitudeGeometryCache.set(mesh, geometry)
	return geometry
}

function interpolateLatBand({
	range,
	latDeg,
}: {
	range: number[]
	latDeg: number
}): number {
	const pos = Math.max(0, Math.min(NUM_LAT - 1, (latDeg + 90) * LAT_STEP_INV))
	const i0 = Math.min(NUM_LAT - 2, pos | 0)
	const t = pos - i0
	return range[i0] + t * (range[i0 + 1] - range[i0])
}

const EBM_LAT_COUNT = CONFIG.earthClimate.discretization.latitudeCount
const EBM_SAMPLES = CONFIG.earthClimate.discretization.samplesPerYear
// The seasonal run starts at northern winter solstice (Ls = -90).
const WINTER_SOLSTICE_DOY = 355

// Linear interpolation of ys (defined at ascending xs) at x, clamped at the ends.
function interpMonotonic(
	xs: readonly number[],
	ys: readonly number[],
	x: number,
): number {
	const n = xs.length
	if (x <= xs[0]) return ys[0]
	if (x >= xs[n - 1]) return ys[n - 1]
	let hi = 1
	while (hi < n && xs[hi] < x) hi++
	const lo = hi - 1
	const t = (x - xs[lo]) / (xs[hi] - xs[lo])
	return ys[lo] + t * (ys[hi] - ys[lo])
}

// Per-cell area proxy from local spacing (mean neighbour distance squared).
// Imported meshes deliberately pack more, smaller cells onto land, so raw cell
// counts over-represent land; weighting by this recovers true area fractions.
function cellAreaProxy(mesh: SphereMesh): Float64Array {
	const { numRegions, adjOffset, adjList, neighborDist } = mesh
	const area = new Float64Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		let sum = 0
		let count = 0
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			if (adjList[j] < 0) continue
			sum += neighborDist[j]
			count++
		}
		const spacing = count > 0 ? sum / count : 0
		area[r] = spacing * spacing || 1
	}
	return area
}

function monthOfDayOfYear(doy: number): number {
	let acc = 0
	for (let m = 0; m < 12; m++) {
		acc += MONTH_DAY_COUNTS[m]
		if (doy < acc) return m
	}
	return 11
}

function computeLandFraction({
	mesh,
	isLand,
}: ComputeLandFractionParams): number[] {
	const { latBandByRegion } = getMeshLatitudeGeometry(mesh)
	const area = cellAreaProxy(mesh)
	const landArea = new Float64Array(NUM_LAT)
	const totalArea = new Float64Array(NUM_LAT)

	for (let r = 0; r < mesh.numRegions; r++) {
		const band = latBandByRegion[r]
		totalArea[band] += area[r]
		if (isLand[r]) landArea[band] += area[r]
	}

	const landFraction: number[] = new Array(NUM_LAT)
	for (let i = 0; i < NUM_LAT; i++) {
		const frac = totalArea[i] > 0 ? landArea[i] / totalArea[i] : 0
		landFraction[i] = Math.min(frac, 0.8) // cap at 0.8 matching existing EBM
	}
	return landFraction
}

function computeMonthlyDaylightHours({
	mesh,
	params,
}: ComputeMonthlyDaylightHoursParams): Float32Array {
	const N = mesh.numRegions
	const { latDegByRegion } = getMeshLatitudeGeometry(mesh)
	const monthly = new Float32Array(N * 12)
	const hoursPerDay = params.hoursPerDay

	if (params.tideLock?.type === "solar") {
		return HEAT.computeLockedMonthlyDaylightHours({ mesh, params })
	}

	const lats: number[] = []
	for (let i = 0; i < CONSTANTS.embConstants.grid.NUM_LAT; i++)
		lats.push(
			-Math.PI / 2 + (Math.PI * i) / (CONSTANTS.embConstants.grid.NUM_LAT - 1),
		)
	const { _daylight_hours } = INSOLATION.compute({
		lats,
		orbital: {
			...CONSTANTS.embConstants.orbital,
			OBLIQUITY: UNITS.getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: params.eccentricity,
			PERIHELION: params.perihelion,
		},
	})
	const monthlyRanges: number[][] = new Array(12)
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		monthlyRanges[month] = _daylight_hours.map((row) => {
			let sum = 0
			for (const day of days) sum += row[day]
			return (sum / Math.max(1, days.length)) * (hoursPerDay / TIME.hoursPerDay)
		})
	}

	for (let r = 0; r < N; r++) {
		for (let month = 0; month < 12; month++) {
			monthly[month * N + r] = interpolateLatBand({
				range: monthlyRanges[month],
				latDeg: latDegByRegion[r],
			})
		}
	}

	return monthly
}

function applyDtrToClimateMinMax({
	climate,
	dtr_monthly,
	N,
}: ApplyDtrToClimateMinMaxParams): void {
	for (let r = 0; r < N; r++) {
		let maxT = -Infinity
		let minT = Infinity
		for (let m = 0; m < 12; m++) {
			const mean = climate.temperature_monthly[m * N + r]
			const half = dtr_monthly[m * N + r] * 0.5
			if (mean + half > maxT) maxT = mean + half
			if (mean - half < minT) minT = mean - half
		}
		climate.temperature_max[r] = maxT
		climate.temperature_min[r] = minT
	}
}

function computeTemperature({
	mesh,
	elevation,
	landFraction,
	params,
	oceanDist,
	isLand,
	elevation_km,
}: ComputeTemperatureParams): GenesisClimate {
	if (params.tideLock?.type === "solar") {
		return HEAT.computeTidalTemperature({
			mesh,
			elevation,
			landFraction,
			params,
			oceanDist,
			elevation_km,
		})
	}

	const cls = getStellarCls(params)
	const T_star = STAR.getStarTemperatureK({ cls, subtype: params.starSubtype })
	const R_star_m =
		STAR.getStarDiameterSol({ cls, subtype: params.starSubtype }) *
		CONSTANTS.embConstants.stellar.R_SUN
	const d_m = params.orbitalDistanceAU * CONSTANTS.embConstants.stellar.AU
	const base = CONFIG.pipeline
	const targetCoverage = Math.min(0.95, Math.max(0.02, params.landCoverage))
	// Resample the measured latitudinal land-fraction profile onto the EBM grid,
	// then rescale it so the global (equal-area) mean matches the world's
	// intended landCoverage -- the fixed POISE OLR is calibrated near 0.34 and
	// tips toward a snowball if fed a much higher global land fraction. Keeping
	// the *shape* is what gives mid-latitude bands their real land fraction, and
	// hence a realistic seasonal amplitude / summer temperature (a uniform fill
	// leaves them ocean-dominated and too damped, pushing tundra equatorward).
	const shapeByBand = Array.from({ length: EBM_LAT_COUNT }, (_, i) => {
		const lat = Math.asin(-1 + (2 * i + 1) / EBM_LAT_COUNT) * RAD_TO_DEG
		return interpolateLatBand({ range: landFraction, latDeg: lat })
	})
	const shapeMean =
		shapeByBand.reduce((sum, value) => sum + value, 0) / EBM_LAT_COUNT
	const coverageScale = shapeMean > 0 ? targetCoverage / shapeMean : 1
	const ebmLandFraction = shapeByBand.map((value) =>
		Math.min(0.95, value * coverageScale),
	)
	const ebm = new EnergyBalanceModel({
		...base,
		orbital: {
			OBLIQUITY: UNITS.getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: params.eccentricity,
			PERIHELION: params.perihelion,
		},
		stellar: {
			...base.stellar,
			T_SUN: T_star,
			R_SUN: R_star_m,
			AU: d_m,
		},
		time: {
			YEAR_LENGTH_DAYS: params.daysPerYear,
			HOURS_PER_DAY: params.hoursPerDay,
		},
		pressure: params.pressure ?? 1.0,
		radius: params.planetRadiusKm * 1000,
		landFraction: ebmLandFraction,
	})
	ebm.runModel({ years: 200, dtDays: 365 / EBM_SAMPLES })
	const daylight_hours_monthly = computeMonthlyDaylightHours({ mesh, params })

	// The EBM runs on EBM_LAT_COUNT equal-area latitudes and EBM_SAMPLES
	// seasonal steps starting at northern winter solstice. Resample its output
	// onto the coarse equal-angle band grid and 12 calendar months the rest of
	// this function uses.
	const targetLatByBand = Array.from(
		{ length: NUM_LAT },
		(_, b) => -90 + (180 * b) / (NUM_LAT - 1),
	)
	const temperatureAvgByBand = targetLatByBand.map((lat) =>
		interpMonotonic(ebm.lats_deg, ebm.temperature_avg, lat),
	)
	const tempByBandSample: number[][] = Array.from(
		{ length: NUM_LAT },
		() => new Array<number>(EBM_SAMPLES),
	)
	const insolByBandSample: number[][] = Array.from(
		{ length: NUM_LAT },
		() => new Array<number>(EBM_SAMPLES),
	)
	for (let s = 0; s < EBM_SAMPLES; s++) {
		const tempCol = ebm.temperature.map((row) => row[s])
		const insolCol = ebm.insolation.map((row) => row[s])
		for (let b = 0; b < NUM_LAT; b++) {
			tempByBandSample[b][s] = interpMonotonic(
				ebm.lats_deg,
				tempCol,
				targetLatByBand[b],
			)
			insolByBandSample[b][s] = interpMonotonic(
				ebm.lats_deg,
				insolCol,
				targetLatByBand[b],
			)
		}
	}
	const monthSamples: number[][] = Array.from(
		{ length: 12 },
		() => [] as number[],
	)
	for (let s = 0; s < EBM_SAMPLES; s++) {
		const doy = (WINTER_SOLSTICE_DOY + (s * 365) / EBM_SAMPLES) % 365
		monthSamples[monthOfDayOfYear(doy)].push(s)
	}
	for (let m = 0; m < 12; m++) {
		if (monthSamples[m].length === 0)
			monthSamples[m].push(
				Math.round(((m + 0.5) / 12) * EBM_SAMPLES) % EBM_SAMPLES,
			)
	}
	const monthlyRanges: number[][] = new Array(12)
	const monthlyRangeRanges: number[][] = new Array(12)
	const monthlyInsolRanges: number[][] = new Array(12)
	for (let m = 0; m < 12; m++) {
		const samples = monthSamples[m]
		monthlyRanges[m] = tempByBandSample.map((row) => {
			let sum = 0
			for (const s of samples) sum += row[s]
			return sum / samples.length
		})
		monthlyRangeRanges[m] = tempByBandSample.map((row) => {
			let min = Infinity
			let max = -Infinity
			for (const s of samples) {
				if (row[s] < min) min = row[s]
				if (row[s] > max) max = row[s]
			}
			return max - min
		})
		monthlyInsolRanges[m] = insolByBandSample.map((row) => {
			let sum = 0
			for (const s of samples) sum += row[s]
			return sum / samples.length
		})
	}

	const N = mesh.numRegions
	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)
	const temperature_monthly_nolapse = new Float32Array(N * 12)
	const temperature_monthly_range = new Float32Array(N * 12)
	const insolation_monthly = new Float32Array(N * 12)
	const pet_monthly = new Float32Array(N * 12)

	const gravityRatio = params.planetRadiusKm / 6371
	const LAPSE_RATE = 6.5 * gravityRatio // °C per km, scaled by surface gravity

	// Convert ocean distance from km to miles for continentality model
	const KM_TO_MI = 0.621371

	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const hKm = elevation_km
			? elevation_km[r]
			: ELEVATION.elevToHeightKm({ elev: elevation[r] })
		const lapseCorrection = isLand?.[r] ? hKm * LAPSE_RATE : 0

		const annualAvg =
			interpolateLatBand({ range: temperatureAvgByBand, latDeg }) -
			lapseCorrection

		// Continentality: scale seasonal deviation from annual mean
		// Ocean (0 mi): factor ≈ 0.78 (damped), coast (~300 mi): factor ≈ 1.0, deep inland: → 1.75
		// Taper toward poles: less solar energy = lower ceiling for continental amplification
		const distMiles = oceanDist ? oceanDist[r] * KM_TO_MI : 0
		const absLat = Math.abs(latDeg)
		const polarTaper = absLat > 55 ? 1 - (absLat - 55) / 35 : 1 // linear fade 55°–90°
		const maxAmplitude = 1 * Math.max(0, polarTaper)
		const inertiaFactor = oceanDist
			? 1 + maxAmplitude * Math.tanh((distMiles - 300) / 1000)
			: 1

		for (let month = 0; month < 12; month++) {
			const zonalMonthNoLapse = interpolateLatBand({
				range: monthlyRanges[month],
				latDeg,
			})
			const zonalMonth = zonalMonthNoLapse - lapseCorrection
			temperature_monthly[month * N + r] =
				annualAvg + (zonalMonth - annualAvg) * inertiaFactor
			temperature_monthly_nolapse[month * N + r] =
				annualAvg + lapseCorrection + (zonalMonth - annualAvg) * inertiaFactor
			// Range scales with continentality; insolation is purely astronomical
			temperature_monthly_range[month * N + r] =
				interpolateLatBand({ range: monthlyRangeRanges[month], latDeg }) *
				inertiaFactor
			insolation_monthly[month * N + r] = interpolateLatBand({
				range: monthlyInsolRanges[month],
				latDeg,
			})
		}
	}

	// ── Ocean SST noise: break up straight latitude bands ──────────────
	// Applied only to ocean cells; amplitude tapers toward equator and poles.
	if (isLand) {
		TEMPERATURE_SHARED.applyTemperatureNoise({
			mesh,
			N,
			seed: params.seed ?? 0,
			temperature_monthly,
			temperature_monthly_nolapse,
			computeTaper: (...coordinates: [number, number, number, number]) =>
				Math.min(1, Math.abs(coordinates[3]) / 0.35),
			includeCell: (r) => !isLand[r],
			temperature_avg,
			temperature_min,
			temperature_max,
		})
	}

	TEMPERATURE_SHARED.recomputeAnnualTemperatureStats({
		temperature_monthly,
		temperature_avg,
		temperature_min,
		temperature_max,
		N,
	})

	// Honest global mean of the final per-cell field (after lapse /
	// continentality / ocean noise), area-weighted so the denser land cells on
	// an imported mesh don't bias it cold.
	const cellArea = cellAreaProxy(mesh)
	let globalMeanWeighted = 0
	let globalMeanArea = 0
	for (let r = 0; r < N; r++) {
		globalMeanWeighted += cellArea[r] * temperature_avg[r]
		globalMeanArea += cellArea[r]
	}
	const globalMeanTempC =
		globalMeanArea > 0 ? globalMeanWeighted / globalMeanArea : 0

	return {
		temperature_avg,
		temperature_min,
		temperature_max,
		temperature_monthly,
		temperature_monthly_nolapse,
		temperature_monthly_range,
		insolation_monthly,
		pet_monthly,
		daylight_hours_monthly,
		landFraction,
		globalMeanTempC,
	}
}

export const CLIMATE = {
	computeLandFraction,
	applyDtrToClimateMinMax,
	computeTemperature,
}
