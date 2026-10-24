import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type {
	ApplyDtrToClimateMinMaxParams,
	ComputeSunlightParams,
	LatBandInterpolationParams,
	Sunlight,
} from "@/model/climate/classification/climate/types"
import { INSOLATION } from "@/model/climate/shared/insolation"
import type {
	OrbitalParams,
	StellarParams,
} from "@/model/climate/shared/insolation/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

function getStellarCls(params: GenesisParams): MainSequenceClass {
	return STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
}

// Sunlight is computed at this many latitudes, pole to pole, and interpolated to the cells
const NUM_LAT = 36

const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const LAT_STEP_INV = (NUM_LAT - 1) / 180

const RAD_TO_DEG = 180 / Math.PI
const meshLatitudeCache = new WeakMap<SphereMesh, Float64Array>()

function meshLatitudes(mesh: SphereMesh): Float64Array {
	const cached = meshLatitudeCache.get(mesh)
	if (cached) return cached
	const latDegByRegion = new Float64Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDegByRegion[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD_TO_DEG
	}
	meshLatitudeCache.set(mesh, latDegByRegion)
	return latDegByRegion
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

// The world's sunlight by month: daylight hours, top-of-atmosphere insolation (W/m²) and the sub-solar latitude
function computeSunlight({ mesh, params }: ComputeSunlightParams): Sunlight {
	const N = mesh.numRegions
	const latDegByRegion = meshLatitudes(mesh)
	const lats: number[] = []
	for (let i = 0; i < NUM_LAT; i++)
		lats.push(-Math.PI / 2 + (Math.PI * i) / (NUM_LAT - 1))
	const { _insolation, _daylight_hours, _declination } = INSOLATION.compute({
		lats,
		orbital: orbitalOf(params),
		stellarOverride: stellarOf(params),
	})
	const daylightByBand: number[][] = new Array(12)
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		daylightByBand[month] = _daylight_hours.map((row) => {
			let sum = 0
			for (const day of days) sum += row[day]
			return (
				(sum / Math.max(1, days.length)) *
				(params.hoursPerDay / TIME.hoursPerDay)
			)
		})
	}
	const insolationByBand = monthlyBandMeans(_insolation)
	const declination_monthly = new Float32Array(12)
	let dayStart = 0
	for (let month = 0; month < 12; month++) {
		const end = dayStart + MONTH_DAY_COUNTS[month]
		let sum = 0
		for (let day = dayStart; day < end; day++) sum += _declination[day]
		declination_monthly[month] = (sum / (end - dayStart)) * RAD_TO_DEG
		dayStart = end
	}
	const daylight_hours_monthly = new Float32Array(N * 12)
	const insolation_monthly = new Float32Array(N * 12)
	for (let r = 0; r < N; r++) {
		const latDeg = latDegByRegion[r]
		for (let month = 0; month < 12; month++) {
			daylight_hours_monthly[month * N + r] = interpolateLatBand({
				range: daylightByBand[month],
				latDeg,
			})
			insolation_monthly[month * N + r] = interpolateLatBand({
				range: insolationByBand[month],
				latDeg,
			})
		}
	}
	return { daylight_hours_monthly, insolation_monthly, declination_monthly }
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

function orbitalOf(params: GenesisParams): OrbitalParams {
	return {
		OBLIQUITY: UNITS.getEffectiveObliquityDeg(params.obliquity),
		ECCENTRICITY: params.eccentricity,
		PERIHELION: params.perihelion,
	}
}

function stellarOf(params: GenesisParams): StellarParams {
	const cls = getStellarCls(params)
	return {
		...INSOLATION.sun,
		T_SUN: STAR.getStarTemperatureK({ cls, subtype: params.starSubtype }),
		R_SUN:
			STAR.getStarDiameterSol({ cls, subtype: params.starSubtype }) *
			INSOLATION.sun.R_SUN,
		AU: params.orbitalDistanceAU * INSOLATION.sun.AU,
	}
}

function monthlyBandMeans(rows: number[][]): number[][] {
	const out: number[][] = new Array(12)
	let dayStart = 0
	for (let month = 0; month < 12; month++) {
		const start = dayStart
		const end = start + MONTH_DAY_COUNTS[month]
		dayStart = end
		out[month] = rows.map((row) => {
			let sum = 0
			for (let day = start; day < end; day++) sum += row[day]
			return sum / (end - start)
		})
	}
	return out
}

export const CLIMATE = {
	computeSunlight,
	applyDtrToClimateMinMax,
}
