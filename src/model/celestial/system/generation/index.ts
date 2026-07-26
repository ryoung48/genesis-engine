import { estimateGreenhouseFactor } from "@/model/climate/ebm/greenhouse-estimate"
import { buildSurfaceTidesSeismologyCallbacks } from "@/model/climate/tidal-schedule"
import { ASTRONOMICAL_DAYS_PER_YEAR } from "@/model/shared"
import { createRng } from "@/model/shared/rng"
import { LANGUAGE } from "@/model/society/language/languages"
import type { MoonBody } from "../../moons"
import { MOON } from "../../moons"
import type { TideLock } from "../../orbit-body"
import {
	EARTH_DIAMETER_KM,
	EARTH_MASS_KG,
	ORBIT_BODY,
	SOLAR_MASS_KG,
} from "../../orbit-body"
import { PLANET } from "../../planet"
import { STAR } from "../../star"
import type { Slot } from "./environment"
import {
	buildBodyEnvironment,
	buildForcedClassificationEnvironment,
	buildMoonEnvironment,
	EPISTELLAR_DEVIATIONS,
	enforceMoonTidalSafety,
	INNER_DEVIATIONS,
	OUTER_DEVIATIONS,
} from "./environment"
import {
	pickDensityEarthRelative,
	rollAxialTiltDeg,
	rollDiameterKmFromSizeClass,
	rollEccentricity,
	rollJovianRings,
	rollOrbitGroup,
	rollSiderealDayHours,
	rollSizeClass,
} from "./rolls"
import { getStarAgeGyr } from "./star-identity"

export { generateStarName, getStarAgeGyr } from "./star-identity"

import {
	SOL_EARTH_CLOUDS_TEXTURE_PATH,
	SOL_EARTH_TEXTURE_PATH,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
	SOL_STAR_AGE_GYR,
	SOL_SYSTEM,
	SOL_SYSTEM_BODIES,
	type SolPlanetSeed,
} from "../sol-system"
import type { SystemBody } from "../types"
import { pickGeneratedTexturePath } from "./texture"
import type { GenerateSystemBodiesParams, HomeWorldParams } from "./types"

export const DAYS_PER_YEAR = ASTRONOMICAL_DAYS_PER_YEAR
// Mirrors the UI's DEFAULT_WORLD_PARAMS.continentSizeVariety (defaults.ts) --
// duplicated here since this model-layer file must not import from the UI
// layer. A rolled main world's continentSizeVariety starts at this Earth-like
// default, edited by hand afterward via the normal slider.
const EARTH_DEFAULT_CONTINENT_SIZE_VARIETY = 0.35

/** Only used for the real Sol seed's Earth, whose physical parameters come
 * from the user's live UI sliders (or the real fitted Earth data), not RNG
 * rolls -- everything else (classification, hydrosphere, texture, ...) is
 * fixed the same way it is for every other Sol body, since Earth is hydrated
 * by the exact same buildPlanet() (see buildMainWorldSeed below). A
 * procedurally generated (non-Sol) main world is no longer built from this
 * shape at all -- it's rolled inline alongside its siblings in
 * generateSystemBodies, see the `forceMainWorld` slot below. */
