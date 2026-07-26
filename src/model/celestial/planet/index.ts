export type { ClassifiedEnvironment } from "./environment/classification"
export type * from "./types"

import {
	auFromTemperature,
	buildClassificationEnvironment,
	buildDensityProfile,
	classifyBody,
	classifyGroup,
	deviationToAU,
	estimateDeviationFromOrbitalDistance,
	hydrosphereCodeFromWaterPct,
	rollClassificationAssignment,
	zoneFromDeviation,
} from "./environment"
import {
	applySystemSeismology,
	computeMoonTidalHeatingRaw,
	MAX_SAFE_MOON_TIDAL_HEATING,
} from "./seismology"
import {
	estimateGasGiantSizeClass,
	estimatePlanetarySizeClass,
	estimateRockySizeClass,
} from "./size-class"
import {
	deriveTideLockStatus,
	rollMoonTideLock,
	rollPlanetTideLock,
} from "./tide-lock"

export const PLANET = {
	auFromTemperature,
	buildClassificationEnvironment,
	buildDensityProfile,
	classifyBody,
	classifyGroup,
	computeMoonTidalHeatingRaw,
	deviationToAU,
	deriveTideLockStatus,
	estimateDeviationFromOrbitalDistance,
	estimateGasGiantSizeClass,
	estimatePlanetarySizeClass,
	estimateRockySizeClass,
	hydrosphereCodeFromWaterPct,
	rollClassificationAssignment,
	rollMoonTideLock,
	rollPlanetTideLock,
	zoneFromDeviation,
	MAX_SAFE_MOON_TIDAL_HEATING,
	applySystemSeismology,
}
