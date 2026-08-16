import { MOON } from "@/model/celestial/moons"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type {
	BuildPlanetOptions,
	SolMoonSeed,
	SolPlanetSeed,
} from "@/model/celestial/system/sol-system/types"
import type {
	SolarSystemState,
	SystemBody,
} from "@/model/celestial/system/types"
import { RNG } from "@/model/shared/random/rng"
import { TIME } from "@/model/shared/time"

function estimateGasGiantInternalHeatTempK({
	massEarths,
	ageGyr,
}: {
	massEarths: number
	ageGyr: number
}): number {
	return (113.6 * massEarths ** 0.25) / ageGyr
}

function rng(seedTag: number) {
	return RNG.createRng({ seed: 1_000_000 + seedTag })
}

function rollExtras(seedTag: number) {
	const r = rng(seedTag)
	return {
		inclinationDeg: ORBIT_BODY.rollInclinationDeg(r),
		longitudeOfAscendingNodeDeg: r.uniform(0, 360),
		longitudeOfPerihelionDeg: r.uniform(0, 360),
		meanAnomalyAtEpochDeg: r.uniform(0, 360),
	}
}

function buildMoon({
	seed,
	idx,
	seedTag,
}: {
	seed: SolMoonSeed
	idx: number
	seedTag: number
}): MoonBody {
	const rolled = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * ORBIT_BODY.earthDiameterKm
	return {
		idx,
		name: seed.name,
		texturePath: seed.texturePath,
		massKg: seed.massEarths * ORBIT_BODY.earthMassKg,
		diameterKm,
		sizeClass: MOON.estimateMoonSizeClassFromDiameter(diameterKm),
		density: {
			earthRelative: seed.densityEarthRelative,
			description: seed.densityDescription,
		},
		group: seed.group,
		classification: seed.classification,
		landCoverage: seed.landCoverage,
		hydrosphereCode: PLANET.hydrosphereCodeFromWaterPct(
			(1 - seed.landCoverage) * 100,
		),
		atmosphere: seed.atmosphere,
		orbitalPeriodDays: seed.rotationHours / TIME.hoursPerDay,
		// Real named moons here are (like nearly every major moon in our own
		// solar system) tidally locked, so this happens to equal the orbital
		// period above — but it's the moon's actual sidereal rotation period
		// from the ported data, not derived from orbitalPeriodDays.
		siderealDayHours: seed.rotationHours,
		eccentricity: seed.eccentricity,
		inclinationDeg: seed.inclinationDeg ?? rolled.inclinationDeg,
		longitudeOfAscendingNodeDeg:
			seed.longitudeOfAscendingNodeDeg ?? rolled.longitudeOfAscendingNodeDeg,
		longitudeOfPerihelionDeg:
			seed.longitudeOfPerihelionDeg ?? rolled.longitudeOfPerihelionDeg,
		meanAnomalyAtEpochDeg:
			seed.meanAnomalyAtEpochDeg ?? rolled.meanAnomalyAtEpochDeg,
		axialTiltDeg: seed.tiltDeg,
		orbitRange: seed.orbitRange,
		semiMajorAxisPlanetDiameters: seed.pd,
		albedo: seed.albedo,
		greenhouseFactor: seed.greenhouseFactor,
	}
}

