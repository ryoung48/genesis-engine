import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type {
	ApplyDtrToClimateMinMaxParams,
	ComputeLandFractionParams,
	ComputeMonthlyDaylightHoursParams,
	ComputeTemperatureParams,
	LatBandInterpolationParams,
	MeshLatitudeGeometry,
} from "@/model/climate/classification/climate/types"
import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"
import { HEAT } from "@/model/climate/temperature/tidal-locked"
import type { GenesisClimate } from "@/model/climate/types"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { MATH } from "@/model/shared/math/core"
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
}: LatBandInterpolationParams): number {
	const pos = Math.max(0, Math.min(NUM_LAT - 1, (latDeg + 90) * LAT_STEP_INV))
	const i0 = Math.min(NUM_LAT - 2, pos | 0)
	const t = pos - i0
	return range[i0] + t * (range[i0 + 1] - range[i0])
}

function computeLandFraction({
	mesh,
	isLand,
}: ComputeLandFractionParams): number[] {
	const { latBandByRegion } = getMeshLatitudeGeometry(mesh)
	const landCount = new Float64Array(NUM_LAT)
	const totalCount = new Float64Array(NUM_LAT)

	for (let r = 0; r < mesh.numRegions; r++) {
		const band = latBandByRegion[r]
		totalCount[band]++
		if (isLand[r]) landCount[band]++
	}

	const landFraction: number[] = new Array(NUM_LAT)
	for (let i = 0; i < NUM_LAT; i++) {
		const frac = totalCount[i] > 0 ? landCount[i] / totalCount[i] : 0
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
	const daylight_hours_monthly = computeMonthlyDaylightHours({ mesh, params })
	const monthlyRanges: number[][] = new Array(12)
	const monthlyRangeRanges: number[][] = new Array(12)
	const monthlyInsolRanges: number[][] = new Array(12)
	const declination_monthly = new Float32Array(12)
	const ebm = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: UNITS.getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: params.eccentricity,
			PERIHELION: params.perihelion,
		},
		stellar: {
			...CONSTANTS.embConstants.stellar,
			T_SUN: T_star,
			R_SUN: R_star_m,
			AU: d_m,
		},
		time: {
			YEAR_LENGTH_DAYS: params.daysPerYear,
			HOURS_PER_DAY: params.hoursPerDay,
		},
		pressure: params.pressure ?? 1,
		radius: params.planetRadiusKm * 1000,
		landFraction,
		albedo: params.albedo,
		greenhouseFactor: params.greenhouseFactor,
		seismologyTotalHeatingK: params.seismologyTotalHeatingK,
	})
	ebm.runModel({ years: 30, dtDays: 0.5 })
	const temperatureAvgByBand = ebm.temperature_avg
	let dayStart = 0
	for (let month = 0; month < 12; month++) {
		const start = dayStart
		const end = start + MONTH_DAY_COUNTS[month]
		dayStart = end
		let declinationSum = 0
		for (let day = start; day < end; day++)
			declinationSum += ebm.declination[day]
		declination_monthly[month] = (declinationSum / (end - start)) * RAD_TO_DEG
		monthlyRanges[month] = ebm.temperature.map((row) => {
			let sum = 0
			for (let day = start; day < end; day++) sum += row[day]
			return sum / (end - start)
		})
		monthlyRangeRanges[month] = ebm.temperature.map((row) => {
			let min = Infinity
			let max = -Infinity
			for (let day = start; day < end; day++) {
				min = Math.min(min, row[day])
				max = Math.max(max, row[day])
			}
			return max - min
		})
		monthlyInsolRanges[month] = ebm.insolation.map((row) => {
			let sum = 0
			for (let day = start; day < end; day++) sum += row[day]
			return sum / (end - start)
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

	// Convert ocean distance from km to miles for continentality model
	const KM_TO_MI = 0.621371

	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const hKm = elevation_km
			? elevation_km[r]
			: ELEVATION.elevToHeightKm({ elev: elevation[r] })
		const annualAvg = interpolateLatBand({
			range: temperatureAvgByBand,
			latDeg,
		})

		// Continentality: scale seasonal deviation from annual mean
		// Ocean (0 mi): factor ≈ 0.78 (damped), coast (~300 mi): factor ≈ 1.0, deep inland: → 1.75
		// Taper toward poles: less solar energy = lower ceiling for continental amplification
		const distMiles = oceanDist ? oceanDist[r] * KM_TO_MI : 0
		const absLat = Math.abs(latDeg)
		const polarTaper = absLat > 55 ? 1 - (absLat - 55) / 35 : 1 // linear fade 55°–90°
		const maxAmplitude = 0.5 * Math.max(0, polarTaper)
		const inertiaFactor = oceanDist
			? 1 + maxAmplitude * Math.tanh((distMiles - 300) / 1000)
			: 1

		for (let month = 0; month < 12; month++) {
			const zonalMonthNoLapse = interpolateLatBand({
				range: monthlyRanges[month],
				latDeg,
			})
			const monthlyNoLapse =
				annualAvg + (zonalMonthNoLapse - annualAvg) * inertiaFactor
			// Temperature proxies moisture: cold columns approach the dry lapse rate.
			const moistureFraction = MATH.smoothstep({
				edge0: -20,
				edge1: 20,
				x: monthlyNoLapse,
			})
			const lapseRate = (9.8 - 4.8 * moistureFraction) * gravityRatio
			const lapseCorrection = isLand[r] === 1 ? hKm * lapseRate : 0
			temperature_monthly[month * N + r] = monthlyNoLapse - lapseCorrection
			temperature_monthly_nolapse[month * N + r] = monthlyNoLapse
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

	return {
		temperature_avg,
		temperature_min,
		temperature_max,
		temperature_monthly,
		temperature_monthly_nolapse,
		temperature_monthly_range,
		insolation_monthly,
		declination_monthly,
		pet_monthly,
		daylight_hours_monthly,
		landFraction,
	}
}

export const CLIMATE = {
	computeLandFraction,
	applyDtrToClimateMinMax,
	computeTemperature,
}
