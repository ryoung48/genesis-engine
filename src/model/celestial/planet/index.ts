import { BIOSPHERE } from "@/model/celestial/planet/biosphere"
import { ENVIRONMENT } from "@/model/celestial/planet/environment"
import { HYDROSPHERE } from "@/model/celestial/planet/environment/classification/hydrosphere"
import { DICE_TABLE } from "@/model/celestial/planet/environment/classification/dice-table"
import { DENSITY } from "@/model/celestial/planet/environment/density"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import { HABITABILITY } from "@/model/celestial/planet/habitability"
import { SEISMOLOGY } from "@/model/celestial/planet/seismology"
import { SIZE_CLASS } from "@/model/celestial/planet/size-class"
import { TIDE_LOCK } from "@/model/celestial/planet/tide-lock"

export const PLANET = {
	auFromTemperature: TEMPERATURE.auFromTemperature,
	buildClassificationEnvironment: ENVIRONMENT.buildClassificationEnvironment,
	buildDensityProfile: DENSITY.buildProfile,
	classifyBody: ENVIRONMENT.classifyBody,
	classifyGroup: ENVIRONMENT.classifyGroup,
	computeMoonTidalHeatingRaw: SEISMOLOGY.computeMoonTidalHeatingRaw,
	deviationToAU: TEMPERATURE.deviationToAU,
	deriveTideLockStatus: TIDE_LOCK.deriveTideLockStatus,
	estimateDeviationFromOrbitalDistance:
		TEMPERATURE.estimateDeviationFromOrbitalDistance,
	estimateGasGiantSizeClass: SIZE_CLASS.estimateGasGiant,
	estimatePlanetarySizeClass: SIZE_CLASS.estimatePlanetary,
	estimateRockySizeClass: SIZE_CLASS.estimateRocky,
	hydrosphereCodeFromWaterPct: HYDROSPHERE.codeFromWaterPct,
	rollClassificationAssignment: DICE_TABLE.rollClassificationAssignment,
	rollMoonTideLock: TIDE_LOCK.rollMoonTideLock,
	rollPlanetTideLock: TIDE_LOCK.rollPlanetTideLock,
	zoneFromDeviation: TEMPERATURE.zoneFromDeviation,
	MAX_SAFE_MOON_TIDAL_HEATING: SEISMOLOGY.MAX_SAFE_MOON_TIDAL_HEATING,
	applySystemSeismology: SEISMOLOGY.applySystemSeismology,
	rollBiosphere: BIOSPHERE.get,
	rollHabitability: HABITABILITY.get,
}
