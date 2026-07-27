import { useMemo } from "react"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { CONSTANTS } from "@/model/climate/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/ebm/energy-balance-model"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/ebm/greenhouse-estimate"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import type { RegularClimatePreviewData } from "@/ui/preview/types"

interface EbmConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	landFraction: number
	radius: number
	pressure: number
	/**
	 * Real per-body overrides -- pass these when previewing an actual known
	 * body (see sol-system.ts's SystemBody.albedo/greenhouseFactor/
	 * internalHeatTempK) rather than a procedurally generated one. Without
	 * them, albedo/greenhouseFactor fall back to the landFraction/pressure
	 * heuristics below, which are only sanity-checked for modest,
	 * terrestrial-ish parameter ranges -- at gas-giant pressure (thousands of
	 * bar) the pressure heuristic alone overshoots by hundreds of degrees,
	 * since it has no internal-heat term and was never fit against anything
	 * that extreme. This is exactly the bug that made Jupiter's preview show
	 * ~800C instead of its real ~-108C before these overrides existed.
	 */
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	/** See EBMConfig.seismologyTotalHeatingK's doc -- a body/moon's
	 * system-seismology.ts SeismologyProfile.totalHeating, applied as a
	 * post-solve bump on top of the EBM's own equilibrium. */
	seismologyTotalHeatingK?: number
}

function meanOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let sum = 0
	for (const value of values) sum += value
	return sum / values.length
}

// UI-level heuristic for a generated (not real-data) world: EBM's own
// defaults are Earth's individually-fitted values (see
// EMB_CONSTANTS.surface), which shouldn't apply regardless of what the user
// actually configured. These reuse the old land/ocean-blend albedo range
// (0.25 ocean, 0.35 land) purely as a landCoverage-driven single Bond albedo,
// and scale greenhouseFactor by sqrt(pressure) off Earth's fitted anchor at
// pressure=1 bar -- not a real per-body fit (there's no known target
// temperature for a generated world), just a reasonable monotonic response
// to the pressure slider.
const OCEAN_ALBEDO_ESTIMATE = 0.25
const LAND_ALBEDO_ESTIMATE = 0.35

/** Exported so stat-card display code can show the same estimate the model
 * actually used without re-running the full simulation just to read it back. */
export function estimateAlbedo(landCoverage: number): number {
	return (
		OCEAN_ALBEDO_ESTIMATE * (1 - landCoverage) +
		LAND_ALBEDO_ESTIMATE * landCoverage
	)
}

export function useEbmPreview(config: EbmConfig) {
	const {
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		hoursPerDay,
		daysPerYear,
		landFraction,
		radius,
		pressure,
		albedo: albedoOverride,
		greenhouseFactor: greenhouseFactorOverride,
		internalHeatTempK,
		seismologyTotalHeatingK,
	} = config
	return useMemo<RegularClimatePreviewData>(() => {
		const cls: MainSequenceClass = STAR.isValidSpectralClass(spectralClass)
			? spectralClass
			: "G"
		const T_star = STAR.getStarTemperatureK({ cls, subtype: starSubtype })
		const R_star_m =
			STAR.getStarDiameterSol({ cls, subtype: starSubtype }) *
			CONSTANTS.embConstants.stellar.R_SUN
		const d_m = orbitalDistanceAU * CONSTANTS.embConstants.stellar.AU
		const modelConfig = {
			orbital: {
				OBLIQUITY: obliquity,
				ECCENTRICITY: eccentricity,
				PERIHELION: perihelion,
			},
			stellar: {
				...CONSTANTS.embConstants.stellar,
				T_SUN: T_star,
				R_SUN: R_star_m,
				AU: d_m,
			},
			time: {
				HOURS_PER_DAY: hoursPerDay,
				YEAR_LENGTH_DAYS: daysPerYear,
			},
			landFraction: new Array(CONSTANTS.embConstants.grid.NUM_LAT).fill(
				landFraction,
			),
			radius: radius * 1000, // km to meters
			pressure,
			albedo: albedoOverride ?? estimateAlbedo(landFraction),
			greenhouseFactor:
				greenhouseFactorOverride ??
				GREENHOUSE_ESTIMATE.estimateGreenhouseFactor(pressure),
			internalHeatTempK,
			seismologyTotalHeatingK,
		}
		const model = new EnergyBalanceModel(modelConfig)
		model.runModel({ years: 30, dtDays: 0.5 })

		const time = CONSTANTS.embConstants.time
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
			columnValues: sampledDays,
			columnLabels: dayLabels,
			albedo: modelConfig.albedo,
			greenhouseFactor: modelConfig.greenhouseFactor,
		}
	}, [
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		hoursPerDay,
		daysPerYear,
		landFraction,
		radius,
		pressure,
		albedoOverride,
		greenhouseFactorOverride,
		internalHeatTempK,
		seismologyTotalHeatingK,
	])
}
