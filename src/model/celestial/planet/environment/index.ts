import { createRng } from "@/model/shared/rng"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	AtmosphereProfile,
	DensityProfile,
	HydrosphereProfile,
	OrbitChemistry,
	OrbitClassification,
	OrbitComposition,
	OrbitGroup,
} from "@/model/celestial/orbit-body/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { ATMOSPHERE } from "@/model/celestial/planet/environment/atmosphere"
import { DICE_TABLE } from "@/model/celestial/planet/environment/classification/dice-table"
import type { ClassifiedEnvironment } from "@/model/celestial/planet/environment/classification/dice-table/types"
import { HYDROSPHERE } from "@/model/celestial/planet/environment/classification/hydrosphere"
import { DENSITY } from "@/model/celestial/planet/environment/density"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import type {
	TemperatureHydrosphereLossInput,
	Zone,
} from "@/model/celestial/planet/types"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/ebm/greenhouse-estimate"

function applyTemperatureHydrosphereLoss({
	hydrosphereCode,
	deviation,
}: TemperatureHydrosphereLossInput): number {
	if (hydrosphereCode >= 10) return hydrosphereCode
	const kelvin = TEMPERATURE.deviationToCelsius(deviation) + 273.15
	if (kelvin > 353.15) return Math.max(0, hydrosphereCode - 6)
	if (kelvin > 303.15) return Math.max(0, hydrosphereCode - 2)
	return hydrosphereCode
}

function classifyGroup(params: {
	/** Absent while a body is being classified from its size; explicit orbit
	 * rolls and authored seeds supply the group to preserve that decision. */
	groupHint?: OrbitGroup
	sizeClass: number
}): OrbitGroup {
	if (params.groupHint) return params.groupHint
	if (params.sizeClass <= 4) return "dwarf"
	if (params.sizeClass <= 10) return "terrestrial"
	return "helian"
}

function classifyBody(params: {
	/** Absent while a body is being classified from its size; explicit orbit
	 * rolls and authored seeds supply the group to preserve that decision. */
	groupHint?: OrbitGroup
	zone: Zone
	orbitalDistanceAU: number
	sizeClass: number
	isPrimaryWorld: boolean
	isMoon: boolean
	tidal: boolean
	/** Ported from galaxy-gen's forced-meltball roll (orbits/index.ts) -- a
	 * close-in epistellar dwarf beyond the star's dust-clearing boundary
	 * (see getStarMAO) that got shoved into a scorching orbit instead of
	 * forming further out. Short-circuits every other rule (including
	 * isPrimaryWorld) since generate-system-bodies.ts only ever sets this for
	 * a non-main-world sibling. */
	forceMeltball?: boolean
}): { group: OrbitGroup; classification: OrbitClassification } {
	const {
		zone,
		orbitalDistanceAU,
		sizeClass,
		isPrimaryWorld,
		isMoon,
		tidal,
		forceMeltball,
	} = params
	if (forceMeltball) return { group: "dwarf", classification: "meltball" }
	const group = classifyGroup({ groupHint: params.groupHint, sizeClass })
	if (isPrimaryWorld)
		return { group: "terrestrial", classification: "tectonic" }
	if (group === "asteroid belt") {
		return { group, classification: isMoon ? "asteroid" : "asteroid belt" }
	}
	if (group === "jovian") {
		if (zone === "epistellar" && orbitalDistanceAU < 0.15) {
			return { group, classification: "chthonian" }
		}
		return { group, classification: "jovian" }
	}
	if (group === "helian") {
		if (zone === "epistellar" && orbitalDistanceAU < 0.2) {
			return { group, classification: "asphodelian" }
		}
		if (zone === "inner" && sizeClass >= 12) {
			return { group, classification: "panthalassic" }
		}
		return { group, classification: "helian" }
	}
	if (group === "terrestrial") {
		if (zone === "epistellar" && orbitalDistanceAU < 0.15) {
			return { group, classification: "acheronian" }
		}
		if (tidal) {
			if (zone === "epistellar") return { group, classification: "jani-lithic" }
			if (zone === "inner") return { group, classification: "vesperian" }
		}
		if (zone === "epistellar") {
			return { group, classification: sizeClass >= 8 ? "telluric" : "arid" }
		}
		if (zone === "inner") {
			if (sizeClass <= 5) return { group, classification: "telluric" }
			if (sizeClass <= 7) return { group, classification: "arid" }
			if (sizeClass <= 9) return { group, classification: "oceanic" }
			return { group, classification: "tectonic" }
		}
		if (sizeClass <= 7) return { group, classification: "arid" }
		if (sizeClass <= 9) return { group, classification: "tectonic" }
		return { group, classification: "oceanic" }
	}
	if (zone === "epistellar" && orbitalDistanceAU < 0.15) {
		return { group, classification: "stygian" }
	}
	if (zone === "epistellar") {
		if (tidal && sizeClass >= 2) {
			return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
		}
		return { group, classification: sizeClass <= 2 ? "rockball" : "meltball" }
	}
	if (zone === "inner") {
		if (tidal && sizeClass >= 2) {
			return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
		}
		if (sizeClass >= 4) return { group, classification: "geo-cyclic" }
		return { group, classification: "rockball" }
	}
	if (tidal && sizeClass >= 2) {
		return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
	}
	if (sizeClass <= 1) return { group, classification: "snowball" }
	if (sizeClass >= 4) return { group, classification: "geo-cyclic" }
	return { group, classification: "rockball" }
}

