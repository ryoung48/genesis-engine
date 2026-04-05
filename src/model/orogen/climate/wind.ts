import { EMB_CONSTANTS } from "../../cells/ebm/constants"
import { EnergyBalanceModel } from "../../cells/ebm/index"
import { WIND } from "../../cells/wind"
import { TIME } from "../../utilities/time"
import type { OrogenClimate, OrogenParams, SphereMesh } from "../types"
import {
	getDaysPerYear,
	getEccentricity,
	getEffectiveObliquityDeg,
	getHoursPerDay,
	getPerihelion,
	getPlanetRadiusKm,
	getSunTempFactor,
} from "../util/units"

const NUM_MONTHS = 12
const LAT_STEP_INV = (EMB_CONSTANTS.grid.NUM_LAT - 1) / 180

export interface WindResult {
	wind_east_monthly: Float32Array
	wind_north_monthly: Float32Array
	wind_speed_monthly: Float32Array
}

function clamp(value: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, value))
}

function interpolateLatBand(range: number[], latDeg: number): number {
	const pos = clamp(
		(latDeg + 90) * LAT_STEP_INV,
		0,
		EMB_CONSTANTS.grid.NUM_LAT - 1,
	)
	const i0 = Math.min(EMB_CONSTANTS.grid.NUM_LAT - 2, pos | 0)
	const t = pos - i0
	return range[i0] + t * (range[i0 + 1] - range[i0])
}

function buildLatitudeMetadata(mesh: SphereMesh): Float32Array {
	const latDeg = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(clamp(z, -1, 1)) * (180 / Math.PI)
	}
	return latDeg
}

function buildPreviewEbm(
	params:
		| Pick<
				OrogenParams,
				| "hoursPerDay"
				| "planetRadiusKm"
				| "obliquity"
				| "eccentricity"
				| "sunTempFactor"
				| "daysPerYear"
				| "perihelion"
				| "pressure"
		  >
		| undefined,
	climate: OrogenClimate,
): EnergyBalanceModel {
	const ebm = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: getEccentricity(params.eccentricity),
			PERIHELION: getPerihelion(params.perihelion),
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			T_SUN:
				EMB_CONSTANTS.stellar.T_SUN * getSunTempFactor(params.sunTempFactor),
		},
		time: {
			YEAR_LENGTH_DAYS: getDaysPerYear(params.daysPerYear),
			HOURS_PER_DAY: getHoursPerDay(params.hoursPerDay),
		},
		pressure: params.pressure ?? 1.0,
		radius: getPlanetRadiusKm(params.planetRadiusKm) * 1000,
		landFraction: climate.landFraction,
	})
	ebm.runModel(30, 0.5)
	return ebm
}

function computeThermalEquatorByDay(
	temperature: number[][],
	latsDeg: number[],
): number[] {
	const numDays = temperature[0]?.length ?? 0
	const teqByDay = new Array<number>(numDays).fill(0)
	for (let day = 0; day < numDays; day++) {
		let maxTemp = -Infinity
		let maxLat = 0
		for (let i = 0; i < latsDeg.length; i++) {
			const temp = temperature[i][day]
			if (temp > maxTemp) {
				maxTemp = temp
				maxLat = latsDeg[i]
			}
		}
		teqByDay[day] = maxLat
	}
	return teqByDay
}

function buildMonthlyLatWind(wind: number[][]): number[][] {
	return Array.from({ length: NUM_MONTHS }, (_, month) => {
		const days = TIME.month.days(month)
		return wind.map((latRow) => {
			let sum = 0
			for (const day of days) sum += latRow[day]
			return sum / Math.max(1, days.length)
		})
	})
}

export function computeWind(
	mesh: SphereMesh,
	_elevation: Float32Array,
	_isLand: Uint8Array,
	_distCoast: Float32Array | undefined,
	climate: OrogenClimate,
	params?: Pick<
		OrogenParams,
		| "seed"
		| "hoursPerDay"
		| "tidallyLocked"
		| "planetRadiusKm"
		| "obliquity"
		| "eccentricity"
		| "sunTempFactor"
		| "daysPerYear"
		| "perihelion"
		| "pressure"
	>,
	monthlyTEQ?: Float32Array[],
): WindResult {
	const N = mesh.numRegions
	const wind_east_monthly = new Float32Array(N * NUM_MONTHS)
	const wind_north_monthly = new Float32Array(N * NUM_MONTHS)
	const wind_speed_monthly = new Float32Array(N * NUM_MONTHS)

	void _elevation
	void _isLand
	void _distCoast
	void params?.seed
	void params?.tidallyLocked
	void monthlyTEQ

	const ebm = buildPreviewEbm(params, climate)
	const teqByDay = computeThermalEquatorByDay(ebm.temperature, ebm.lats_deg)
	const dailyWind = WIND.calculateEbmWind(ebm.temperature, ebm.lats, teqByDay)
	const monthlyLatWind = buildMonthlyLatWind(dailyWind)
	const latDeg = buildLatitudeMetadata(mesh)

	for (let month = 0; month < NUM_MONTHS; month++) {
		const monthOffset = month * N
		const monthWind = monthlyLatWind[month]
		for (let r = 0; r < N; r++) {
			const zonalWind = interpolateLatBand(monthWind, latDeg[r])
			wind_east_monthly[monthOffset + r] = zonalWind
			wind_north_monthly[monthOffset + r] = 0
			wind_speed_monthly[monthOffset + r] = Math.abs(zonalWind)
		}
	}

	return { wind_east_monthly, wind_north_monthly, wind_speed_monthly }
}
