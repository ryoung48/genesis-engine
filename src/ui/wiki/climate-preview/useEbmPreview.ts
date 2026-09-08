import { useMemo } from "react"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { CONFIG } from "@/model/climate/temperature/ebm/config"
import type { EBMConfig } from "@/model/climate/temperature/ebm/config/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { UTILS } from "@/model/climate/temperature/ebm/utils"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import type { RgbColor } from "@/model/shared/color/color-interpolation/types"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import type {
	EbmPreviewConfig,
	RegularClimatePreviewData,
	RegularPreviewConfigInput,
} from "@/ui/wiki/climate-preview/types"

export function regularPreviewConfigOf(
	input: RegularPreviewConfigInput,
): EbmPreviewConfig {
	return {
		obliquity: input.obliquity,
		eccentricity: input.eccentricity,
		perihelion: input.perihelion,
		spectralClass: input.spectralClass,
		starSubtype: input.starSubtype,
		starTemperatureK: input.starTemperatureK,
		starDiameterSol: input.starDiameterSol,
		orbitalDistanceAU: input.orbitalDistanceAU,
		hoursPerDay: input.hoursPerDay,
		daysPerYear: input.daysPerYear,
		landFraction: input.landFraction,
		radius: input.planetRadiusKm,
		pressure: input.pressureBar,
	}
}

const MAX_CHART_COLUMNS = 60

// The VPLanet preset runs on a 150-cell equal-area latitude grid for parity,
// but the chart shows it on the coarser equal-angle grid so previews are
// visually comparable. Only the displayed rows are resampled.
const DISPLAY_LAT_COUNT = CONSTANTS.embConstants.grid.NUM_LAT

function equalAngleLatsDeg(count: number): number[] {
	return Array.from({ length: count }, (_, i) => -90 + (180 * i) / (count - 1))
}

function resampleByLatitude(params: {
	matrix: readonly (readonly number[])[]
	sourceLatsDeg: readonly number[]
	targetLatsDeg: readonly number[]
}): number[][] {
	const { matrix, sourceLatsDeg, targetLatsDeg } = params
	const lastSource = matrix.length - 1
	return targetLatsDeg.map((target) => {
		const hi = sourceLatsDeg.findIndex((lat) => lat >= target)
		if (hi === -1) return [...matrix[lastSource]]
		if (hi === 0) return [...matrix[0]]
		const lo = hi - 1
		const span = sourceLatsDeg[hi] - sourceLatsDeg[lo]
		const t = span > 0 ? (target - sourceLatsDeg[lo]) / span : 0
		return matrix[lo].map((value, col) => value + (matrix[hi][col] - value) * t)
	})
}

function buildColorFn(params: {
	stops: readonly RgbColor[]
	domainStart: number
	domainEnd: number
	rangeStart: number
	rangeEnd: number
}) {
	return (value: number) =>
		COLOR_INTERPOLATION.rgbToCss(
			COLOR_INTERPOLATION.sampleColorStops({
				stops: params.stops,
				t: COLOR_INTERPOLATION.mapLinear({
					value,
					domainStart: params.domainStart,
					domainEnd: params.domainEnd,
					rangeStart: params.rangeStart,
					rangeEnd: params.rangeEnd,
					clamp: true,
				}),
			}),
		)
}

// The VPLanet preset, with the body's orbital / stellar / rotation inputs plus
// its land fraction, radius, and pressure overriding the pinned Earth values.
// The seasonal-surface calibration (fixed OLR, heat capacities, albedos) is
// fixed.
function modelConfigFor(config: EbmPreviewConfig): EBMConfig {
	const cls: MainSequenceClass = STAR.isValidSpectralClass(config.spectralClass)
		? config.spectralClass
		: "G"
	const subtype = config.starSubtype
	const T_star =
		config.starTemperatureK ?? STAR.getStarTemperatureK({ cls, subtype })
	const R_star_m =
		(config.starDiameterSol ?? STAR.getStarDiameterSol({ cls, subtype })) *
		CONSTANTS.embConstants.stellar.R_SUN
	const base = CONFIG.earthClimate
	return {
		...base,
		orbital: {
			OBLIQUITY: config.obliquity,
			ECCENTRICITY: config.eccentricity,
			PERIHELION: config.perihelion,
		},
		stellar: {
			...base.stellar,
			T_SUN: T_star,
			R_SUN: R_star_m,
			AU: config.orbitalDistanceAU * CONSTANTS.embConstants.stellar.AU,
		},
		time: {
			HOURS_PER_DAY: config.hoursPerDay,
			YEAR_LENGTH_DAYS: config.daysPerYear,
		},
		radius: config.radius * 1000,
		pressure: config.pressure,
		landFraction: new Array(base.discretization.latitudeCount).fill(
			config.landFraction,
		),
	}
}

