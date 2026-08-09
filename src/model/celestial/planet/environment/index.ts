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
import { ATMOSPHERE } from "@/model/celestial/planet/environment/atmosphere"
import { DICE_TABLE } from "@/model/celestial/planet/environment/classification/dice-table"
import type { ClassifiedEnvironment } from "@/model/celestial/planet/environment/classification/dice-table/types"
import { HYDROSPHERE } from "@/model/celestial/planet/environment/classification/hydrosphere"
import { DENSITY } from "@/model/celestial/planet/environment/density"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import type { TemperatureHydrosphereLossInput } from "@/model/celestial/planet/environment/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { SpectralClass } from "@/model/celestial/star/types"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/temperature/ebm/greenhouse-estimate"
import { RNG } from "@/model/shared/random/rng"

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

// Ported from galaxy-gen's getRareDwarfType (orbits/groups.ts) -- the
// epistellar/inner dwarf zones' "not rockball" fallback.
function rollRareDwarfType(
	rng: ReturnType<typeof RNG.createRng>,
): "hebean" | "geo-tidal" {
	return rng.randint(1, 6) <= 4 ? "hebean" : "geo-tidal"
}

// Ported from galaxy-gen's getOuterRareDwarfType (orbits/groups.ts) -- the
// outer dwarf zone's "not snowball/rockball" fallback.
function rollOuterRareDwarfType(
	rng: ReturnType<typeof RNG.createRng>,
): "hebean" | "geo-cyclic" | "geo-tidal" {
	const roll = rng.randint(1, 6)
	if (roll <= 3) return "hebean"
	if (roll <= 5) return "geo-cyclic"
	return "geo-tidal"
}