// Ported from galaxy-gen's TEMPERATURE.finalize albedo roll (orbits/
// temperature/index.ts) -- a real composition/atmosphere/hydrosphere-driven
// Bond albedo, dice-rolled and stored at generation time. Chaos-machine
// previously had no equivalent: a generated body's albedo stayed unset, and
// the UI only ever synthesized a crude landCoverage-only linear blend
// on the fly wherever an EBM preview needed one (see useEbmPreview.ts's
// estimateAlbedo) -- that fallback still exists for a body that somehow
// still lacks a stored albedo, but every newly generated body now gets a
// real one from this roll instead of relying on it.
function buildClassificationEnvironment(params: {
	rng: ReturnType<typeof createRng>
	group: OrbitGroup
	classification: OrbitClassification
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	diameterKm: number
	massKg: number
	isPrimaryWorld: boolean
	/** Always explicit: primary worlds estimate their greenhouse factor while
	 * every other generated world rolls it. */
	greenhouseMode: "estimate" | "roll"
	/** Present when classification was rolled earlier to choose physical
	 * properties; reusing it prevents consuming RNG and rolling it twice. */
	assignment?: ClassifiedEnvironment
}): {
	density: DensityProfile | null
	landCoverage: number
	hydrosphereCode: number
	hydrosphere: HydrosphereProfile
	composition: OrbitComposition
	/** Unset when the selected classification has no volatile chemistry. */
	chemistry?: OrbitChemistry
	/** Unset when the selected classification has no named subtype. */
	subtype?: string
	/** Set only when the selected classification requires eccentricity. */
	eccentricByClassification?: boolean
	atmosphere: AtmosphereProfile | null
	greenhouseFactor: number
	albedo: number
} {
	const rolledEnvironment =
		params.assignment ??
		DICE_TABLE.rollClassificationAssignment({
			rng: params.rng,
			classification: params.classification,
			sizeClass: params.sizeClass,
			zone: params.zone,
			deviation: params.deviation,
			spectralClass: params.spectralClass,
			isPrimaryWorld: params.isPrimaryWorld,
		})
	const hydrosphereCode = applyTemperatureHydrosphereLoss({
		hydrosphereCode: rolledEnvironment.hydrosphereCode,
		deviation: params.deviation,
	})
	const hydrosphere = HYDROSPHERE.buildProfile({
		rng: params.rng,
		code: hydrosphereCode,
	})
	const gravityG =
		params.massKg > 0
			? ORBIT_BODY.computeGravityG({
					massKg: params.massKg,
					diameterKm: params.diameterKm,
				})
			: 0
	const atmosphere = ATMOSPHERE.codeToProfile({
		rng: params.rng,
		atmosphereCode: rolledEnvironment.atmosphereCode,
		params: {
			chemistry: rolledEnvironment.chemistry ?? rolledEnvironment.composition,
			sizeClass: params.sizeClass,
			deviation: params.deviation,
			hydrosphereCode,
			gravityG,
			classification: params.classification,
			isPrimaryWorld: params.isPrimaryWorld,
		},
	})
	const greenhouseFactor =
		params.group === "jovian"
			? GREENHOUSE_ESTIMATE.rollGasGiantGreenhouseFactor(params.rng)
			: params.greenhouseMode === "estimate"
				? GREENHOUSE_ESTIMATE.estimateGreenhouseFactor(
						atmosphere?.pressureBar ?? 0,
					)
				: GREENHOUSE_ESTIMATE.rollGreenhouseFactor({
						rng: params.rng,
						pressureBar: atmosphere?.pressureBar ?? 0,
						atmosphereCode: atmosphere?.code ?? 0,
					})
	const albedo = DENSITY.rollAlbedo({
		rng: params.rng,
		composition: rolledEnvironment.composition,
		atmosphere,
		hydrosphereCode,
	})
	return {
		density: DENSITY.buildProfile({
			massKg: params.massKg,
			diameterKm: params.diameterKm,
			classification: params.classification,
		}),
		landCoverage: 1 - HYDROSPHERE.waterFraction(hydrosphere),
		hydrosphereCode,
		hydrosphere,
		composition: rolledEnvironment.composition,
		chemistry: rolledEnvironment.chemistry,
		subtype: rolledEnvironment.subtype,
		eccentricByClassification: rolledEnvironment.eccentric,
		atmosphere,
		greenhouseFactor,
		albedo,
	}
}

export const ENVIRONMENT = {
	classifyGroup,
	classifyBody,
	buildClassificationEnvironment,
	deviationToCelsius: TEMPERATURE.deviationToCelsius,
	auFromTemperature: TEMPERATURE.auFromTemperature,
	deviationToAU: TEMPERATURE.deviationToAU,
	estimateDeviationFromOrbitalDistance:
		TEMPERATURE.estimateDeviationFromOrbitalDistance,
	zoneFromDeviation: TEMPERATURE.zoneFromDeviation,
	codeFromWaterPct: HYDROSPHERE.codeFromWaterPct,
	buildProfile: HYDROSPHERE.buildProfile,
	waterFraction: HYDROSPHERE.waterFraction,
	rollClassificationAssignment: DICE_TABLE.rollClassificationAssignment,
	buildDensityProfile: DENSITY.buildProfile,
}
