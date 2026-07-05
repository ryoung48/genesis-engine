import type {
	AtmosphereProfile,
	MoonOrbitRange,
	MoonParams,
} from "@/model/celestial/moons/moon-types"
import {
	attachParentTideLocks,
	estimateMoonSizeClassFromDiameter,
	rollInclinationDeg,
} from "@/model/celestial/moons/moon-utils"
import { getKeplerYearYears } from "@/model/celestial/star/star-types"
import { createRng } from "@/model/shared/rng"
import type { SystemBody } from "./generate-system-bodies"
import { estimatePlanetarySizeClass } from "./size-class"

// Ported from galaxy-gen's src/model/system/sol/data.ts (SOL_PLANETS). Earth
// is intentionally omitted — the caller's own main-world params always stand
// in for it at the habitable-zone center. Real orbital inclination/ascending
// node/periapsis values aren't part of the ported data (galaxy-gen only
// tracks a display `angle`), so those are rolled the same way any other
// generated body's are, seeded per-body for determinism.

const EARTH_DIAMETER_KM = 12742
const EARTH_MASS_KG = 5.972e24

export const SOL_SEED = 0
export const SOL_STAR_AGE_GYR = 4.6
export const SOL_STAR_NAME = "Sol"
export const SOL_MAIN_WORLD_NAME = "Earth"
export const SOL_MAIN_WORLD_DEFAULTS = {
	name: SOL_MAIN_WORLD_NAME,
	planetRadiusKm: EARTH_DIAMETER_KM / 2,
	obliquity: 23.5,
	eccentricity: 0.0167,
	orbitalDistanceAU: 1,
	daysPerYear: 365,
	hoursPerDay: 24,
	pressureBar: 1,
	antistellarLon: 180,
	perihelion: 102,
	moonCount: 1,
} as const

export const SOL_LUNA_DEFAULT: MoonParams = {
	idx: 1,
	name: "Luna",
	massKg: 7.34e22,
	diameterKm: 3474,
	sizeClass: 2,
	densityEarthRelative: 0.607,
	densityDescription: "Mostly Rock",
	group: "dwarf",
	classification: "rockball",
	hydrosphereFraction: 0,
	atmosphere: {
		code: 0,
		pressureBar: 0,
		type: "vacuum",
		breathable: false,
	},
	orbitalPeriodDays: 27.3,
	siderealDayHours: 27.3 * 24,
	eccentricity: 0.055,
	inclinationDeg: 5.1,
	longitudeOfAscendingNodeDeg: 0,
	argumentOfPeriapsisDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	axialTiltDeg: 6.7,
	orbitRange: "middle",
	semiMajorAxisPlanetDiameters: 30.17,
	albedo: 0.12,
	greenhouseFactor: 0,
}

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
	/** Bond albedo, 0..1 (real measured/estimated value). */
	albedo: number
	/** EBM greenhouseFactor -- see SolPlanetSeed.greenhouseFactor doc. Only
	 * fit for moons with a real, well-characterized atmosphere (Titan);
	 * zero (no meaningful real greenhouse effect) for airless/trace-
	 * atmosphere moons, same as Mercury. */
	greenhouseFactor: number
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
	/** Bond albedo, 0..1 (real measured value; NASA planetary fact sheets). */
	albedo: number
	/**
	 * EBM greenhouseFactor, individually fit per body so the model's simulated
	 * average matches its real known surface temperature (see
	 * ebm/index.ts's EBMConfig.greenhouseFactor doc) -- not derived from a
	 * formula, and not comparable in magnitude between bodies (a thick
	 * atmosphere's fitted value isn't a scaled-up version of a thin one's).
	 * For the gas/ice giants this is fit AFTER internalHeatTempK is applied,
	 * so it represents the lapse-rate/opacity gap between the effective
	 * (radiating) temperature and the deeper "1-bar level" temperature used
	 * as the real-world target -- structurally the same role it plays for
	 * Earth, just not usually called "greenhouse" for a gas giant.
	 */
	greenhouseFactor: number
}

