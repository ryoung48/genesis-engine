import { useMemo } from "react"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { INSOLATION } from "@/model/climate/shared/insolation"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import { TIME } from "@/model/shared/time"
import type {
	RegularClimatePreviewData,
	SunlightPreviewConfig,
} from "@/ui/wiki/climate-preview/types"

const LATITUDES = 36
const DAY_STEP = 10

export function useSunlightPreview(config: SunlightPreviewConfig) {
	const {
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		starTemperatureK,
		starDiameterSol,
		orbitalDistanceAU,
		hoursPerDay,
	} = config
	return useMemo<RegularClimatePreviewData>(() => {
		const cls: MainSequenceClass = STAR.isValidSpectralClass(spectralClass)
			? spectralClass
			: "G"
		const lats = Array.from(
			{ length: LATITUDES },
			(_, i) => -Math.PI / 2 + (Math.PI * i) / (LATITUDES - 1),
		)
		const { _insolation, _daylight_hours } = INSOLATION.compute({
			lats,
			orbital: {
				OBLIQUITY: obliquity,
				ECCENTRICITY: eccentricity,
				PERIHELION: perihelion,
			},
			stellarOverride: {
				...INSOLATION.sun,
				T_SUN:
					starTemperatureK ??
					STAR.getStarTemperatureK({ cls, subtype: starSubtype }),
				R_SUN:
					(starDiameterSol ??
						STAR.getStarDiameterSol({ cls, subtype: starSubtype })) *
					INSOLATION.sun.R_SUN,
				AU: orbitalDistanceAU * INSOLATION.sun.AU,
			},
		})

		const sampledDays: number[] = []
		const dayLabels: string[] = []
		for (let i = 0; i < TIME.constants.daysPerYear; i += DAY_STEP) {
			sampledDays.push(i)
			dayLabels.push(`${i}`)
		}

		let insolMin = Infinity
		let insolMax = -Infinity
		for (const row of _insolation) {
			for (const val of row) {
				if (val < insolMin) insolMin = val
				if (val > insolMax) insolMax = val
			}
		}
		const insolColorFn = (val: number) =>
			COLOR_INTERPOLATION.rgbToCss(
				COLOR_INTERPOLATION.sampleColorStops({
					stops: COLOR_PALETTES.plasmaStops,
					t: COLOR_INTERPOLATION.mapLinear({
						value: val,
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
						domainEnd: hoursPerDay,
						rangeStart: 1,
						rangeEnd: 0,
						clamp: true,
					}),
				}),
			)

		return {
			insolation: _insolation,
			insolColorFn,
			daylight: _daylight_hours,
			daylightColorFn,
			lats: lats.map((lat) => (lat * 180) / Math.PI),
			columnValues: sampledDays,
			columnLabels: dayLabels,
		}
	}, [
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		starTemperatureK,
		starDiameterSol,
		orbitalDistanceAU,
		hoursPerDay,
	])
}
