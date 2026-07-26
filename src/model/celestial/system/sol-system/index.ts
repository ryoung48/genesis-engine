import { ASTRONOMICAL_DAYS_PER_YEAR, HOURS_PER_DAY } from "@/model/shared"
import { createRng } from "@/model/shared/rng"
import type { MoonBody } from "../../moons"
import { MOON } from "../../moons"
import { EARTH_DIAMETER_KM, EARTH_MASS_KG } from "../../orbit-body"
import { PLANET } from "../../planet"
import { STAR } from "../../star"
import type { SolarSystemState, SystemBody } from "../types"
import type { SolMoonSeed, SolPlanetSeed } from "./data"
import {
	SOL_PLANET_RINGS_BY_NAME,
	SOL_PLANET_SEEDS,
	SOL_STAR_AGE_GYR,
} from "./data"

export {
	SOL_EARTH_CLOUDS_TEXTURE_PATH,
	SOL_EARTH_TEXTURE_PATH,
	SOL_MAIN_WORLD_NAME,
	SOL_PLANET_RINGS_BY_NAME,
	SOL_PLANET_SEEDS,
	SOL_SEED,
	SOL_STAR_AGE_GYR,
	SOL_STAR_NAME,
	type SolMoonSeed,
	type SolPlanetSeed,
} from "./data"

// biome-ignore lint/nursery/useMaxParams: pending domain params-object conversion
function estimateGasGiantInternalHeatTempK(
	massEarths: number,
	ageGyr: number,
): number {
	return (113.6 * massEarths ** 0.25) / ageGyr
}

function rng(seedTag: number) {
	return createRng(1_000_000 + seedTag)
}

function rollExtras(seedTag: number) {
	const r = rng(seedTag)
	return {
		inclinationDeg: MOON.rollInclinationDeg(r),
		longitudeOfAscendingNodeDeg: r.uniform(0, 360),
		longitudeOfPerihelionDeg: r.uniform(0, 360),
		meanAnomalyAtEpochDeg: r.uniform(0, 360),
	}
}

