import { EMB_CONSTANTS } from "../../cells/ebm/constants"
import { EnergyBalanceModel } from "../../cells/ebm/index"
import { WIND } from "../../cells/wind"
import { TIME } from "../../utilities/time"
import type { OrogenClimate, OrogenParams, SphereMesh } from "../types"
import { getRegionLatLonDegrees } from "../util/math"
import { getEffectiveObliquityDeg } from "../util/units"
import { interpolateLatBand } from "./climate"

const NUM_MONTHS = 12

export interface WindResult {
	wind_east_monthly: Float32Array
	wind_north_monthly: Float32Array
	wind_speed_monthly: Float32Array
}

function buildPreviewEbm(
	params: Pick<
		OrogenParams,
		| "hoursPerDay"
		| "planetRadiusKm"
		| "obliquity"
		| "eccentricity"
		| "sunTempFactor"
		| "daysPerYear"
		| "perihelion"
		| "pressure"
	>,
	climate: OrogenClimate,
): EnergyBalanceModel {
	const ebm = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: params.eccentricity,
			PERIHELION: params.perihelion,
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			T_SUN: EMB_CONSTANTS.stellar.T_SUN * params.sunTempFactor,
		},
		time: {
			YEAR_LENGTH_DAYS: params.daysPerYear,
			HOURS_PER_DAY: params.hoursPerDay,
		},
		pressure: params.pressure ?? 1.0,
		radius: params.planetRadiusKm * 1000,
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
	climate: OrogenClimate,
	params: Pick<
		OrogenParams,
		| "hoursPerDay"
		| "planetRadiusKm"
		| "obliquity"
		| "eccentricity"
		| "sunTempFactor"
		| "daysPerYear"
		| "perihelion"
		| "pressure"
	>,
): WindResult {
	const N = mesh.numRegions
	const wind_east_monthly = new Float32Array(N * NUM_MONTHS)
	const wind_north_monthly = new Float32Array(N * NUM_MONTHS)
	const wind_speed_monthly = new Float32Array(N * NUM_MONTHS)

	const ebm = buildPreviewEbm(params, climate)
	const teqByDay = computeThermalEquatorByDay(ebm.temperature, ebm.lats_deg)
	const dailyWind = WIND.calculateEbmWind(ebm.temperature, ebm.lats, teqByDay)
	const monthlyLatWind = buildMonthlyLatWind(dailyWind)
	const { latDeg } = getRegionLatLonDegrees(mesh)

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
