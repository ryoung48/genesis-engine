import type {
	AtmosphereProfile,
	MoonOrbitRange,
	MoonParams,
} from "@/model/celestial/moons/moon-types"
import { rollInclinationDeg } from "@/model/celestial/moons/orbital-mechanics"
import { getKeplerYearYears } from "@/model/celestial/star/star-types"
import { createRng } from "@/model/shared/rng"
import type { SystemBody } from "./generate-system-bodies"

// Ported from galaxy-gen's src/model/system/sol/data.ts (SOL_PLANETS). Earth
// is intentionally omitted — the caller's own main-world params always stand
// in for it at the habitable-zone center. Real orbital inclination/ascending
// node/periapsis values aren't part of the ported data (galaxy-gen only
// tracks a display `angle`), so those are rolled the same way any other
// generated body's are, seeded per-body for determinism.

const EARTH_DIAMETER_KM = 12742
const EARTH_MASS_KG = 5.972e24

export const SOL_SEED = 0

const SOL_PLANET_TEXTURE_BY_NAME: Partial<Record<string, string>> = {
	Mercury: "/2k_mercury.jpg",
	Venus: "/2k_venus.jpg",
	Mars: "/2k_mars.jpg",
	Jupiter: "/2k_jupiter.jpg",
	Saturn: "/2k_saturn.jpg",
	Uranus: "/2k_uranus.jpg",
	Neptune: "/2k_neptune.jpg",
	Pluto: "/pluto.jpg",
}

const SOL_PLANET_RINGS_BY_NAME: Partial<Record<string, SystemBody["rings"]>> = {
	Saturn: {
		innerRadiusRelative: 1.52,
		outerRadiusRelative: 2.08,
		color: 0xd8c69a,
		opacity: 0.52,
	},
}

interface SolMoonSeed {
	name: string
	group: SystemBody["group"]
	classification: SystemBody["classification"]
	diameterEarths: number
	massEarths: number
	gravityG: number
	densityEarthRelative: number
	densityDescription: string
	rotationHours: number
	tiltDeg: number
	eccentricity: number
	pd: number
	orbitRange: MoonOrbitRange
	atmosphere?: AtmosphereProfile
	hydrosphereFraction: number
}

interface SolPlanetSeed {
	name: string
	group: SystemBody["group"]
	classification: SystemBody["classification"]
	au: number
	diameterEarths: number
	massEarths: number
	gravityG: number
	densityEarthRelative: number
	densityDescription: string
	rotationHours: number
	tiltDeg: number
	eccentricity: number
	atmosphere?: AtmosphereProfile
	hydrosphereFraction: number
	moons?: SolMoonSeed[]
}

function rng(seedTag: number) {
	return createRng(1_000_000 + seedTag)
}

function rollExtras(seedTag: number) {
	const r = rng(seedTag)
	return {
		inclinationDeg: rollInclinationDeg(r),
		longitudeOfAscendingNodeDeg: r.uniform(0, 360),
		argumentOfPeriapsisDeg: r.uniform(0, 360),
		meanAnomalyAtEpochDeg: r.uniform(0, 360),
	}
}

