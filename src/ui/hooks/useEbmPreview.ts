import { useMemo } from "react"
import { EnergyBalanceModel } from "@/model/climate/ebm"
import { EMB_CONSTANTS } from "@/model/climate/ebm/constants"
import {
	mapLinear,
	rgbToCss,
	sampleColorStops,
} from "@/model/shared/color-interpolation"
import { PLASMA_STOPS, PURPLES_STOPS } from "@/model/shared/color-palettes"

interface EbmConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	tSun: number
	hoursPerDay: number
	daysPerYear: number
	landFraction: number
	radius: number
	pressure: number
}

function meanOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let sum = 0
	for (const value of values) sum += value
	return sum / values.length
}

export function useEbmPreview(config: EbmConfig) {
	const {
		obliquity,
		eccentricity,
		perihelion,
		tSun,
		hoursPerDay,
		daysPerYear,
		landFraction,
		radius,
		pressure,
	} = config
	return useMemo(() => {
		const modelConfig = {
			orbital: {
				OBLIQUITY: obliquity,
				ECCENTRICITY: eccentricity,
				PERIHELION: perihelion,
			},
			stellar: {
				...EMB_CONSTANTS.stellar,
				T_SUN: tSun,
			},
			time: {
				HOURS_PER_DAY: hoursPerDay,
				YEAR_LENGTH_DAYS: daysPerYear,
			},
			landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(landFraction),
			radius: radius * 1000, // km to meters
			pressure,
		}
		const model = new EnergyBalanceModel(modelConfig)
		model.runModel(30, 0.5)

		const time = EMB_CONSTANTS.time
		const sampledDays: number[] = []
		const dayLabels: string[] = []
		for (let i = 0; i < time.DAYS_PER_YEAR; i += 10) {
			sampledDays.push(i)
			dayLabels.push(`${i}`)
		}

		let insolMin = Infinity
		let insolMax = -Infinity
		for (const row of model.insolation) {
			for (const val of row) {
				if (val < insolMin) insolMin = val
				if (val > insolMax) insolMax = val
			}
		}
		const insolColorFn = (val: number) =>
			rgbToCss(
				sampleColorStops(
					PLASMA_STOPS,
					mapLinear(val, insolMin, insolMax, 0, 1, true),
				),
			)
		const daylightColorFn = (hours: number) =>
			rgbToCss(
				sampleColorStops(
					PURPLES_STOPS,
					mapLinear(hours, 0, hoursPerDay, 1, 0, true),
				),
			)

		// Calculate global average temperature (area-weighted)
		let totalWeightedTemp = 0
		let totalArea = 0
		for (let i = 0; i < model.lats_deg.length; i++) {
			const latAvg = meanOf(model.temperature[i])
			const areaWeight = model.dx[i]
			totalWeightedTemp += latAvg * areaWeight
			totalArea += areaWeight
		}
		const avgTemp = totalWeightedTemp / totalArea

		return {
			heat: model.temperature,
			avgTemp,
			insolation: model.insolation,
			insolColorFn,
			daylight: model.daylightHours,
			daylightColorFn,
			lats: model.lats_deg,
			sampledDays,
			dayLabels,
		}
	}, [
		obliquity,
		eccentricity,
		perihelion,
		tSun,
		hoursPerDay,
		daysPerYear,
		landFraction,
		radius,
		pressure,
	])
}
