import type {
	AtmosphereProfile,
	MoonBody,
	MoonOrbitRange,
	TideLock,
} from "@/model/celestial/moons/moon-types"
import { DEFAULT_MOON_ATMOSPHERE } from "@/model/celestial/moons/moon-types"
import {
	attachParentTideLocks,
	estimateMoonSizeClassFromDiameter,
	rollInclinationDeg,
} from "@/model/celestial/moons/moon-utils"
import {
	getKeplerYearYears,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import { createRng } from "@/model/shared/rng"
import type { SystemBody } from "./generate-system-bodies"
import { estimatePlanetarySizeClass } from "./size-class"
import { applySystemSeismology } from "./system-seismology"

// Ported from galaxy-gen's src/model/system/sol/data.ts (SOL_PLANETS), plus
// Earth/Luna as regular entries alongside them (see SOL_PLANET_SEEDS below)
// -- Earth is tagged `isMainWorld: true`, the only thing that flag should
// ever control (which extra terrain-generation fields the UI exposes for
// editing), not a separate construction/editing code path. Its own physical
// parameters (radius/obliquity/pressure/day length/...) are still supplied
// live from the UI at generation time (see buildHomeBody), so its entry here
// only carries the values that AREN'T user-editable: real Bond albedo,
// fitted greenhouseFactor, and Luna's real orbital data.
//
// Real inclination (to the Sun's equator, for planets; to the parent's
// equator, for moons -- every body's inclination is relative to whatever it
// orbits' own equatorial plane, not the ecliptic) and longitude of
// perihelion are now authored per body too (see
// SolPlanetSeed/SolMoonSeed's inclinationDeg/longitudeOfPerihelionDeg docs) --
// longitude of ascending node and mean anomaly at epoch still aren't part of
// the ported data (galaxy-gen only tracks a display `angle`), and for
// near-circular moon orbits longitude of perihelion isn't a stable/meaningful
// real figure either, so those are still rolled the same way any other
// generated body's are, seeded per-body for determinism. Luna is the one
// exception with all four fixed to real values.

const EARTH_DIAMETER_KM = 12742
const EARTH_MASS_KG = 5.973886146404331e24

// Every moon should carry an explicit atmosphere so its stats card shows an
// Atmosphere row -- omitting the field (rather than stating "none") used to
// silently drop the row for every real airless moon here (Phobos, Io,
// Callisto, ...), while Titan/Luna (which do have one authored) showed it
// fine.
const NO_MOON_ATMOSPHERE = DEFAULT_MOON_ATMOSPHERE

export const SOL_SEED = 0
export const SOL_STAR_AGE_GYR = 4.6
export const SOL_STAR_NAME = "Sol"
export const SOL_MAIN_WORLD_NAME = "Earth"

interface Star {
	class: MainSequenceClass
	subtype: number
	seed: string
}

export interface SolarSystemState {
	star: Star
	orbits: SystemBody[]
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
	/** Optional authored texture for a named moon. Procedural moons omit this
	 * and fall back to moon-orbit-overlay.ts's generic shared texture. */
	texturePath?: string
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
	/** Fraction of surface covered by land, 0..1 (retired hydrosphereFraction,
	 * which was the inverse -- ocean/ice coverage). */
	landCoverage: number
	/** Bond albedo, 0..1 (real measured/estimated value). */
	albedo: number
	/** EBM greenhouseFactor -- see SolPlanetSeed.greenhouseFactor doc. Only
	 * fit for moons with a real, well-characterized atmosphere (Titan);
	 * zero (no meaningful real greenhouse effect) for airless/trace-
	 * atmosphere moons, same as Mercury. */
	greenhouseFactor: number
	/** Real orbital inclination (degrees, to the parent planet's equator --
	 * the commonly-cited reference frame for a moon), used instead of
	 * rollExtras()'s seeded-random roll when set. */
	inclinationDeg?: number
	/** Real longitude of perihelion (degrees). Only Luna has this authored --
	 * for every other (near-circular) moon here, real longitude of
	 * perihelion isn't a stable/meaningful published figure (it precesses
	 * rapidly and is barely defined at low eccentricity), so it still gets a
	 * rolled value like the ported data intends. */
	longitudeOfPerihelionDeg?: number
	/** Real longitude of ascending node (degrees). Only Luna has this
	 * authored (as a simplified fixed 0 -- its real node regresses over an
	 * 18.6-year cycle, so no single "real" value exists); every other moon
	 * here still gets a rolled value. */
	longitudeOfAscendingNodeDeg?: number
	/** Real mean anomaly at epoch (degrees). Only Luna has this authored (as
	 * a simplified fixed 0); every other moon here still gets a rolled
	 * value. */
	meanAnomalyAtEpochDeg?: number
}

export interface SolPlanetSeed {
	name: string
	seed?: string
	group: SystemBody["group"]
	classification: SystemBody["classification"]
	/** Optional authored texture for a named body. Untextured bodies fall back
	 * to a plain color in solar-system-overlay.ts. */
	texturePath?: string
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
	landDistribution?: number
	/** Fraction of surface covered by land, 0..1 (retired hydrosphereFraction,
	 * which was the inverse -- ocean/ice coverage). */
	landCoverage: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
	/** Static real moon data, hydrated via buildMoon() -- unused when
	 * `moonsOverride` is passed to buildPlanet() instead (the main world's
	 * moons come from a live generation pipeline, not this fixed table). */
	moons?: SolMoonSeed[]
	/** What (if anything) this body is tidally locked to -- fixed/known for
	 * the static bodies here (e.g. Pluto-Charon's mutual lock), or a live
	 * user-controlled value for the main world. */
	tideLock?: TideLock | null
	/** Longitude of the substellar point, in degrees 0-360. */
	substellarLon?: number
	/** Tags the main/home world -- the only thing this flag should ever
	 * control is which extra (terrain-generation) fields the UI exposes for
	 * editing, not a separate construction/editing code path: the main
	 * world is built via buildPlanet() exactly like every other body here,
	 * just from a live seed object (its own physical params come from the
	 * UI at generation time) rather than a fixed table entry. */
	isMainWorld?: boolean
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
	/** Real orbital inclination (degrees, to the Sun's equator). */
	inclinationDeg?: number
	/** Real longitude of perihelion (degrees, J2000). */
	longitudeOfPerihelionDeg?: number
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
		longitudeOfPerihelionDeg: r.uniform(0, 360),
		meanAnomalyAtEpochDeg: r.uniform(0, 360),
	}
}