// Builds a live SolPlanetSeed for the main world from the user's current UI
// state -- hydrated by the exact same buildPlanet() every other Sol body
// uses (see sol-system.ts), just from this freshly-built seed instead of a
// fixed table entry. Its deviation/zone is always the temperate slot (see
// the deviation: 0 reservation below), and real Earth data (Bond albedo,
// fitted greenhouseFactor, real inclination/longitude of perihelion) only
// applies when this actually IS Earth (the Sol seed) -- see the SOL_SEED
// branch below, which merges in SOL_MAIN_WORLD_DEFAULTS's real values.
function buildMainWorldSeed(mainWorld: HomeWorldParams): SolPlanetSeed {
	const diameterEarths = mainWorld.diameterKm / EARTH_DIAMETER_KM
	const massEarths = mainWorld.massKg / EARTH_MASS_KG
	const density = PLANET.buildDensityProfile({
		massKg: mainWorld.massKg,
		diameterKm: mainWorld.diameterKm,
		classification: "tectonic",
	})
	const pressureBar = mainWorld.atmosphere?.pressureBar ?? 0
	return {
		name: mainWorld.name,
		isMainWorld: true,
		group: "terrestrial",
		classification: "tectonic",
		au: mainWorld.orbitalDistanceAU,
		diameterEarths,
		massEarths,
		gravityG: mainWorld.gravityG,
		densityEarthRelative: density?.earthRelative ?? 1,
		densityDescription: density?.description ?? "Rock and Metal",
		rotationHours: mainWorld.siderealDayHours,
		tiltDeg: mainWorld.axialTiltDeg,
		eccentricity: mainWorld.eccentricity,
		longitudeOfPerihelionDeg: mainWorld.longitudeOfPerihelionDeg,
		inclinationDeg: mainWorld.inclinationDeg,
		tideLock: mainWorld.tideLock,
		substellarLon: mainWorld.substellarLon,
		atmosphere: mainWorld.atmosphere ?? undefined,
		landDistribution: mainWorld.landDistribution,
		landCoverage:
			mainWorld.landCoverage ?? SOL_MAIN_WORLD_DEFAULTS.landCoverage,
		continentSizeVariety: mainWorld.continentSizeVariety,
		seaLevel: mainWorld.seaLevel,
		maxElevation: mainWorld.maxElevation,
		albedo: mainWorld.albedo,
		greenhouseFactor:
			mainWorld.greenhouseFactor ?? estimateGreenhouseFactor(pressureBar),
	}
}

/**
 * Generates the rest of the (single-star) solar system around the already-
 * generated main world: a handful of sibling asteroid belts/planets/gas
 * giants placed by the same deviation-pool + temperature-derived AU spacing
 * galaxy-gen uses for its star's satellite slots, simplified to drop all
 * companion-star/stellar-age machinery that doesn't apply to a lone
 * main-sequence star. The main world always keeps its real, already-rolled
 * orbitalDistanceAU — siblings are generated around it, never replacing it.
 */