// The single body-hydration path for every Sol body, real or live: Mercury
// through Pluto hydrate straight from their fixed SolPlanetSeed entries, and
// the main world (Earth, or a procedurally generated homeworld) hydrates
// from a freshly-built live seed object whose physical params get
// overwritten with the user's current UI state before each call -- see
// generate-system-bodies.ts's buildMainWorldSeed.
function buildPlanet({
	seed,
	seedTag,
	idx,
	/** Static seed hydration needs no overrides; live main worlds pass only
	 * the star/moon/texture values that differ from the Sol table. */
	options,
}: {
	seed: SolPlanetSeed
	seedTag: number
	idx: number
	options?: BuildPlanetOptions
}): SystemBody {
	const rolled = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * ORBIT_BODY.earthDiameterKm
	const massKg = seed.massEarths * ORBIT_BODY.earthMassKg
	const orbitalPeriodDays =
		STAR.getKeplerYearYears({
			orbitalDistanceAU: seed.au,
			massSol: options?.starMassSol ?? 1,
		}) * TIME.astronomicalDaysPerYear
	const moons = (
		options?.moonsOverride
			? MOON.attachParentTideLocks({
					moons: options.moonsOverride,
					parentIdx: idx,
				})
			: MOON.attachParentTideLocks({
					moons: (seed.moons ?? []).map((moonSeed, i) =>
						buildMoon({
							seed: moonSeed,
							idx: i + 1,
							seedTag: seedTag * 100 + i + 1,
						}),
					),
					parentIdx: idx,
				})
	).map((moon) => ({
		...moon,
		tideLockStatus: PLANET.deriveTideLockStatus({
			siderealDayHours: moon.siderealDayHours,
			orbitalPeriodDays: moon.orbitalPeriodDays,
			tideLock: moon.tideLock,
		}),
	}))
	const internalHeatTempK =
		seed.group === "jovian"
			? estimateGasGiantInternalHeatTempK({
					massEarths: seed.massEarths,
					ageGyr: SOL_DATA.solStarAgeGyr,
				})
			: 0
	return {
		idx,
		seed:
			seed.seed ??
			(seed.name
				? seed.name.toLowerCase()
				: seed.isMainWorld
					? "world"
					: `orbit-${Math.max(0, idx) + 1}`),
		tideLock: seed.tideLock,
		tideLockStatus: PLANET.deriveTideLockStatus({
			siderealDayHours: seed.rotationHours,
			orbitalPeriodDays,
			tideLock: seed.tideLock,
		}),
		substellarLon: seed.substellarLon,
		name: seed.name,
		sizeClass:
			seed.group === "asteroid belt"
				? -1
				: PLANET.estimatePlanetarySizeClass({
						diameterKm,
						isGasGiant: seed.group === "jovian",
					}),
		density:
			seed.group === "asteroid belt"
				? null
				: {
						earthRelative: seed.densityEarthRelative,
						description: seed.densityDescription,
					},
		group: seed.group,
		zone: PLANET.zoneFromDeviation(
			PLANET.estimateDeviationFromOrbitalDistance({
				orbitalDistanceAU: seed.au,
				luminositySol: 1,
			}),
		),
		classification: seed.classification,
		texturePath: options?.textureOverride ?? seed.texturePath,
		cloudsTexturePath: seed.cloudsTexturePath,
		rings: SOL_DATA.solPlanetRingsByName[seed.name],
		landDistribution: seed.landDistribution,
		landCoverage: seed.landCoverage,
		hydrosphereCode:
			seed.group === "jovian"
				? 13
				: PLANET.hydrosphereCodeFromWaterPct((1 - seed.landCoverage) * 100),
		continentSizeVariety: seed.continentSizeVariety,
		seaLevel: seed.seaLevel,
		maxElevation: seed.maxElevation,
		atmosphere: seed.atmosphere ?? null,
		isMainWorld: seed.isMainWorld ?? false,
		orbitalDistanceAU: seed.au,
		diameterKm,
		massKg,
		gravityG: seed.gravityG,
		orbitalPeriodDays,
		siderealDayHours: seed.rotationHours,
		eccentricity: seed.eccentricity,
		longitudeOfPerihelionDeg:
			seed.longitudeOfPerihelionDeg ?? rolled.longitudeOfPerihelionDeg,
		lsAphelionDeg: seed.lsAphelionDeg,
		axialTiltDeg: seed.tiltDeg,
		inclinationDeg: seed.inclinationDeg ?? rolled.inclinationDeg,
		longitudeOfAscendingNodeDeg:
			seed.longitudeOfAscendingNodeDeg ?? rolled.longitudeOfAscendingNodeDeg,
		moons,
		albedo: seed.albedo,
		greenhouseFactor: seed.greenhouseFactor,
		internalHeatTempK,
		biosphere: seed.biosphere,
	}
}

const EARTH_SEED = SOL_DATA.solPlanetSeeds.find((seed) => seed.isMainWorld)
if (!EARTH_SEED) throw new Error("SOL_PLANET_SEEDS is missing its Earth entry")
const LUNA_SEED = EARTH_SEED.moons?.[0]
if (!LUNA_SEED)
	throw new Error("Earth's SOL_PLANET_SEEDS entry is missing Luna")