const SOL_PLANET_SEEDS: SolPlanetSeed[] = [
	{
		name: "Mercury",
		group: "dwarf",
		classification: "rockball",
		au: 0.387,
		diameterEarths: 0.383,
		massEarths: 0.0553,
		gravityG: 0.378,
		densityEarthRelative: 0.984,
		densityDescription: "Rock and Metal",
		rotationHours: 1407.6,
		tiltDeg: 0.03,
		eccentricity: 0.2056,
		atmosphere: { code: 1, pressureBar: 0.01, type: "trace", breathable: false },
		hydrosphereFraction: 0,
	},
	{
		name: "Venus",
		group: "terrestrial",
		classification: "telluric",
		au: 0.723,
		diameterEarths: 0.9495,
		massEarths: 0.815,
		gravityG: 0.904,
		densityEarthRelative: 0.952,
		densityDescription: "Rock and Metal",
		rotationHours: 5832.43,
		tiltDeg: 177.36,
		eccentricity: 0.0068,
		atmosphere: { code: 12, pressureBar: 92, type: "corrosive", subtype: "very dense", breathable: false },
		hydrosphereFraction: 0,
	},
	{
		name: "Mars",
		group: "terrestrial",
		classification: "arid",
		au: 1.524,
		diameterEarths: 0.532,
		massEarths: 0.1074,
		gravityG: 0.379,
		densityEarthRelative: 0.713,
		densityDescription: "Mostly Rock",
		rotationHours: 24.62,
		tiltDeg: 25.19,
		eccentricity: 0.0934,
		atmosphere: { code: 1, pressureBar: 0.006, type: "trace", breathable: false },
		hydrosphereFraction: 0.1,
		moons: [
			{
				name: "Phobos",
				group: "dwarf",
				classification: "asteroid",
				diameterEarths: 0.0035,
				massEarths: 0.000000018,
				gravityG: 0.00058,
				densityEarthRelative: 0.34,
				densityDescription: "Exotic Ice",
				rotationHours: 7.65,
				tiltDeg: 0,
				eccentricity: 0.0151,
				pd: 2.76,
				orbitRange: "inner",
				hydrosphereFraction: 0,
			},
			{
				name: "Deimos",
				group: "dwarf",
				classification: "asteroid",
				diameterEarths: 0.0019,
				massEarths: 0.0000000025,
				gravityG: 0.00031,
				densityEarthRelative: 0.26,
				densityDescription: "Exotic Ice",
				rotationHours: 30.35,
				tiltDeg: 0,
				eccentricity: 0.0002,
				pd: 6.92,
				orbitRange: "middle",
				hydrosphereFraction: 0,
			},
		],
	},
	{
		name: "Asteroid Belt",
		group: "asteroid belt",
		classification: "asteroid belt",
		au: 2.77,
		diameterEarths: 0,
		massEarths: 0,
		gravityG: 0,
		densityEarthRelative: 0,
		densityDescription: "",
		rotationHours: 0,
		tiltDeg: 0,
		eccentricity: 0,
		hydrosphereFraction: 0,
	},
	{
		name: "Jupiter",
		group: "jovian",
		classification: "jovian",
		au: 5.2,
		diameterEarths: 11.209,
		massEarths: 317.83,
		gravityG: 2.528,
		densityEarthRelative: 0.241,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 9.93,
		tiltDeg: 3.13,
		eccentricity: 0.049,
		atmosphere: { code: 17, pressureBar: 4200, type: "gas", subtype: "hydrogen", breathable: false },
		hydrosphereFraction: 1,
		moons: [
			{
				name: "Io",
				group: "dwarf",
				classification: "geo-tidal",
				diameterEarths: 0.286,
				massEarths: 0.015,
				gravityG: 0.183,
				densityEarthRelative: 0.64,
				densityDescription: "Mostly Rock",
				rotationHours: 42.46,
				tiltDeg: 0.04,
				eccentricity: 0.0041,
				pd: 2.95,
				orbitRange: "inner",
				hydrosphereFraction: 0,
			},
			{
				name: "Europa",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.245,
				massEarths: 0.008,
				gravityG: 0.134,
				densityEarthRelative: 0.546,
				densityDescription: "Mostly Ice",
				rotationHours: 85.23,
				tiltDeg: 0.1,
				eccentricity: 0.0094,
				pd: 4.69,
				orbitRange: "inner",
				hydrosphereFraction: 0.8,
			},
			{
				name: "Ganymede",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.413,
				massEarths: 0.025,
				gravityG: 0.146,
				densityEarthRelative: 0.352,
				densityDescription: "Mostly Ice",
				rotationHours: 171.71,
				tiltDeg: 0.33,
				eccentricity: 0.0013,
				pd: 7.49,
				orbitRange: "middle",
				hydrosphereFraction: 0.8,
			},
			{
				name: "Callisto",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.378,
				massEarths: 0.018,
				gravityG: 0.126,
				densityEarthRelative: 0.337,
				densityDescription: "Mostly Ice",
				rotationHours: 400.54,
				tiltDeg: 0.19,
				eccentricity: 0.0074,
				pd: 13.17,
				orbitRange: "middle",
				hydrosphereFraction: 0.8,
			},
		],
	},
	{
		name: "Saturn",
		group: "jovian",
		classification: "jovian",
		au: 9.58,
		diameterEarths: 9.449,
		massEarths: 95.16,
		gravityG: 1.065,
		densityEarthRelative: 0.125,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 10.66,
		tiltDeg: 26.73,
		eccentricity: 0.0565,
		atmosphere: { code: 17, pressureBar: 2600, type: "gas", subtype: "hydrogen", breathable: false },
		hydrosphereFraction: 1,
		moons: [
			{
				name: "Enceladus",
				group: "dwarf",
				classification: "geo-tidal",
				diameterEarths: 0.0395,
				massEarths: 0.000018,
				gravityG: 0.0114,
				densityEarthRelative: 0.294,
				densityDescription: "Mostly Ice",
				rotationHours: 32.88,
				tiltDeg: 0,
				eccentricity: 0.0047,
				pd: 1.97,
				orbitRange: "inner",
				hydrosphereFraction: 0.8,
			},
			{
				name: "Titan",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.404,
				massEarths: 0.0225,
				gravityG: 0.14,
				densityEarthRelative: 0.341,
				densityDescription: "Mostly Ice",
				rotationHours: 382.68,
				tiltDeg: 0.3,
				eccentricity: 0.0288,
				pd: 10.14,
				orbitRange: "middle",
				atmosphere: { code: 13, pressureBar: 1.45, type: "exotic", subtype: "very dense", breathable: false },
				hydrosphereFraction: 0.4,
			},
		],
	},
	{
		name: "Uranus",
		group: "jovian",
		classification: "jovian",
		au: 19.22,
		diameterEarths: 4.007,
		massEarths: 14.54,
		gravityG: 0.886,
		densityEarthRelative: 0.231,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 17.24,
		tiltDeg: 97.8,
		eccentricity: 0.0464,
		atmosphere: { code: 17, pressureBar: 1300, type: "gas", subtype: "hydrogen", breathable: false },
		hydrosphereFraction: 1,
		moons: [
			{
				name: "Titania",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.124,
				massEarths: 0.00059,
				gravityG: 0.038,
				densityEarthRelative: 0.312,
				densityDescription: "Mostly Ice",
				rotationHours: 209.31,
				tiltDeg: 0.08,
				eccentricity: 0.0011,
				pd: 8.53,
				orbitRange: "middle",
				hydrosphereFraction: 0.6,
			},
			{
				name: "Oberon",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.119,
				massEarths: 0.0005,
				gravityG: 0.036,
				densityEarthRelative: 0.296,
				densityDescription: "Mostly Ice",
				rotationHours: 323.11,
				tiltDeg: 0.07,
				eccentricity: 0.0014,
				pd: 11.42,
				orbitRange: "middle",
				hydrosphereFraction: 0.6,
			},
		],
	},
	{
		name: "Neptune",
		group: "jovian",
		classification: "jovian",
		au: 30.047,
		diameterEarths: 3.883,
		massEarths: 17.15,
		gravityG: 1.137,
		densityEarthRelative: 0.297,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 16.11,
		tiltDeg: 28.32,
		eccentricity: 0.009,
		atmosphere: { code: 17, pressureBar: 1500, type: "gas", subtype: "hydrogen", breathable: false },
		hydrosphereFraction: 1,
		moons: [
			{
				name: "Triton",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.212,
				massEarths: 0.0036,
				gravityG: 0.08,
				densityEarthRelative: 0.376,
				densityDescription: "Mostly Ice",
				rotationHours: 141.04,
				tiltDeg: 156.8,
				eccentricity: 0,
				pd: 7.16,
				orbitRange: "middle",
				atmosphere: { code: 1, pressureBar: 0.02, type: "trace", breathable: false },
				hydrosphereFraction: 0.8,
			},
		],
	},
	{
		name: "Pluto",
		group: "dwarf",
		classification: "snowball",
		au: 39.482,
		diameterEarths: 0.186,
		massEarths: 0.0022,
		gravityG: 0.063,
		densityEarthRelative: 0.336,
		densityDescription: "Mostly Ice",
		rotationHours: 153.3,
		tiltDeg: 119.6,
		eccentricity: 0.248,
		atmosphere: { code: 1, pressureBar: 0.03, type: "trace", breathable: false },
		hydrosphereFraction: 0.8,
		moons: [
			{
				name: "Charon",
				group: "dwarf",
				classification: "snowball",
				diameterEarths: 0.095,
				massEarths: 0.00025,
				gravityG: 0.029,
				densityEarthRelative: 0.309,
				densityDescription: "Mostly Ice",
				rotationHours: 153.3,
				tiltDeg: 0,
				eccentricity: 0,
				pd: 8.24,
				orbitRange: "middle",
				hydrosphereFraction: 0.6,
			},
		],
	},
]