function classifyBody(params: {
	rng: ReturnType<typeof RNG.createRng>
	/** Absent while a body is being classified from its size; explicit orbit
	 * rolls and authored seeds supply the group to preserve that decision. */
	groupHint?: OrbitGroup
	/** Only ever set for a moon -- the group of the planet it orbits. Ported
	 * from galaxy-gen's ORBIT_GROUPS.dwarf/terrestrial.type parent-group roll
	 * modifiers (orbits/groups.ts): e.g. an outer-zone dwarf moon of a jovian
	 * or helian rolls snowball noticeably less often than one orbiting a
	 * terrestrial/dwarf primary, since gas giants' many small moons would
	 * otherwise skew heavily toward ice. */
	parentGroup?: OrbitGroup
	/** True when this orbit slot is one of the star's own innermost few --
	 * only ever set for a star whose luminosityClass is "III" (giant) or
	 * whose spectralClass is "D" (white dwarf), meaning this slot used to be
	 * inside the star before it evolved/collapsed. Forces a specific
	 * "burned out" classification for every group, overriding the zone roll
	 * entirely -- ported from galaxy-gen's impactZone (stars/index.ts). A
	 * moon inherits its parent planet's impactZone flag unchanged, exactly
	 * like galaxy-gen's ORBIT.spawn passes the same closure variable down to
	 * every child orbit. */
	impactZone: boolean
	zone: Zone
	orbitalDistanceAU: number
	sizeClass: number
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
		rng,
		zone,
		sizeClass,
		isMoon,
		tidal,
		forceMeltball,
		parentGroup,
		impactZone,
	} = params
	if (forceMeltball) return { group: "dwarf", classification: "meltball" }
	const group = classifyGroup({ groupHint: params.groupHint, sizeClass })
	if (group === "asteroid belt") {
		return { group, classification: isMoon ? "asteroid" : "asteroid belt" }
	}
	if (group === "jovian") {
		if (impactZone) return { group, classification: "chthonian" }
		if (zone === "epistellar") {
			return {
				group,
				classification: rng.randint(1, 6) <= 5 ? "jovian" : "chthonian",
			}
		}
		return { group, classification: "jovian" }
	}
	if (group === "helian") {
		if (impactZone) return { group, classification: "asphodelian" }
		if (zone === "epistellar") {
			return {
				group,
				classification: rng.randint(1, 6) <= 5 ? "helian" : "asphodelian",
			}
		}
		if (zone === "inner") {
			return {
				group,
				classification: rng.randint(1, 6) <= 4 ? "helian" : "panthalassic",
			}
		}
		return { group, classification: "helian" }
	}
	if (group === "terrestrial") {
		if (impactZone) return { group, classification: "acheronian" }
		if (tidal) {
			if (zone === "epistellar") return { group, classification: "jani-lithic" }
			if (zone === "inner") return { group, classification: "vesperian" }
		}
		if (zone === "epistellar") {
			return {
				group,
				classification: rng.randint(1, 6) <= 5 ? "arid" : "telluric",
			}
		}
		if (zone === "inner") {
			// Ported from galaxy-gen's 2d6 inner-zone roll.
			const roll = rng.randint(1, 6) + rng.randint(1, 6)
			if (roll <= 4) return { group, classification: "telluric" }
			if (roll <= 6) return { group, classification: "arid" }
			if (roll <= 8) return { group, classification: "oceanic" }
			if (roll <= 10) return { group, classification: "tectonic" }
			return { group, classification: "telluric" }
		}
		// outer -- a moon of anything but an asteroid belt rolls warmer
		// (higher roll -> less oceanic) than a bare planet, same as dwarf's
		// outer-zone parentGroup modifiers.
		let roll = rng.randint(1, 6)
		if (parentGroup !== undefined && parentGroup !== "asteroid belt") roll += 2
		if (roll <= 4) return { group, classification: "arid" }
		if (roll <= 6) return { group, classification: "tectonic" }
		return { group, classification: "oceanic" }
	}
	// dwarf
	if (impactZone) return { group, classification: "stygian" }
	if (zone === "epistellar") {
		if (tidal && sizeClass >= 2) {
			return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
		}
		let roll = rng.randint(1, 6)
		if (parentGroup === "asteroid belt") roll -= 2
		if (roll <= 5) return { group, classification: "rockball" }
		return { group, classification: rollRareDwarfType(rng) }
	}
	if (zone === "inner") {
		if (tidal && sizeClass >= 2) {
			return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
		}
		let roll = rng.randint(1, 6)
		if (parentGroup === "asteroid belt") roll -= 2
		else if (parentGroup === "helian") roll += 1
		else if (parentGroup === "jovian") roll += 2
		if (roll <= 6) return { group, classification: "rockball" }
		if (roll <= 7) return { group, classification: "geo-cyclic" }
		return { group, classification: rollRareDwarfType(rng) }
	}
	if (tidal && sizeClass >= 2) {
		return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
	}
	// Ported from galaxy-gen's ORBIT_GROUPS.dwarf.type outer-zone roll (orbits/
	// groups.ts) -- a real 1d6 roll, not derived from sizeClass, so a jovian's
	// or helian's many small outer-zone moons don't all land on snowball the
	// way a fixed sizeClass<=1 threshold would (see parentGroup's doc).
	let outerRoll = rng.randint(1, 6)
	if (parentGroup === "asteroid belt") outerRoll -= 1
	else if (parentGroup === "helian") outerRoll += 1
	else if (parentGroup === "jovian") outerRoll += 2
	if (outerRoll <= 5) return { group, classification: "snowball" }
	if (outerRoll <= 7) return { group, classification: "rockball" }
	return { group, classification: rollOuterRareDwarfType(rng) }
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
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
	classification: OrbitClassification
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: SpectralClass
	diameterKm: number
	massKg: number
	isPrimaryWorld: boolean
	/** Always explicit: primary worlds estimate their greenhouse factor while
	 * every other generated world rolls it. */
	greenhouseMode: "estimate" | "roll"
	/** Present when classification was rolled earlier to choose physical
	 * properties; reusing it prevents consuming RNG and rolling it twice. */
	assignment?: ClassifiedEnvironment
	/** Forwarded to ATMOSPHERE.codeToProfile's hazard roll. */
	starAgeGyr: number
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
			starAgeGyr: params.starAgeGyr,
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
}
