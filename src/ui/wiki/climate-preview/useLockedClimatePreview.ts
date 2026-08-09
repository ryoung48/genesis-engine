import { useMemo } from "react"
import { HEAT } from "@/model/climate/temperature/tidal-locked"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import type { LockedClimatePreviewData } from "@/ui/wiki/climate-preview/types"

interface LockedClimatePreviewConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	starTemperatureK?: number
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	radius: number
	pressure: number
	planetRadiusKm: number
	substellarLon: number
	seismologyTotalHeatingK?: number
}

const LONGITUDE_STEP = 10

function buildLockedClimatePreview(
	config: LockedClimatePreviewConfig,
): LockedClimatePreviewData {
	const previewParams = {
		planetRadiusKm: config.planetRadiusKm,
		pressure: config.pressure,
		eccentricity: config.eccentricity,
		spectralClass: config.spectralClass,
		starSubtype: config.starSubtype,
		starTemperatureK: config.starTemperatureK,
		starDiameterSol: config.starDiameterSol,
		orbitalDistanceAU: config.orbitalDistanceAU,
		daysPerYear: config.daysPerYear,
		perihelion: config.perihelion,
		substellarLon: config.substellarLon,
		obliquity: config.obliquity,
		// TEMP: seismology zeroed out for debugging -- see useEbmPreview.ts
		seismologyTotalHeatingK: 0,
	} as const
	const { flux, libration, solarLongitude } = HEAT.computeDailyLockedOrbit({
		eccentricity: config.eccentricity,
		perihelion: config.perihelion,
		spectralClass: config.spectralClass,
		starSubtype: config.starSubtype,
		starTemperatureK: config.starTemperatureK,
		starDiameterSol: config.starDiameterSol,
		orbitalDistanceAU: config.orbitalDistanceAU,
	})
	const dayCount = flux.length
	const longitudes = Array.from(
		{ length: 360 / LONGITUDE_STEP },
		(_, index) => -180 + index * LONGITUDE_STEP,
	)
	const sampledDays: number[] = []
	const dayLabels: string[] = []
	for (let day = 0; day < dayCount; day += 10) {
		sampledDays.push(day)
		dayLabels.push(`${day}`)
	}
	const { T_mean_C, A1, A_night, eccAmplitude } =
		HEAT.computeTidalTransportParams(previewParams)

	const heat = longitudes.map(() => new Array<number>(dayCount).fill(0))
	const insolation = longitudes.map(() => new Array<number>(dayCount).fill(0))
	const daylight = longitudes.map(() => new Array<number>(dayCount).fill(0))

	let insolMin = Infinity
	let insolMax = -Infinity
	let totalTemp = 0
	let sampleCount = 0
	for (let lonIndex = 0; lonIndex < longitudes.length; lonIndex++) {
		const lonRad = (longitudes[lonIndex] * Math.PI) / 180
		const x = Math.cos(lonRad)
		const y = Math.sin(lonRad)

		for (let day = 0; day < dayCount; day++) {
			const substellar = HEAT.getSubstellarDirWithOffsetAndDeclination({
				substellarLon: config.substellarLon,
				lonOffsetRad: libration[day],
				declinationRad: HEAT.computeLockedSubstellarDeclinationRad({
					obliquity: config.obliquity,
					solarLongitudeRad: solarLongitude[day],
				}),
			})
			const cosTheta = Math.max(
				-1,
				Math.min(1, x * substellar[0] + y * substellar[1]),
			)
			const nightFrac = (1 - cosTheta) / 2
			const temperature =
				T_mean_C +
				A1 * cosTheta +
				A_night * nightFrac +
				eccAmplitude * Math.sin((day / config.daysPerYear) * 2 * Math.PI)
			const dayInsolation = flux[day] * Math.max(0, cosTheta)
			const dayLength =
				cosTheta > 1e-6
					? config.hoursPerDay
					: cosTheta < -1e-6
						? 0
						: config.hoursPerDay / 2

			heat[lonIndex][day] = temperature
			insolation[lonIndex][day] = dayInsolation
			daylight[lonIndex][day] = dayLength

			if (dayInsolation < insolMin) insolMin = dayInsolation
			if (dayInsolation > insolMax) insolMax = dayInsolation
			totalTemp += temperature
			sampleCount++
		}
	}

	const insolColorFn = (value: number) =>
		COLOR_INTERPOLATION.rgbToCss(
			COLOR_INTERPOLATION.sampleColorStops({
				stops: COLOR_PALETTES.plasmaStops,
				t: COLOR_INTERPOLATION.mapLinear({
					value,
					domainStart: insolMin,
					domainEnd: insolMax,
					rangeStart: 0,
					rangeEnd: 1,
					clamp: true,
				}),
			}),
		)
	const daylightColorFn = (hours: number) =>
		COLOR_INTERPOLATION.rgbToCss(
			COLOR_INTERPOLATION.sampleColorStops({
				stops: COLOR_PALETTES.purplesStops,
				t: COLOR_INTERPOLATION.mapLinear({
					value: hours,
					domainStart: 0,
					domainEnd: config.hoursPerDay,
					rangeStart: 1,
					rangeEnd: 0,
					clamp: true,
				}),
			}),
		)

	return {
		heat,
		avgTemp: sampleCount > 0 ? totalTemp / sampleCount : T_mean_C,
		insolation,
		insolColorFn,
		daylight,
		daylightColorFn,
		longitudes,
		columnValues: sampledDays,
		columnLabels: dayLabels,
	}
}

export function useLockedClimatePreview(config: LockedClimatePreviewConfig) {
	return useMemo(
		() => buildLockedClimatePreview(config),
		[
			config.substellarLon,
			config.daysPerYear,
			config.eccentricity,
			config.hoursPerDay,
			config.orbitalDistanceAU,
			config.obliquity,
			config.perihelion,
			config.planetRadiusKm,
			config.pressure,
			config.radius,
			config.spectralClass,
			config.starSubtype,
			config.seismologyTotalHeatingK,
			config,
		],
	)
}
