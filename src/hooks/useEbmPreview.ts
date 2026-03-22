import {
	interpolatePlasma,
	interpolatePurples,
	interpolateRdBu,
	mean,
	scaleDiverging,
	scaleLinear,
} from "d3"
import { useMemo } from "react"
import { EBM, EnergyBalanceModel } from "../model/cells/ebm"
import { WIND } from "../model/cells/wind"

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

export function useEbmPreview(config: EbmConfig) {
	const { obliquity, eccentricity, perihelion, tSun, hoursPerDay, daysPerYear, landFraction, radius, pressure } = config

	return useMemo(() => {
		const modelConfig = {
			orbital: {
				OBLIQUITY: obliquity,
				ECCENTRICITY: eccentricity,
				PERIHELION: perihelion,
			},
			stellar: {
				...EBM.constants.stellar,
				T_SUN: tSun,
			},
			time: {
				HOURS_PER_DAY: hoursPerDay,
				YEAR_LENGTH_DAYS: daysPerYear,
			},
			landFraction: new Array(EBM.constants.grid.NUM_LAT).fill(landFraction),
			radius: radius * 1000, // km to meters
			pressure,
		}
		const model = new EnergyBalanceModel(modelConfig)
		model.runModel(30, 0.5)

		const time = EBM.constants.time
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
		const insolColorScale = scaleLinear()
			.domain([insolMin, insolMax])
			.range([0, 1])
			.clamp(true)
		const insolColorFn = (val: number) =>
			interpolatePlasma(insolColorScale(val))

		const daylightScale = scaleLinear([0, hoursPerDay], [1, 0])
		const daylightColorFn = (hours: number) =>
			interpolatePurples(daylightScale(hours))

		const gradient = model.temperature.map((row, latIdx) => {
			const prevIdx = Math.max(0, latIdx - 1)
			const nextIdx = Math.min(model.temperature.length - 1, latIdx + 1)
			const latSpan = model.lats_deg[nextIdx] - model.lats_deg[prevIdx] || 1

			return row.map((_, dayIdx) => {
				const dT = model.temperature[nextIdx][dayIdx] - model.temperature[prevIdx][dayIdx]
				return dT / latSpan
			})
		})

		let gradientAbsMax = 0
		for (const row of gradient) {
			for (const val of row) {
				const abs = Math.abs(val)
				if (abs > gradientAbsMax) gradientAbsMax = abs
			}
		}
		const gradientScale = scaleDiverging((t) => t)
			.domain([-(gradientAbsMax || 0.1), 0, gradientAbsMax || 0.1])
			.clamp(true)
		const gradientColorFn = (val: number) =>
			interpolateRdBu(1 - gradientScale(val))

		// Find thermal equator per day
		const teqByDay: number[] = []
		for (let day = 0; day < time.DAYS_PER_YEAR; day++) {
			let maxTemp = -Infinity
			let maxLat = 0
			for (let i = 0; i < model.lats_deg.length; i++) {
				if (model.temperature[i][day] > maxTemp) {
					maxTemp = model.temperature[i][day]
					maxLat = model.lats_deg[i]
				}
			}
			teqByDay.push(maxLat)
		}

		// Calculate signed zonal wind field (neg=easterly, pos=westerly)
		const wind = WIND.calculateEbmWind(model.temperature, model.lats, teqByDay)
		let windMax = 0
		for (const row of wind) {
			for (const val of row) {
				const abs = Math.abs(val)
				if (abs > windMax) windMax = abs
			}
		}
		const windAbsMax = Math.max(15, windMax)
		const windColorFn = (val: number) => WIND.color(val, windAbsMax)

		// Calculate global average temperature (area-weighted)
		let totalWeightedTemp = 0
		let totalArea = 0
		for (let i = 0; i < model.lats_deg.length; i++) {
			const latAvg = (mean(model.temperature[i]) as number) || 0
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
			gradient,
			gradientColorFn,
			teqByDay,
			wind,
			windColorFn,
			lats: model.lats_deg,
			sampledDays,
			dayLabels,
		}
	}, [obliquity, eccentricity, perihelion, tSun, hoursPerDay, daysPerYear, landFraction, radius, pressure])
}