const SOL_BODIES_BY_SEED_NAME = new Map(
	SOL_DATA.solPlanetSeeds.map((seed, i) => [
		seed.name,
		seed.isMainWorld ? -1 : i,
	]),
)

const SOL_SYSTEM_BODIES_RAW: SystemBody[] = SOL_DATA.solPlanetSeeds
	.map((seed, i) => {
		const body = buildPlanet({
			seed,
			seedTag: i + 1,
			idx: seed.isMainWorld ? -1 : i,
		})
		// Resolves Ceres/Pallas's parentBeltName into the built Asteroid Belt
		// body's own idx -- see SystemBody.beltOfIdx's doc. Not a moon: this is
		// a real planet-class body sharing the belt's ring, not the belt's
		// `moons` array.
		if (seed.parentBeltName) {
			const beltIdx = SOL_BODIES_BY_SEED_NAME.get(seed.parentBeltName)
			if (beltIdx === undefined) {
				throw new Error(
					`SolPlanetSeed "${seed.name}" references unknown parentBeltName "${seed.parentBeltName}"`,
				)
			}
			body.beltOfIdx = beltIdx
		}
		return body
	})
	.sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU)

const solSystemBodies: SystemBody[] = PLANET.applySystemSeismology({
	bodies: SOL_SYSTEM_BODIES_RAW,
	starAgeGyr: SOL_DATA.solStarAgeGyr,
	starLuminositySol: 1,
	spectralClass: "G",
})

const solDefaultSolarSystem: SolarSystemState = {
	star: {
		class: "G",
		subtype: 2,
		seed: "sol",
		ageGyr: SOL_DATA.solStarAgeGyr,
	},
	orbits: solSystemBodies,
}

// Centralized default parameters for Earth (the main world) and Luna (its
// default moon) -- planetRadiusKm/obliquity/eccentricity/orbitalDistanceAU/
// hoursPerDay/perihelion/albedo/greenhouseFactor come straight from the seed
// entry above; the rest (daysPerYear/pressureBar/substellarLon/moonCount,
// and the terrain-generation defaults below) are UI-slider-default-only
// concepts with no equivalent on any other (non-editable) Sol body, so they
// stay here rather than on the seed.
const solMainWorldDefaults = {
	name: EARTH_SEED.name,
	isMainWorld: true,
	planetRadiusKm: (EARTH_SEED.diameterEarths * ORBIT_BODY.earthDiameterKm) / 2,
	obliquity: EARTH_SEED.tiltDeg,
	eccentricity: EARTH_SEED.eccentricity,
	orbitalDistanceAU: EARTH_SEED.au,
	daysPerYear: 365,
	hoursPerDay: EARTH_SEED.rotationHours,
	pressureBar: 1,
	substellarLon: 0,
	perihelion: EARTH_SEED.lsAphelionDeg,
	inclinationDeg: EARTH_SEED.inclinationDeg ?? 0,
	moonCount: EARTH_SEED.moons?.length ?? 1,
	albedo: EARTH_SEED.albedo,
	greenhouseFactor: EARTH_SEED.greenhouseFactor,
	landCoverage: EARTH_SEED.landCoverage,
	/** Terrain-generation defaults (not orbital/climate data, but centralized
	 * here alongside the rest of Earth's defaults so nothing duplicates
	 * these numbers elsewhere). */
	seaLevel: 1,
	/** 1 - landDistribution, i.e. what the UI calls "Land/Ocean
	 * Concentration" -- see sliders.ts. */
	landConcentration: 0.75,
	maxElevation: 6000,
	volcanism: 1,
} as const

const SOL_LUNA_BUILT: MoonBody = MOON.attachParentTideLocks({
	moons: [buildMoon({ seed: LUNA_SEED, idx: 1, seedTag: 0 })],
	parentIdx: -1,
})[0]!
const solLunaDefault: MoonBody = {
	...SOL_LUNA_BUILT,
	tideLockStatus: PLANET.deriveTideLockStatus({
		siderealDayHours: SOL_LUNA_BUILT.siderealDayHours,
		orbitalPeriodDays: SOL_LUNA_BUILT.orbitalPeriodDays,
		tideLock: SOL_LUNA_BUILT.tideLock,
	}),
}

export const SOL_SYSTEM = {
	buildPlanet,
	solSystemBodies,
	solDefaultSolarSystem,
	solMainWorldDefaults,
	solLunaDefault,
}
