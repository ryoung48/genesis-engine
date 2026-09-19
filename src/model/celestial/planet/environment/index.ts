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
import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/temperature/ebm/greenhouse-estimate"
import { MATH } from "@/model/shared/math/core"
import { DICE } from "@/model/shared/random/dice"
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
		// jani-lithic / vesperian are the star-tide-locked terrestrial classes.
		// A moon's `tidal` flag instead means "tidally close to its parent", so
		// applying this branch to moons funnels every big close-in moon of an
		// inner/epistellar planet into those classes. A moon instead gets a
		// plain hot-world class: arid for an epistellar parent, or an
		// arid/oceanic/tectonic roll for an inner one.
		if (tidal) {
			if (!isMoon) {
				if (zone === "epistellar")
					return { group, classification: "jani-lithic" }
				if (zone === "inner") return { group, classification: "vesperian" }
			} else if (zone === "epistellar") {
				return { group, classification: "arid" }
			} else if (zone === "inner") {
				const roll = rng.randint(1, 6)
				if (roll <= 2) return { group, classification: "arid" }
				if (roll <= 4) return { group, classification: "oceanic" }
				return { group, classification: "tectonic" }
			}
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

// Ported from galaxy-gen's HYDROSPHERE.proto (orbits/hydrosphere/index.ts) --
// a young (proto/primordial-age star) body below the size-scaled magma-
// cooling threshold hasn't solidified a surface yet, so its hydrosphere is
// forced to code 12 ("intense volcanism/molten surface") regardless of what
// its classification would otherwise roll. sizeClass is the direct
// equivalent of galaxy-gen's "size" (both split dwarf/terrestrial/helian/
// jovian at the same 4/10/15 boundaries -- see rolls/index.ts's
// rollSizeClass), and starAgeGyr*1000 converts to the Myr scale galaxy-gen's
// star.age*1000 uses.
function applyProtoHydrosphereSuppression({
	sizeClass,
	starAgeGyr,
	hydrosphereCode,
}: {
	sizeClass: number
	starAgeGyr: number
	hydrosphereCode: number
}): number {
	if (sizeClass < 2) return hydrosphereCode
	const magmaThresholdMyr = (sizeClass - 2) ** 2 + 2
	if (starAgeGyr * 1000 < magmaThresholdMyr) return 12
	return hydrosphereCode
}

// Book p. 226: a primordial-system body's atmosphere rolls the normal
// 2D-7+Size formula with DM+2, then remaps the numeric result: 2-7 -> code A
// (10, Exotic), 8-C -> code C (12, Insidious), D-F -> code F (15, Unusual),
// G-H -> code H (17, this codebase's own "gas" sentinel -- see
// rollProtoAtmosphereCode's identical G-H handling for why). Mirrors
// rollProtoAtmosphereCode's shape exactly but with primordial's own smaller
// DM and wider low bucket (2-7 vs. protostar's 2-5).
function rollYouthAtmosphereCode({
	rng,
	sizeClass,
}: {
	rng: ReturnType<typeof RNG.createRng>
	sizeClass: number
}): number {
	const roll = DICE.roll2d6(rng) - 7 + sizeClass + 2
	if (roll >= 2 && roll <= 7) return 10
	if (roll >= 8 && roll <= 12) return 12
	if (roll >= 13 && roll <= 15) return 15
	if (roll >= 16) return 17
	return MATH.clamp({ value: roll, lo: 0, hi: 9 })
}

// Book p. 224-225: a protostar-system body's atmosphere rolls the normal
// 2D-7+Size formula (rollYouthAtmosphereCode's own base roll) with DM+4, then
// remaps the numeric result: 2-5 -> code A (10, Exotic), 6-C -> code C (12,
// Insidious), D-F -> code F (15, Unusual), G-H -> code H -- this codebase's
// own 16/17 "gas" sentinel already covers a helium/hydrogen envelope
// (rollProfile's own code===16/17 comment), so G-H's two-letter bucket maps
// onto that existing pair via DICE's raw 16/17 split rather than collapsing
// both to one value.
function rollProtoAtmosphereCode({
	rng,
	sizeClass,
}: {
	rng: ReturnType<typeof RNG.createRng>
	sizeClass: number
}): number {
	const roll = DICE.roll2d6(rng) - 7 + sizeClass + 4
	if (roll >= 2 && roll <= 5) return 10
	if (roll >= 6 && roll <= 12) return 12
	if (roll >= 13 && roll <= 15) return 15
	if (roll >= 16) return 17
	return MATH.clamp({ value: roll, lo: 0, hi: 9 })
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
	/** [JUSTIFICATION] Only meaningful alongside spectralClass "NS" -- lets
	 * ATMOSPHERE.codeToProfile detect a pulsar/magnetar host (World
	 * Builder's Handbook p. 228) via STAR.isPulsar/isMagnetar, which key off
	 * this exact pair. Omitted callers (moons, forced-classification
	 * rerolls) never need the pulsar/magnetar taint override. */
	luminosityClass?: LuminosityClass
	/** Always explicit: primary worlds estimate their greenhouse factor while
	 * every other generated world rolls it. */
	greenhouseMode: "estimate" | "roll"
	/** Present when classification was rolled earlier to choose physical
	 * properties; reusing it prevents consuming RNG and rolling it twice. */
	assignment?: ClassifiedEnvironment
	/** Forwarded to ATMOSPHERE.codeToProfile's hazard roll. */
	starAgeGyr: number
	/** Ported from galaxy-gen's star.proto/star.primordial (stars/index.ts) --
	 * proto is starAgeGyr<0.01 && starMassSol<8, primordial is the broader
	 * starAgeGyr<0.1. Both false for a system whose star's mass/age isn't
	 * known to be young (e.g. Sol-seeded bodies). Suppresses hydrosphere and
	 * overrides atmosphere for any non-asteroid-belt, non-jovian body -- see
	 * applyProtoHydrosphereSuppression/rollYouthAtmosphereCode above. */
	proto?: boolean
	primordial?: boolean
	/** [JUSTIFICATION] Only the galaxy capital-homeworld slot sets this. Forces
	 * a standard non-tainted breathable atmosphere (code 6) and a liquid-water
	 * hydrosphere so a capital's guaranteed homeworld is genuinely friendly,
	 * while still being a real roll for everything else (size, density, moons,
	 * tilt, tide-lock). Every other caller leaves it unset. */
	homeworld?: boolean
}): {
	/** Echoes `params.classification`, unless the youth reclassification
	 * below (any dwarf/terrestrial/helian body whose hydrosphere ends up
	 * molten) overrides it -- see that check's own doc. Callers must use
	 * this, not the classification they passed in, as the body's real final
	 * classification. */
	classification: OrbitClassification
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
	// Computed up front (density doesn't depend on anything derived below)
	// so the rare Carbon relabel -- see DENSITY.buildProfile's own doc -- can
	// also steer the atmosphere roll further down: a carbon-rich world has
	// too little free oxygen for a breathable atmosphere. A main world (either
	// the system's designated primary world or the galaxy capital's homeworld
	// slot) is never eligible -- omitting hostSpectralClass collapses to the
	// same "never carbon" case as any other non-eligible host.
	const density = DENSITY.buildProfile({
		rng: params.rng,
		massKg: params.massKg,
		diameterKm: params.diameterKm,
		classification: params.classification,
		hostSpectralClass:
			params.isPrimaryWorld || params.homeworld === true
				? undefined
				: params.spectralClass,
	})
	const isCarbonWorld = density?.description === "Carbon"
	const youth =
		params.group !== "asteroid belt" &&
		params.group !== "jovian" &&
		(params.proto === true || params.primordial === true)
	let hydrosphereCode = applyTemperatureHydrosphereLoss({
		hydrosphereCode: rolledEnvironment.hydrosphereCode,
		deviation: params.deviation,
	})
	if (youth) {
		hydrosphereCode = applyProtoHydrosphereSuppression({
			sizeClass: params.sizeClass,
			starAgeGyr: params.starAgeGyr,
			hydrosphereCode,
		})
	}
	if (params.homeworld === true) {
		hydrosphereCode = MATH.clamp({ value: hydrosphereCode, lo: 5, hi: 10 })
	}
	// Book pp. 224-227: any dwarf/terrestrial/helian body whose hydrosphere
	// ends up molten (code 12) still reads as an accreting protoplanet, not
	// whatever ordinary climate classification it rolled -- true regardless
	// of whether the star is proto or primordial (or, in principle, any
	// future "young star" case), since it's keyed on the actual outcome
	// (hydrosphereCode) rather than the star-state flags. "meltball" is
	// excluded: it's already its own distinct, deliberately-named
	// classification (a forced close-in epistellar roll, unrelated to youth)
	// that happens to also carry hydrosphereCode 12.
	let classification = params.classification
	if (
		hydrosphereCode === 12 &&
		classification !== "meltball" &&
		(params.group === "dwarf" ||
			params.group === "terrestrial" ||
			params.group === "helian")
	) {
		classification =
			params.group === "dwarf"
				? "proto-dwarf"
				: params.group === "terrestrial"
					? "proto-terrestrial"
					: "proto-helian"
	}
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
	// The youth override rerolls a young world's atmosphere as a thin/primordial
	// one -- but a classification that already rolled a dense, exotic, or gas
	// code (10 exotic, 11 corrosive, 12 insidious, 14 gas) is meant to keep it,
	// so leave those untouched and only reroll the rest.
	const rolledAtmosphereCode = rolledEnvironment.atmosphereCode
	const atmosphereCode =
		youth && ![10, 11, 12, 14].includes(rolledAtmosphereCode)
			? params.proto === true
				? rollProtoAtmosphereCode({
						rng: params.rng,
						sizeClass: params.sizeClass,
					})
				: rollYouthAtmosphereCode({
						rng: params.rng,
						sizeClass: params.sizeClass,
					})
			: rolledAtmosphereCode
	// A capital homeworld always gets the plain standard breathable code (6),
	// overriding whatever its tectonic assignment rolled (2-9, some tainted).
	const homeworldAtmosphereCode = params.homeworld === true ? 6 : atmosphereCode
	const rolledAtmosphere = ATMOSPHERE.codeToProfile({
		rng: params.rng,
		atmosphereCode: homeworldAtmosphereCode,
		params: {
			chemistry: rolledEnvironment.chemistry ?? rolledEnvironment.composition,
			sizeClass: params.sizeClass,
			deviation: params.deviation,
			hydrosphereCode,
			gravityG,
			classification: params.classification,
			isPrimaryWorld: params.isPrimaryWorld,
			starAgeGyr: params.starAgeGyr,
			starSpectralClass: params.spectralClass,
			starLuminosityClass: params.luminosityClass ?? "V",
		},
	})
	// A carbon-rich world (see isCarbonWorld above) has too little free
	// oxygen for a breathable atmosphere -- never overrides the guaranteed
	// habitable homeworld slot. Checked against the resolved profile rather
	// than the pre-roll code: code 13 ("Dense High") can itself resolve to a
	// breathable composition (final code 13/14/15), not just codes 2-9.
	// Redirected to Exotic (10) rather than left breathable, with the
	// chemistry hint switched to methane/hydrocarbon-flavored.
	const forcedNonBreathable =
		isCarbonWorld &&
		params.homeworld !== true &&
		rolledAtmosphere?.breathable === true
	const atmosphere = forcedNonBreathable
		? ATMOSPHERE.codeToProfile({
				rng: params.rng,
				atmosphereCode: 10,
				params: {
					chemistry: "methane",
					sizeClass: params.sizeClass,
					deviation: params.deviation,
					hydrosphereCode,
					gravityG,
					classification: params.classification,
					isPrimaryWorld: params.isPrimaryWorld,
					starAgeGyr: params.starAgeGyr,
					starSpectralClass: params.spectralClass,
					starLuminosityClass: params.luminosityClass ?? "V",
				},
			})
		: rolledAtmosphere
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
		classification,
		density,
		landCoverage: 1 - HYDROSPHERE.waterFraction(hydrosphere),
		hydrosphereCode,
		hydrosphere,
		composition: rolledEnvironment.composition,
		chemistry: youth ? undefined : rolledEnvironment.chemistry,
		subtype: youth ? "primordial" : rolledEnvironment.subtype,
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