const SOL_PLANET_SEEDS: SolPlanetSeed[] = [
	{
		name: "Mercury",
		group: "dwarf",
		classification: "rockball",
		texturePath: "/sol/2k_mercury.jpg",
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
		landCoverage: 1,
		albedo: 0.088,
		greenhouseFactor: 0,
		inclinationDeg: 3.38,
		longitudeOfPerihelionDeg: 77.457,
	},
	{
		name: "Venus",
		group: "terrestrial",
		classification: "telluric",
		texturePath: "/sol/2k_venus.jpg",
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
		landCoverage: 1,
		albedo: 0.76,
		// Fit against Venus's real ~737K/463.85C surface temp using
		// EnergyBalanceModel's direct annual-mean equilibrium solve (see
		// seedPerLatitudeEquilibrium()), not by time-stepping to convergence --
		// gives 463.82C, no meaningful time-stepping needed.
		greenhouseFactor: 9,
		inclinationDeg: 3.86,
		longitudeOfPerihelionDeg: 131.533,
	},
	{
		name: SOL_MAIN_WORLD_NAME,
		isMainWorld: true,
		group: "terrestrial",
		texturePath: "/sol/earth/2k_earth.jpg",
		// Matches classifyBody()'s isPrimaryWorld branch in
		// generate-system-bodies.ts -- Earth is now built live by buildPlanet()
		// exactly like every other body here, just from a live seed object
		// whose physical params (radius/obliquity/pressure/day length/
		// orbital distance/eccentricity/moons) get overwritten with the
		// user's live UI state before each call.
		classification: "tectonic",
		au: 1,
		diameterEarths: 1,
		massEarths: 1,
		gravityG: 1,
		densityEarthRelative: 1,
		densityDescription: "Rock and Metal",
		rotationHours: 24,
		tiltDeg: 23.5,
		eccentricity: 0.0167,
		inclinationDeg: 7.25,
		longitudeOfPerihelionDeg: 102,
		landDistribution: 0.25,
		landCoverage: 0.3,
		continentSizeVariety: 0.35,
		seaLevel: 1,
		maxElevation: 6000,
		/** Real Earth Bond albedo (NASA planetary fact sheet). */
		albedo: 0.3,
		/** Bisected directly against the real imported Earth world's own
		 * land-only WorldClim bias (zeroed exactly; see
		 * ebm/earth-import-greenhouse-refit.smoke.test.ts), with the
		 * temperature-driven ice-albedo feedback ON (default) -- was 0.534
		 * when that feedback was disabled. useEbmPreview.ts never disables it
		 * for this override, so the calibration has to match, not the model
		 * behavior. */
		greenhouseFactor: 0.578,
		/** Real Earth sea-level pressure (~1 bar), matching every sibling
		 * body's own hand-authored atmosphere below. Without this, the static
		 * Sol system's Earth entry (restSeed === SOL_SEED, unlike the live
		 * procedurally-generated path in GenesisView.tsx, which builds its own
		 * atmosphere from the live pressure slider before calling buildPlanet)
		 * has no atmosphere at all -- buildPlanet() reads seed.atmosphere
		 * straight through with no fallback, so the real Sol Earth ends up
		 * vacuum (0 bar). At 0 bar the EBM's heat diffusion and thermal
		 * inertia both collapse to zero, removing all seasonal lag and
		 * producing a much wider climate-preview min/max swing than any real
		 * atmosphere would. */
		atmosphere: {
			code: 6,
			pressureBar: 1,
			type: "breathable",
			breathable: true,
		},
		moons: [
			{
				name: "Luna",
				group: "dwarf",
				classification: "rockball",
				texturePath: "/sol/earth/moon.jpg",
				diameterEarths: 3474 / EARTH_DIAMETER_KM,
				massEarths: 7.34e22 / EARTH_MASS_KG,
				gravityG: 0.166,
				densityEarthRelative: 0.607,
				densityDescription: "Mostly Rock",
				rotationHours: 27.3 * 24,
				tiltDeg: 6.7,
				eccentricity: 0.055,
				pd: 30.17,
				orbitRange: "middle",
				atmosphere: {
					code: 0,
					pressureBar: 0,
					type: "vacuum",
					breathable: false,
				},
				landCoverage: 1,
				albedo: 0.12,
				greenhouseFactor: 0,
				// Luna's real inclination/node/periapsis/anomaly are
				// well-known, unlike every other moon here (which get a
				// seeded roll instead).
				inclinationDeg: 5.1,
				longitudeOfAscendingNodeDeg: 0,
				longitudeOfPerihelionDeg: 0,
				meanAnomalyAtEpochDeg: 0,
			},
		],
	},
	{
		name: "Mars",
		group: "terrestrial",
		classification: "arid",
		texturePath: "/sol/mars/2k_mars.jpg",
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
		landCoverage: 0.9,
		albedo: 0.25,
		// Fit against Mars's real ~-63C mean surface temp -- barely above 0,
		// consistent with its thin CO2 atmosphere providing almost no warming.
		greenhouseFactor: 0.0084,
		inclinationDeg: 5.65,
		longitudeOfPerihelionDeg: 336.041,
		moons: [
			{
				name: "Phobos",
				group: "dwarf",
				classification: "asteroid",
				texturePath: "/sol/mars/phobos.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				albedo: 0.07,
				greenhouseFactor: 0,
				// Real inclination to Mars's equator; near-circular orbit
				// makes a stable real longitude of perihelion undefined.
				inclinationDeg: 1.093,
			},
			{
				name: "Deimos",
				group: "dwarf",
				classification: "asteroid",
				texturePath: "/sol/mars/deimos.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				albedo: 0.08,
				greenhouseFactor: 0,
				inclinationDeg: 1.791,
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
		landCoverage: 1,
	},
	{
		name: "Jupiter",
		group: "jovian",
		classification: "jovian",
		texturePath: "/sol/jupiter/2k_jupiter.jpg",
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
		landCoverage: 0,
		albedo: 0.503,
		// Fit against Jupiter's real ~-108C 1-bar-level temp, WITH
		// estimateGasGiantInternalHeatTempK's ~104K already applied (see
		// buildPlanet()) -- this remaining value represents the lapse-rate/
		// opacity gap up to the 1-bar level, not internal heat.
		greenhouseFactor: 1.4332,
		inclinationDeg: 6.09,
		longitudeOfPerihelionDeg: 14.754,
		moons: [
			{
				name: "Io",
				group: "dwarf",
				classification: "geo-tidal",
				texturePath: "/sol/jupiter/io.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				albedo: 0.63,
				greenhouseFactor: 0,
				inclinationDeg: 0.036,
			},
			{
				name: "Europa",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/jupiter/europa.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.2,
				albedo: 0.67,
				greenhouseFactor: 0,
				inclinationDeg: 0.466,
			},
			{
				name: "Ganymede",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/jupiter/ganymede.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.2,
				albedo: 0.43,
				greenhouseFactor: 0,
				inclinationDeg: 0.177,
			},
			{
				name: "Callisto",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/jupiter/callisto.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.2,
				albedo: 0.22,
				greenhouseFactor: 0,
				inclinationDeg: 0.192,
			},
		],
	},
	{
		name: "Saturn",
		group: "jovian",
		classification: "jovian",
		texturePath: "/sol/saturn/2k_saturn.jpg",
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
		landCoverage: 0,
		albedo: 0.342,
		// Fit against Saturn's real ~-139C 1-bar-level temp, WITH
		// estimateGasGiantInternalHeatTempK's ~77K already applied.
		greenhouseFactor: 1.9196,
		inclinationDeg: 5.51,
		longitudeOfPerihelionDeg: 92.432,
		moons: [
			{
				name: "Enceladus",
				group: "dwarf",
				classification: "geo-tidal",
				texturePath: "/sol/saturn/enceladus.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.2,
				albedo: 0.81,
				greenhouseFactor: 0,
				inclinationDeg: 0.009,
			},
			{
				name: "Titan",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/saturn/titan.jpg",
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
				landCoverage: 0.6,
				albedo: 0.22,
				// Fit against Titan's real ~-179.5C surface temp -- its thick
				// 1.45 bar N2/CH4 atmosphere gives a real, well-characterized
				// greenhouse effect unlike every other Sol moon here.
				greenhouseFactor: 0.6942,
				inclinationDeg: 0.348,
			},
		],
	},
	{
		name: "Uranus",
		group: "jovian",
		classification: "jovian",
		texturePath: "/sol/uranus/2k_uranus.jpg",
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
		landCoverage: 0,
		albedo: 0.3,
		// Fit against Uranus's real ~-197C 1-bar-level temp, WITH
		// estimateGasGiantInternalHeatTempK's ~48K applied -- note real Uranus
		// has essentially no measurable internal heat (~29K), so that ~48K is
		// itself an overshoot (see the formula's own doc), meaning this fitted
		// greenhouseFactor is compensating for the formula's Uranus-specific
		// error on top of the real lapse-rate gap. Not a "purer" greenhouse
		// value than Jupiter/Saturn's despite Uranus's real heat anomaly.
		greenhouseFactor: 1.3257,
		inclinationDeg: 6.48,
		longitudeOfPerihelionDeg: 170.964,
		moons: [
			{
				name: "Titania",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/uranus/titania.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.4,
				albedo: 0.35,
				greenhouseFactor: 0,
				inclinationDeg: 0.34,
			},
			{
				name: "Oberon",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/uranus/oberon.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.4,
				albedo: 0.31,
				greenhouseFactor: 0,
				inclinationDeg: 0.058,
			},
		],
	},
	{
		name: "Neptune",
		group: "jovian",
		classification: "jovian",
		texturePath: "/sol/neptune/2k_neptune.jpg",
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
		landCoverage: 0,
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
		inclinationDeg: 6.43,
		longitudeOfPerihelionDeg: 44.971,
		moons: [
			{
				name: "Triton",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/neptune/triton.jpg",
				diameterEarths: 0.212,
				massEarths: 0.0036,
				gravityG: 0.08,
				densityEarthRelative: 0.376,
				densityDescription: "Mostly Ice",
				rotationHours: 141.04,
				tiltDeg: 156.8,
				eccentricity: 0,
				// Retrograde orbit -- real inclination to Neptune's equator
				// is ~156.8°, coincidentally close to its axial tilt above
				// (both are consequences of its retrograde capture origin).
				inclinationDeg: 156.8,
				pd: 7.16,
				orbitRange: "middle",
				atmosphere: {
					code: 1,
					pressureBar: 0.02,
					type: "trace",
					breathable: false,
				},
				landCoverage: 0.2,
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
		texturePath: "/sol/pluto/pluto.jpg",
		au: 39.482,
		diameterEarths: 0.186,
		massEarths: 0.0022,
		gravityG: 0.063,
		densityEarthRelative: 0.336,
		densityDescription: "Mostly Ice",
		rotationHours: 153.3,
		tiltDeg: 119.6,
		eccentricity: 0.248,
		// Pluto-Charon is a mutual (double-synchronous) lock -- unlike every
		// other preset planet here, Pluto itself keeps one face toward its
		// moon rather than the star having any bearing on its rotation.
		tideLock: { type: "lunar", target: 1 },
		atmosphere: {
			code: 1,
			pressureBar: 0.03,
			type: "trace",
			breathable: false,
		},
		landCoverage: 0.2,
		albedo: 0.72,
		// Fit against Pluto's real ~-229C mean surface temp. Needed a
		// surprisingly large value given the blackbody gap alone is only
		// ~20C -- Pluto's small radius and long rotation (153.3h) amplify the
		// EBM's diffusion coefficient the same way Mercury's did (see
		// mercury.smoke.test.ts), which damps how much a given greenhouseFactor
		// actually warms the surface. Not a sign of unusually potent Plutonian
		// atmospheric trapping.
		greenhouseFactor: 44.2956,
		inclinationDeg: 11.88,
		longitudeOfPerihelionDeg: 224.067,
		moons: [
			{
				name: "Charon",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/sol/pluto/charon.jpg",
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
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 0.4,
				albedo: 0.35,
				greenhouseFactor: 0,
				// Mutually tidally locked with Pluto in the same plane as
				// Pluto's own equator/orbit -- effectively 0.
				inclinationDeg: 0.08,
			},
		],
	},
]

function buildMoon(seed: SolMoonSeed, idx: number, seedTag: number): MoonBody {
	const rolled = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	return {
		idx,
		name: seed.name,
		texturePath: seed.texturePath,
		massKg: seed.massEarths * EARTH_MASS_KG,
		diameterKm,
		sizeClass: estimateMoonSizeClassFromDiameter(diameterKm),
		density: {
			earthRelative: seed.densityEarthRelative,
			description: seed.densityDescription,
		},
		group: seed.group,
		classification: seed.classification,
		landCoverage: seed.landCoverage,
		atmosphere: seed.atmosphere,
		orbitalPeriodDays: seed.rotationHours / 24,
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
function buildPlanet(
	seed: SolPlanetSeed,
	seedTag: number,
	idx: number,
	options?: BuildPlanetOptions,
): SystemBody {
	const rolled = rollExtras(seedTag)
	const diameterKm = seed.diameterEarths * EARTH_DIAMETER_KM
	const massKg = seed.massEarths * EARTH_MASS_KG
	const orbitalPeriodDays =
		getKeplerYearYears(seed.au, options?.starMassSol ?? 1) * 365.25
	const moons = options?.moonsOverride
		? attachParentTideLocks(options.moonsOverride, idx)
		: attachParentTideLocks(
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
		seed:
			seed.seed ??
			(seed.name
				? seed.name.toLowerCase()
				: seed.isMainWorld
					? "world"
					: `orbit-${Math.max(0, idx) + 1}`),
		tideLock: seed.tideLock,
		substellarLon: seed.substellarLon,
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
		texturePath: options?.textureOverride ?? seed.texturePath,
		rings: SOL_PLANET_RINGS_BY_NAME[seed.name],
		landDistribution: seed.landDistribution,
		landCoverage: seed.landCoverage,
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

export { buildPlanet }

const EARTH_SEED = SOL_PLANET_SEEDS.find((seed) => seed.isMainWorld)
if (!EARTH_SEED) throw new Error("SOL_PLANET_SEEDS is missing its Earth entry")
const LUNA_SEED = EARTH_SEED.moons?.[0]
if (!LUNA_SEED)
	throw new Error("Earth's SOL_PLANET_SEEDS entry is missing Luna")

const SOL_SYSTEM_BODIES_RAW: SystemBody[] = SOL_PLANET_SEEDS.map((seed, i) =>
	buildPlanet(seed, i + 1, seed.isMainWorld ? -1 : i),
).sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU)

export const SOL_SYSTEM_BODIES: SystemBody[] = applySystemSeismology({
	bodies: SOL_SYSTEM_BODIES_RAW,
	starAgeGyr: SOL_STAR_AGE_GYR,
	starLuminositySol: 1,
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

export const SOL_LUNA_DEFAULT: MoonBody = attachParentTideLocks(
	[buildMoon(LUNA_SEED, 1, 0)],
	-1,
)[0]!
