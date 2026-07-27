import { MOON } from "@/model/celestial/moons"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import type { BodyGenerationParams } from "@/model/celestial/system/generation/body/types"
import { ENVIRONMENT } from "@/model/celestial/system/generation/environment"
import type { Slot } from "@/model/celestial/system/generation/environment/types"
import { MOON_PLACEMENT } from "@/model/celestial/system/generation/moon-placement"
import { ROLLS } from "@/model/celestial/system/generation/rolls"
import { SOL_SEED_BODIES } from "@/model/celestial/system/generation/sol-seed"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { TEXTURE } from "@/model/celestial/system/generation/texture"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import type { SystemBody } from "@/model/celestial/system/types"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"
import { RNG } from "@/model/shared/rng"
import { TIME } from "@/model/shared/time"
import { LANGUAGE } from "@/model/society/language/languages"

const DAYS_PER_YEAR = TIME.astronomicalDaysPerYear
// Mirrors the UI's DEFAULT_WORLD_PARAMS.continentSizeVariety (defaults.ts) --
// duplicated here since this model-layer file must not import from the UI
// layer. A rolled main world's continentSizeVariety starts at this Earth-like
// default, edited by hand afterward via the normal slider.
const EARTH_DEFAULT_CONTINENT_SIZE_VARIETY = 0.35

/**
 * Generates the rest of the (single-star) solar system around the already-
 * generated main world: a handful of sibling asteroid belts/planets/gas
 * giants placed by the same deviation-pool + temperature-derived AU spacing
 * galaxy-gen uses for its star's satellite slots, simplified to drop all
 * companion-star/stellar-age machinery that doesn't apply to a lone
 * main-sequence star. The main world always keeps its real, already-rolled
 * orbitalDistanceAU — siblings are generated around it, never replacing it.
 */
function generateSystemBodies(params: BodyGenerationParams): SystemBody[] {
	const { seed, spectralClass, starSubtype, forceMainWorld } = params
	const solBodies = SOL_SEED_BODIES.generate(params)
	if (solBodies) return solBodies
	const rng = RNG.createRng({ seed })

	const luminositySol = STAR.getStarLuminositySol({
		cls: spectralClass,
		subtype: starSubtype,
	})
	const starMassKg = ORBIT_BODY.solarMassKg

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
			.sample(ENVIRONMENT.epistellarDeviations, epistellarCount)
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
					? ENVIRONMENT.innerDeviations.filter((d) => d !== 0)
					: ENVIRONMENT.innerDeviations,
				forceMainWorld ? Math.max(0, innerCount - 1) : innerCount,
			)
			.map((deviation) => ({ zone: "inner" as const, deviation })),
		...rng
			.sample(ENVIRONMENT.outerDeviations, outerCount)
			.map((deviation) => ({ zone: "outer" as const, deviation })),
	]

	const starMassSol = STAR.getStarMassSol({
		cls: spectralClass,
		subtype: starSubtype,
	})
	const starAgeGyr = STAR_IDENTITY.getStarAgeGyr({ seed, massSol: starMassSol })

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
			let group = ROLLS.rollOrbitGroup({ rng, zone: slot.zone })
			// A main world can't be an asteroid belt (no surface to generate
			// terrain on) -- reroll until it isn't. Low-probability in the inner
			// zone already, so this terminates quickly.
			while (isMainWorld && group === "asteroid belt") {
				group = ROLLS.rollOrbitGroup({ rng, zone: slot.zone })
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
				? Math.max(ROLLS.rollSizeClass({ rng, group }), 5)
				: ROLLS.rollSizeClass({ rng, group })
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
			const diameterKm = ROLLS.rollDiameterKmFromSizeClass({ rng, sizeClass })
			const densityEarthRelative =
				group === "asteroid belt"
					? 0
					: ROLLS.pickDensityEarthRelative({
							rng,
							group,
							classification,
							composition: assignment.composition,
						})
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
					: ROLLS.rollSiderealDayHours({
							rng,
							isJovian: group === "jovian",
							starAgeGyr,
						})
			// Moved up from this body's other orbital elements (previously rolled
			// inline in the returned object below) because rollPlanetTideLock needs
			// them as pre-lock inputs -- its own DM/roll may still adjust them
			// further (circularizing eccentricity, flattening or flipping tilt).
			const orbitalPeriodDays =
				STAR.getKeplerYearYears({ orbitalDistanceAU, massSol: starMassSol }) *
				DAYS_PER_YEAR
			const eccentricity =
				group === "asteroid belt" ? 0 : ROLLS.rollEccentricity(rng)
			const rolledAxialTiltDeg =
				group === "asteroid belt" ? 0 : ROLLS.rollAxialTiltDeg(rng)
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
			const moons = MOON_PLACEMENT.place({
				rng,
				moonCount,
				diameterKm,
				orbitalDistanceAU,
				starMassKg,
				group,
				isPrimaryWorld,
				zone: slot.zone,
				deviation: slot.deviation,
				spectralClass,
				starAgeGyr,
				massKg,
				moonSlotName,
				nameBody,
			})
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
			const environment = ENVIRONMENT.buildBodyEnvironment({
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
					rerollEccentricity: () => ROLLS.rollEccentricity(rng),
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
					finalEnvironment = ENVIRONMENT.buildForcedClassificationEnvironment({
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
				texturePath: TEXTURE.pickGeneratedTexturePath({
					rng,
					classification: finalEnvironment.classification,
				}),
				rings:
					finalEnvironment.group === "jovian"
						? ROLLS.rollJovianRings(rng)
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
							landDistribution:
								1 - SOL_SYSTEM.solMainWorldDefaults.landConcentration,
							continentSizeVariety: EARTH_DEFAULT_CONTINENT_SIZE_VARIETY,
							seaLevel: SOL_SYSTEM.solMainWorldDefaults.seaLevel,
							maxElevation: SOL_SYSTEM.solMainWorldDefaults.maxElevation,
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
		...TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks({
			spectralClass,
			starSubtype,
		}),
	})
}

export const BODY_GENERATION = {
	generateSystemBodies,
}