export function generateSystemBodies(
	params: GenerateSystemBodiesParams,
): SystemBody[] {
	const {
		seed,
		spectralClass,
		starSubtype,
		forceMainWorld,
		solMainWorldOverrides,
	} = params
	const rng = createRng(seed)

	if (seed === SOL_SEED) {
		if (!solMainWorldOverrides) {
			throw new Error(
				"generateSystemBodies: Sol seed requires solMainWorldOverrides",
			)
		}
		const mainWorldSeed: SolPlanetSeed = {
			...buildMainWorldSeed(solMainWorldOverrides),
			cloudsTexturePath: SOL_EARTH_CLOUDS_TEXTURE_PATH,
			inclinationDeg:
				solMainWorldOverrides.inclinationDeg ??
				SOL_MAIN_WORLD_DEFAULTS.inclinationDeg,
		}
		return PLANET.applySystemSeismology({
			bodies: SOL_SYSTEM_BODIES.map((body) =>
				body.isMainWorld
					? SOL_SYSTEM.buildPlanet(mainWorldSeed, seed, -1, {
							textureOverride: SOL_EARTH_TEXTURE_PATH,
							moonsOverride: solMainWorldOverrides.moons,
						})
					: body,
			),
			starAgeGyr: SOL_STAR_AGE_GYR,
			starLuminositySol: 1,
			spectralClass,
			...buildSurfaceTidesSeismologyCallbacks({
				spectralClass,
				starSubtype,
			}),
		})
	}

	const luminositySol = STAR.getStarLuminositySol({
		cls: spectralClass,
		subtype: starSubtype,
	})
	const starMassKg = SOLAR_MASS_KG

	// Every non-Sol system gets its own procedurally generated language (see
	// LANGUAGE.spawn/planet-name.ts), used to name every sibling planet and
	// moon so a system's bodies read as belonging to one another instead of
	// each carrying an unrelated one-off name. Sol keeps its real, curated
	// names untouched (see the seed === SOL_SEED branch above).
	const systemLanguage = LANGUAGE.spawn(`system:${seed}`)
	const nameBody = (slot: string): string =>
		LANGUAGE.word.simple({
			lang: systemLanguage,
			key: "region",
			namespace: "planet",
			slot,
		}).word

	const epistellarCount = rng.randint(0, 2)
	const innerCount = rng.randint(1, 3)
	const outerCount = rng.randint(1, 5)

	const slots: Slot[] = [
		...rng
			.sample(EPISTELLAR_DEVIATIONS, epistellarCount)
			.map((deviation) => ({ zone: "epistellar" as const, deviation })),
		// One inner slot is reserved for the main world (deviation 0, the
		// "temperate" slot -- always exactly the HZ center, see deviationToAU)
		// when forceMainWorld is set -- same guarantee galaxy-gen gives its
		// homeworld. It's rolled through the exact same pipeline as any other
		// slot below, just tagged isMainWorld/isPrimaryWorld true.
		...(forceMainWorld
			? [{ zone: "inner" as const, deviation: 0, isMainWorld: true }]
			: []),
		...rng
			.sample(
				forceMainWorld
					? INNER_DEVIATIONS.filter((d) => d !== 0)
					: INNER_DEVIATIONS,
				forceMainWorld ? Math.max(0, innerCount - 1) : innerCount,
			)
			.map((deviation) => ({ zone: "inner" as const, deviation })),
		...rng
			.sample(OUTER_DEVIATIONS, outerCount)
			.map((deviation) => ({ zone: "outer" as const, deviation })),
	]

	const starMassSol = STAR.getStarMassSol({
		cls: spectralClass,
		subtype: starSubtype,
	})
	const starAgeGyr = getStarAgeGyr(seed, starMassSol)

	// Ported from galaxy-gen's non-homeworld "primary" bias (orbits/index.ts)
	// -- even a system with no forced main world still gets one significant,
	// habitability-biased sibling: whichever slot sits closest to the star's
	// temperate (deviation 0) center, as long as that's an inner-zone slot
	// (an epistellar/outer "closest" pick just means this system has no
	// primary, same as galaxy-gen). Skipped entirely when forceMainWorld
	// already reserves the deviation-0 inner slot for an actual playable
	// homeworld.
	let primarySlotIndex: number | undefined
	if (!forceMainWorld && slots.length > 0) {
		let closestIndex = 0
		for (let i = 1; i < slots.length; i++) {
			if (
				Math.abs(slots[i]!.deviation) < Math.abs(slots[closestIndex]!.deviation)
			) {
				closestIndex = i
			}
		}
		if (slots[closestIndex]!.zone === "inner") primarySlotIndex = closestIndex
	}

	const bodies: SystemBody[] = slots.map(
		// biome-ignore lint/nursery/useMaxParams: native Array callback signature
		(slot, siblingIdx) => {
			const isMainWorld = slot.isMainWorld === true
			const isPrimaryWorld = isMainWorld || siblingIdx === primarySlotIndex
			let group = rollOrbitGroup(rng, slot.zone)
			// A main world can't be an asteroid belt (no surface to generate
			// terrain on) -- reroll until it isn't. Low-probability in the inner
			// zone already, so this terminates quickly.
			while (isMainWorld && group === "asteroid belt") {
				group = rollOrbitGroup(rng, slot.zone)
			}
			let orbitalDistanceAU = PLANET.deviationToAU({
				deviation: slot.deviation,
				luminositySol,
			})
			// Ported from galaxy-gen's forced-meltball roll (orbits/index.ts) -- a
			// close-in epistellar dwarf beyond the star's dust-clearing boundary
			// (getStarMAO) can get shoved into a scorching orbit instead of
			// forming further out. Only ever checked for the very first slot in
			// generation order (mirroring galaxy-gen's firstStarOrbit gate) and
			// never for the main world.
			let forceMeltball = false
			if (
				siblingIdx === 0 &&
				!isMainWorld &&
				slot.zone === "epistellar" &&
				group === "dwarf" &&
				rng.uniform(0, 1) <= 0.2
			) {
				const candidateAu = PLANET.auFromTemperature({
					kelvinTemp: rng.uniform(1000, 2000),
					luminositySol,
				})
				const maoAu = STAR.getStarMAO({
					cls: spectralClass,
					subtype: starSubtype,
				})
				if (candidateAu > maoAu) {
					forceMeltball = true
					orbitalDistanceAU = candidateAu
				}
			}
			// A primary/main world is meant to be a significant, habitable-scale
			// body -- floor its rolled size the way galaxy-gen floors `size` to
			// at least 2 for its own primary designation, adapted to our
			// terrestrial-sized (5-10) sizeClass band since classifyBody always
			// reclassifies an isPrimaryWorld body to group "terrestrial".
			const sizeClass = isPrimaryWorld
				? Math.max(rollSizeClass(rng, group), 5)
				: rollSizeClass(rng, group)
			const classification = PLANET.classifyBody({
				groupHint: group,
				zone: slot.zone,
				orbitalDistanceAU,
				sizeClass,
				isPrimaryWorld,
				isMoon: false,
				tidal: false,
				forceMeltball,
			}).classification
			const assignment = PLANET.rollClassificationAssignment({
				rng,
				classification,
				sizeClass,
				zone: slot.zone,
				deviation: slot.deviation,
				spectralClass,
				isPrimaryWorld,
			})
			const diameterKm = rollDiameterKmFromSizeClass(rng, sizeClass)
			const densityEarthRelative =
				group === "asteroid belt"
					? 0
					: pickDensityEarthRelative(
							rng,
							group,
							classification,
							assignment.composition,
						)
			const massKg =
				group === "asteroid belt"
					? 0
					: ORBIT_BODY.massKgFromEarthRelativeDensity({
							diameterKm,
							densityEarthRelative,
						})
			// This is the pre-tide-lock "natural" rotation baseline -- see
			// rollPlanetTideLock below, which may override it entirely.
			const siderealDayHours =
				group === "asteroid belt"
					? 0
					: rollSiderealDayHours(rng, group === "jovian", starAgeGyr)
			// Moved up from this body's other orbital elements (previously rolled
			// inline in the returned object below) because rollPlanetTideLock needs
			// them as pre-lock inputs -- its own DM/roll may still adjust them
			// further (circularizing eccentricity, flattening or flipping tilt).
			const orbitalPeriodDays =
				STAR.getKeplerYearYears({ orbitalDistanceAU, massSol: starMassSol }) *
				DAYS_PER_YEAR
			const eccentricity = group === "asteroid belt" ? 0 : rollEccentricity(rng)
			const rolledAxialTiltDeg =
				group === "asteroid belt" ? 0 : rollAxialTiltDeg(rng)
			const moonCount =
				group === "asteroid belt"
					? 0
					: MOON.rollMoonCountForParent({
							rng,
							parentGroup: group,
							parentSizeClass: sizeClass,
							orbitalDistanceAU,
						})
			const moonSlotName = isMainWorld ? "main" : `orbit-${siblingIdx}`
			const moons =
				moonCount > 0
					? MOON.generateMoons({
							count: moonCount,
							seed: rng.randint(1, 1_000_000_000),
							planetRadiusKm: diameterKm / 2,
							orbitalDistanceAU,
							starMassKg,
							parentGroup: group,
						})
							.map(
								// biome-ignore lint/nursery/useMaxParams: native Array callback signature
								(moon, moonIdx) => {
									const moonEnvironment = buildMoonEnvironment({
										rng,
										diameterKm: moon.diameterKm,
										massKg: moon.massKg,
										orbitalDistanceAU,
										zone: slot.zone,
										deviation: slot.deviation,
										spectralClass,
										sizeClass: moon.sizeClass,
										isPrimaryWorld,
										orbitRange: moon.orbitRange,
										semiMajorAxisPlanetDiameters:
											moon.semiMajorAxisPlanetDiameters,
									})
									// Ported from galaxy-gen's ROTATION.locks.get's per-moon loop
									// (see tide-lock.ts's rollMoonTideLock) -- may override this
									// moon's rotation/tilt/eccentricity with a partial spin-down, a
									// 3:2 resonance, or a full 1:1 lock to ITS planet. Runs before
									// enforceMoonTidalSafety below so the safety check validates the
									// post-lock (often circularized, lower-heating) orbit. The
									// resulting tideLock itself isn't set here -- attachParentTideLocks
									// below infers it from whether siderealDayHours ended up equal to
									// the orbital period, which a 1:1 lock result always does.
									const moonTideLock = PLANET.rollMoonTideLock({
										rng,
										sizeClass: moonEnvironment.sizeClass,
										eccentricity: moon.eccentricity,
										axialTiltDeg: moon.axialTiltDeg,
										atmospherePressureBar:
											moonEnvironment.atmosphere?.pressureBar ?? 0,
										starAgeGyr,
										semiMajorAxisPlanetDiameters:
											moon.semiMajorAxisPlanetDiameters ?? 0,
										orbitalPeriodDays: moon.orbitalPeriodDays,
										planetMassEarths: massKg / EARTH_MASS_KG,
										baseSiderealDayHours: moon.siderealDayHours,
										rerollEccentricity: () =>
											MOON.rollMoonEccentricity({
												rng,
												range: moon.orbitRange ?? "middle",
												sizeClass: moonEnvironment.sizeClass,
											}),
									})
									return enforceMoonTidalSafety(rng, massKg, diameterKm, {
										...moon,
										// Spread after `moon` so its real classification-derived
										// atmosphere/group/density wins over MOON.generateMoons()'s bare
										// vacuum-atmosphere fallback (and its own sizeClass estimate,
										// now told about the roll already made, wins too).
										...moonEnvironment,
										siderealDayHours: moonTideLock.siderealDayHours,
										axialTiltDeg: moonTideLock.axialTiltDeg,
										eccentricity: moonTideLock.eccentricity,
										// A rolled moon gets its OWN classification-based texture here
										// -- it must never inherit SOL_LUNA_DEFAULT's photo. Only when
										// its classification has no matching generated art (not in
										// GENERATED_TEXTURE_FILES) does it fall through moon-orbit-
										// overlay.ts's untextured branch, which happens to reuse Luna's
										// moon.jpg as a generic gray placeholder -- a pre-existing,
										// unrelated renderer default, not something this assigns.
										texturePath: pickGeneratedTexturePath(
											rng,
											moonEnvironment.classification,
										),
										name: nameBody(`${moonSlotName}-moon-${moonIdx}`),
									})
								},
							)
							.filter((moon): moon is MoonBody => moon !== null)
					: []
			const idx = isMainWorld ? -1 : siblingIdx
			const moonsWithTideLocks = MOON.attachParentTideLocks({
				moons,
				parentIdx: idx,
			}).map((moon) => ({
				...moon,
				tideLockStatus: PLANET.deriveTideLockStatus({
					siderealDayHours: moon.siderealDayHours,
					orbitalPeriodDays: moon.orbitalPeriodDays,
					tideLock: moon.tideLock,
				}),
			}))
			const environment = buildBodyEnvironment({
				rng,
				groupHint: group,
				zone: slot.zone,
				deviation: slot.deviation,
				spectralClass,
				diameterKm,
				massKg,
				orbitalDistanceAU,
				isPrimaryWorld,
				isMoon: false,
				tidal: false,
				forceMeltball,
				assignment,
			})
			// Ported from galaxy-gen's ROTATION.locks.get (see tide-lock.ts) -- may
			// override this body's rotation/tilt/eccentricity entirely (a partial
			// spin-down, a 3:2 resonance, or a full 1:1 lock to its star or to one
			// of its own already-planet-locked moons). Never applies to an asteroid
			// belt, which has no rotation of its own to lock.
			let finalSiderealDayHours = siderealDayHours
			let finalAxialTiltDeg = rolledAxialTiltDeg
			let finalEccentricity = eccentricity
			let tideLock: TideLock | null = null
			let finalEnvironment = environment
			if (group !== "asteroid belt") {
				const tideLockResult = PLANET.rollPlanetTideLock({
					rng,
					sizeClass,
					eccentricity,
					axialTiltDeg: rolledAxialTiltDeg,
					atmospherePressureBar: environment.atmosphere?.pressureBar ?? 0,
					starAgeGyr,
					starMassSol,
					orbitalDistanceAU,
					orbitalPeriodDays,
					baseSiderealDayHours: siderealDayHours,
					moons: moonsWithTideLocks,
					homeworld: isMainWorld,
					rerollEccentricity: () => rollEccentricity(rng),
				})
				finalSiderealDayHours = tideLockResult.siderealDayHours
				finalAxialTiltDeg = tideLockResult.axialTiltDeg
				finalEccentricity = tideLockResult.eccentricity
				tideLock = tideLockResult.tideLock
				if (
					tideLockResult.starLocked &&
					environment.group === "terrestrial" &&
					environment.classification !== "acheronian"
				) {
					finalEnvironment = buildForcedClassificationEnvironment({
						rng,
						classification:
							slot.zone === "epistellar" ? "jani-lithic" : "vesperian",
						sizeClass,
						zone: slot.zone,
						deviation: slot.deviation,
						spectralClass,
						diameterKm,
						massKg,
						isPrimaryWorld,
					})
				}
			}
			return {
				...finalEnvironment,
				idx,
				seed: isMainWorld ? "main-world" : `orbit-${siblingIdx + 1}`,
				name: nameBody(isMainWorld ? "main-world" : `orbit-${siblingIdx}`),
				isMainWorld,
				zone: slot.zone,
				texturePath: pickGeneratedTexturePath(
					rng,
					finalEnvironment.classification,
				),
				rings:
					finalEnvironment.group === "jovian"
						? rollJovianRings(rng)
						: undefined,
				orbitalDistanceAU,
				diameterKm,
				massKg,
				gravityG:
					group === "asteroid belt"
						? 0
						: ORBIT_BODY.computeGravityG({ massKg, diameterKm }),
				orbitalPeriodDays,
				siderealDayHours: finalSiderealDayHours,
				eccentricity: finalEccentricity,
				longitudeOfPerihelionDeg: rng.uniform(0, 360),
				axialTiltDeg: finalAxialTiltDeg,
				inclinationDeg:
					group === "asteroid belt" ? 0 : MOON.rollInclinationDeg(rng),
				longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
				tideLock,
				tideLockStatus: PLANET.deriveTideLockStatus({
					siderealDayHours: finalSiderealDayHours,
					orbitalPeriodDays,
					tideLock,
				}),
				substellarLon:
					tideLock?.type === "solar" ? rng.uniform(0, 360) : undefined,
				moons: moonsWithTideLocks,
				// Terrain-generation-only fields, meaningless for anything but the
				// main world -- set to Earth's own defaults (not rolled) per
				// SOL_MAIN_WORLD_DEFAULTS/the UI's DEFAULT_WORLD_PARAMS, since the
				// player edits these by hand afterward via the normal sliders.
				...(isMainWorld
					? {
							landDistribution: 1 - SOL_MAIN_WORLD_DEFAULTS.landConcentration,
							continentSizeVariety: EARTH_DEFAULT_CONTINENT_SIZE_VARIETY,
							seaLevel: SOL_MAIN_WORLD_DEFAULTS.seaLevel,
							maxElevation: SOL_MAIN_WORLD_DEFAULTS.maxElevation,
						}
					: {}),
			}
		},
	)

	return PLANET.applySystemSeismology({
		bodies: bodies.sort(
			// biome-ignore lint/nursery/useMaxParams: native Array callback signature
			(a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU,
		),
		starAgeGyr,
		starLuminositySol: luminositySol,
		spectralClass,
		...buildSurfaceTidesSeismologyCallbacks({
			spectralClass,
			starSubtype,
		}),
	})
}
