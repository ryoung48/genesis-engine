import { ENVIRONMENT } from "./environment"
import { SEISMOLOGY } from "./seismology"
import { SIZE_CLASS } from "./size-class"
import { TIDE_LOCK } from "./tide-lock"

export const PLANET = {
	auFromTemperature: ENVIRONMENT.auFromTemperature,
	buildClassificationEnvironment: ENVIRONMENT.buildClassificationEnvironment,
	buildDensityProfile: ENVIRONMENT.buildDensityProfile,
	classifyBody: ENVIRONMENT.classifyBody,
	classifyGroup: ENVIRONMENT.classifyGroup,
	computeMoonTidalHeatingRaw: SEISMOLOGY.computeMoonTidalHeatingRaw,
	deviationToAU: ENVIRONMENT.deviationToAU,
	deriveTideLockStatus: TIDE_LOCK.deriveTideLockStatus,
	estimateDeviationFromOrbitalDistance:
		ENVIRONMENT.estimateDeviationFromOrbitalDistance,
	estimateGasGiantSizeClass: SIZE_CLASS.estimateGasGiant,
	estimatePlanetarySizeClass: SIZE_CLASS.estimatePlanetary,
	estimateRockySizeClass: SIZE_CLASS.estimateRocky,
	hydrosphereCodeFromWaterPct: ENVIRONMENT.codeFromWaterPct,
	rollClassificationAssignment: ENVIRONMENT.rollClassificationAssignment,
	rollMoonTideLock: TIDE_LOCK.rollMoonTideLock,
	rollPlanetTideLock: TIDE_LOCK.rollPlanetTideLock,
	zoneFromDeviation: ENVIRONMENT.zoneFromDeviation,
	MAX_SAFE_MOON_TIDAL_HEATING: SEISMOLOGY.MAX_SAFE_MOON_TIDAL_HEATING,
	applySystemSeismology: SEISMOLOGY.applySystemSeismology,
}