export function buildEbmPreview(
	config: EbmPreviewConfig,
): RegularClimatePreviewData {
	const modelConfig = modelConfigFor(config)
	const model = new EnergyBalanceModel(modelConfig)
	const samplesPerYear = modelConfig.discretization.samplesPerYear
	const yearLengthDays = config.daysPerYear
	model.runModel({ years: 200, dtDays: 365 / samplesPerYear })

	const displayLatsDeg = equalAngleLatsDeg(DISPLAY_LAT_COUNT)
	const forDisplay = (matrix: readonly (readonly number[])[]): number[][] =>
		resampleByLatitude({
			matrix,
			sourceLatsDeg: model.lats_deg,
			targetLatsDeg: displayLatsDeg,
		})
	const heat = forDisplay(model.temperature)
	const insolation = forDisplay(model.insolation)
	const daylight = forDisplay(model.daylightHours)
	const iceMassBalance = forDisplay(model.ice_mass_balance)

	// Chart columns are matrix sample indices; the labels carry the physical
	// day. The run starts at northern winter solstice, so day 0 is the solstice.
	const sampleCount = model.temperature[0]?.length ?? 0
	const stride = Math.max(1, Math.ceil(sampleCount / MAX_CHART_COLUMNS))
	const columnValues: number[] = []
	const columnLabels: string[] = []
	for (let i = 0; i < sampleCount; i += stride) {
		columnValues.push(i)
		columnLabels.push(`${Math.round((i / sampleCount) * yearLengthDays)}`)
	}

	let insolMin = Infinity
	let insolMax = -Infinity
	for (const row of insolation) {
		for (const val of row) {
			if (val < insolMin) insolMin = val
			if (val > insolMax) insolMax = val
		}
	}
	const insolColorFn = buildColorFn({
		stops: COLOR_PALETTES.plasmaStops,
		domainStart: insolMin,
		domainEnd: insolMax,
		rangeStart: 0,
		rangeEnd: 1,
	})
	const daylightColorFn = buildColorFn({
		stops: COLOR_PALETTES.purplesStops,
		domainStart: 0,
		domainEnd: config.hoursPerDay,
		rangeStart: 1,
		rangeEnd: 0,
	})

	// Ice mass balance: dark blue for the most negative (ablation), fading to
	// white as it reaches zero; accumulation clamps to white.
	let iceMin = 0
	for (const row of iceMassBalance) {
		for (const val of row) if (val < iceMin) iceMin = val
	}
	const iceBalanceColorFn = buildColorFn({
		stops: COLOR_PALETTES.bluesStops,
		domainStart: iceMin,
		domainEnd: 0,
		rangeStart: 1,
		rangeEnd: 0,
	})

	let totalWeightedTemp = 0
	let totalArea = 0
	for (let i = 0; i < model.lats_deg.length; i++) {
		totalWeightedTemp += UTILS.meanOf(model.temperature[i]) * model.dx[i]
		totalArea += model.dx[i]
	}

	return {
		heat,
		avgTemp: totalWeightedTemp / totalArea,
		insolation,
		insolColorFn,
		daylight,
		daylightColorFn,
		iceMassBalance,
		iceBalanceColorFn,
		converged: model.converged,
		yearsRun: model.yearsRun,
		lats: displayLatsDeg,
		columnValues,
		columnLabels,
	}
}

export function useEbmPreview(config: EbmPreviewConfig) {
	return useMemo<RegularClimatePreviewData>(
		() => buildEbmPreview(config),
		[
			config.obliquity,
			config.eccentricity,
			config.perihelion,
			config.spectralClass,
			config.starSubtype,
			config.starTemperatureK,
			config.starDiameterSol,
			config.orbitalDistanceAU,
			config.hoursPerDay,
			config.daysPerYear,
			config.landFraction,
			config.radius,
			config.pressure,
			config,
		],
	)
}
