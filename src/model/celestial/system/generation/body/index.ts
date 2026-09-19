import { MOON } from "@/model/celestial/moons"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	TemperatureTraceEntry,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import { ASTEROID_BELT } from "@/model/celestial/system/generation/asteroid-belt"
import type { BeltCrossingInput } from "@/model/celestial/system/generation/asteroid-belt/types"
import type {
	BodyGenerationParams,
	RollBeltResidentBodyInput,
	RollYouthBeltWrapperInput,
} from "@/model/celestial/system/generation/body/types"
import { ENVIRONMENT } from "@/model/celestial/system/generation/environment"
import type { Slot } from "@/model/celestial/system/generation/environment/types"
import { IMPACT_EXPOSURE } from "@/model/celestial/system/generation/impact-exposure"
import type { ImpactExposureBeltInput } from "@/model/celestial/system/generation/impact-exposure/types"
import { MOON_PLACEMENT } from "@/model/celestial/system/generation/moon-placement"
import { ROLLS } from "@/model/celestial/system/generation/rolls"
import { SOL_SEED_BODIES } from "@/model/celestial/system/generation/sol-seed"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { SolPlanetSeed } from "@/model/celestial/system/sol-system/types"
import type { BeltProfile, SystemBody } from "@/model/celestial/system/types"
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

// A zone's fixed deviation pool can put a slot closer to the star than its
// own MAO allows (most often an M dwarf's epistellar zone, whose whole
// habitable-zone-scaled range can sit inside its dust-clearing radius), or
// farther out than a multi-star host's Hill-sphere stability ceiling allows
// (see maxOrbitalDistanceAU) -- both filtered out here, before any slot is
// even sampled, rather than clamping an already-rolled slot after the fact.
// If every deviation in a zone falls outside [minAU, maxAU] for this star,
// the zone is illegal for it and contributes no slots at all (rng.sample
// naturally returns fewer than requested from a shorter, or empty, pool).
function filterDeviationsInRange({
	deviations,
	luminositySol,
	minAU,
	maxAU,
}: {
	deviations: readonly number[]
	luminositySol: number
	minAU: number
	maxAU: number
}): number[] {
	return deviations.filter((deviation) => {
		const au = PLANET.deviationToAU({ deviation, luminositySol })
		return au >= minAU && au <= maxAU
	})
}

// Book's Significant Moon Quantity DM (p. 54) triggers when a planet's own
// slot is "adjacent" to a companion star's unavailability range or to a
// companion-driven outer ceiling -- "adjacent" means literally "within the
// spread distance," so this measures against this exact slot's own
// spreadOrbitNumber (Stage 8's real, post-exclusion-zone-growth spread),
// not an approximation.
function isAdjacentToCompanionExclusion({
	orbitalDistanceAU,
	spreadOrbitNumber,
	companionExclusionZonesAU,
	maxOrbitalDistanceAU,
}: {
	orbitalDistanceAU: number
	spreadOrbitNumber: number
	companionExclusionZonesAU: { minAU: number; maxAU: number }[]
	maxOrbitalDistanceAU: number
}): boolean {
	const orbitNumber = ORBIT_BODY.auToOrbitNumber({ au: orbitalDistanceAU })
	const isNear = (otherOrbitNumber: number) =>
		Math.abs(orbitNumber - otherOrbitNumber) <= spreadOrbitNumber
	if (
		companionExclusionZonesAU.some(
			(zone) =>
				isNear(ORBIT_BODY.auToOrbitNumber({ au: zone.minAU })) ||
				isNear(ORBIT_BODY.auToOrbitNumber({ au: zone.maxAU })),
		)
	) {
		return true
	}
	return (
		Number.isFinite(maxOrbitalDistanceAU) &&
		isNear(ORBIT_BODY.auToOrbitNumber({ au: maxOrbitalDistanceAU }))
	)
}

// Shared "roll a small body and place it in a belt" pipeline -- used by both
// the natural Ceres/Pallas-style belt dwarf loop and the protostar size-cap
// cascade (World Builder's Handbook p. 224), which differ only in group/
// sizeClass/eccentricity DM, not in how a belt resident's own stats are
// rolled.
function rollBeltResidentBody({
	rng,
	group,
	sizeClass,
	zone,
	orbitalDistanceAU,
	luminositySol,
	spectralClass,
	luminosityClass,
	starAgeGyr,
	starMassSol,
	proto,
	primordial,
	extraEccentricityDM = 0,
}: RollBeltResidentBodyInput): Pick<
	SystemBody,
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
	| "sizeClass"
	| "density"
	| "diameterKm"
	| "massKg"
	| "gravityG"
	| "siderealDayHours"
	| "eccentricity"
	| "axialTiltDeg"
	| "orbitalPeriodDays"
	| "inclinationDeg"
