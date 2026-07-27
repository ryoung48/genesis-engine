import type { createRng } from "@/model/shared/rng"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import { PLANET } from "@/model/celestial/planet"
import type { ClassifiedEnvironment } from "@/model/celestial/planet/environment/classification/dice-table/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"

const epistellarDeviations = [2.25, 1.75, 1.25]
const innerDeviations = [0.75, 0, -0.75]
const outerDeviations = [
	-1.25, -1.75, -2.25, -2.75, -3.25, -3.75, -4, -4.25, -4.5,
]

function buildBodyEnvironment(params: {
	rng: ReturnType<typeof createRng>
	/** Omitted when size alone should determine the group. */
	groupHint?: OrbitGroup
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	isPrimaryWorld: boolean
	isMoon: boolean
	tidal: boolean
	/** Only the first close-in dwarf slot can force this ported outcome. */
	forceMeltball?: boolean
	/** Reuses the assignment rolled before mass/density construction. */
	assignment?: ClassifiedEnvironment
}): Pick<
	SystemBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "subtype"
	| "composition"
	| "chemistry"
	| "hydrosphereCode"
	| "hydrosphere"
	| "landCoverage"
	| "atmosphere"
	| "greenhouseFactor"
	| "albedo"
> {
	const sizeClass =
		params.groupHint === "jovian"
			? PLANET.estimateGasGiantSizeClass(params.diameterKm)
			: PLANET.estimateRockySizeClass(params.diameterKm)
	const body = PLANET.classifyBody({ ...params, sizeClass })
	const environment = PLANET.buildClassificationEnvironment({
		rng: params.rng,
		group: body.group,
		classification: body.classification,
		sizeClass,
		zone: params.zone,
		deviation: params.deviation,
		spectralClass: params.spectralClass,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
		greenhouseMode: params.isPrimaryWorld ? "estimate" : "roll",
		assignment: params.assignment,
	})
	return {
		sizeClass,
		density: environment.density,
		group: body.group,
		classification: body.classification,
		subtype: environment.subtype,
		composition: environment.composition,
		chemistry: environment.chemistry,
		hydrosphereCode: environment.hydrosphereCode,
		hydrosphere: environment.hydrosphere,
		landCoverage: environment.landCoverage,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
		albedo: environment.albedo,
	}
}

// Ported from galaxy-gen's classify() (orbits/rotation/index.ts) -- rerolls
// atmosphere/hydrosphere/subtype/chemistry for a terrestrial body that just
// became star-locked (see tide-lock.ts's rollPlanetTideLock), the same way
// its real classification's dice table would if it had been rolled that way
// from the start. Density is also recomputed (buildClassificationEnvironment
// always derives it from mass/diameter, which don't change here) rather than
// carried over -- galaxy-gen doesn't touch density on reclassify either,
// since it's independent of classification other than its description label.
function buildForcedClassificationEnvironment(params: {
	rng: ReturnType<typeof createRng>
	classification: "jani-lithic" | "vesperian"
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	diameterKm: number
	massKg: number
	isPrimaryWorld: boolean
}): Pick<
	SystemBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "subtype"
	| "composition"
	| "chemistry"
	| "hydrosphereCode"
	| "hydrosphere"
	| "landCoverage"
	| "atmosphere"
	| "greenhouseFactor"
	| "albedo"
> {
	const environment = PLANET.buildClassificationEnvironment({
		rng: params.rng,
		group: "terrestrial",
		classification: params.classification,
		sizeClass: params.sizeClass,
		zone: params.zone,
		deviation: params.deviation,
		spectralClass: params.spectralClass,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
		greenhouseMode: params.isPrimaryWorld ? "estimate" : "roll",
	})
	return {
		sizeClass: params.sizeClass,
		density: environment.density,
		group: "terrestrial",
		classification: params.classification,
		subtype: environment.subtype,
		composition: environment.composition,
		chemistry: environment.chemistry,
		hydrosphereCode: environment.hydrosphereCode,
		hydrosphere: environment.hydrosphere,
		landCoverage: environment.landCoverage,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
		albedo: environment.albedo,
	}
}

