import { useMemo } from "react"
import {
	computeDailyLockedOrbit,
	computeLockedSubstellarDeclinationRad,
	computeTidalTransportParams,
	getSubstellarDirWithOffsetAndDeclination,
} from "@/model/climate/locked/heat"
import {
	mapLinear,
	rgbToCss,
	sampleColorStops,
} from "@/model/shared/color-interpolation"
import { PLASMA_STOPS, PURPLES_STOPS } from "@/model/shared/color-palettes"
import type { LockedClimatePreviewData } from "@/ui/preview/types"

interface LockedClimatePreviewConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	radius: number
	pressure: number
	planetRadiusKm: number
	antistellarLon: number
}

const LONGITUDE_STEP = 10

export function buildLockedClimatePreview(
	config: LockedClimatePreviewConfig,
): LockedClimatePreviewData {
	const previewParams = {
		planetRadiusKm: config.planetRadiusKm,
		pressure: config.pressure,
		eccentricity: config.eccentricity,
		spectralClass: config.spectralClass,
		starSubtype: config.starSubtype,
		orbitalDistanceAU: config.orbitalDistanceAU,
		daysPerYear: config.daysPerYear,
		perihelion: config.perihelion,
		antistellarLon: config.antistellarLon,
		obliquity: config.obliquity,
	} as const
	const { flux, libration, solarLongitude } = computeDailyLockedOrbit({
		eccentricity: config.eccentricity,
		perihelion: config.perihelion,
		spectralClass: config.spectralClass,
		starSubtype: config.starSubtype,
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
		computeTidalTransportParams(previewParams)

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
			const substellar = getSubstellarDirWithOffsetAndDeclination(
				config.antistellarLon,
				libration[day],
				computeLockedSubstellarDeclinationRad(
					config.obliquity,
					solarLongitude[day],
				),
			)
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
		rgbToCss(
			sampleColorStops(
				PLASMA_STOPS,
				mapLinear(value, insolMin, insolMax, 0, 1, true),
			),
		)
	const daylightColorFn = (hours: number) =>
		rgbToCss(
			sampleColorStops(
				PURPLES_STOPS,
				mapLinear(hours, 0, config.hoursPerDay, 1, 0, true),
			),
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
			config.antistellarLon,
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
			config,
		],
	)
}