// biome-ignore lint/nursery/useMaxParams: pending domain params-object conversion
function buildMoon(seed: SolMoonSeed, idx: number, seedTag: number): MoonBody {
	const rolled = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	return {
		idx,
		name: seed.name,
		texturePath: seed.texturePath,
		massKg: seed.massEarths * EARTH_MASS_KG,
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
		orbitalPeriodDays: seed.rotationHours / HOURS_PER_DAY,
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

interface BuildPlanetOptions {
	/** Real orbital period needs the actual star's mass -- 1 (Sol) for the
	 * static bodies here, but the main world can orbit an arbitrary
	 * procedurally-generated star. Defaults to 1. */
	starMassSol?: number
	/** The main world's moons come from a live generation pipeline (already-
	 * built MoonBody), not this file's static SolMoonSeed table -- bypasses
	 * the seed.moons -> buildMoon() hydration below when supplied. */
	moonsOverride?: MoonBody[]
	/** Overrides the seed-authored texture -- only the real Sol seed's Earth
	 * gets its real texture; a live main world under a different star
	 * doesn't. */
	textureOverride?: string
}

// The single body-hydration path for every Sol body, real or live: Mercury
// through Pluto hydrate straight from their fixed SolPlanetSeed entries, and
// the main world (Earth, or a procedurally generated homeworld) hydrates
// from a freshly-built live seed object whose physical params get
// overwritten with the user's current UI state before each call -- see
// generate-system-bodies.ts's buildMainWorldSeed.
// biome-ignore lint/nursery/useMaxParams: pending domain params-object conversion
function buildPlanet(
	seed: SolPlanetSeed,
	seedTag: number,
	idx: number,
	/** Static seed hydration needs no overrides; live main worlds pass only
	 * the star/moon/texture values that differ from the Sol table. */
	options?: BuildPlanetOptions,
): SystemBody {
	const rolled = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	const massKg = seed.massEarths * EARTH_MASS_KG
	const orbitalPeriodDays =
		STAR.getKeplerYearYears({
			orbitalDistanceAU: seed.au,
			massSol: options?.starMassSol ?? 1,
		}) * ASTRONOMICAL_DAYS_PER_YEAR
	const moons = (
		options?.moonsOverride
			? MOON.attachParentTideLocks({
					moons: options.moonsOverride,
					parentIdx: idx,
				})
			: MOON.attachParentTideLocks({
					moons: (seed.moons ?? []).map(
						// biome-ignore lint/nursery/useMaxParams: native Array callback signature
						(moonSeed, i) => buildMoon(moonSeed, i + 1, seedTag * 100 + i + 1),
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
			? estimateGasGiantInternalHeatTempK(seed.massEarths, SOL_STAR_AGE_GYR)
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
		rings: SOL_PLANET_RINGS_BY_NAME[seed.name],
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
		axialTiltDeg: seed.tiltDeg,
		inclinationDeg: seed.inclinationDeg ?? rolled.inclinationDeg,
		longitudeOfAscendingNodeDeg: rolled.longitudeOfAscendingNodeDeg,
		moons,
		albedo: seed.albedo,
		greenhouseFactor: seed.greenhouseFactor,
		internalHeatTempK,
	}
}

export const SOL_SYSTEM = {
	buildMoon,
	buildPlanet,
	estimateGasGiantInternalHeatTempK,
}

const EARTH_SEED = SOL_PLANET_SEEDS.find((seed) => seed.isMainWorld)
if (!EARTH_SEED) throw new Error("SOL_PLANET_SEEDS is missing its Earth entry")
const LUNA_SEED = EARTH_SEED.moons?.[0]
if (!LUNA_SEED)
	throw new Error("Earth's SOL_PLANET_SEEDS entry is missing Luna")

const SOL_SYSTEM_BODIES_RAW: SystemBody[] = SOL_PLANET_SEEDS.map(
	// biome-ignore lint/nursery/useMaxParams: native Array callback signature
	(seed, i) => buildPlanet(seed, i + 1, seed.isMainWorld ? -1 : i),
).sort(
	// biome-ignore lint/nursery/useMaxParams: native Array callback signature
	(a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU,
)

export const SOL_SYSTEM_BODIES: SystemBody[] = PLANET.applySystemSeismology({
	bodies: SOL_SYSTEM_BODIES_RAW,
	starAgeGyr: SOL_STAR_AGE_GYR,
	starLuminositySol: 1,
	spectralClass: "G",
})

export const SOL_DEFAULT_SOLAR_SYSTEM: SolarSystemState = {
	star: {
		class: "G",
		subtype: 2,
		seed: "sol",
	},
	orbits: SOL_SYSTEM_BODIES,
}

// Centralized default parameters for Earth (the main world) and Luna (its
// default moon) -- planetRadiusKm/obliquity/eccentricity/orbitalDistanceAU/
// hoursPerDay/perihelion/albedo/greenhouseFactor come straight from the seed
// entry above; the rest (daysPerYear/pressureBar/substellarLon/moonCount,
// and the terrain-generation defaults below) are UI-slider-default-only
// concepts with no equivalent on any other (non-editable) Sol body, so they
// stay here rather than on the seed.
export const SOL_MAIN_WORLD_DEFAULTS = {
	name: EARTH_SEED.name,
	isMainWorld: true,
	planetRadiusKm: (EARTH_SEED.diameterEarths * EARTH_DIAMETER_KM) / 2,
	obliquity: EARTH_SEED.tiltDeg,
	eccentricity: EARTH_SEED.eccentricity,
	orbitalDistanceAU: EARTH_SEED.au,
	daysPerYear: 365,
	hoursPerDay: EARTH_SEED.rotationHours,
	pressureBar: 1,
	substellarLon: 0,
	perihelion: EARTH_SEED.longitudeOfPerihelionDeg ?? 102,
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
	moons: [buildMoon(LUNA_SEED, 1, 0)],
	parentIdx: -1,
})[0]!
export const SOL_LUNA_DEFAULT: MoonBody = {
	...SOL_LUNA_BUILT,
	tideLockStatus: PLANET.deriveTideLockStatus({
		siderealDayHours: SOL_LUNA_BUILT.siderealDayHours,
		orbitalPeriodDays: SOL_LUNA_BUILT.orbitalPeriodDays,
		tideLock: SOL_LUNA_BUILT.tideLock,
	}),
}
