import { MOON } from "@/model/celestial/moons"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	TemperatureTraceEntry,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import type { BodyGenerationParams } from "@/model/celestial/system/generation/body/types"
import { ENVIRONMENT } from "@/model/celestial/system/generation/environment"
import type { Slot } from "@/model/celestial/system/generation/environment/types"
import { MOON_PLACEMENT } from "@/model/celestial/system/generation/moon-placement"
import { ROLLS } from "@/model/celestial/system/generation/rolls"
import { SOL_SEED_BODIES } from "@/model/celestial/system/generation/sol-seed"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { SolPlanetSeed } from "@/model/celestial/system/sol-system/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { RNG } from "@/model/shared/random/rng"
import { TEXT } from "@/model/shared/text"
import { TIME } from "@/model/shared/time"
import { LANGUAGE } from "@/model/society/language/languages"

const DAYS_PER_YEAR = TIME.astronomicalDaysPerYear
// A forced main world is a literal Earth clone (same radius/mass/density/
// atmosphere/day length/tilt/eccentricity/texture as the real Sol seed data),
// just re-positioned to the new star's own habitable-zone center and given a
// procedurally generated name instead of rolling its own physical stats --
// see the isMainWorld branch below.
const EARTH_SEED = SOL_DATA.solPlanetSeeds.find((seed) => seed.isMainWorld)!
const LUNA_SEED = EARTH_SEED.moons![0]!
// sizeClass 6 -> the [8800, 10400] km diameter band -- notably smaller than
// Earth's own sizeClass (8, [12000, 13600]) -- used for the "gas-giant-moon"
// mode's promoted moon (see promoteMoonToMainWorld).
const MAIN_WORLD_MOON_SIZE_CLASS = 6

/** Turns an already fully-rolled moon into the gas-giant-moon mode's main
 * world: forces its size into the sizeClass-6 band and copies Earth's
 * atmosphere/composition/land stats, but leaves every orbital-mechanics
 * field (period, eccentricity, rotation, tide-lock) exactly as rolled by
 * MOON_PLACEMENT.place -- see generateSystemBodies' gas-giant-moon branch. */