> {
	const classification = PLANET.classifyBody({
		rng,
		groupHint: group,
		impactZone: false,
		zone,
		orbitalDistanceAU,
		sizeClass,
		isMoon: false,
		tidal: false,
		forceMeltball: false,
	}).classification
	const assignment = PLANET.rollClassificationAssignment({
		rng,
		classification,
		sizeClass,
		zone,
		deviation: 0,
		spectralClass,
		isPrimaryWorld: false,
	})
	const diameterKm = ROLLS.rollDiameterKmFromSizeClass({ rng, sizeClass })
	const densityEarthRelative = ROLLS.pickDensityEarthRelative({
		rng,
		group,
		classification,
		sizeClass,
		orbitalDistanceAU,
		luminositySol,
		starAgeGyr,
	})
	const massKg = ORBIT_BODY.massKgFromEarthRelativeDensity({
		diameterKm,
		densityEarthRelative,
	})
	const siderealDayHours = ROLLS.rollSiderealDayHours({
		rng,
		isJovian: false,
		starAgeGyr,
	})
	const eccentricity = ROLLS.rollEccentricity({
		rng,
		orbitKind: "planet",
		protostar: proto,
		primordial: primordial && !proto,
		anomalyEccentricityDM: extraEccentricityDM,
	})
	const axialTiltDeg = ROLLS.rollAxialTiltDeg(rng)
	const orbitalPeriodDays =
		STAR.getKeplerYearYears({ orbitalDistanceAU, massSol: starMassSol }) *
		DAYS_PER_YEAR
	const environment = ENVIRONMENT.buildBodyEnvironment({
		rng,
		groupHint: group,
		zone,
		deviation: 0,
		spectralClass,
		luminosityClass,
		diameterKm,
		massKg,
		orbitalDistanceAU,
		isPrimaryWorld: false,
		isMoon: false,
		tidal: false,
		forceMeltball: false,
		assignment,
		classified: { group, classification },
		starAgeGyr,
		proto,
		primordial,
	})
	return {
		...environment,
		diameterKm,
		massKg,
		gravityG: ORBIT_BODY.computeGravityG({ massKg, diameterKm }),
		siderealDayHours,
		eccentricity,
		axialTiltDeg,
		orbitalPeriodDays,
		inclinationDeg: ORBIT_BODY.rollInclinationDeg(rng),
	}
}

// A belt spawned purely to hold a young-system slot's overflow -- either a
// protostar slot's entire real content (book p. 224's co-located belts,
// wrapping the slot unconditionally) or a primordial slot's size-cap cascade
// overflow only (book p. 226, spawned solely to hold the cascade, alongside
// -- not replacing -- the slot's own top-level body). Either way the belt
// itself is a plain, contentless "asteroid belt" group body; whatever it
// holds is linked in separately via beltOfIdx (see rollBeltResidentBody),
// the same mechanism already used for Ceres/Pallas-style belt dwarfs.
function rollYouthBeltWrapper({
	rng,
	zone,
	deviation,
	orbitalDistanceAU,
	luminositySol,
	spectralClass,
	luminosityClass,
	starAgeGyr,
	spreadOrbitNumber,
	hasAdjacentGasGiant,
	isOutermostOrbitSlot,
	primordial,
}: RollYouthBeltWrapperInput): Pick<
	SystemBody,
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
	| "sizeClass"
	| "density"
	| "belt"