function buildMoon(seed: SolMoonSeed, idx: number, seedTag: number): MoonParams {
	const extras = rollExtras(seedTag)
	return {
		idx,
		massKg: seed.massEarths * EARTH_MASS_KG,
		diameterKm: seed.diameterEarths * EARTH_DIAMETER_KM,
		densityEarthRelative: seed.densityEarthRelative,
		densityDescription: seed.densityDescription,
		group: seed.group,
		classification: seed.classification,
		hydrosphereFraction: seed.hydrosphereFraction,
		atmosphere: seed.atmosphere,
		orbitalPeriodDays: seed.rotationHours / 24,
		eccentricity: seed.eccentricity,
		inclinationDeg: extras.inclinationDeg,
		longitudeOfAscendingNodeDeg: extras.longitudeOfAscendingNodeDeg,
		argumentOfPeriapsisDeg: extras.argumentOfPeriapsisDeg,
		meanAnomalyAtEpochDeg: extras.meanAnomalyAtEpochDeg,
		axialTiltDeg: seed.tiltDeg,
		retrogradeRotation: false,
		orbitRange: seed.orbitRange,
		semiMajorAxisPlanetDiameters: seed.pd,
	}
}

function buildPlanet(seed: SolPlanetSeed, seedTag: number): SystemBody {
	const extras = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	const massKg = seed.massEarths * EARTH_MASS_KG
	const orbitalPeriodDays = getKeplerYearYears(seed.au, 1) * 365.25
	const moons = (seed.moons ?? []).map((moonSeed, i) =>
		buildMoon(moonSeed, i + 1, seedTag * 100 + i + 1),
	)
	return {
		sizeClass:
			seed.group === "asteroid belt"
				? -1
				: Math.round((diameterKm - 400) / 1600),
		density:
			seed.group === "asteroid belt"
				? null
				: {
						earthRelative: seed.densityEarthRelative,
						description: seed.densityDescription,
					},
		group: seed.group,
		classification: seed.classification,
		texturePath: SOL_PLANET_TEXTURE_BY_NAME[seed.name],
		rings: SOL_PLANET_RINGS_BY_NAME[seed.name],
		hydrosphereFraction: seed.hydrosphereFraction,
		atmosphere: seed.atmosphere ?? null,
		isMainWorld: false,
		orbitalDistanceAU: seed.au,
		diameterKm,
		massKg,
		gravityG: seed.gravityG,
		orbitalPeriodDays,
		dayLengthHours: seed.rotationHours,
		eccentricity: seed.eccentricity,
		argumentOfPeriapsisDeg: extras.argumentOfPeriapsisDeg,
		axialTiltDeg: seed.tiltDeg,
		inclinationDeg: extras.inclinationDeg,
		longitudeOfAscendingNodeDeg: extras.longitudeOfAscendingNodeDeg,
		moons,
	}
}

export const SOL_SYSTEM_BODIES: SystemBody[] = SOL_PLANET_SEEDS.map(
	(seed, i) => buildPlanet(seed, i + 1),
)
