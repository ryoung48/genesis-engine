import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { CLIMATE } from "@/model/climate/classification/climate"
import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import type { EBMConfig } from "@/model/climate/temperature/ebm/config/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { ENERGY_BALANCE_MODEL } from "@/model/climate/temperature/ebm/energy-balance-model"
import type { SolvedEnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model/types"
import type {
	ComputeLandFractionParams,
	ComputeTemperatureParams,
	LatBandInterpolationParams,
	MeshLatitudeGeometry,
	ZonalTemperatureCellsParams,
} from "@/model/climate/temperature/legacy/types"
import type { GenesisClimate } from "@/model/climate/types"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { MATH } from "@/model/shared/math/core"
import { PARALLEL } from "@/model/shared/parallel"
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

const KM_TO_MI = 0.621371

function zonalTemperatureCells({
	start,
	end,
	xyz,
	elevation,
	elevationKm,
	oceanDist,
	isLand,
	annualByBand,
	monthlyByBand,
	monthlyRangeByBand,
	monthlyInsolationByBand,
	gravityRatio,
	monthly,
	noLapse,
	monthlyRange,
	insolation,
}: ZonalTemperatureCellsParams): void {
	const N = isLand.length
	for (let r = start; r < end; r++) {
		const z = xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const hKm = elevationKm
			? elevationKm[r]
			: ELEVATION.elevToHeightKm({ elev: elevation[r] })
		const annualAvg = interpolateLatBand({
			range: annualByBand,
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
				range: monthlyByBand[month],
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
			monthly[month * N + r] = monthlyNoLapse - lapseCorrection
			noLapse[month * N + r] = monthlyNoLapse
			// Range scales with continentality; insolation is purely astronomical
			monthlyRange[month * N + r] =
				interpolateLatBand({ range: monthlyRangeByBand[month], latDeg }) *
				inertiaFactor
			insolation[month * N + r] = interpolateLatBand({
				range: monthlyInsolationByBand[month],
				latDeg,
			})
		}
	}
}

const SOLVED_MODEL_LIMIT = 4

const solvedModels = new Map<string, SolvedEnergyBalanceModel>()

// Generation re-derives temperature after lakes settle with the same planet
// and land fractions, so a solved model is kept and reused instead of re-run.
function solvedModel(config: EBMConfig): SolvedEnergyBalanceModel {
	const key = JSON.stringify(config)
	const solved = solvedModels.get(key)
	if (solved) return solved
	const model = ENERGY_BALANCE_MODEL.create(config)
	model.runModel({ years: 30, dtDays: 0.5 })
	if (solvedModels.size >= SOLVED_MODEL_LIMIT)
		for (const oldest of solvedModels.keys()) {
			solvedModels.delete(oldest)
			break
		}
	solvedModels.set(key, model)
	return model
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
	const cls = getStellarCls(params)
	const T_star = STAR.getStarTemperatureK({ cls, subtype: params.starSubtype })
	const R_star_m =
		STAR.getStarDiameterSol({ cls, subtype: params.starSubtype }) *
		CONSTANTS.embConstants.stellar.R_SUN
	const d_m = params.orbitalDistanceAU * CONSTANTS.embConstants.stellar.AU
	const { daylight_hours_monthly } = CLIMATE.computeSunlight({ mesh, params })
	const monthlyRanges: number[][] = new Array(12)
	const monthlyRangeRanges: number[][] = new Array(12)
	const monthlyInsolRanges: number[][] = new Array(12)
	const declination_monthly = new Float32Array(12)
	const ebm = solvedModel({
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
	const monthly = PARALLEL.shared(new Float32Array(N * 12))
	const noLapse = PARALLEL.shared(new Float32Array(N * 12))
	const monthlyRange = PARALLEL.shared(new Float32Array(N * 12))
	const insolation = PARALLEL.shared(new Float32Array(N * 12))
	const pet_monthly = new Float32Array(N * 12)

	PARALLEL.mapCells({
		task: "legacyZonalTemperatureCells",
		kernel: zonalTemperatureCells,
		count: N,
		payload: {
			xyz: PARALLEL.shared(mesh.r_xyz),
			elevation: PARALLEL.shared(elevation),
			elevationKm: elevation_km ? PARALLEL.shared(elevation_km) : null,
			oceanDist: oceanDist ? PARALLEL.shared(oceanDist) : null,
			isLand: PARALLEL.shared(isLand),
			annualByBand: temperatureAvgByBand,
			monthlyByBand: monthlyRanges,
			monthlyRangeByBand: monthlyRangeRanges,
			monthlyInsolationByBand: monthlyInsolRanges,
			gravityRatio: params.planetRadiusKm / 6371,
			monthly,
			noLapse,
			monthlyRange,
			insolation,
		},
	})
	const temperature_monthly = PARALLEL.local(monthly)
	const temperature_monthly_nolapse = PARALLEL.local(noLapse)
	const temperature_monthly_range = PARALLEL.local(monthlyRange)
	const insolation_monthly = PARALLEL.local(insolation)

	// ── Ocean SST noise: break up straight latitude bands ──────────────
	// Applied only to ocean cells; amplitude tapers toward equator and poles.
	if (isLand) {
		for (const field of [temperature_monthly, temperature_monthly_nolapse])
			TEMPERATURE_SHARED.applyTemperatureNoise({
				mesh,
				N,
				seed: params.seed ?? 0,
				temperature_monthly: field,
				computeTaper: (...coordinates: [number, number, number, number]) =>
					Math.min(1, Math.abs(coordinates[3]) / 0.35),
				includeCell: (r) => !isLand[r],
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
	}
}

export const CLIMATE_V1 = {
	computeLandFraction,
	computeTemperature,
	zonalTemperatureCells,
}