> {
	const classification = PLANET.classifyBody({
		rng,
		groupHint: "asteroid belt",
		impactZone: false,
		zone,
		orbitalDistanceAU,
		sizeClass: -1,
		isMoon: false,
		tidal: false,
		forceMeltball: false,
	}).classification
	const assignment = PLANET.rollClassificationAssignment({
		rng,
		classification,
		sizeClass: -1,
		zone,
		deviation,
		spectralClass,
		isPrimaryWorld: false,
	})
	const environment = ENVIRONMENT.buildBodyEnvironment({
		rng,
		groupHint: "asteroid belt",
		zone,
		deviation,
		spectralClass,
		luminosityClass,
		diameterKm: 0,
		massKg: 0,
		orbitalDistanceAU,
		isPrimaryWorld: false,
		isMoon: false,
		tidal: false,
		assignment,
		classified: { group: "asteroid belt", classification },
		starAgeGyr,
	})
	const belt = ASTEROID_BELT.rollProfile({
		rng,
		orbitalDistanceAU,
		luminositySol,
		starAgeGyr,
		spreadOrbitNumber,
		hasAdjacentGasGiant,
		isOutermostOrbitSlot,
		primordial,
	})
	return { ...environment, belt }
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
	const { seed, mainWorldMode, starMassKgOverride, exactHZC } = params
	const hostStar = params.hostStar
	const spectralClass =
		hostStar?.spectralClass ?? params.spectralClass ?? STAR.defaultSpectralClass
	// Only ever meaningfully non-"V" for a dead-star host (a pulsar/magnetar
	// neutron star uses "P"/"M" -- see STAR.isPulsar/isMagnetar) -- forwarded
	// to the atmosphere pipeline for World Builder's Handbook p. 228's
	// pulsar/magnetar radioactive-taint rule.
	const luminosityClass = hostStar?.luminosityClass
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
		STAR.getStarLuminositySolExtended({
			cls: spectralClass,
			subtype: starSubtype,
		})
	const starMassKg =
		hostStar?.massSol !== undefined
			? hostStar.massSol * ORBIT_BODY.solarMassKg
			: (starMassKgOverride ?? ORBIT_BODY.solarMassKg)
	// Book's Minimum Allowable Orbit# (p. 19013 glossary entry): the closest a
	// world can form, inside of which the star's own dust-clearing has swept
	// the zone clear. Used below to filter each zone's deviation pool before
	// any slot is even sampled, rather than clamping an already-rolled slot
	// after the fact -- see filterDeviationsInRange.
	const maoAu =
		hostStar?.mao ??
		STAR.getStarMAO({
			cls: tableSpectralClass,
			subtype: starSubtype,
		})
	// Hill-sphere stability ceiling for a multi-star host (see
	// GenerateSystemBodiesParams.maxOrbitalDistanceAU's doc) -- absent (no
	// ceiling) for every single-star caller.
	const maxOrbitalDistanceAU =
		params.maxOrbitalDistanceAU ?? Number.POSITIVE_INFINITY
	const companionExclusionZonesAU = params.companionExclusionZonesAU ?? []

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

	const neutronStar = spectralClass === "NS"
	const brownDwarf = STAR.isBrownDwarf(spectralClass)
	const deadStar = STAR.isPostStellar(spectralClass)
	if (
		params.orbitSlots === undefined &&
		(params.isEpistellarCompanion === true ||
			(params.hasParent === true && rng.uniform(0, 1) > 0.5) ||
			(deadStar && rng.uniform(0, 1) > 0.2))
	) {
		return []
	}
	const epistellarCount = brownDwarf || deadStar ? 0 : rng.randint(0, 2)
	const innerCount =
		neutronStar || spectralClass === "T"
			? 0
			: rng.randint(1, deadStar || brownDwarf ? 1 : 3)
	const outerCount = rng.randint(1, deadStar || brownDwarf ? 2 : 5)

	// Filtered per-zone before sampling -- see filterDeviationsInRange. A
	// zone left with no legal deviations for this star (typically epistellar,
	// around a dim enough host, for the MAO floor; or an outer zone pushed
	// past a tight multi-star ceiling) simply contributes no slots:
	// rng.sample already returns fewer than requested from a shorter, or
	// empty, pool.
	const epistellarPool = filterDeviationsInRange({
		deviations: ENVIRONMENT.epistellarDeviations,
		luminositySol,
		minAU: maoAu,
		maxAU: maxOrbitalDistanceAU,
	})
	const innerPool = filterDeviationsInRange({
		deviations:
			mainWorldMode === "procedural"
				? ENVIRONMENT.innerDeviations
				: ENVIRONMENT.innerDeviations.filter((d) => d !== 0),
		luminositySol,
		minAU: maoAu,
		maxAU: maxOrbitalDistanceAU,
	})
	const outerPool = filterDeviationsInRange({
		deviations: ENVIRONMENT.outerDeviations,
		luminositySol,
		minAU: maoAu,
		maxAU: maxOrbitalDistanceAU,
	})

	const slots: Slot[] = params.orbitSlots
		? params.orbitSlots
				.filter((slot) => slot.type !== "empty")
				.map((slot) => {
					// Book's Belt Span DMs (p. 73) key off the belt's physical
					// neighbors, including empty orbits -- so this indexes into the
					// full, unfiltered params.orbitSlots (still ordered ascending by
					// orbitNumber), not the "empty"-filtered slots array above.
					const orbitSlotIndex = params.orbitSlots!.indexOf(slot)
					const innerNeighbor = params.orbitSlots![orbitSlotIndex - 1]
					const outerNeighbor = params.orbitSlots![orbitSlotIndex + 1]
					const pinBaselineToHZC =
						exactHZC && mainWorldMode !== "procedural" && slot.isBaseline
					const habitableZoneAU = STAR.getHabitableZoneAU(luminositySol)
					return {
						zone: pinBaselineToHZC ? "inner" : slot.zone!,
						deviation: pinBaselineToHZC ? 0 : slot.deviation!,
						orbitalDistanceAU: pinBaselineToHZC
							? habitableZoneAU
							: slot.orbitalDistanceAU!,
						groupHint:
							slot.type === "gas-giant"
								? "jovian"
								: slot.type === "belt"
									? "asteroid belt"
									: ROLLS.rollTerrestrialSubgroup({ rng, zone: slot.zone! }),
						trojanCount: slot.trojanCount,
						// Mirrors the legacy deviation-0 reservation, which was skipped
						// entirely under "procedural" (no guaranteed habitable body) --
						// only a non-"procedural" mode forces the baseline slot's body.
						isMainWorld: mainWorldMode !== "procedural" && slot.isBaseline,
						anomalousOrbitType: slot.anomalousOrbitType,
						spreadOrbitNumber: slot.spreadOrbitNumber,
						hasAdjacentGasGiant:
							innerNeighbor?.type === "gas-giant" ||
							outerNeighbor?.type === "gas-giant",
						isOutermostOrbitSlot:
							orbitSlotIndex === params.orbitSlots!.length - 1,
					}
				})
		: [
				...rng
					.sample(epistellarPool, epistellarCount)
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
						innerPool,
						mainWorldMode === "procedural"
							? innerCount
							: Math.max(0, innerCount - 1),
					)
					.map((deviation) => ({ zone: "inner" as const, deviation })),
				...rng
					.sample(outerPool, outerCount)
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
	// Ported from galaxy-gen's star.proto/star.primordial (stars/index.ts) --
	// derived inline rather than stored, since nothing outside this generation
	// pass needs them (see rollOrbitGroup's asteroid-belt weight boost and
	// buildBodyEnvironment's hydrosphere/atmosphere youth override below).
	const proto = STAR.isProto({ ageGyr: starAgeGyr, massSol: starMassSol })
	const primordial = STAR.isPrimordial({ ageGyr: starAgeGyr })
	// Book's Protostar Systems chapter (p. 224-225) keys its age-tiered
	// branching (gas-giant ring/size tiers, moon onset, terrestrial size cap)
	// off the system's age in Myr, not Gyr -- kept as a single derived value
	// here since every proto-specific roll below needs the same conversion.
	const starAgeMyr = starAgeGyr * 1000

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

	// Book pp. 224-227's protostar co-located belts, and both sections' own
	// size-cap cascades and (primordial-only) extra co-orbital planet, all
	// produce more `SystemBody` entries than the one-per-slot `bodies` array
	// below has room for -- collected here (rather than pushed directly into
	// `bodies`, which doesn't exist until the map below finishes) and
	// appended afterward, the same pattern the existing beltDwarfs loop
	// already uses for Ceres/Pallas-style belt residents. Every push
	// reserves its own final `idx` as `slots.length + youthAppendages.length`
	// at push time, so ordering here must exactly match the order this array
	// is later concatenated onto `bodies` (see the `bodies.push(...)` below,
	// which must run before beltDwarfs' own `bodies.length`-based idx math).
	const youthAppendages: SystemBody[] = []
	const bodies: SystemBody[] = slots.map((slot, siblingIdx) => {
		if (
			slot.isMainWorld &&
			mainWorldMode !== "gas-giant-moon" &&
			mainWorldMode !== "temperate-native"
		) {
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
				nearCompanionExclusion: isAdjacentToCompanionExclusion({
					orbitalDistanceAU,
					spreadOrbitNumber: slot.spreadOrbitNumber ?? 0,
					companionExclusionZonesAU,
					maxOrbitalDistanceAU,
				}),
			})
			const moonSlotName = `orbit-${siblingIdx}`
			const rolledMoons = MOON_PLACEMENT.place({
				rng,
				moonCount,
				diameterKm: builtMainWorld.diameterKm,
				parentSizeClass: earthSizeClass,
				orbitalDistanceAU,
				starMassKg,
				group: "terrestrial",
				isPrimaryWorld: true,
				zone: slot.zone,
				deviation: slot.deviation,
				spectralClass,
				starAgeGyr,
				luminositySol,
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
		const isGasGiantMainWorld =
			slot.isMainWorld === true && mainWorldMode === "gas-giant-moon"
		// The galaxy capital-homeworld slot: a normally rolled body, but forced
		// into guaranteed-habitable ranges below (see "temperate-native").
		const isHomeworld =
			slot.isMainWorld === true && mainWorldMode === "temperate-native"
		const isPrimaryWorld = isGasGiantMainWorld || isHomeworld
		// Book pp. 224-225: every protostar-system slot's real content gets
		// wrapped in a co-located belt -- except the forced main-world slots
		// (a literal Earth clone / promoted gas-giant moon has no book-proto
		// treatment) and a slot that's already naturally an asteroid belt
		// (nothing to wrap).
		const group = isHomeworld
			? ("terrestrial" as const)
			: isGasGiantMainWorld
				? ("jovian" as const)
				: (slot.groupHint ??
					ROLLS.rollOrbitGroup({
						rng,
						zone: slot.zone,
						postStellar: deadStar,
						starAgeGyr,
						proto,
						primordial,
					}))
		const isProtoSlot =
			proto && !isHomeworld && !isGasGiantMainWorld && group !== "asteroid belt"
		// Book p. 226: a primordial slot's own top-level body is never
		// belt-wrapped (unlike protostar) -- only its size-cap cascade (Stage
		// PM4) and the independent 1-in-6 extra co-orbital planet (Stage PM5)
		// add anything beyond the ordinary per-slot body.
		const isPrimordialSlot =
			primordial &&
			!proto &&
			!isHomeworld &&
			!isGasGiantMainWorld &&
			group !== "asteroid belt"
		let orbitalDistanceAU = PLANET.deviationToAU({
			deviation: slot.deviation,
			luminositySol,
		})
		if (slot.orbitalDistanceAU !== undefined) {
			orbitalDistanceAU = slot.orbitalDistanceAU
		}
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
			if (candidateAu > maoAu) {
				forceMeltball = true
				orbitalDistanceAU = candidateAu
			}
		}
		// Book p. 224: under 2 Myr, a gas giant that has formed at all is
		// "medium size or smaller" -- demote a rolled medium tier to small.
		// Gas giants are exempt from the size-cap cascade below (jovian never
		// hits the "difference between final size and current size as
		// indicated by age" rule, which is stated as terrestrial/moon-only).
		let sizeClass: number
		let cascadeCount = 0
		if (isHomeworld) {
			sizeClass = rng.randint(7, 9)
		} else if (group === "jovian") {
			const rolled = ROLLS.rollSizeClass({ rng, group })
			sizeClass = isProtoSlot && starAgeMyr < 2 && rolled === 17 ? 16 : rolled
		} else if (isProtoSlot) {
			// Book p. 224's terrestrial/moon size cap = system age in Myr, with
			// a cascade of `1D-1`-smaller bodies for every unit the roll
			// exceeds it -- sizeClass is clamped to the cap *before* diameter/
			// density/mass/gravity are derived from it (see
			// baseline-spread-placement-redesign.md's sibling plan doc), so
			// every downstream physical quantity reflects the capped size, not
			// the pre-clamp roll.
			const capSizeClass = Math.max(0, Math.floor(starAgeMyr))
			const rolled = ROLLS.rollSizeClass({ rng, group })
			cascadeCount = Math.max(0, rolled - capSizeClass)
			sizeClass = Math.min(rolled, capSizeClass)
		} else if (isPrimordialSlot) {
			// Book p. 226: identical size-cap formula to protostar's, but the
			// cascade die is a plain `1D` (Stage PM4), not `1D-1` -- see the
			// cascade-member loop below, which is the only place that
			// distinction actually matters.
			const capSizeClass = Math.max(0, Math.floor(starAgeMyr))
			const rolled = ROLLS.rollSizeClass({ rng, group })
			cascadeCount = Math.max(0, rolled - capSizeClass)
			sizeClass = Math.min(rolled, capSizeClass)
		} else {
			sizeClass = ROLLS.rollSizeClass({ rng, group })
		}
		const impactZone = impactZoneSlots.has(slot)
		const classification = isHomeworld
			? ("tectonic" as const)
			: PLANET.classifyBody({
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
						sizeClass,
						orbitalDistanceAU,
						luminositySol,
						starAgeGyr,
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
					: isHomeworld
						? Math.max(
								16,
								Math.min(
									40,
									ROLLS.rollSiderealDayHours({
										rng,
										isJovian: false,
										starAgeGyr,
									}),
								),
							)
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
		// Book's Anomalous Orbit Type table (p. 50-51): +2 for random/inclined/
		// retrograde, +5 for eccentric, applied to this slot's eccentricity
		// roll -- see rollEccentricity's anomalyEccentricityDM.
		const anomalyEccentricityDM =
			slot.anomalousOrbitType === "eccentric"
				? 5
				: slot.anomalousOrbitType === "random" ||
						slot.anomalousOrbitType === "inclined" ||
						slot.anomalousOrbitType === "retrograde"
					? 2
					: 0
		const eccentricity =
			group === "asteroid belt"
				? 0
				: isGasGiantMainWorld
					? EARTH_SEED.eccentricity
					: isHomeworld
						? Math.min(
								ROLLS.rollEccentricity({
									rng,
									orbitKind: "planet",
									protostar: proto,
									primordial: primordial && !proto,
								}),
								0.05,
							)
						: ROLLS.rollEccentricity({
								rng,
								orbitKind: "planet",
								anomalyEccentricityDM,
								protostar: proto,
								primordial: primordial && !proto,
							})
		const rolledAxialTiltDeg =
			group === "asteroid belt"
				? 0
				: isHomeworld
					? rng.uniform(10, 30)
					: ROLLS.rollAxialTiltDeg(rng)
		// Book p. 224: under 2 Myr, "no significant moons have formed" yet.
		const rolledMoonCount =
			group === "asteroid belt" || (isProtoSlot && starAgeMyr < 2)
				? 0
				: MOON.rollMoonCountForParent({
						rng,
						parentGroup: group,
						parentSizeClass: sizeClass,
						orbitalDistanceAU,
						nearCompanionExclusion: isAdjacentToCompanionExclusion({
							orbitalDistanceAU,
							spreadOrbitNumber: slot.spreadOrbitNumber ?? 0,
							companionExclusionZonesAU,
							maxOrbitalDistanceAU,
						}),
					})
		// World Builder's Handbook pp. 72-75's Planetoid Belt Characteristics.
		const belt: BeltProfile | undefined =
			group === "asteroid belt"
				? ASTEROID_BELT.rollProfile({
						rng,
						orbitalDistanceAU,
						luminositySol,
						starAgeGyr,
						spreadOrbitNumber: slot.spreadOrbitNumber,
						hasAdjacentGasGiant: slot.hasAdjacentGasGiant ?? false,
						isOutermostOrbitSlot: slot.isOutermostOrbitSlot ?? false,
						primordial: primordial && !proto,
					})
				: undefined
		// The gas-giant-moon slot always needs at least one moon to promote.
		const moonCount = isGasGiantMainWorld
			? Math.max(1, rolledMoonCount)
			: rolledMoonCount
		const moonSlotName = `orbit-${siblingIdx}`
		let moons = MOON_PLACEMENT.place({
			rng,
			moonCount,
			diameterKm,
			parentSizeClass: sizeClass,
			orbitalDistanceAU,
			starMassKg,
			group,
			isPrimaryWorld,
			zone: slot.zone,
			deviation: slot.deviation,
			spectralClass,
			starAgeGyr,
			luminositySol,
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
					parentSizeClass: sizeClass,
					orbitalDistanceAU,
					starMassKg,
					group,
					isPrimaryWorld,
					zone: slot.zone,
					deviation: slot.deviation,
					spectralClass,
					starAgeGyr,
					luminositySol,
					massKg,
					moonSlotName,
					nameBody,
					impactZone,
				})
			}
		}
		// A proto-wrapped slot's real content isn't the top-level body returned
		// for this slot position (the wrapping belt is, see the isProtoSlot
		// branch at the end of this callback) -- it's appended to
		// youthAppendages afterward, so its idx must anticipate that final
		// position instead of this slot's own position.
		const idx = isProtoSlot ? slots.length + youthAppendages.length : siblingIdx
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
		const environment = isHomeworld
			? ENVIRONMENT.buildForcedClassificationEnvironment({
					rng,
					classification: "tectonic",
					sizeClass,
					zone: slot.zone,
					deviation: slot.deviation,
					spectralClass,
					diameterKm,
					massKg,
					isPrimaryWorld: true,
					starAgeGyr,
					homeworld: true,
				})
			: ENVIRONMENT.buildBodyEnvironment({
					rng,
					groupHint: group,
					zone: slot.zone,
					deviation: slot.deviation,
					spectralClass,
					luminosityClass,
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
					proto,
					primordial,
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
				// A capital homeworld still rolls for tide lock, but `homeworld`
				// forces a dm-0 "broke" reroll on any full 1:1 lock -- so a full
				// lock is rare while a rolled partial spin-down / 3:2 resonance
				// still applies.
				homeworld: isHomeworld,
				rerollEccentricity: () =>
					isHomeworld
						? Math.min(
								ROLLS.rollEccentricity({
									rng,
									orbitKind: "planet",
									protostar: proto,
									primordial: primordial && !proto,
								}),
								0.05,
							)
						: ROLLS.rollEccentricity({
								rng,
								orbitKind: "planet",
								protostar: proto,
								primordial: primordial && !proto,
							}),
			})
			finalSiderealDayHours = tideLockResult.siderealDayHours
			finalAxialTiltDeg = tideLockResult.axialTiltDeg
			finalEccentricity = tideLockResult.eccentricity
			tideLock = tideLockResult.tideLock
			tideLockTrace = tideLockResult.trace
			if (
				tideLockResult.starLocked &&
				!isHomeworld &&
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
		const memberBody: SystemBody = {
			...finalEnvironment,
			idx,
			seed: isHomeworld ? "main-world" : `orbit-${siblingIdx + 1}`,
			name: isHomeworld
				? nameBody("main-world")
				: nameBody(`orbit-${siblingIdx}`),
			isMainWorld: isHomeworld,
			// A capital homeworld gets a preset full-sapience biosphere with no
			// compatibility label -- identical shape to Earth's own seed
			// (SOL_DATA's EARTH_SEED.biosphere) -- so seismology keeps it verbatim
			// instead of re-rolling and tacking on a miscible/hybrid label.
			biosphere: isHomeworld ? { code: 10, trace: [] } : undefined,
			zone: slot.zone,
			impactZone,
			beltOfIdx: isProtoSlot ? siblingIdx : undefined,
			// texturePath/cloudsTexturePath are assigned later by
			// PLANET.applySystemSeismology, once the body's real
			// seismology-inclusive temperature (and any post-seismology
			// hydrosphere/classification change) is known -- see
			// seismology/index.ts's applyBodySeismology. Picking them here would
			// use a stale pre-seismology climate estimate.
			rings: ROLLS.rollPlanetRings({
				rng,
				group: finalEnvironment.group,
				protostar: isProtoSlot,
			}),
			orbitalDistanceAU,
			belt,
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
			// Book's Inclined/Retrograde Orbit procedures (p. 51) use their own
			// inclination formula instead of the ordinary Inclination table --
			// retrograde adds 90 degrees on top (see rollAnomalousInclinationDeg).
			inclinationDeg:
				group === "asteroid belt"
					? 0
					: slot.anomalousOrbitType === "inclined"
						? ROLLS.rollAnomalousInclinationDeg({ rng })
						: slot.anomalousOrbitType === "retrograde"
							? ROLLS.rollAnomalousInclinationDeg({ rng }) + 90
							: ORBIT_BODY.rollInclinationDeg(rng),
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
		if (isProtoSlot) {
			// Book pp. 224-225: this slot's real content (memberBody, above)
			// becomes a beltOfIdx-linked resident of a co-located belt instead of
			// an independent top-level body, with one additional smaller
			// resident per unit of size-cap difference (cascadeCount, computed
			// alongside memberBody's own sizeClass above).
			youthAppendages.push(memberBody)
			for (let c = 0; c < cascadeCount; c++) {
				// Book p. 224's cascade die is `1D-1`.
				const cascadeSizeClass = Math.max(
					0,
					Math.floor(starAgeMyr) - (rng.randint(1, 6) - 1),
				)
				const cascadeIdx = slots.length + youthAppendages.length
				const cascadeResident = rollBeltResidentBody({
					rng,
					group,
					sizeClass: cascadeSizeClass,
					zone: slot.zone,
					orbitalDistanceAU,
					luminositySol,
					spectralClass,
					luminosityClass,
					starAgeGyr,
					starMassSol,
					proto,
					primordial,
					extraEccentricityDM: 2,
				})
				youthAppendages.push({
					...cascadeResident,
					idx: cascadeIdx,
					seed: `orbit-${siblingIdx}-cascade-${c + 1}`,
					name: nameBody(`orbit-${siblingIdx}-cascade-${c + 1}`),
					isMainWorld: false,
					zone: slot.zone,
					impactZone: false,
					beltOfIdx: siblingIdx,
					// Spread variance -- a cascade member sits near, not exactly on,
					// the slot's own orbital distance (book p. 224's "placed with
					// spread variance").
					orbitalDistanceAU: orbitalDistanceAU * rng.uniform(0.97, 1.03),
					longitudeOfPerihelionDeg: rng.uniform(0, 360),
					lsAphelionDeg: rng.uniform(0, 360),
					longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
					tideLock: null,
					tideLockStatus: PLANET.deriveTideLockStatus({
						siderealDayHours: cascadeResident.siderealDayHours,
						orbitalPeriodDays: cascadeResident.orbitalPeriodDays,
						tideLock: null,
					}),
					tideLockTrace: [],
					moons: [],
				})
			}
			const wrapper = rollYouthBeltWrapper({
				rng,
				zone: slot.zone,
				deviation: slot.deviation,
				orbitalDistanceAU,
				luminositySol,
				spectralClass,
				luminosityClass,
				starAgeGyr,
				spreadOrbitNumber: slot.spreadOrbitNumber,
				hasAdjacentGasGiant: slot.hasAdjacentGasGiant ?? false,
				isOutermostOrbitSlot: slot.isOutermostOrbitSlot ?? false,
			})
			return {
				...wrapper,
				idx: siblingIdx,
				seed: `orbit-${siblingIdx + 1}`,
				name: nameBody(`orbit-${siblingIdx}`),
				isMainWorld: false,
				biosphere: undefined,
				zone: slot.zone,
				impactZone,
				rings: undefined,
				orbitalDistanceAU,
				diameterKm: 0,
				massKg: 0,
				gravityG: 0,
				orbitalPeriodDays,
				siderealDayHours: 0,
				eccentricity: 0,
				longitudeOfPerihelionDeg: rng.uniform(0, 360),
				lsAphelionDeg: rng.uniform(0, 360),
				axialTiltDeg: 0,
				inclinationDeg: 0,
				longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
				tideLock: null,
				tideLockStatus: PLANET.deriveTideLockStatus({
					siderealDayHours: 0,
					orbitalPeriodDays,
					tideLock: null,
				}),
				tideLockTrace: [],
				substellarLon: undefined,
				moons: [],
			}
		}
		if (isPrimordialSlot) {
			// Book p. 226: unlike protostar, memberBody stays this slot's own
			// top-level body -- only the size-cap cascade's overflow (if any)
			// needs a belt, spawned here purely to hold it.
			if (cascadeCount > 0) {
				const cascadeBeltIdx = slots.length + youthAppendages.length
				const cascadeBeltWrapper = rollYouthBeltWrapper({
					rng,
					zone: slot.zone,
					deviation: slot.deviation,
					orbitalDistanceAU,
					luminositySol,
					spectralClass,
					luminosityClass,
					starAgeGyr,
					spreadOrbitNumber: slot.spreadOrbitNumber,
					hasAdjacentGasGiant: slot.hasAdjacentGasGiant ?? false,
					isOutermostOrbitSlot: slot.isOutermostOrbitSlot ?? false,
					primordial: true,
				})
				youthAppendages.push({
					...cascadeBeltWrapper,
					idx: cascadeBeltIdx,
					seed: `orbit-${siblingIdx}-cascade-belt`,
					name: nameBody(`orbit-${siblingIdx}-cascade-belt`),
					isMainWorld: false,
					biosphere: undefined,
					zone: slot.zone,
					impactZone: false,
					rings: undefined,
					orbitalDistanceAU,
					diameterKm: 0,
					massKg: 0,
					gravityG: 0,
					orbitalPeriodDays,
					siderealDayHours: 0,
					eccentricity: 0,
					longitudeOfPerihelionDeg: rng.uniform(0, 360),
					lsAphelionDeg: rng.uniform(0, 360),
					axialTiltDeg: 0,
					inclinationDeg: 0,
					longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
					tideLock: null,
					tideLockStatus: PLANET.deriveTideLockStatus({
						siderealDayHours: 0,
						orbitalPeriodDays,
						tideLock: null,
					}),
					tideLockTrace: [],
					substellarLon: undefined,
					moons: [],
				})
				for (let c = 0; c < cascadeCount; c++) {
					// Book p. 226's cascade die is a plain `1D` (no `-1`).
					const cascadeSizeClass = Math.max(
						0,
						Math.floor(starAgeMyr) - rng.randint(1, 6),
					)
					const cascadeIdx = slots.length + youthAppendages.length
					const cascadeResident = rollBeltResidentBody({
						rng,
						group,
						sizeClass: cascadeSizeClass,
						zone: slot.zone,
						orbitalDistanceAU,
						luminositySol,
						spectralClass,
						luminosityClass,
						starAgeGyr,
						starMassSol,
						proto,
						primordial,
						extraEccentricityDM: 2,
					})
					youthAppendages.push({
						...cascadeResident,
						idx: cascadeIdx,
						seed: `orbit-${siblingIdx}-cascade-${c + 1}`,
						name: nameBody(`orbit-${siblingIdx}-cascade-${c + 1}`),
						isMainWorld: false,
						zone: slot.zone,
						impactZone: false,
						beltOfIdx: cascadeBeltIdx,
						// Spread variance -- a cascade member sits near, not exactly
						// on, the slot's own orbital distance (book p. 226's "placed
						// with spread variance").
						orbitalDistanceAU: orbitalDistanceAU * rng.uniform(0.97, 1.03),
						longitudeOfPerihelionDeg: rng.uniform(0, 360),
						lsAphelionDeg: rng.uniform(0, 360),
						longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
						tideLock: null,
						tideLockStatus: PLANET.deriveTideLockStatus({
							siderealDayHours: cascadeResident.siderealDayHours,
							orbitalPeriodDays: cascadeResident.orbitalPeriodDays,
							tideLock: null,
						}),
						tideLockTrace: [],
						moons: [],
					})
				}
			}
			// Book p. 226: independent of the cascade above, every gas-giant/
			// terrestrial slot in a primordial system has a flat 1-in-6 chance
			// of one more Size-1D planet sharing the same basic orbit. The
			// book gives this new planet's size, not its group, so its group is
			// derived from its own rolled size (PLANET.classifyGroup) rather
			// than inherited from the host slot -- a "Size 1D" roll (1-6) never
			// lands in this codebase's jovian sizeClass range (16-18), so a
			// jovian slot's extra planet is never itself another gas giant.
			if (
				(group === "jovian" || group === "terrestrial") &&
				rng.randint(1, 6) === 6
			) {
				const extraSizeClass = rng.randint(1, 6)
				const extraGroup = PLANET.classifyGroup({
					sizeClass: extraSizeClass,
				})
				const extraOrbitalDistanceAU = orbitalDistanceAU * rng.uniform(0.9, 1.1)
				const extraIdx = slots.length + youthAppendages.length
				const extraResident = rollBeltResidentBody({
					rng,
					group: extraGroup,
					sizeClass: extraSizeClass,
					zone: slot.zone,
					orbitalDistanceAU: extraOrbitalDistanceAU,
					luminositySol,
					spectralClass,
					luminosityClass,
					starAgeGyr,
					starMassSol,
					proto,
					primordial,
					extraEccentricityDM: 3,
				})
				youthAppendages.push({
					...extraResident,
					idx: extraIdx,
					seed: `orbit-${siblingIdx}-co-orbital`,
					name: nameBody(`orbit-${siblingIdx}-co-orbital`),
					isMainWorld: false,
					zone: slot.zone,
					impactZone: false,
					coOrbital: true,
					orbitalDistanceAU: extraOrbitalDistanceAU,
					longitudeOfPerihelionDeg: rng.uniform(0, 360),
					lsAphelionDeg: rng.uniform(0, 360),
					longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
					tideLock: null,
					tideLockStatus: PLANET.deriveTideLockStatus({
						siderealDayHours: extraResident.siderealDayHours,
						orbitalPeriodDays: extraResident.orbitalPeriodDays,
						tideLock: null,
					}),
					tideLockTrace: [],
					moons: [],
				})
			}
		}
		return memberBody
	})
	// Pushed before the belt-dwarf loop below so its own bodies.length-based
	// idx math (dwarfIdx) already accounts for these -- see youthAppendages'
	// own idx precomputation (slots.length + youthAppendages.length at push
	// time) inside the map above, which this ordering keeps consistent.
	bodies.push(...youthAppendages)

	// Real-body asteroid-belt residents: an asteroid belt occasionally hosts
	// one or two protoplanet-sized dwarf worlds embedded within it (a
	// procedural Ceres/Pallas), instead of always being pure debris. Each is
	// a full SystemBody (own stats/wiki card, group "dwarf") flagged via
	// beltOfIdx to render on the belt's own ring radius instead of its own
	// independently packed orbit slot -- see SystemBody.beltOfIdx's doc and
	// Ceres/Pallas in sol-system/data/index.ts.
	const BELT_DWARF_CHANCE = 0.35
	const beltDwarfs: SystemBody[] = []
	for (const belt of bodies) {
		if (belt.group !== "asteroid belt") continue
		if (rng.uniform(0, 1) > BELT_DWARF_CHANCE) continue
		const dwarfCount = rng.randint(1, 2)
		for (let i = 0; i < dwarfCount; i++) {
			const dwarfIdx = bodies.length + beltDwarfs.length
			// Belt residents skew much smaller than free-orbiting dwarf planets
			// (most real belt dwarfs are Ceres/Pallas-scale, not Pluto-scale) --
			// weighted toward sizeClass 0, with 1 rare and 2-4 rarer still.
			const sizeClass = rng.weightedChoice([
				{ v: 0, w: 8 },
				{ v: 1, w: 2 },
			])
			const resident = rollBeltResidentBody({
				rng,
				group: "dwarf",
				sizeClass,
				zone: belt.zone,
				orbitalDistanceAU: belt.orbitalDistanceAU,
				luminositySol,
				spectralClass,
				luminosityClass,
				starAgeGyr,
				starMassSol,
				proto,
				primordial,
			})
			beltDwarfs.push({
				...resident,
				idx: dwarfIdx,
				seed: `belt-${belt.idx}-dwarf-${i + 1}`,
				name: nameBody(`belt-${belt.idx}-dwarf-${i + 1}`),
				isMainWorld: false,
				zone: belt.zone,
				impactZone: false,
				beltOfIdx: belt.idx,
				orbitalDistanceAU: belt.orbitalDistanceAU,
				longitudeOfPerihelionDeg: rng.uniform(0, 360),
				lsAphelionDeg: rng.uniform(0, 360),
				longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
				tideLock: null,
				tideLockStatus: PLANET.deriveTideLockStatus({
					siderealDayHours: resident.siderealDayHours,
					orbitalPeriodDays: resident.orbitalPeriodDays,
					tideLock: null,
				}),
				tideLockTrace: [],
				moons: [],
			})
		}
	}
	bodies.push(...beltDwarfs)

	if (params.orbitSlots !== undefined) {
		const trojans: SystemBody[] = []
		for (const [slotIndex, slot] of slots.entries()) {
			const host = bodies[slotIndex]
			if (!host || slot.trojanCount === undefined) continue
			for (let trojanIndex = 0; trojanIndex < slot.trojanCount; trojanIndex++) {
				const idx = bodies.length + trojans.length
				// A real trojan shares its target's orbit (same ellipse, offset
				// ±60° in longitude), not the target's own physical identity --
				// only the orbital elements below are cloned; everything else
				// (size, classification, composition, atmosphere, rotation) is
				// independently rolled via rollBeltResidentBody, the same
				// pipeline every other independently-placed small body uses.
				const trojanSizeClass = ROLLS.rollSizeClass({
					rng,
					group: host.group,
				})
				const resident = rollBeltResidentBody({
					rng,
					group: host.group,
					sizeClass: trojanSizeClass,
					zone: host.zone,
					orbitalDistanceAU: host.orbitalDistanceAU,
					luminositySol,
					spectralClass,
					luminosityClass,
					starAgeGyr,
					starMassSol,
					proto,
					primordial,
				})
				trojans.push({
					...resident,
					idx,
					seed: `trojan-${host.idx}-${trojanIndex + 1}`,
					name: nameBody(`trojan-${host.idx}-${trojanIndex + 1}`),
					isMainWorld: false,
					zone: host.zone,
					impactZone: false,
					moons: [],
					trojan: true,
					trojanOffsetDeg: rng.randint(1, 6) <= 3 ? -60 : 60,
					trojanOfIdx: host.idx,
					// Cloned orbital stats -- see the doc above.
					orbitalDistanceAU: host.orbitalDistanceAU,
					eccentricity: host.eccentricity,
					inclinationDeg: host.inclinationDeg,
					orbitalPeriodDays: host.orbitalPeriodDays,
					longitudeOfPerihelionDeg: host.longitudeOfPerihelionDeg,
					longitudeOfAscendingNodeDeg: host.longitudeOfAscendingNodeDeg,
					lsAphelionDeg: rng.uniform(0, 360),
					rings: ROLLS.rollPlanetRings({ rng, group: resident.group }),
					tideLock: null,
					tideLockStatus: PLANET.deriveTideLockStatus({
						siderealDayHours: resident.siderealDayHours,
						orbitalPeriodDays: host.orbitalPeriodDays,
						tideLock: null,
					}),
					tideLockTrace: [],
					substellarLon: undefined,
				})
			}
		}
		bodies.push(...trojans)
	}

	// Every belt in the system contributes debris flux to every other body --
	// not just belts a body's own eccentric orbit crosses -- so this is
	// computed against the full, final belt list, after belt dwarfs/trojans
	// are in place.
	const finalizedBelts = bodies.filter(
		(body): body is SystemBody & { belt: BeltProfile } =>
			body.group === "asteroid belt" && body.belt !== undefined,
	)
	const beltsForImpactExposure: ImpactExposureBeltInput[] = finalizedBelts.map(
		(belt) => ({
			orbitalDistanceAU: belt.orbitalDistanceAU,
			bulk: belt.belt.bulk,
		}),
	)
	const beltsForCrossing: BeltCrossingInput[] = finalizedBelts.map((belt) => ({
		orbitalDistanceAU: belt.orbitalDistanceAU,
		spanOrbitNumber: belt.belt.spanOrbitNumber,
	}))
	const bodiesWithImpactExposure = bodies.map((body) => {
		if (body.group === "asteroid belt") return body
		// A moon shares its parent planet's star-orbit rather than having its
		// own, so it inherits this unchanged -- same pattern as impactZone.
		const asteroidImpacts = ASTEROID_BELT.crossesAnyBelt({
			bodyOrbitalDistanceAU: body.orbitalDistanceAU,
			bodyEccentricity: body.eccentricity,
			belts: beltsForCrossing,
		})
		return {
			...body,
			impactExposure: IMPACT_EXPOSURE.computeForBody({
				bodyOrbitalDistanceAU: body.orbitalDistanceAU,
				belts: beltsForImpactExposure,
			}),
			asteroidImpacts,
			moons: body.moons.map((moon) => ({ ...moon, asteroidImpacts })),
		}
	})

	// Surface-tide heating is itself just a display/classification refinement
	// on top of residual heating -- skipped under skipNaming along with naming,
	// since a bulk pre-generation pass has no more use for it than for names
	// until the system is actually opened (real generate always includes it).
	return PLANET.applySystemSeismology({
		bodies: bodiesWithImpactExposure.sort(
			(a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU,
		),
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
