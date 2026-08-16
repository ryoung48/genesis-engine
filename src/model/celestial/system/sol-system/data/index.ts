import { MOON } from "@/model/celestial/moons"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { SolPlanetSeed } from "@/model/celestial/system/sol-system/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { TIME } from "@/model/shared/time"

// live from the UI at generation time (see buildHomeBody), so its entry here
// only carries the values that AREN'T user-editable: real Bond albedo,
// fitted greenhouseFactor, and Luna's real orbital data.
//
// Planet orbital elements use the Sun-centered HGI frame: the reference plane
// is the Sun's equator and +X is its ascending node on the J2000 ecliptic.
// The source J2000 ecliptic elements are from JPL's approximate-positions
// table, rotated into HGI so inclination, node, and perihelion all share one
// reference frame. Near-circular moon orbits still use seeded display values:
// perihelion and node are not stable/meaningful enough to author as constants.
// Every moon should carry an explicit atmosphere so its stats card shows an
// Atmosphere row -- omitting the field (rather than stating "none") used to
// silently drop the row for every real airless moon here (Phobos, Io,
// Callisto, ...), while Titan/Luna (which do have one authored) showed it
// fine.
const NO_MOON_ATMOSPHERE = MOON.defaultMoonAtmosphere

const solSeed = 0
const solStarAgeGyr = 4.6
const solStarName = "Sol"
const solMainWorldName = "Earth"
const solEarthTexturePath = "/textures/celestial/sol/earth/2k_earth.jpg"
const solEarthCloudsTexturePath =
	"/textures/celestial/sol/earth/2k_earth_clouds.jpg"

