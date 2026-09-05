import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type {
	ApplyDtrToClimateMinMaxParams,
	ComputeLandElevationParams,
	ComputeLandFractionParams,
	ComputeMonthlyDaylightHoursParams,
	ComputeTemperatureParams,
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
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

function getStellarCls(params: GenesisParams): MainSequenceClass {
	return STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
}

const NUM_LAT = CONSTANTS.embConstants.grid.NUM_LAT

const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
// Share of the EBM land column a coastal land cell gets, and the e-folding
// distance over which maritime influence fades inland.
const COAST_LAND_WEIGHT = 0.5
const MARITIME_REACH_KM = 400

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

function computeLandFraction({
	mesh,
	isLand,
}: ComputeLandFractionParams): number[] {
	const { latBandByRegion } = getMeshLatitudeGeometry(mesh)
	const landCount = new Float64Array(NUM_LAT)
	const totalCount = new Float64Array(NUM_LAT)

	// Meshes are density-refined (coasts, land), so a cell count over-weights
	// land; weight each cell by its approximate area instead.
	for (let r = 0; r < mesh.numRegions; r++) {
		const area = cellAreaWeight({ mesh, r })
		const band = latBandByRegion[r]
		totalCount[band] += area
		if (isLand[r]) landCount[band] += area
	}

	const landFraction: number[] = new Array(NUM_LAT)
	for (let i = 0; i < NUM_LAT; i++) {
		const frac = totalCount[i] > 0 ? landCount[i] / totalCount[i] : 0
		landFraction[i] = Math.min(frac, 0.8) // cap at 0.8 matching existing EBM
	}
	return landFraction
}

function cellAreaWeight({ mesh, r }: { mesh: SphereMesh; r: number }): number {
	let spacing = 0
	let n = 0
	for (let j = mesh.adjOffset[r], jEnd = mesh.adjOffset[r + 1]; j < jEnd; j++) {
		spacing += mesh.neighborDist[j]
		n++
	}
	return n > 0 ? (spacing / n) ** 2 : 0
}

const LAND_ELEVATION_QUANTILES = [0.125, 0.375, 0.625, 0.875]

function computeLandElevationQuantilesKm({
	mesh,
	isLand,
	elevation_km,
}: ComputeLandElevationParams): number[][] {
	const { latBandByRegion } = getMeshLatitudeGeometry(mesh)
	const cells: { km: number; area: number }[][] = Array.from(
		{ length: NUM_LAT },
		(): { km: number; area: number }[] => [],
	)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!isLand[r]) continue
		cells[latBandByRegion[r]].push({
			km: Math.max(0, elevation_km[r]),
			area: cellAreaWeight({ mesh, r }),
		})
	}
	return cells.map((band) => {
		if (band.length === 0) return LAND_ELEVATION_QUANTILES.map(() => 0)
		band.sort((a, b) => a.km - b.km)
		const total = band.reduce((sum, c) => sum + c.area, 0)
		let cumulative = 0
		let index = 0
		return LAND_ELEVATION_QUANTILES.map((q) => {
			while (
				index < band.length - 1 &&
				cumulative + band[index].area < q * total
			) {
				cumulative += band[index].area
				index++
			}
			return band[index].km
		})
	})
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
		pressure: params.pressure ?? 1.0,
		radius: params.planetRadiusKm * 1000,
		landFraction,
		landElevationQuantilesKm:
			isLand && elevation_km
				? computeLandElevationQuantilesKm({ mesh, isLand, elevation_km })
				: undefined,
		albedo: params.albedo,
		greenhouseFactor: params.greenhouseFactor,
		seismologyTotalHeatingK: params.seismologyTotalHeatingK,
	})
	ebm.runModel({ years: 30, dtDays: 0.5 })
	const daylight_hours_monthly = computeMonthlyDaylightHours({ mesh, params })
	// Build interpolation ranges: latitude bands → zonal temperature, range, and insolation
	let dayStart = 0
	const monthlyLand: number[][] = new Array(12)
	const monthlyOcean: number[][] = new Array(12)
	const monthlyLandRange: number[][] = new Array(12)
	const monthlyOceanRange: number[][] = new Array(12)
	const monthlyInsolRanges: number[][] = new Array(12)
	const declination_monthly = new Float32Array(12)
	const monthMean = (row: number[], start: number, end: number) => {
		let sum = 0
		for (let d = start; d < end; d++) sum += row[d]
		return sum / (end - start)
	}
	const monthRange = (row: number[], start: number, end: number) => {
		let min = Infinity
		let max = -Infinity
		for (let d = start; d < end; d++) {
			if (row[d] < min) min = row[d]
			if (row[d] > max) max = row[d]
		}
		return max - min
	}
	for (let m = 0; m < 12; m++) {
		const start = dayStart
		const end = start + MONTH_DAY_COUNTS[m]
		dayStart = end
		declination_monthly[m] =
			(monthMean(ebm.declination, start, end) * 180) / Math.PI
		monthlyLand[m] = ebm.temperature_land.map((row) =>
			monthMean(row, start, end),
		)
		monthlyOcean[m] = ebm.temperature_ocean.map((row) =>
			monthMean(row, start, end),
		)
		monthlyLandRange[m] = ebm.temperature_land.map((row) =>
			monthRange(row, start, end),
		)
		monthlyOceanRange[m] = ebm.temperature_ocean.map((row) =>
			monthRange(row, start, end),
		)
		monthlyInsolRanges[m] = ebm.insolation.map((row) =>
			monthMean(row, start, end),
		)
	}
	const annualMean = (row: number[]) => monthMean(row, 0, row.length)
	const annualAmplitude = (row: number[]) => monthRange(row, 0, row.length) / 2
	const annualLand = ebm.temperature_land.map(annualMean)
	const annualOcean = ebm.temperature_ocean.map(annualMean)
	const annualLandAmplitude = ebm.temperature_land.map(annualAmplitude)
	const annualOceanAmplitude = ebm.temperature_ocean.map(annualAmplitude)

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
	const LAPSE_RATE = 5.5 * gravityRatio // °C per km, scaled by surface gravity

	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const hKm = elevation_km
			? elevation_km[r]
			: ELEVATION.elevToHeightKm({ elev: elevation[r] })
		const land = isLand?.[r] ?? hKm > 0
		const lapseCorrection = land ? hKm * LAPSE_RATE : 0

		// Land cells take the EBM land column's phase with an amplitude that
		// shrinks toward the ocean column's near the coast: maritime air damps
		// the swing but does not delay it the way the slab ocean's own lag would.
		const distKm = oceanDist?.[r] ?? 0
		const landWeight = land
			? COAST_LAND_WEIGHT +
				(1 - COAST_LAND_WEIGHT) * (1 - Math.exp(-distKm / MARITIME_REACH_KM))
			: 0
		const oceanMean = interpolateLatBand({ range: annualOcean, latDeg })
		const landMean = interpolateLatBand({ range: annualLand, latDeg })
		const oceanAmplitude = interpolateLatBand({
			range: annualOceanAmplitude,
			latDeg,
		})
		const landAmplitude = interpolateLatBand({
			range: annualLandAmplitude,
			latDeg,
		})
		const amplitudeScale =
			landAmplitude > 1e-6
				? landWeight + (1 - landWeight) * (oceanAmplitude / landAmplitude)
				: 1
		const meanNoLapse = oceanMean + landWeight * (landMean - oceanMean)

		for (let month = 0; month < 12; month++) {
			const ocean = interpolateLatBand({ range: monthlyOcean[month], latDeg })
			const landCol = interpolateLatBand({ range: monthlyLand[month], latDeg })
			const noLapse = land
				? meanNoLapse + amplitudeScale * (landCol - landMean)
				: ocean
			temperature_monthly[month * N + r] = noLapse - lapseCorrection
			temperature_monthly_nolapse[month * N + r] = noLapse
			const oceanRange = interpolateLatBand({
				range: monthlyOceanRange[month],
				latDeg,
			})
			const landRange = interpolateLatBand({
				range: monthlyLandRange[month],
				latDeg,
			})
			temperature_monthly_range[month * N + r] =
				oceanRange + landWeight * (landRange - oceanRange)
			insolation_monthly[month * N + r] = interpolateLatBand({
				range: monthlyInsolRanges[month],
				latDeg,
			})
		}
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