function buildMoonEnvironment(params: {
	rng: ReturnType<typeof createRng>
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	/** Moon generation supplies this when known; hand-authored/incomplete
	 * moons infer it from diameter before their environment is built. */
	sizeClass?: number
	isPrimaryWorld: boolean
	/** Moon placement has not run yet for incomplete/authored moons, so tidal
	 * classification must tolerate both orbital fields being absent. */
	orbitRange?: MoonBody["orbitRange"]
	semiMajorAxisPlanetDiameters?: number
}): Pick<
	MoonBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "subtype"
	| "composition"
	| "chemistry"
	| "hydrosphereCode"
	| "hydrosphere"
	| "landCoverage"
	| "atmosphere"
	| "greenhouseFactor"
	| "albedo"
> {
	const sizeClass =
		params.sizeClass ?? PLANET.estimateRockySizeClass(params.diameterKm)
	const tidal =
		params.orbitRange === "inner" ||
		(params.semiMajorAxisPlanetDiameters ?? Number.POSITIVE_INFINITY) <= 8
	const body = PLANET.classifyBody({
		groupHint: undefined,
		zone: params.zone,
		orbitalDistanceAU: params.orbitalDistanceAU,
		sizeClass,
		isPrimaryWorld: params.isPrimaryWorld,
		isMoon: true,
		tidal,
	})
	const environment = PLANET.buildClassificationEnvironment({
		rng: params.rng,
		group: body.group,
		classification: body.classification,
		sizeClass,
		zone: params.zone,
		deviation: params.deviation,
		spectralClass: params.spectralClass,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
		greenhouseMode: params.isPrimaryWorld ? "estimate" : "roll",
	})
	return {
		sizeClass,
		density: environment.density,
		group: body.group,
		classification: body.classification,
		subtype: environment.subtype,
		composition: environment.composition,
		chemistry: environment.chemistry,
		hydrosphereCode: environment.hydrosphereCode,
		hydrosphere: environment.hydrosphere,
		landCoverage: environment.landCoverage,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
		albedo: environment.albedo,
	}
}

const MAX_MOON_ECCENTRICITY_SAFETY_ATTEMPTS = 8

// Ported from galaxy-gen's ORBIT.safeMoonOrbit (orbits/index.ts) -- Hill-
// sphere/Roche spacing (already enforced by generateMoons' own orbit-band
// placement, see orbital-mechanics.ts's morPd/placeMoonOrbits) only keeps a
// moon's orbit geometrically stable; it says nothing about whether that
// orbit's *tidal heating* would tear the moon apart. Rerolls the cheapest
// knob (eccentricity, which the heating formula is most sensitive to) a
// bounded number of times and drops the moon entirely if no safe orbit is
// found, exactly like galaxy-gen's discard-and-reroll loop.
function enforceMoonTidalSafety({
	rng,
	parentMassKg,
	parentDiameterKm,
	moon,
}: {
	rng: ReturnType<typeof createRng>
	parentMassKg: number
	parentDiameterKm: number
	moon: MoonBody
}): MoonBody | null {
	const heatingFor = (eccentricity: number) =>
		PLANET.computeMoonTidalHeatingRaw({
			parentMassKg,
			parentDiameterKm,
			moonDiameterKm: moon.diameterKm,
			moonMassKg: moon.massKg,
			semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters ?? 0,
			orbitalPeriodDays: moon.orbitalPeriodDays,
			eccentricity,
			densityEarthRelative: moon.density?.earthRelative ?? 0,
		})
	let eccentricity = moon.eccentricity
	let heating = heatingFor(eccentricity)
	let attempts = 0
	while (
		heating > PLANET.MAX_SAFE_MOON_TIDAL_HEATING &&
		attempts < MAX_MOON_ECCENTRICITY_SAFETY_ATTEMPTS
	) {
		eccentricity = rng.uniform(0, eccentricity / 2)
		heating = heatingFor(eccentricity)
		attempts += 1
	}
	if (heating > PLANET.MAX_SAFE_MOON_TIDAL_HEATING) return null
	return { ...moon, eccentricity }
}

export const ENVIRONMENT = {
	epistellarDeviations,
	innerDeviations,
	outerDeviations,
	buildBodyEnvironment,
	buildForcedClassificationEnvironment,
	buildMoonEnvironment,
	enforceMoonTidalSafety,
}