const solPlanetRingsByName: Partial<Record<string, SystemBody["rings"]>> = {
	Saturn: {
		innerRadiusRelative: 1.52,
		outerRadiusRelative: 2.08,
		color: 0xd8c69a,
		opacity: 0.52,
	},
	// Real, discovered 2017 -- a narrow ~70km-wide ring at ~2287km from
	// Haumea's center, roughly 3x its own mean radius out. Far fainter/
	// narrower than Saturn's -- low opacity reflects that.
	Haumea: {
		innerRadiusRelative: 2.89,
		outerRadiusRelative: 2.98,
		color: 0xb8c4d0,
		opacity: 0.35,
	},
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
const solPlanetSeeds: SolPlanetSeed[] = [
	{
		name: "Mercury",
		group: "dwarf",
		classification: "rockball",
		texturePath: "/textures/celestial/sol/2k_mercury.jpg",
		au: 0.387,
		diameterEarths: 0.383,
		massEarths: 0.0553,
		gravityG: 0.378,
		densityEarthRelative: 0.984,
		densityDescription: "Rock and Metal",
		rotationHours: 1407.5088,
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
		longitudeOfAscendingNodeDeg: 252.348,
		longitudeOfPerihelionDeg: 1.902,
		// Reuses the raw fixed-frame value rather than a verified real Ls:
		// Mercury's ~0.03 deg axial tilt means the EBM sees essentially no
		// latitude-dependent declination swing to get out of phase in the
		// first place (unlike Mars), so which exact value lands here barely
		// moves Mercury's simulated temperatures despite its large 0.2056
		// eccentricity (the highest of any planet).
		lsAphelionDeg: 77.457,
	},
	{
		name: "Venus",
		group: "terrestrial",
		classification: "telluric",
		texturePath: "/textures/celestial/sol/2k_venus.jpg",
		au: 0.723,
		diameterEarths: 0.9495,
		massEarths: 0.815,
		gravityG: 0.904,
		densityEarthRelative: 0.952,
		densityDescription: "Rock and Metal",
		rotationHours: 5832.432,
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
		longitudeOfAscendingNodeDeg: 179.19,
		longitudeOfPerihelionDeg: 55.839,
		// Reuses the raw fixed-frame value: Venus's real axial tilt is 177.36
		// deg, i.e. ~2.64 deg of *effective* obliquity (nearly upside-down,
		// not upright), so its seasonal declination swing is tiny -- combined
		// with its negligible 0.0068 eccentricity, there's no established
		// real Ls-at-perihelion figure worth chasing here the way Mars's is.
		lsAphelionDeg: 131.533,
	},
	{
		name: solMainWorldName,
		isMainWorld: true,
		group: "terrestrial",
		texturePath: solEarthTexturePath,
		cloudsTexturePath: solEarthCloudsTexturePath,
		// Earth is built live by buildPlanet() exactly like every other body
		// here, just from a live seed object
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
		rotationHours: 23.93447232,
		tiltDeg: 23.5,
		eccentricity: 0.0167,
		inclinationDeg: 7.25,
		longitudeOfAscendingNodeDeg: 180,
		longitudeOfPerihelionDeg: 27.178,
		// The EBM uses a body-fixed seasonal angle, not this HGI-frame value.
		lsAphelionDeg: 102,
		landDistribution: 0.25,
		landCoverage: 0.3,
		continentSizeVariety: 0.35,
		seaLevel: 1,
		maxElevation: 6000,
		/** Real Earth Bond albedo (NASA planetary fact sheet). */
		albedo: 0.3,
		/** Bisected directly against the real imported Earth world's own
		 * land-only WorldClim bias (zeroed exactly; see
		 * test/earth/earth-import-greenhouse-refit.smoke.test.ts), with the
		 * temperature-driven ice-albedo feedback ON (default) -- was 0.534
		 * when that feedback was disabled. useEbmPreview.ts never disables it
		 * for this override, so the calibration has to match, not the model
		 * behavior. */
		greenhouseFactor: 0.578,
		/** Real Earth sea-level pressure (~1 bar), matching every sibling
		 * body's own hand-authored atmosphere below. Without this, the static
		 * Sol system's Earth entry (seed === SOL_SEED, unlike the live
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
		biosphere: { code: 10, trace: [] },
		moons: [
			{
				name: "Luna",
				group: "dwarf",
				classification: "rockball",
				texturePath: "/textures/celestial/sol/earth/moon.jpg",
				diameterEarths: 3474 / ORBIT_BODY.earthDiameterKm,
				massEarths: 7.34e22 / ORBIT_BODY.earthMassKg,
				gravityG: 0.166,
				densityEarthRelative: 0.607,
				densityDescription: "Mostly Rock",
				rotationHours: 27.3 * TIME.hoursPerDay,
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
		texturePath: "/textures/celestial/sol/mars/2k_mars.jpg",
		au: 1.524,
		diameterEarths: 0.532,
		massEarths: 0.1074,
		gravityG: 0.379,
		densityEarthRelative: 0.713,
		densityDescription: "Mostly Rock",
		rotationHours: 24.62296224,
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
		longitudeOfAscendingNodeDeg: 188.324,
		longitudeOfPerihelionDeg: 260.348,
		// EBM insolation input (see OrbitBody.lsAphelionDeg's doc) -- NOT the
		// same quantity as longitudeOfPerihelionDeg above. That field is the
		// real, fixed HGI-frame value used to orient Mars's orbit
		// ellipse in the 3D view; this one is Ls (areocentric solar
		// longitude) at APHELION in Mars's own vernal-equinox-referenced
		// frame, which is what insolation/index.ts's orbital.PERIHELION
		// actually consumes. Real Mars perihelion falls at the well-known
		// Ls=251 deg (shortly before southern summer solstice, driving
		// Mars's real global dust-storm season), so aphelion is 180 deg
		// later at Ls=71. Feeding the raw longitudeOfPerihelionDeg value into
		// the EBM instead gets the hemisphere backwards -- verified by
		// comparing peak polar insolation under each value directly against
		// the insolation math.
		lsAphelionDeg: 71,
		moons: [
			{
				name: "Phobos",
				group: "dwarf",
				classification: "asteroid",
				texturePath: "/textures/celestial/sol/mars/phobos.jpg",
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
				texturePath: "/textures/celestial/sol/mars/deimos.jpg",
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
		// Not a real climate body (no tilt, no atmosphere, no EBM-driven
		// terrain) -- value is inert filler to satisfy SolPlanetSeed.
		lsAphelionDeg: 0,
	},
	{
		name: "Ceres",
		group: "dwarf",
		classification: "rockball",
		// No real Ceres photo texture available yet -- reuses a generic
		// rockball texture like every other unphotographed dwarf here.
		texturePath: "/textures/celestial/generated/rockball/1.png",
		parentBeltName: "Asteroid Belt",
		au: 2.77,
		diameterEarths: 939.4 / ORBIT_BODY.earthDiameterKm,
		massEarths: 9.393e20 / ORBIT_BODY.earthMassKg,
		gravityG: 0.029,
		densityEarthRelative: 0.392,
		densityDescription: "Mostly Rock",
		rotationHours: 9.07417,
		tiltDeg: 4,
		eccentricity: 0.0758,
		atmosphere: {
			code: 0,
			pressureBar: 0,
			type: "vacuum",
			breathable: false,
		},
		landCoverage: 1,
		albedo: 0.09,
		// Airless -- same 0 convention as every other bare-rock dwarf/moon here
		// (Phobos, Deimos, ...); Ceres's real ~167K mean surface temp is close
		// to its own blackbody equilibrium without any greenhouse trap.
		greenhouseFactor: 0,
		inclinationDeg: 10.59,
		longitudeOfAscendingNodeDeg: 80.3,
		longitudeOfPerihelionDeg: 73.6,
		// No published real Ls-at-perihelion for Ceres (unlike Mars/the giants)
		// -- reuses the raw fixed-frame value like Mercury/Venus, justified the
		// same way: ~4 deg tilt means negligible seasonal declination swing
		// regardless of which exact value lands here.
		lsAphelionDeg: 73.6,
	},
	{
		name: "Pallas",
		group: "dwarf",
		classification: "rockball",
		// No real Pallas photo texture available yet -- reuses a generic
		// rockball texture (a different one than Ceres's, so the two don't
		// render identically).
		texturePath: "/textures/celestial/generated/rockball/3.png",
		parentBeltName: "Asteroid Belt",
		au: 2.77,
		diameterEarths: 512 / ORBIT_BODY.earthDiameterKm,
		massEarths: 2.04e20 / ORBIT_BODY.earthMassKg,
		gravityG: 0.0212,
		densityEarthRelative: 0.53,
		densityDescription: "Mostly Rock",
		rotationHours: 7.8132,
		// Real, unusually high obliquity -- Pallas spins close to on its side
		// relative to its own orbital plane, unlike every other belt body here.
		tiltDeg: 84,
		// Real, unusually high for a major asteroid -- both more eccentric and
		// far more inclined than Ceres or the belt's own mean plane, a known
		// real oddity (likely an ancient collision) rather than a data error.
		eccentricity: 0.2302,
		atmosphere: {
			code: 0,
			pressureBar: 0,
			type: "vacuum",
			breathable: false,
		},
		landCoverage: 1,
		albedo: 0.16,
		greenhouseFactor: 0,
		inclinationDeg: 34.93,
		longitudeOfAscendingNodeDeg: 173.08,
		longitudeOfPerihelionDeg: 124,
		lsAphelionDeg: 124,
	},
	{
		name: "Jupiter",
		group: "jovian",
		classification: "jovian",
		texturePath: "/textures/celestial/sol/jupiter/2k_jupiter.jpg",
		au: 5.2,
		diameterEarths: 11.209,
		massEarths: 317.83,
		gravityG: 2.528,
		densityEarthRelative: 0.241,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 9.92496,
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
		longitudeOfAscendingNodeDeg: 174.853,
		longitudeOfPerihelionDeg: 298.934,
		// EBM insolation input (see OrbitBody.lsAphelionDeg's doc) -- Ls
		// (heliocentric solar longitude, in Jupiter's own vernal-equinox
		// frame) at APHELION. Real Jupiter perihelion falls at Ls ~= 57-58 deg
		// (shortly before its own northern summer solstice at Ls=90), so
		// aphelion sits 180 deg later at Ls ~= 237.5.
		lsAphelionDeg: 237.5,
		moons: [
			{
				name: "Io",
				group: "dwarf",
				classification: "geo-tidal",
				texturePath: "/textures/celestial/sol/jupiter/io.jpg",
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
				texturePath: "/textures/celestial/sol/jupiter/europa.jpg",
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
				texturePath: "/textures/celestial/sol/jupiter/ganymede.jpg",
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
				texturePath: "/textures/celestial/sol/jupiter/callisto.jpg",
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
		texturePath: "/textures/celestial/sol/saturn/2k_saturn.jpg",
		au: 9.58,
		diameterEarths: 9.449,
		massEarths: 95.16,
		gravityG: 1.065,
		densityEarthRelative: 0.125,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 10.65624,
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
		longitudeOfAscendingNodeDeg: 163.869,
		longitudeOfPerihelionDeg: 16.742,
		// EBM insolation input (see OrbitBody.lsAphelionDeg's doc). Real
		// Saturn perihelion falls at Ls ~= 280 deg (shortly after its own
		// northern winter solstice, making southern summer -- which happens
		// near perihelion -- shorter and hotter than northern summer), so
		// aphelion sits 180 deg earlier/later at Ls ~= 100.
		lsAphelionDeg: 100,
		moons: [
			{
				name: "Enceladus",
				group: "dwarf",
				classification: "geo-tidal",
				texturePath: "/textures/celestial/sol/saturn/enceladus.jpg",
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
				texturePath: "/textures/celestial/sol/saturn/titan.jpg",
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
			{
				name: "Iapetus",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/generated/rockball/3.png",
				diameterEarths: 1469 / ORBIT_BODY.earthDiameterKm,
				massEarths: 1.805e21 / ORBIT_BODY.earthMassKg,
				gravityG: 0.02277,
				densityEarthRelative: 0.1975,
				densityDescription: "Mostly Ice",
				rotationHours: 79.3216 * TIME.hoursPerDay,
				tiltDeg: 0,
				eccentricity: 0.0286,
				pd: 3560820 / (9.449 * ORBIT_BODY.earthDiameterKm),
				orbitRange: "extreme",
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				// Real Iapetus is famously two-toned -- a very dark (albedo
				// ~0.03-0.05) leading hemisphere and a much brighter (~0.5-0.6)
				// trailing one, a known real oddity this single-albedo schema
				// can't represent. This is a rough disk-averaged stand-in, not
				// either real hemisphere's value.
				albedo: 0.25,
				greenhouseFactor: 0,
				// Real and unusually high for a regular-ish moon this far out --
				// most of Saturn's other major moons sit near 0 deg.
				inclinationDeg: 15.47,
			},
		],
	},
	{
		name: "Uranus",
		group: "jovian",
		classification: "jovian",
		texturePath: "/textures/celestial/sol/uranus/2k_uranus.jpg",
		au: 19.22,
		diameterEarths: 4.007,
		massEarths: 14.54,
		gravityG: 0.886,
		densityEarthRelative: 0.231,
		densityDescription: "Hydrogen-Helium Envelope",
		rotationHours: 17.23992,
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
		longitudeOfAscendingNodeDeg: 180.208,
		longitudeOfPerihelionDeg: 95.196,
		// EBM insolation input (see OrbitBody.lsAphelionDeg's doc). Real
		// Uranus perihelion falls near its own northern autumn equinox, at
		// Ls ~= 182 deg, so aphelion sits 180 deg earlier/later at Ls ~= 2.
		lsAphelionDeg: 2,
		moons: [
			{
				name: "Miranda",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/generated/rockball/4.png",
				diameterEarths: 471.6 / ORBIT_BODY.earthDiameterKm,
				massEarths: 6.4e19 / ORBIT_BODY.earthMassKg,
				gravityG: 0.00783,
				densityEarthRelative: 0.2178,
				densityDescription: "Mostly Ice",
				rotationHours: 1.413 * TIME.hoursPerDay,
				tiltDeg: 0,
				eccentricity: 0.0013,
				pd: 129900 / (4.007 * ORBIT_BODY.earthDiameterKm),
				orbitRange: "inner",
				atmosphere: NO_MOON_ATMOSPHERE,
				// Real Miranda has the most extreme, chaotically fractured terrain
				// of any known moon (huge cliffs and disjointed "coronae"
				// terrain) -- not representable by this schema's single
				// landCoverage figure.
				landCoverage: 0.6,
				albedo: 0.32,
				greenhouseFactor: 0,
				// Real and notably high compared to Titania/Oberon's near-zero
				// inclination -- a known oddity, likely from a past orbital
				// resonance.
				inclinationDeg: 4.232,
			},
			{
				name: "Titania",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/sol/uranus/titania.jpg",
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
				texturePath: "/textures/celestial/sol/uranus/oberon.jpg",
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
		texturePath: "/textures/celestial/sol/neptune/2k_neptune.jpg",
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
		longitudeOfAscendingNodeDeg: 166.777,
		longitudeOfPerihelionDeg: 329.112,
		// Derived, not a directly-published Ls-at-perihelion figure like
		// Mars/Jupiter/Saturn/Uranus's: combines two published facts (real
		// southern summer solstice, Ls=270, occurred in 2005; real perihelion
		// occurs 2042-09-04) via Neptune's near-circular orbit (eccentricity
		// 0.009, so mean motion ~= true motion) -- 37 years at
		// 360/165=2.18 deg/year is ~81 deg past Ls=270, giving
		// Ls_perihelion ~= 351, Ls_aphelion ~= 171. Low-stakes either way:
		// published seasonal-forcing studies put Neptune's perihelion-timing
		// effect at only ~0.2K given its tiny eccentricity.
		lsAphelionDeg: 171,
		moons: [
			{
				name: "Triton",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/sol/neptune/triton.jpg",
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
			{
				name: "Nereid",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/generated/rockball/5.png",
				diameterEarths: 340 / ORBIT_BODY.earthDiameterKm,
				// Real mass/density are both poorly constrained (Voyager 2 never
				// flew close) -- order-of-magnitude estimates, not tightly
				// measured figures.
				massEarths: 3.1e19 / ORBIT_BODY.earthMassKg,
				gravityG: 0.0073,
				densityEarthRelative: 0.2722,
				densityDescription: "Mostly Ice",
				// Real rotation period is not well determined -- one of several
				// reported light-curve estimates, not a settled figure.
				rotationHours: 11.52,
				tiltDeg: 0,
				// Real and extreme -- by far the most eccentric orbit of any
				// major moon in the solar system, a consequence of its huge
				// distance leaving it only loosely bound and susceptible to
				// solar perturbation (unlike Triton's circularized orbit).
				eccentricity: 0.7512,
				pd: 5504000 / (3.883 * ORBIT_BODY.earthDiameterKm),
				orbitRange: "extreme",
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				albedo: 0.155,
				greenhouseFactor: 0,
				// Real inclination relative to Neptune's own equator isn't a
				// well-defined quantity the way it is for Triton -- Nereid orbits
				// so far out that solar tides dominate over Neptune's oblateness,
				// so its orbital plane doesn't track Neptune's equator at all.
				// This uses its real ecliptic-relative inclination instead, the
				// only commonly published figure for it.
				inclinationDeg: 7.23,
			},
		],
	},
	{
		name: "Kuiper Belt",
		group: "asteroid belt",
		classification: "asteroid belt",
		// Real classical Kuiper Belt spans roughly 30 (Neptune's orbit) to 50
		// AU, with most classical (non-resonant) KBOs concentrated around
		// 42-45 AU -- placed between Pluto's 39.482 AU (a 3:2 resonant "plutino"
		// technically at the belt's inner edge) and Makemake's 45.79 AU (a
		// classical KBO near its outer edge), same convention as the main
		// Asteroid Belt entry sitting at Ceres/Pallas's shared 2.77 AU.
		au: 43,
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
		// Not a real climate body (no tilt, no atmosphere, no EBM-driven
		// terrain) -- value is inert filler to satisfy SolPlanetSeed.
		lsAphelionDeg: 0,
	},
	{
		name: "Pluto",
		group: "dwarf",
		classification: "snowball",
		texturePath: "/textures/celestial/sol/pluto/pluto.jpg",
		parentBeltName: "Kuiper Belt",
		au: 39.482,
		diameterEarths: 0.186,
		massEarths: 0.0022,
		gravityG: 0.063,
		densityEarthRelative: 0.336,
		densityDescription: "Mostly Ice",
		rotationHours: 153.2928,
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
		longitudeOfAscendingNodeDeg: 54.267,
		longitudeOfPerihelionDeg: 147.691,
		// Current-epoch value only: unlike Mars/Jupiter/Saturn/Uranus, Pluto's
		// real Ls-at-perihelion isn't a fixed number -- it precesses on a
		// ~3.7 Myr cycle. Bertrand & Forget (2016), modeling Pluto's volatile
		// cycles under the same real eccentricity (0.2488) and obliquity
		// (119.6 deg) as this data, give the current Ls_perihelion as 3.8 deg,
		// so aphelion sits 180 deg away at Ls ~= 183.8.
		lsAphelionDeg: 183.8,
		moons: [
			{
				name: "Charon",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/sol/pluto/charon.jpg",
				diameterEarths: 0.095,
				massEarths: 0.00025,
				gravityG: 0.029,
				densityEarthRelative: 0.309,
				densityDescription: "Mostly Ice",
				rotationHours: 153.2928,
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
	{
		name: "Haumea",
		group: "dwarf",
		classification: "snowball",
		// No real Haumea photo texture available -- generic rockball texture,
		// same convention as Ceres/Pallas/Eris.
		texturePath: "/textures/celestial/generated/rockball/6.png",
		parentBeltName: "Kuiper Belt",
		au: 43.13,
		// Real Haumea is a strongly elongated triaxial ellipsoid (~2100 x 1680 x
		// 1074 km, the defining consequence of its own extreme spin below) --
		// this data schema only has a single diameter field, so it uses the
		// real published "effective" (equal-volume-sphere) diameter rather than
		// any one axis.
		diameterEarths: 1560 / ORBIT_BODY.earthDiameterKm,
		massEarths: 4.006e21 / ORBIT_BODY.earthMassKg,
		gravityG: 0.0409,
		densityEarthRelative: 0.342,
		densityDescription: "Rock and Ice",
		// Real and remarkable -- Haumea is the fastest-known rotator of any
		// large solar-system body, which is what stretched it into its own
		// triaxial shape in the first place (likely from an ancient collision
		// that also produced its moons and ring).
		rotationHours: 3.9155,
		// Real axial tilt is observationally unconstrained, same caveat as
		// Eris.
		tiltDeg: 0,
		eccentricity: 0.195,
		atmosphere: {
			code: 0,
			pressureBar: 0,
			type: "vacuum",
			breathable: false,
		},
		landCoverage: 1,
		albedo: 0.66,
		greenhouseFactor: 0,
		inclinationDeg: 28.19,
		longitudeOfAscendingNodeDeg: 122.09,
		longitudeOfPerihelionDeg: 1.27,
		// No published real Ls-at-perihelion -- reuses the raw fixed-frame
		// value, same convention as Ceres/Eris.
		lsAphelionDeg: 1.27,
		moons: [
			{
				name: "Namaka",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/generated/rockball/7.png",
				diameterEarths: 170 / ORBIT_BODY.earthDiameterKm,
				// Real mass/density are both poorly constrained -- these are
				// order-of-magnitude estimates (assumed ~1 g/cm3 icy bulk
				// density), not tightly measured figures like Charon's.
				massEarths: 1.8e18 / ORBIT_BODY.earthMassKg,
				gravityG: 0.0017,
				densityEarthRelative: 0.1815,
				densityDescription: "Mostly Ice",
				// Real and notable: unlike most moons here, Namaka's rotation is
				// NOT synchronous -- it tumbles chaotically due to perturbation
				// from Hi'iaka's gravity, and this value (one of several reported)
				// is only an approximate snapshot.
				rotationHours: 18.2,
				tiltDeg: 0,
				// Real, fairly eccentric for a moon -- part of what drives its
				// chaotic (non-synchronous) rotation above.
				eccentricity: 0.249,
				pd: 25657 / 1560,
				orbitRange: "inner",
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				// Not well measured -- an icy-surface estimate, not a precise
				// published figure.
				albedo: 0.7,
				greenhouseFactor: 0,
				// Real and unusual: inclined relative to Hi'iaka's own orbital
				// plane (its dynamical reference here, since Haumea's own equator
				// isn't well pinned down) rather than aligned with it.
				inclinationDeg: 13,
			},
			{
				name: "Hi'iaka",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/generated/rockball/8.png",
				diameterEarths: 310 / ORBIT_BODY.earthDiameterKm,
				// Same estimate caveat as Namaka -- order-of-magnitude, not a
				// tightly measured figure.
				massEarths: 1.79e19 / ORBIT_BODY.earthMassKg,
				gravityG: 0.00507,
				densityEarthRelative: 0.1815,
				densityDescription: "Mostly Ice",
				// Real and notable, same non-synchronous-rotation family as
				// Namaka -- the larger of Haumea's two moons, but still not
				// tidally locked to it.
				rotationHours: 9.8,
				tiltDeg: 0,
				eccentricity: 0.0513,
				pd: 49880 / 1560,
				orbitRange: "outer",
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				albedo: 0.7,
				greenhouseFactor: 0,
				// Real and highly unusual -- close to a polar/near-perpendicular
				// orbit relative to Haumea's own spin, unlike the near-equatorial
				// moons everywhere else in this table.
				inclinationDeg: 126,
			},
		],
	},
	{
		name: "Makemake",
		group: "dwarf",
		classification: "snowball",
		// No real Makemake photo texture available -- generic rockball
		// texture.
		texturePath: "/textures/celestial/generated/rockball/1.png",
		parentBeltName: "Kuiper Belt",
		au: 45.79,
		diameterEarths: 1434 / ORBIT_BODY.earthDiameterKm,
		massEarths: 3.1e21 / ORBIT_BODY.earthMassKg,
		gravityG: 0.041,
		densityEarthRelative: 0.3086,
		densityDescription: "Rock and Ice",
		rotationHours: 22.48,
		// Real axial tilt is observationally unconstrained, same caveat as
		// Eris/Haumea.
		tiltDeg: 0,
		eccentricity: 0.161,
		atmosphere: {
			code: 0,
			pressureBar: 0,
			type: "vacuum",
			breathable: false,
		},
		landCoverage: 1,
		// Real, very high -- a fresh methane/ethane-ice surface, among the
		// most reflective large KBOs after Eris.
		albedo: 0.82,
		greenhouseFactor: 0,
		inclinationDeg: 28.98,
		longitudeOfAscendingNodeDeg: 79.62,
		longitudeOfPerihelionDeg: 16.56,
		lsAphelionDeg: 16.56,
	},
	{
		name: "Eris",
		group: "dwarf",
		classification: "snowball",
		// No real Eris photo texture available -- reuses a generic rockball
		// texture, same convention as Ceres/Pallas.
		texturePath: "/textures/celestial/generated/rockball/4.png",
		au: 67.78,
		diameterEarths: 2326 / ORBIT_BODY.earthDiameterKm,
		massEarths: 1.6466e22 / ORBIT_BODY.earthMassKg,
		gravityG: 0.0836,
		densityEarthRelative: 0.4573,
		densityDescription: "Mostly Ice",
		rotationHours: 25.9,
		// Real axial tilt is observationally unconstrained (unlike Pluto's
		// well-measured value) -- left at 0 rather than guessing.
		tiltDeg: 0,
		eccentricity: 0.436,
		atmosphere: {
			code: 0,
			pressureBar: 0,
			type: "vacuum",
			breathable: false,
		},
		landCoverage: 1,
		// Real Eris Bond albedo -- one of the most reflective bodies in the
		// solar system, higher even than Enceladus's fresh-ice surface.
		albedo: 0.96,
		// Airless in practice: Eris is cold enough that any real atmosphere it
		// once had is frozen onto the surface -- same 0 convention as Ceres/
		// Pallas/the outer icy moons.
		greenhouseFactor: 0,
		inclinationDeg: 44.04,
		longitudeOfAscendingNodeDeg: 35.95,
		longitudeOfPerihelionDeg: 187.23,
		// No published real Ls-at-perihelion for Eris -- reuses the raw
		// fixed-frame value, same convention as Ceres/Mercury/Venus.
		lsAphelionDeg: 187.23,
		moons: [
			{
				name: "Dysnomia",
				group: "dwarf",
				classification: "snowball",
				texturePath: "/textures/celestial/generated/rockball/5.png",
				diameterEarths: 700 / ORBIT_BODY.earthDiameterKm,
				// Real measured mass is imprecise (derived from a low, unexpected
				// bulk density found by JWST in 2023, suggesting a giant-impact
				// origin) -- this is a plausible estimate, not a tightly
				// constrained published figure the way Charon's is.
				massEarths: 2.1e20 / ORBIT_BODY.earthMassKg,
				gravityG: 0.01166,
				densityEarthRelative: 0.2178,
				densityDescription: "Mostly Ice",
				// Synchronous with its 15.786-day orbit around Eris, same
				// mutual-lock convention as Charon/Pluto.
				rotationHours: 15.786 * TIME.hoursPerDay,
				tiltDeg: 0,
				eccentricity: 0,
				pd: 37350 / 2326,
				orbitRange: "middle",
				atmosphere: NO_MOON_ATMOSPHERE,
				landCoverage: 1,
				// Not well measured -- Charon's real albedo used as a placeholder
				// stand-in rather than an invented precise figure.
				albedo: 0.35,
				greenhouseFactor: 0,
				// Real orbital inclination relative to Eris's equator is poorly
				// constrained; the ~78 deg figure sometimes quoted is relative to
				// the ecliptic instead, so this is left at the mutual-lock default
				// (effectively 0) rather than mixing reference frames.
				inclinationDeg: 0,
			},
		],
	},
]

export const SOL_DATA = {
	solSeed,
	solStarAgeGyr,
	solStarName,
	solMainWorldName,
	solEarthTexturePath,
	solEarthCloudsTexturePath,
	solPlanetRingsByName,
	solPlanetSeeds,
}