/**
 * Intrinsic formation-heat temperature (K) for a gas giant, estimated via
 * T = 113.6 * massEarths^0.25 / ageGyr -- a quarter-power mass scaling fit to
 * Jupiter/Saturn/Neptune's real measured internal heat flux (Jupiter ~99K,
 * Saturn ~77K, Neptune ~53K, all within ~10% of the same mass^0.25 ratio).
 * Fully determined by mass and age, so it's computed here rather than
 * authored per body (unlike greenhouseFactor, which captures the
 * lapse-rate/opacity gap to the "1-bar level" target temperature and can't
 * be derived this way).
 *
 * The originally-suggested mass^0.5 (square root) scaling was tried first
 * and rejected: it scattered those same three bodies over a 2.3x range (5.6
 * to 12.7 in T/sqrt(mass)) instead of the ~10% spread mass^0.25 gives, and
 * its raw Jupiter output (310K) was roughly 3x the real measured value.
 * Uranus's real internal heat (~29K) is a known planetary-science anomaly no
 * mass-based formula predicts (it's the one giant with essentially no
 * measurable internal heat excess for its size) -- this formula overshoots
 * it (48K) for that reason, not a units or scaling error.
 *
 * Required, not optional: without it, Neptune is structurally unreachable by
 * greenhouseFactor alone -- its 1500 bar atmosphere drives so much diffusion
 * redistribution that the ceiling temperature as greenhouseFactor->infinity
 * caps around -238C, colder than its real -201C target. Neptune's real
 * internal heat (it radiates ~2.6x what it receives from the Sun) is what
 * closes that exact gap.
 */
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
		atmosphere: {
			code: 1,
			pressureBar: 0.01,
			type: "trace",
			breathable: false,
		},
		hydrosphereFraction: 0,
		albedo: 0.088,
		greenhouseFactor: 0,
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
		atmosphere: {
			code: 12,
			pressureBar: 92,
			type: "corrosive",
			subtype: "very dense",
			breathable: false,
		},
		hydrosphereFraction: 0,
		albedo: 0.76,
		// Fit against Venus's real ~737K/463.85C surface temp using
		// EnergyBalanceModel's direct annual-mean equilibrium solve (see
		// seedPerLatitudeEquilibrium()), not by time-stepping to convergence --
		// gives 463.82C, no meaningful time-stepping needed.
		greenhouseFactor: 9,
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
		atmosphere: {
			code: 1,
			pressureBar: 0.006,
			type: "trace",
			breathable: false,
		},
		hydrosphereFraction: 0.1,
		albedo: 0.25,
		// Fit against Mars's real ~-63C mean surface temp -- barely above 0,
		// consistent with its thin CO2 atmosphere providing almost no warming.
		greenhouseFactor: 0.0084,
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
				albedo: 0.07,
				greenhouseFactor: 0,
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
				albedo: 0.08,
				greenhouseFactor: 0,
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
		albedo: 0,
		greenhouseFactor: 0,
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
		atmosphere: {
			code: 17,
			pressureBar: 4200,
			type: "gas",
			subtype: "hydrogen",
			breathable: false,
		},
		hydrosphereFraction: 1,
		albedo: 0.503,
		// Fit against Jupiter's real ~-108C 1-bar-level temp, WITH
		// estimateGasGiantInternalHeatTempK's ~104K already applied (see
		// buildPlanet()) -- this remaining value represents the lapse-rate/
		// opacity gap up to the 1-bar level, not internal heat.
		greenhouseFactor: 1.4332,
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
				albedo: 0.63,
				greenhouseFactor: 0,
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
				albedo: 0.67,
				greenhouseFactor: 0,
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
				albedo: 0.43,
				greenhouseFactor: 0,
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
				albedo: 0.22,
				greenhouseFactor: 0,
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
		atmosphere: {
			code: 17,
			pressureBar: 2600,
			type: "gas",
			subtype: "hydrogen",
			breathable: false,
		},
		hydrosphereFraction: 1,
		albedo: 0.342,
		// Fit against Saturn's real ~-139C 1-bar-level temp, WITH
		// estimateGasGiantInternalHeatTempK's ~77K already applied.
		greenhouseFactor: 1.9196,
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
				albedo: 0.81,
				greenhouseFactor: 0,
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
				atmosphere: {
					code: 13,
					pressureBar: 1.45,
					type: "exotic",
					subtype: "very dense",
					breathable: false,
				},
				hydrosphereFraction: 0.4,
				albedo: 0.22,
				// Fit against Titan's real ~-179.5C surface temp -- its thick
				// 1.45 bar N2/CH4 atmosphere gives a real, well-characterized
				// greenhouse effect unlike every other Sol moon here.
				greenhouseFactor: 0.6942,
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
		atmosphere: {
			code: 17,
			pressureBar: 1300,
			type: "gas",
			subtype: "hydrogen",
			breathable: false,
		},
		hydrosphereFraction: 1,
		albedo: 0.3,
		// Fit against Uranus's real ~-197C 1-bar-level temp, WITH
		// estimateGasGiantInternalHeatTempK's ~48K applied -- note real Uranus
		// has essentially no measurable internal heat (~29K), so that ~48K is
		// itself an overshoot (see the formula's own doc), meaning this fitted
		// greenhouseFactor is compensating for the formula's Uranus-specific
		// error on top of the real lapse-rate gap. Not a "purer" greenhouse
		// value than Jupiter/Saturn's despite Uranus's real heat anomaly.
		greenhouseFactor: 1.3257,
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
				albedo: 0.35,
				greenhouseFactor: 0,
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
				albedo: 0.31,
				greenhouseFactor: 0,
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
		atmosphere: {
			code: 17,
			pressureBar: 1500,
			type: "gas",
			subtype: "hydrogen",
			breathable: false,
		},
		hydrosphereFraction: 1,
		albedo: 0.29,
		// Previously UNFITTABLE by greenhouseFactor alone: Neptune's huge
		// pressure (1500 bar) drives so much diffusion redistribution that the
		// ceiling temperature as greenhouseFactor->infinity capped around
		// -238C, colder than the real -201C 1-bar-level target -- no finite
		// greenhouseFactor could reach it. Adding
		// estimateGasGiantInternalHeatTempK's ~50K (Neptune's real internal
		// heat is genuinely significant -- it radiates ~2.6x what it receives
		// from the Sun) closes that gap; this fitted value now represents just
		// the remaining lapse-rate/opacity gap, same as the other giants.
		greenhouseFactor: 2.4833,
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
				atmosphere: {
					code: 1,
					pressureBar: 0.02,
					type: "trace",
					breathable: false,
				},
				hydrosphereFraction: 0.8,
				albedo: 0.76,
				// Real Triton attempted-fit against ~-235C showed no g-sensitivity
				// at all (diffusion-ceiling degeneracy at these extreme parameters,
				// same family as Neptune's/Pluto's issues) -- 0 is also physically
				// sensible on its own merits given the trace 0.02 bar atmosphere.
				greenhouseFactor: 0,
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
		atmosphere: {
			code: 1,
			pressureBar: 0.03,
			type: "trace",
			breathable: false,
		},
		hydrosphereFraction: 0.8,
		albedo: 0.72,
		// Fit against Pluto's real ~-229C mean surface temp. Needed a
		// surprisingly large value given the blackbody gap alone is only
		// ~20C -- Pluto's small radius and long rotation (153.3h) amplify the
		// EBM's diffusion coefficient the same way Mercury's did (see
		// mercury.smoke.test.ts), which damps how much a given greenhouseFactor
		// actually warms the surface. Not a sign of unusually potent Plutonian
		// atmospheric trapping.
		greenhouseFactor: 44.2956,
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
				albedo: 0.35,
				greenhouseFactor: 0,
			},
		],
	},
]