function promoteMoonToMainWorld(params: {
	moon: MoonBody
	rng: ReturnType<typeof RNG.createRng>
	nameBody: (slot: string) => string
}): MoonBody {
	const { moon, rng, nameBody } = params
	const [minKm, maxKm] = ORBIT_BODY.sizeClassToRockyDiameterRangeKm(
		MAIN_WORLD_MOON_SIZE_CLASS,
	)
	const diameterKm = rng.uniform(minKm, maxKm)
	return {
		...moon,
		name: nameBody("main-world"),
		group: EARTH_SEED.group,
		classification: EARTH_SEED.classification,
		texturePath: EARTH_SEED.texturePath,
		cloudsTexturePath: EARTH_SEED.cloudsTexturePath,
		diameterKm,
		massKg: ORBIT_BODY.massKgFromEarthRelativeDensity({
			diameterKm,
			densityEarthRelative: EARTH_SEED.densityEarthRelative,
		}),
		density: {
			earthRelative: EARTH_SEED.densityEarthRelative,
			description: EARTH_SEED.densityDescription,
		},
		atmosphere: EARTH_SEED.atmosphere,
		landCoverage: EARTH_SEED.landCoverage,
		landDistribution: EARTH_SEED.landDistribution,
		continentSizeVariety: EARTH_SEED.continentSizeVariety,
		seaLevel: EARTH_SEED.seaLevel,
		maxElevation: EARTH_SEED.maxElevation,
		albedo: EARTH_SEED.albedo,
		greenhouseFactor: EARTH_SEED.greenhouseFactor,
		biosphere: EARTH_SEED.biosphere,
		isMainWorld: true,
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
function generateSystemBodies(params: BodyGenerationParams): SystemBody[] {
	const { seed, mainWorldMode, starMassKgOverride } = params
	const hostStar = params.hostStar
	const spectralClass =
		hostStar?.spectralClass ?? params.spectralClass ?? STAR.defaultSpectralClass
	const tableSpectralClass = STAR.isValidSpectralClass(spectralClass)
		? spectralClass
		: STAR.defaultSpectralClass
	const starSubtype =
		hostStar?.subtype ?? params.starSubtype ?? STAR.defaultStarSubtype
	const solBodies = SOL_SEED_BODIES.generate(params)
	if (solBodies) return solBodies
	const rng = RNG.createRng({ seed })

	const luminositySol =
		hostStar?.luminositySol ??
		STAR.getStarLuminositySol({
			cls: tableSpectralClass,
			subtype: starSubtype,
		})
	const starMassKg =
		hostStar?.massSol !== undefined
			? hostStar.massSol * ORBIT_BODY.solarMassKg
			: (starMassKgOverride ?? ORBIT_BODY.solarMassKg)

	// Every non-Sol system gets its own procedurally generated language (see
	// LANGUAGE.spawn/planet-name.ts), used to name every sibling planet and
	// moon so a system's bodies read as belonging to one another instead of
	// each carrying an unrelated one-off name. Sol keeps its real, curated
	// names untouched (see the seed === SOL_SEED branch above). Skipped
	// entirely under skipNaming -- LANGUAGE.spawn isn't free, and a bulk
	// pre-generation pass has no use for names until the system is opened.
	const systemLanguage = params.skipNaming
		? null
		: LANGUAGE.spawn(`system:${seed}`)
	// LANGUAGE.word.simple's slot-based path returns the raw (lowercase) word
	// -- every other caller (see names/index.ts) title-cases it themselves.
	const nameBody = (slot: string): string =>
		systemLanguage
			? TEXT.titleCase(
					LANGUAGE.word.simple({
						lang: systemLanguage,
						key: "region",
						namespace: "planet",
						slot,
					}).word,
				)
			: ""

	const blackHole = spectralClass === "BH"
	const yBrownDwarf = spectralClass === "Y"
	const neutronStar = spectralClass === "NS"
	const brownDwarf =
		spectralClass === "L" || spectralClass === "T" || yBrownDwarf
	const deadStar = spectralClass === "D" || neutronStar || blackHole
	if (
		blackHole ||
		yBrownDwarf ||
		(params.hasParent === true && rng.uniform(0, 1) > 0.5) ||
		(deadStar && rng.uniform(0, 1) > 0.2)
	) {
		return []
	}
	const epistellarCount = brownDwarf || deadStar ? 0 : rng.randint(0, 2)
	const innerCount =
		neutronStar || spectralClass === "T"
			? 0
			: rng.randint(1, deadStar || brownDwarf ? 1 : 3)
	const outerCount = rng.randint(1, deadStar || brownDwarf ? 2 : 5)

	const slots: Slot[] = [
		...rng
			.sample(ENVIRONMENT.epistellarDeviations, epistellarCount)
			.map((deviation) => ({ zone: "epistellar" as const, deviation })),
		// One inner slot is reserved for the main world (deviation 0, the
		// "temperate" slot -- always exactly the HZ center, see deviationToAU) --
		// same guarantee galaxy-gen gives its homeworld -- for every mode except
		// "procedural", which skips the reservation entirely so deviation-0 is
		// just another inner-zone candidate like any other (no guaranteed
		// habitable body). Unlike every other slot, a reserved slot isn't rolled
		// at all: see the isMainWorld branch below, which builds it according to
		// mainWorldMode.
		...(mainWorldMode === "procedural"
			? []
			: [{ zone: "inner" as const, deviation: 0, isMainWorld: true }]),
		...rng
			.sample(
				mainWorldMode === "procedural"
					? ENVIRONMENT.innerDeviations
					: ENVIRONMENT.innerDeviations.filter((d) => d !== 0),
				mainWorldMode === "procedural"
					? innerCount
					: Math.max(0, innerCount - 1),
			)
			.map((deviation) => ({ zone: "inner" as const, deviation })),
		...rng
			.sample(ENVIRONMENT.outerDeviations, outerCount)
			.map((deviation) => ({ zone: "outer" as const, deviation })),
	]

	const starMassSol =
		hostStar?.massSol ??
		STAR.getStarMassSol({
			cls: tableSpectralClass,
			subtype: starSubtype,
		})
	const starAgeGyr =
		hostStar?.ageGyr ??
		params.starAgeGyrOverride ??
		STAR_IDENTITY.getStarAgeGyr({ massSol: starMassSol })

	// Ported from galaxy-gen's impactZone (stars/index.ts) -- a giant
	// (luminosityClass "III") or white dwarf ("D") host star's innermost few
	// orbit slots (closest first, independent of zone) are forced into a
	// "burned out" classification for whatever group they'd otherwise become
	// -- see PLANET.classifyBody's impactZone doc. A moon inherits its parent
	// planet's flag unchanged (see the MOON_PLACEMENT.place calls below).
	const impactZoneSlots = new Set<Slot>()
	{
		let remaining =
			hostStar?.luminosityClass === "III" || spectralClass === "D"
				? rng.randint(1, 3)
				: 0
		const byProximity = [...slots].sort((a, b) => b.deviation - a.deviation)
		for (const slot of byProximity) {
			if (remaining <= 0) break
			impactZoneSlots.add(slot)
			remaining -= 1
		}
	}

	const bodies: SystemBody[] = slots.map((slot, siblingIdx) => {
		if (slot.isMainWorld && mainWorldMode !== "gas-giant-moon") {
			const orbitalDistanceAU = PLANET.deviationToAU({
				deviation: slot.deviation,
				luminositySol,
			})
			const mainWorldSeed: SolPlanetSeed = {
				...EARTH_SEED,
				// Never show the real Earth surface art on a procedurally generated
				// "Earth clone" main world -- undefined here falls through to the
				// normal generated-texture pipeline (seismology/index.ts), which
				// picks tectonic/rockball art from the clone's real classification
				// instead. isMainWorld bodies render via live simulated terrain
				// regardless (see overlay.ts's mainWorldSatelliteMap), so
				// texturePath itself is moot for them either way -- but
				// cloudsTexturePath IS rendered unconditionally (not bypassed like
				// texturePath is for isMainWorld), so keep Earth's real cloud layer
				// here rather than falling through to a generated one. The literal
				// Luna clone moon below is not isMainWorld and would otherwise
				// render the real Moon photo directly, so its own texturePath still
				// gets blanked.
				texturePath: undefined,
				seed: "main-world",
				name: nameBody("main-world"),
				au: orbitalDistanceAU,
				moons:
					mainWorldMode === "moon-system"
						? []
						: [
								{
									...LUNA_SEED,
									texturePath: undefined,
									name: nameBody("main-moon-1"),
								},
							],
			}
			const builtMainWorld = {
				...SOL_SYSTEM.buildPlanet({
					seed: mainWorldSeed,
					seedTag: siblingIdx + 1,
					idx: -1,
					options: { starMassSol },
				}),
				zone: slot.zone,
			}
			if (mainWorldMode !== "moon-system") return builtMainWorld
			// Roll a moon system the same way any sibling planet's moons are
			// rolled, instead of the single literal Luna clone above.
			const earthSizeClass = ORBIT_BODY.estimateRockySizeClassFromDiameterKm(
				builtMainWorld.diameterKm,
			)
			const moonCount = MOON.rollMoonCountForParent({
				rng,
				parentGroup: "terrestrial",
				parentSizeClass: earthSizeClass,
				orbitalDistanceAU,
			})
			const moonSlotName = `orbit-${siblingIdx}`
			const rolledMoons = MOON_PLACEMENT.place({
				rng,
				moonCount,
				diameterKm: builtMainWorld.diameterKm,
				orbitalDistanceAU,
				starMassKg,
				group: "terrestrial",
				isPrimaryWorld: true,
				zone: slot.zone,
				deviation: slot.deviation,
				spectralClass,
				starAgeGyr,
				massKg: builtMainWorld.massKg,
				moonSlotName,
				nameBody,
				// This is the reserved main-world slot, which only ever exists for
				// mainWorldMode !== "procedural" -- impactZone is a galaxy-generation
				// concept (giant/white-dwarf host stars) that never applies there.
				impactZone: false,
			})
			const moonsWithTideLocks = MOON.attachParentTideLocks({
				moons: rolledMoons,
				parentIdx: -1,
			}).map((moon) => ({
				...moon,
				tideLockStatus: PLANET.deriveTideLockStatus({
					siderealDayHours: moon.siderealDayHours,
					orbitalPeriodDays: moon.orbitalPeriodDays,
					tideLock: moon.tideLock,
				}),
			}))
			return { ...builtMainWorld, moons: moonsWithTideLocks }
		}
		// True only for the reserved deviation-0 slot in "gas-giant-moon" mode --
		// this slot becomes a normally-rolled jovian instead of a literal Earth
		// clone, with one of its own normally-rolled moons promoted to be the
		// main world below (see promoteMoonToMainWorld).
		const isGasGiantMainWorld = slot.isMainWorld === true
		const isPrimaryWorld = isGasGiantMainWorld
		const group = isGasGiantMainWorld
			? ("jovian" as const)
			: ROLLS.rollOrbitGroup({
					rng,
					zone: slot.zone,
					postStellar: deadStar,
					starAgeGyr,
				})
		let orbitalDistanceAU = PLANET.deviationToAU({
			deviation: slot.deviation,
			luminositySol,
		})
		// Ported from galaxy-gen's forced-meltball roll (orbits/index.ts) -- a
		// close-in epistellar dwarf beyond the star's dust-clearing boundary
		// (getStarMAO) can get shoved into a scorching orbit instead of
		// forming further out. Only ever checked for the very first slot in
		// generation order (mirroring galaxy-gen's firstStarOrbit gate).
		let forceMeltball = false
		if (
			siblingIdx === 0 &&
			slot.zone === "epistellar" &&
			group === "dwarf" &&
			rng.uniform(0, 1) <= 0.2
		) {
			const candidateAu = PLANET.auFromTemperature({
				kelvinTemp: rng.uniform(1000, 2000),
				luminositySol,
			})
			const maoAu =
				hostStar?.mao ??
				STAR.getStarMAO({
					cls: tableSpectralClass,
					subtype: starSubtype,
				})
			if (candidateAu > maoAu) {
				forceMeltball = true
				orbitalDistanceAU = candidateAu
			}
		}
		const sizeClass = ROLLS.rollSizeClass({ rng, group })
		const impactZone = impactZoneSlots.has(slot)
		const classification = PLANET.classifyBody({
			rng,
			groupHint: group,
			impactZone,
			zone: slot.zone,
			orbitalDistanceAU,
			sizeClass,
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
				: isGasGiantMainWorld
					? EARTH_SEED.rotationHours
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
			group === "asteroid belt"
				? 0
				: isGasGiantMainWorld
					? EARTH_SEED.eccentricity
					: ROLLS.rollEccentricity({ rng, orbitKind: "planet" })
		const rolledAxialTiltDeg =
			group === "asteroid belt" ? 0 : ROLLS.rollAxialTiltDeg(rng)
		const rolledMoonCount =
			group === "asteroid belt"
				? 0
				: MOON.rollMoonCountForParent({
						rng,
						parentGroup: group,
						parentSizeClass: sizeClass,
						orbitalDistanceAU,
					})
		// The gas-giant-moon slot always needs at least one moon to promote.
		const moonCount = isGasGiantMainWorld
			? Math.max(1, rolledMoonCount)
			: rolledMoonCount
		const moonSlotName = `orbit-${siblingIdx}`
		let moons = MOON_PLACEMENT.place({
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
			impactZone,
		})
		// enforceMoonTidalSafety can drop a rolled moon entirely -- retry with a
		// larger count so the gas-giant-moon slot always has one to promote.
		if (isGasGiantMainWorld) {
			let attempts = 0
			while (moons.length === 0 && attempts < 3) {
				attempts += 1
				moons = MOON_PLACEMENT.place({
					rng,
					moonCount: moonCount + attempts,
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
					impactZone,
				})
			}
		}
		const idx = siblingIdx
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
		// Promote the largest rolled moon into the main world -- everything else
		// about the gas giant's moon system stays exactly as rolled.
		const finalMoons = isGasGiantMainWorld
			? (() => {
					const promoteIdx = moonsWithTideLocks.reduce(
						(bestIdx, m, j, arr) =>
							m.diameterKm > arr[bestIdx]!.diameterKm ? j : bestIdx,
						0,
					)
					return moonsWithTideLocks.map((moon, i) =>
						i === promoteIdx
							? promoteMoonToMainWorld({ moon, rng, nameBody })
							: moon,
					)
				})()
			: moonsWithTideLocks
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
			classified: { group, classification },
			starAgeGyr,
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
		let tideLockTrace: TemperatureTraceEntry[] = []
		let finalEnvironment = environment
		// Skipped entirely for the gas-giant-moon slot -- its eccentricity and
		// rotation are forced to Earth's above, and a star-lock here would
		// silently override that.
		if (group !== "asteroid belt" && !isGasGiantMainWorld) {
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
				homeworld: false,
				rerollEccentricity: () =>
					ROLLS.rollEccentricity({ rng, orbitKind: "planet" }),
			})
			finalSiderealDayHours = tideLockResult.siderealDayHours
			finalAxialTiltDeg = tideLockResult.axialTiltDeg
			finalEccentricity = tideLockResult.eccentricity
			tideLock = tideLockResult.tideLock
			tideLockTrace = tideLockResult.trace
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
					starAgeGyr,
				})
			}
		}
		return {
			...finalEnvironment,
			idx,
			seed: `orbit-${siblingIdx + 1}`,
			name: nameBody(`orbit-${siblingIdx}`),
			isMainWorld: false,
			zone: slot.zone,
			impactZone,
			// texturePath/cloudsTexturePath are assigned later by
			// PLANET.applySystemSeismology, once the body's real
			// seismology-inclusive temperature (and any post-seismology
			// hydrosphere/classification change) is known -- see
			// seismology/index.ts's applyBodySeismology. Picking them here would
			// use a stale pre-seismology climate estimate.
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
			// Independently rolled, not derived from longitudeOfPerihelionDeg
			// above -- see OrbitBody.lsAphelionDeg's doc. For a procedurally
			// generated body neither angle has any real-world meaning, so
			// there's no "correct" value being risked by rolling them
			// separately; this just avoids quietly reusing one arbitrary
			// roll for two conceptually distinct purposes.
			lsAphelionDeg: rng.uniform(0, 360),
			axialTiltDeg: finalAxialTiltDeg,
			inclinationDeg:
				group === "asteroid belt" ? 0 : ORBIT_BODY.rollInclinationDeg(rng),
			longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
			tideLock,
			tideLockStatus: PLANET.deriveTideLockStatus({
				siderealDayHours: finalSiderealDayHours,
				orbitalPeriodDays,
				tideLock,
			}),
			tideLockTrace,
			substellarLon:
				tideLock?.type === "solar" ? rng.uniform(0, 360) : undefined,
			moons: finalMoons,
		}
	})

	// Surface-tide heating is itself just a display/classification refinement
	// on top of residual heating -- skipped under skipNaming along with naming,
	// since a bulk pre-generation pass has no more use for it than for names
	// until the system is actually opened (real generate always includes it).
	return PLANET.applySystemSeismology({
		bodies: bodies.sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU),
		starAgeGyr,
		starLuminositySol: luminositySol,
		spectralClass,
		...(params.skipNaming
			? {}
			: TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks({
					spectralClass,
					starSubtype,
				})),
	})
}

export const BODY_GENERATION = {
	generateSystemBodies,
}
