import { useMemo } from "react"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/temperature/ebm/greenhouse-estimate"
import { SPACE_ENGINE_CLIMATE } from "@/model/climate/temperature/spaceengine"
import type {
	SpaceEngineDiurnalField,
	SpaceEngineSeasonalField,
} from "@/model/climate/temperature/spaceengine/types"

// Ocean/land Bond-albedo blend by land coverage, for the Space Engine preview
// and stat-card display when a body has no measured Bond albedo.
const OCEAN_ALBEDO_ESTIMATE = 0.25
const LAND_ALBEDO_ESTIMATE = 0.35

export function estimateAlbedo(landCoverage: number): number {
	return (
		OCEAN_ALBEDO_ESTIMATE * (1 - landCoverage) +
		LAND_ALBEDO_ESTIMATE * landCoverage
	)
}

/** Newtonian gravitational constant, m³·kg⁻¹·s⁻². */
const G = 6.6743e-11
const NUM_LAT = 36
const NUM_YEAR_SAMPLES = 48
const NUM_DAY_SAMPLES = 49
/** Latitudes traced on the diurnal chart, one curve each. The ±80° pair is
 * inside the polar circle at solstice, so one shows polar day (flat, warm) and
 * the other polar night (flat, cold). */
const DIURNAL_LATITUDES_DEG = [-80, -40, 0, 40, 80]
/** Diurnal curves are taken at the northern summer solstice (Ls ~ 90°) so the
 * obliquity asymmetry -- long polar day in one hemisphere, polar night in the
 * other -- is visible, rather than the symmetric equinox case. */
const DIURNAL_YEAR_FRACTION = 0.25
/** Fallbacks for the inputs the body model doesn't carry (see the design
 * discussion): near-surface wind speed for advective transport, and the
 * atmospheric specific heat by rough composition class. */
const DEFAULT_WIND_MS = 10
const CP_DIATOMIC = 1005 // N2/O2-dominated
const CP_CO2 = 846 // CO2-dominated (Venus/Mars-like)

function estimateAtmosphereCp(atmosphereType: string | undefined): number {
	switch (atmosphereType) {
		case "exotic":
		case "corrosive":
		case "insidious":
			return CP_CO2
		default:
			return CP_DIATOMIC
	}
}

export interface SpaceEnginePreviewConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	starTemperatureK?: number
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
	landFraction: number
	planetRadiusKm: number
	planetMassKg?: number
	pressureBar: number
	atmosphereType?: string
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	seismologyTotalHeatingK?: number
}

export interface SpaceEnginePreview {
	seasonal: SpaceEngineSeasonalField
	diurnal: SpaceEngineDiurnalField
}

export function useSpaceEnginePreview(
	config: SpaceEnginePreviewConfig,
): SpaceEnginePreview {
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
		landFraction,
		planetRadiusKm,
		planetMassKg,
		pressureBar,
		atmosphereType,
		albedo,
		greenhouseFactor,
		internalHeatTempK,
		seismologyTotalHeatingK,
	} = config

	return useMemo<SpaceEnginePreview>(() => {
		const cls: MainSequenceClass = STAR.isValidSpectralClass(spectralClass)
			? spectralClass
			: "G"
		const T_star =
			starTemperatureK ??
			STAR.getStarTemperatureK({ cls, subtype: starSubtype })
		const R_star_m =
			(starDiameterSol ??
				STAR.getStarDiameterSol({ cls, subtype: starSubtype })) *
			CONSTANTS.embConstants.stellar.R_SUN

		const planetRadiusM = planetRadiusKm * 1000
		const surfaceGravityMs2 =
			planetMassKg && planetRadiusM > 0
				? (G * planetMassKg) / planetRadiusM ** 2
				: 9.81

		const modelConfig = {
			starTemperatureK: T_star,
			starRadiusM: R_star_m,
			semiMajorAxisM: orbitalDistanceAU * CONSTANTS.embConstants.stellar.AU,
			eccentricity,
			perihelionDeg: perihelion,
			obliquityDeg: obliquity,
			bondAlbedo: albedo ?? estimateAlbedo(landFraction),
			greenhouseFactor:
				greenhouseFactor ??
				GREENHOUSE_ESTIMATE.estimateGreenhouseFactor(pressureBar),
			pressureBar,
			atmosphereCp: estimateAtmosphereCp(atmosphereType),
			surfaceGravityMs2,
			windSpeedMs: DEFAULT_WIND_MS,
			planetRadiusM,
			hoursPerDay,
			internalHeatTempK,
			seismologyTotalHeatingK,
			numLat: NUM_LAT,
			numYearSamples: NUM_YEAR_SAMPLES,
			numDaySamples: NUM_DAY_SAMPLES,
			diurnalLatitudesDeg: DIURNAL_LATITUDES_DEG,
		}

		return {
			seasonal: SPACE_ENGINE_CLIMATE.seasonalField(modelConfig),
			diurnal: SPACE_ENGINE_CLIMATE.diurnalField(modelConfig, {
				yearFraction: DIURNAL_YEAR_FRACTION,
			}),
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
		landFraction,
		planetRadiusKm,
		planetMassKg,
		pressureBar,
		atmosphereType,
		albedo,
		greenhouseFactor,
		internalHeatTempK,
		seismologyTotalHeatingK,
	])
}