function buildMoon(
	seed: SolMoonSeed,
	idx: number,
	seedTag: number,
): MoonParams {
	const extras = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	return {
		idx,
		name: seed.name,
		massKg: seed.massEarths * EARTH_MASS_KG,
		diameterKm,
		sizeClass: estimateMoonSizeClassFromDiameter(diameterKm),
		densityEarthRelative: seed.densityEarthRelative,
		densityDescription: seed.densityDescription,
		group: seed.group,
		classification: seed.classification,
		hydrosphereFraction: seed.hydrosphereFraction,
		atmosphere: seed.atmosphere,
		orbitalPeriodDays: seed.rotationHours / 24,
		// Real named moons here are (like nearly every major moon in our own
		// solar system) tidally locked, so this happens to equal the orbital
		// period above — but it's the moon's actual sidereal rotation period
		// from the ported data, not derived from orbitalPeriodDays.
		siderealDayHours: seed.rotationHours,
		eccentricity: seed.eccentricity,
		inclinationDeg: extras.inclinationDeg,
		longitudeOfAscendingNodeDeg: extras.longitudeOfAscendingNodeDeg,
		argumentOfPeriapsisDeg: extras.argumentOfPeriapsisDeg,
		meanAnomalyAtEpochDeg: extras.meanAnomalyAtEpochDeg,
		axialTiltDeg: seed.tiltDeg,
		orbitRange: seed.orbitRange,
		semiMajorAxisPlanetDiameters: seed.pd,
		albedo: seed.albedo,
		greenhouseFactor: seed.greenhouseFactor,
	}
}

function buildPlanet(
	seed: SolPlanetSeed,
	seedTag: number,
	idx: number,
): SystemBody {
	const extras = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	const massKg = seed.massEarths * EARTH_MASS_KG
	const orbitalPeriodDays = getKeplerYearYears(seed.au, 1) * 365.25
	const moons = attachParentTideLocks(
		(seed.moons ?? []).map((moonSeed, i) =>
			buildMoon(moonSeed, i + 1, seedTag * 100 + i + 1),
		),
		idx,
	)
	const internalHeatTempK =
		seed.group === "jovian"
			? estimateGasGiantInternalHeatTempK(seed.massEarths, SOL_STAR_AGE_GYR)
			: 0
	return {
		idx,
		// Pluto-Charon is a mutual (double-synchronous) lock -- unlike every
		// other preset planet here, Pluto itself keeps one face toward its
		// moon rather than the star having any bearing on its rotation.
		tideLock: seed.name === "Pluto" ? { type: "lunar", target: 1 } : undefined,
		name: seed.name,
		sizeClass:
			seed.group === "asteroid belt"
				? -1
				: estimatePlanetarySizeClass(diameterKm, seed.group === "jovian"),
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
		siderealDayHours: seed.rotationHours,
		eccentricity: seed.eccentricity,
		argumentOfPeriapsisDeg: extras.argumentOfPeriapsisDeg,
		axialTiltDeg: seed.tiltDeg,
		inclinationDeg: extras.inclinationDeg,
		longitudeOfAscendingNodeDeg: extras.longitudeOfAscendingNodeDeg,
		moons,
		albedo: seed.albedo,
		greenhouseFactor: seed.greenhouseFactor,
		internalHeatTempK,
	}
}

export const SOL_SYSTEM_BODIES: SystemBody[] = SOL_PLANET_SEEDS.map((seed, i) =>
	buildPlanet(seed, i + 1, i),
)
