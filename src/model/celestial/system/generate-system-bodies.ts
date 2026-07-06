import type {
	AtmosphereProfile,
	MoonParams,
	TideLock,
} from "@/model/celestial/moons/moon-types"
import {
	attachParentTideLocks,
	rollInclinationDeg,
} from "@/model/celestial/moons/moon-utils"
import {
	generateMoons,
	M_SOL_KG,
	rollMoonCountForParent,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getKeplerYearYears,
	getStarLuminositySol,
	getStarMassSol,
	type MainSequenceClass,
	rollStarAgeGyr,
} from "@/model/celestial/star/star-types"
import {
	estimateGreenhouseFactor,
	rollGasGiantGreenhouseFactor,
	rollGreenhouseFactor,
} from "@/model/climate/ebm/greenhouse-estimate"
import { createRng } from "@/model/shared/rng"
import { estimateGasGiantSizeClass, estimateRockySizeClass } from "./size-class"
import {
	buildPlanet,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
	SOL_STAR_AGE_GYR,
	SOL_SYSTEM_BODIES,
	type SolPlanetSeed,
} from "./sol-system"

const GRAVITATIONAL_CONSTANT = 6.674e-11
const STANDARD_GRAVITY_MS2 = 9.807
const DAYS_PER_YEAR = 365.25
const EARTH_DIAMETER_KM = 12_742
const EARTH_MASS_KG = 5.972e24

type OrbitGroup =
	| "asteroid belt"
	| "dwarf"
	| "terrestrial"
	| "helian"
	| "jovian"

type OrbitClassification =
	| "acheronian"
	| "arid"
	| "asphodelian"
	| "asteroid"
	| "asteroid belt"
	| "chthonian"
	| "geo-cyclic"
	| "geo-tidal"
	| "hebean"
	| "helian"
	| "jani-lithic"
	| "jovian"
	| "meltball"
	| "oceanic"
	| "panthalassic"
	| "rockball"
	| "snowball"
	| "stygian"
	| "tectonic"
	| "telluric"
	| "vesperian"

interface DensityProfile {
	earthRelative: number
	description: string
}

interface RingProfile {
	innerRadiusRelative: number
	outerRadiusRelative: number
	color: number
	opacity: number
}

export interface SystemBody {
	/** Stable identifier for this body within the system -- the main world is
	 * always -1; siblings/preset planets get non-negative indices. Lets a
	 * moon's tideLock reference "my parent" without embedding an object
	 * reference. See attachParentTideLocks. */
	idx: number
	name?: string
	sizeClass: number
	density: DensityProfile | null
	group: OrbitGroup
	classification: OrbitClassification
	texturePath?: string
	rings?: RingProfile
	hydrosphereFraction: number
	atmosphere: AtmosphereProfile | null
	isMainWorld: boolean
	orbitalDistanceAU: number
	/** 0 / unused for asteroid belts. */
	diameterKm: number
	/** 0 / unused for asteroid belts. */
	massKg: number
	/** 0 / unused for asteroid belts. */
	gravityG: number
	orbitalPeriodDays: number
	/** Sidereal rotation period (relative to the stars, not the sun) — 0 /
	 * unused for asteroid belts. */
	siderealDayHours: number
	eccentricity: number
	/** Longitude of perihelion, in degrees. */
	longitudeOfPerihelionDeg: number
	/** 0 / unused for asteroid belts. */
	axialTiltDeg: number
	/** Orbital inclination, in degrees — see rollInclinationDeg. */
	inclinationDeg: number
	/** Longitude of the ascending node, in degrees — where the orbit crosses
	 * the reference (equatorial) plane heading "north". No existing table to
	 * port for this, so it's just a uniform 0–360° roll like the moons use. */
	longitudeOfAscendingNodeDeg: number
	moons: MoonParams[]
	/** What (if anything) this body is tidally locked to. Undefined/null when
	 * not locked to anything. */
	tideLock?: TideLock | null
	/** Bond albedo, 0..1 — real measured value where known, otherwise unset. */
	albedo?: number
	/** EBM greenhouseFactor, individually fit per body — see
	 * sol-system.ts's SolPlanetSeed.greenhouseFactor doc. Unset elsewhere. */
	greenhouseFactor?: number
	/** EBM internalHeatTempK (residual/formation heat), relevant for gas
	 * giants — see sol-system.ts's SolPlanetSeed.greenhouseFactor doc.
	 * Unset (no known excess) for everything else. */
	internalHeatTempK?: number
	/** Longitude of the antistellar point (the spot on the surface directly
	 * facing away from the star), in degrees 0-360 — only meaningful when
	 * tideLock is set. Defaults to 180° when unset. */
	antistellarLon?: number
}

type Zone = "epistellar" | "inner" | "outer"

interface ClassifiedEnvironment {
	classification: OrbitClassification
	atmosphereCode: number
	hydrosphereCode: number
	chemistry: string
}

const EPISTELLAR_DEVIATIONS = [2.25, 1.75, 1.25]
const INNER_DEVIATIONS = [0.75, 0, -0.75]
const OUTER_DEVIATIONS = [
	-1.25, -1.75, -2.25, -2.75, -3.25, -3.75, -4, -4.25, -4.5,
]

// Ported from galaxy-gen's orbits/temperature module: a deviation value (how
// many "steps" hot/cold an orbital slot is from temperate) maps to a baseline
// Celsius temperature via this piecewise-linear curve (repeated domain values
// are intentional — they create a vertical jump at that deviation, matching
// galaxy-gen's original d3 scaleLinear definition).
const DEVIATION_DOMAIN = [
	-4.5, -4.0, -4.0, -3.5, -3.5, -3.0, -3.0, -2.5, -2.5, -2.0, -2.0, -1.5, -1.5,
	-1.0, -1.0, -0.5, -0.5, 0.5, 0.5, 1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 2.5,
]
const DEVIATION_RANGE = [
	-250, -230, -210, -190, -180, -160, -150, -130, -120, -100, -95, -75, -65,
	-50, -40, 0, 5, 25, 35, 75, 85, 180, 200, 300, 350, 450,
]

function deviationToCelsius(deviation: number): number {
	if (deviation <= DEVIATION_DOMAIN[0]) return DEVIATION_RANGE[0]
	const lastIndex = DEVIATION_DOMAIN.length - 1
	if (deviation >= DEVIATION_DOMAIN[lastIndex])
		return DEVIATION_RANGE[lastIndex]
	for (let i = 0; i < lastIndex; i++) {
		const x0 = DEVIATION_DOMAIN[i]
		const x1 = DEVIATION_DOMAIN[i + 1]
		if (deviation >= x0 && deviation <= x1) {
			if (x1 === x0) return DEVIATION_RANGE[i + 1]
			const t = (deviation - x0) / (x1 - x0)
			return (
				DEVIATION_RANGE[i] + t * (DEVIATION_RANGE[i + 1] - DEVIATION_RANGE[i])
			)
		}
	}
	return DEVIATION_RANGE[lastIndex]
}

// Ported from galaxy-gen's MATH.orbits.distance: the AU distance at which an
// orbit sitting at `kelvin` would occur for a star of the given luminosity
// (279 K is the reference blackbody temperature at 1 AU / 1 solar luminosity).
function auFromTemperature(kelvinTemp: number, luminositySol: number): number {
	return (luminositySol / (kelvinTemp / 279) ** 4) ** 0.5
}

function deviationToAU(deviation: number, luminositySol: number): number {
	const celsius = deviationToCelsius(deviation)
	const kelvin = celsius + 273.15
	return auFromTemperature(kelvin, luminositySol)
}

interface Slot {
	zone: Zone
	deviation: number
}

function describeDensity(
	earthRelative: number,
	classification: OrbitClassification,
): string {
	if (classification === "jovian" || classification === "chthonian") {
		return "Hydrogen-Helium Envelope"
	}
	if (earthRelative < 0.18) return "Exotic Ice"
	if (earthRelative < 0.5) return "Mostly Ice"
	if (earthRelative < 0.82) return "Mostly Rock"
	if (earthRelative < 1.15) return "Rock and Metal"
	if (earthRelative < 1.5) return "Mostly Metal"
	return "Compressed Metal"
}

function buildDensityProfile(
	massKg: number,
	diameterKm: number,
	classification: OrbitClassification,
): DensityProfile | null {
	if (massKg <= 0 || diameterKm <= 0) return null
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = massKg / EARTH_MASS_KG
	const earthRelative = massEarths / diameterEarths ** 3
	return {
		earthRelative,
		description: describeDensity(earthRelative, classification),
	}
}

function hydrosphereCodeToFraction(hydrosphereCode: number): number {
	if (hydrosphereCode <= 0) return 0
	if (hydrosphereCode >= 12) return 1
	if (hydrosphereCode === 11) return 0.95
	if (hydrosphereCode === 10) return 0.9
	return hydrosphereCode / 10
}

function roll2d5(rng: ReturnType<typeof createRng>): number {
	return rng.randint(1, 5) + rng.randint(1, 5)
}

function rollAtmosphereBar(
	rng: ReturnType<typeof createRng>,
	profile: Pick<AtmosphereProfile, "type" | "subtype">,
	panthalassic: boolean,
): number {
	if (profile.type === "vacuum") return rng.uniform(0, 0.0009)
	if (profile.type === "trace") return rng.uniform(0.001, 0.09)
	if (profile.subtype === "very thin") return rng.uniform(0.1, 0.42)
	if (profile.subtype === "thin") return rng.uniform(0.43, 0.69)
	if (profile.subtype === "standard" || profile.subtype === "unusual") {
		return panthalassic ? rng.uniform(1, 1.49) : rng.uniform(0.7, 1.49)
	}
	if (profile.subtype === "dense") return rng.uniform(1.5, 2.49)
	if (profile.subtype === "very dense") return rng.uniform(2.5, 10)
	if (profile.type === "gas" && profile.subtype === "helium") {
		return rng.uniform(100, 1000)
	}
	if (profile.type === "gas" && profile.subtype === "hydrogen") {
		return rng.uniform(1000, 5000)
	}
	return 0
}

function atmosphereCodeToProfile(
	rng: ReturnType<typeof createRng>,
	atmosphereCode: number,
	params: {
		chemistry: string
		sizeClass: number
		deviation: number
		hydrosphereCode: number
		gravityG: number
		classification: OrbitClassification
		isPrimaryWorld: boolean
	},
): AtmosphereProfile | null {
	let code = atmosphereCode
	const nonhabitable = params.deviation < -1.5 || params.deviation > 1.5
	if (params.isPrimaryWorld && (code < 4 || (code > 9 && code <= 10))) {
		code = [5, 6, 6, 8][rng.randint(0, 3)]!
	}
	if (params.sizeClass <= 1) code = Math.min(code, 1)
	else if (nonhabitable && code >= 2 && code <= 9) code = 10

	let profile: Omit<AtmosphereProfile, "pressureBar"> | null = null
	if (code === 0) profile = { code, type: "vacuum", breathable: false }
	else if (code === 1) profile = { code, type: "trace", breathable: false }
	else if (code === 2) {
		profile = {
			code,
			type: "breathable",
			subtype: "very thin",
			tainted: true,
			breathable: true,
		}
	} else if (code === 3) {
		profile = {
			code,
			type: "breathable",
			subtype: "very thin",
			breathable: true,
		}
	} else if (code === 4) {
		profile = {
			code,
			type: "breathable",
			subtype: "thin",
			tainted: true,
			breathable: true,
		}
	} else if (code === 5) {
		profile = {
			code,
			type: "breathable",
			subtype: "thin",
			breathable: true,
		}
	} else if (code === 6) {
		profile = {
			code,
			type: "breathable",
			subtype: "standard",
			breathable: true,
		}
	} else if (code === 7) {
		profile = {
			code,
			type: "breathable",
			subtype: "standard",
			tainted: true,
			breathable: true,
		}
	} else if (code === 8) {
		profile = {
			code,
			type: "breathable",
			subtype: "dense",
			breathable: true,
		}
	} else if (code === 9) {
		profile = {
			code,
			type: "breathable",
			subtype: "dense",
			tainted: true,
			breathable: true,
		}
	} else if (code === 10) {
		let roll = roll2d5(rng)
		if (params.sizeClass <= 4) roll -= 2
		if (params.deviation >= 1.5) roll -= 2
		if (params.deviation <= -1.5) roll += 2
		if (roll <= 2) {
			profile = {
				code,
				type: "exotic",
				subtype: "very thin",
				tainted: true,
				breathable: false,
			}
		} else if (roll <= 3) {
			profile = {
				code,
				type: "exotic",
				subtype: "very thin",
				breathable: false,
			}
		} else if (roll <= 4) {
			profile = {
				code,
				type: "exotic",
				subtype: "thin",
				tainted: true,
				breathable: false,
			}
		} else if (roll <= 5) {
			profile = {
				code,
				type: "exotic",
				subtype: "thin",
				breathable: false,
			}
		} else if (roll <= 6) {
			profile = {
				code,
				type: "exotic",
				subtype: "standard",
				tainted: true,
				breathable: false,
			}
		} else if (roll <= 8) {
			profile = {
				code,
				type: "exotic",
				subtype: "standard",
				breathable: false,
			}
		} else if (roll <= 9) {
			profile = {
				code,
				type: "exotic",
				subtype: "dense",
				tainted: true,
				breathable: false,
			}
		} else {
			profile = {
				code,
				type: "exotic",
				subtype: "dense",
				breathable: false,
			}
		}
	} else if (code === 11 || code === 12) {
		let roll = roll2d6(rng)
		if (params.sizeClass <= 4) roll -= 3
		if (params.sizeClass >= 8) roll += 2
		if (params.deviation >= 1.5) roll += 4
		if (params.deviation <= -1.5) roll -= 2
		if (code === 12) roll += 2
		if (params.classification === "telluric") roll += 4
		profile = {
			code,
			type: code === 12 ? "insidious" : "corrosive",
			subtype:
				roll <= 3
					? "very thin"
					: roll <= 5
						? "thin"
						: roll <= 7
							? "standard"
							: roll <= 10
								? "dense"
								: "very dense",
			breathable: false,
		}
	} else if (code === 13) {
		const panthalassic = params.classification === "panthalassic"
		const gasRoll = rng.uniform(0, 1)
		if (!params.isPrimaryWorld && !panthalassic && gasRoll > 0.8) {
			profile = {
				code: gasRoll > 0.92 ? 17 : 16,
				type: "gas",
				subtype: gasRoll > 0.92 ? "hydrogen" : "helium",
				breathable: false,
			}
		} else {
			const breathable = params.isPrimaryWorld || !nonhabitable
			profile = {
				code: breathable ? 13 : 10,
				type: breathable ? "breathable" : "exotic",
				subtype: "very dense",
				breathable,
			}
		}
	} else if (code === 16 || code === 17 || code === 14) {
		profile = {
			code: code === 14 ? 17 : code,
			type: "gas",
			subtype: code === 16 ? "helium" : "hydrogen",
			breathable: false,
		}
	}

	if (!profile) return null
	return {
		...profile,
		pressureBar: rollAtmosphereBar(
			rng,
			profile,
			params.classification === "panthalassic",
		),
	}
}

const CLASS_ENVIRONMENTS: Record<OrbitClassification, ClassifiedEnvironment> = {
	acheronian: {
		classification: "acheronian",
		atmosphereCode: 1,
		hydrosphereCode: 0,
		chemistry: "water",
	},
	arid: {
		classification: "arid",
		atmosphereCode: 6,
		hydrosphereCode: 2,
		chemistry: "water",
	},
	asphodelian: {
		classification: "asphodelian",
		atmosphereCode: 1,
		hydrosphereCode: 0,
		chemistry: "water",
	},
	asteroid: {
		classification: "asteroid",
		atmosphereCode: 0,
		hydrosphereCode: 0,
		chemistry: "rocky",
	},
	"asteroid belt": {
		classification: "asteroid belt",
		atmosphereCode: 0,
		hydrosphereCode: 0,
		chemistry: "rocky",
	},
	chthonian: {
		classification: "chthonian",
		atmosphereCode: 1,
		hydrosphereCode: 0,
		chemistry: "hydrogen-helium",
	},
	"geo-cyclic": {
		classification: "geo-cyclic",
		atmosphereCode: 1,
		hydrosphereCode: 2,
		chemistry: "water",
	},
	"geo-tidal": {
		classification: "geo-tidal",
		atmosphereCode: 7,
		hydrosphereCode: 3,
		chemistry: "water",
	},
	hebean: {
		classification: "hebean",
		atmosphereCode: 10,
		hydrosphereCode: 3,
		chemistry: "water",
	},
	helian: {
		classification: "helian",
		atmosphereCode: 13,
		hydrosphereCode: 6,
		chemistry: "water",
	},
	"jani-lithic": {
		classification: "jani-lithic",
		atmosphereCode: 1,
		hydrosphereCode: 0,
		chemistry: "water",
	},
	jovian: {
		classification: "jovian",
		atmosphereCode: 17,
		hydrosphereCode: 13,
		chemistry: "hydrogen-helium",
	},
	meltball: {
		classification: "meltball",
		atmosphereCode: 1,
		hydrosphereCode: 12,
		chemistry: "silicate vapor",
	},
	oceanic: {
		classification: "oceanic",
		atmosphereCode: 8,
		hydrosphereCode: 10,
		chemistry: "water",
	},
	panthalassic: {
		classification: "panthalassic",
		atmosphereCode: 11,
		hydrosphereCode: 11,
		chemistry: "water",
	},
	rockball: {
		classification: "rockball",
		atmosphereCode: 0,
		hydrosphereCode: 0,
		chemistry: "rocky",
	},
	snowball: {
		classification: "snowball",
		atmosphereCode: 1,
		hydrosphereCode: 10,
		chemistry: "water",
	},
	stygian: {
		classification: "stygian",
		atmosphereCode: 0,
		hydrosphereCode: 0,
		chemistry: "rocky",
	},
	tectonic: {
		classification: "tectonic",
		atmosphereCode: 7,
		hydrosphereCode: 7,
		chemistry: "water",
	},
	telluric: {
		classification: "telluric",
		atmosphereCode: 12,
		hydrosphereCode: 0,
		chemistry: "water",
	},
	vesperian: {
		classification: "vesperian",
		atmosphereCode: 7,
		hydrosphereCode: 4,
		chemistry: "water",
	},
}

function classifyGroup(params: {
	groupHint?: OrbitGroup
	sizeClass: number
}): OrbitGroup {
	if (params.groupHint) return params.groupHint
	const { sizeClass } = params
	if (sizeClass <= 4) return "dwarf"
	if (sizeClass <= 10) return "terrestrial"
	return "helian"
}

function classifyBody(params: {
	groupHint?: OrbitGroup
	zone: Zone
	orbitalDistanceAU: number
	sizeClass: number
	isPrimaryWorld: boolean
	isMoon: boolean
	tidal: boolean
}): { group: OrbitGroup; classification: OrbitClassification } {
	const { zone, orbitalDistanceAU, sizeClass, isPrimaryWorld, isMoon, tidal } =
		params
	const group = classifyGroup({ groupHint: params.groupHint, sizeClass })
	if (isPrimaryWorld)
		return { group: "terrestrial", classification: "tectonic" }
	if (group === "asteroid belt") {
		return { group, classification: isMoon ? "asteroid" : "asteroid belt" }
	}
	if (group === "jovian") {
		if (zone === "epistellar" && orbitalDistanceAU < 0.15) {
			return { group, classification: "chthonian" }
		}
		return { group, classification: "jovian" }
	}
	if (group === "helian") {
		if (zone === "epistellar" && orbitalDistanceAU < 0.2) {
			return { group, classification: "asphodelian" }
		}
		if (zone === "inner" && sizeClass >= 12) {
			return { group, classification: "panthalassic" }
		}
		return { group, classification: "helian" }
	}
	if (group === "terrestrial") {
		if (zone === "epistellar" && orbitalDistanceAU < 0.15) {
			return { group, classification: "acheronian" }
		}
		if (tidal) {
			if (zone === "epistellar") return { group, classification: "jani-lithic" }
			if (zone === "inner") return { group, classification: "vesperian" }
		}
		if (zone === "epistellar") {
			return { group, classification: sizeClass >= 8 ? "telluric" : "arid" }
		}
		if (zone === "inner") {
			if (sizeClass <= 5) return { group, classification: "telluric" }
			if (sizeClass <= 7) return { group, classification: "arid" }
			if (sizeClass <= 9) return { group, classification: "oceanic" }
			return { group, classification: "tectonic" }
		}
		if (sizeClass <= 7) return { group, classification: "arid" }
		if (sizeClass <= 9) return { group, classification: "tectonic" }
		return { group, classification: "oceanic" }
	}
	if (zone === "epistellar" && orbitalDistanceAU < 0.15) {
		return { group, classification: "stygian" }
	}
	if (zone === "epistellar") {
		if (tidal && sizeClass >= 2) {
			return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
		}
		return { group, classification: sizeClass <= 2 ? "rockball" : "meltball" }
	}
	if (zone === "inner") {
		if (tidal && sizeClass >= 2) {
			return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
		}
		if (sizeClass >= 4) return { group, classification: "geo-cyclic" }
		return { group, classification: "rockball" }
	}
	if (tidal && sizeClass >= 2) {
		return { group, classification: sizeClass >= 4 ? "geo-tidal" : "hebean" }
	}
	if (sizeClass <= 1) return { group, classification: "snowball" }
	if (sizeClass >= 4) return { group, classification: "geo-cyclic" }
	return { group, classification: "rockball" }
}

function buildBodyEnvironment(params: {
	rng: ReturnType<typeof createRng>
	groupHint?: OrbitGroup
	zone: Zone
	deviation: number
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	isPrimaryWorld: boolean
	isMoon: boolean
	tidal: boolean
}): Pick<
	SystemBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "hydrosphereFraction"
	| "atmosphere"
	| "greenhouseFactor"
> {
	const sizeClass =
		params.groupHint === "jovian"
			? estimateGasGiantSizeClass(params.diameterKm)
			: estimateRockySizeClass(params.diameterKm)
	const body = classifyBody({ ...params, sizeClass })
	const environment = CLASS_ENVIRONMENTS[body.classification]
	const gravityG =
		params.massKg > 0 ? computeGravityG(params.massKg, params.diameterKm) : 0
	const atmosphere = atmosphereCodeToProfile(
		params.rng,
		environment.atmosphereCode,
		{
			chemistry: environment.chemistry,
			sizeClass,
			deviation: params.deviation,
			hydrosphereCode: environment.hydrosphereCode,
			gravityG,
			classification: body.classification,
			isPrimaryWorld: params.isPrimaryWorld,
		},
	)
	const greenhouseFactor =
		body.group === "jovian"
			? rollGasGiantGreenhouseFactor(params.rng)
			: rollGreenhouseFactor(
					params.rng,
					atmosphere?.pressureBar ?? 0,
					atmosphere?.code ?? 0,
				)
	return {
		sizeClass,
		density: buildDensityProfile(
			params.massKg,
			params.diameterKm,
			body.classification,
		),
		group: body.group,
		classification: body.classification,
		hydrosphereFraction: hydrosphereCodeToFraction(environment.hydrosphereCode),
		atmosphere,
		greenhouseFactor,
	}
}

function buildMoonEnvironment(params: {
	rng: ReturnType<typeof createRng>
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	zone: Zone
	deviation: number
	sizeClass?: number
	isPrimaryWorld: boolean
	orbitRange?: MoonParams["orbitRange"]
	semiMajorAxisPlanetDiameters?: number
}): Pick<
	MoonParams,
	| "sizeClass"
	| "densityEarthRelative"
	| "densityDescription"
	| "group"
	| "classification"
	| "hydrosphereFraction"
	| "atmosphere"
	| "greenhouseFactor"
> {
	const sizeClass =
		params.sizeClass ?? estimateRockySizeClass(params.diameterKm)
	const tidal =
		params.orbitRange === "inner" ||
		(params.semiMajorAxisPlanetDiameters ?? Number.POSITIVE_INFINITY) <= 8
	const body = classifyBody({
		groupHint: undefined,
		zone: params.zone,
		orbitalDistanceAU: params.orbitalDistanceAU,
		sizeClass,
		isPrimaryWorld: params.isPrimaryWorld,
		isMoon: true,
		tidal,
	})
	const environment = CLASS_ENVIRONMENTS[body.classification]
	const density = buildDensityProfile(
		params.massKg,
		params.diameterKm,
		body.classification,
	)
	const gravityG =
		params.massKg > 0 ? computeGravityG(params.massKg, params.diameterKm) : 0
	const atmosphere = atmosphereCodeToProfile(
		params.rng,
		environment.atmosphereCode,
		{
			chemistry: environment.chemistry,
			sizeClass,
			deviation: params.deviation,
			hydrosphereCode: environment.hydrosphereCode,
			gravityG,
			classification: body.classification,
			isPrimaryWorld: params.isPrimaryWorld,
		},
	)
	const greenhouseFactor =
		body.group === "jovian"
			? rollGasGiantGreenhouseFactor(params.rng)
			: rollGreenhouseFactor(
					params.rng,
					atmosphere?.pressureBar ?? 0,
					atmosphere?.code ?? 0,
				)
	return {
		sizeClass,
		densityEarthRelative: density?.earthRelative,
		densityDescription: density?.description,
		group: body.group,
		classification: body.classification,
		hydrosphereFraction: hydrosphereCodeToFraction(environment.hydrosphereCode),
		atmosphere,
		greenhouseFactor,
	}
}

function rollOrbitGroup(
	rng: ReturnType<typeof createRng>,
	zone: Zone,
): OrbitGroup {
	const weights: Record<OrbitGroup, number> =
		zone === "outer"
			? {
					"asteroid belt": 1,
					dwarf: 1,
					terrestrial: 1,
					helian: 0.6,
					jovian: 2,
				}
			: zone === "inner"
				? {
						"asteroid belt": 1,
						dwarf: 1.2,
						terrestrial: 2,
						helian: 0.3,
						jovian: 0.2,
					}
				: {
						"asteroid belt": 0.5,
						dwarf: 1.5,
						terrestrial: 1.3,
						helian: 0.2,
						jovian: 0.1,
					}
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
	let roll = rng.uniform(0, total)
	for (const group of [
		"asteroid belt",
		"dwarf",
		"terrestrial",
		"helian",
		"jovian",
	] as const) {
		roll -= weights[group]
		if (roll <= 0) return group
	}
	return "dwarf"
}

function rollSizeClass(
	rng: ReturnType<typeof createRng>,
	group: OrbitGroup,
): number {
	if (group === "asteroid belt") return -1
	if (group === "dwarf") return rng.randint(0, 4)
	if (group === "terrestrial") return rng.randint(5, 10)
	if (group === "helian") return rng.randint(11, 15)
	return rng.randint(16, 18)
}

function rollDiameterKmFromSizeClass(
	rng: ReturnType<typeof createRng>,
	sizeClass: number,
): number {
	if (sizeClass < 0) return 0
	if (sizeClass === 0) return rng.uniform(400, 800)
	if (sizeClass === 1) return rng.uniform(1000, 2000)
	if (sizeClass === 16) return rng.uniform(2, 6) * EARTH_DIAMETER_KM
	if (sizeClass === 17) return rng.uniform(6, 12) * EARTH_DIAMETER_KM
	if (sizeClass === 18) return rng.uniform(8, 18) * EARTH_DIAMETER_KM
	const minKm = 1200 + sizeClass * 1600
	const maxKm = minKm + 1600
	return rng.uniform(minKm, maxKm)
}

function pickDensityEarthRelative(
	rng: ReturnType<typeof createRng>,
	group: OrbitGroup,
	classification: OrbitClassification,
): number {
	if (group === "jovian" || classification === "chthonian") {
		return rng.uniform(0.08, 0.35)
	}
	if (
		classification === "snowball" ||
		classification === "panthalassic" ||
		classification === "helian"
	) {
		return rng.uniform(0.2, 0.6)
	}
	if (
		classification === "rockball" ||
		classification === "geo-cyclic" ||
		classification === "arid" ||
		classification === "tectonic" ||
		classification === "oceanic" ||
		classification === "vesperian"
	) {
		return rng.uniform(0.55, 1.05)
	}
	if (
		classification === "telluric" ||
		classification === "meltball" ||
		classification === "stygian" ||
		classification === "acheronian" ||
		classification === "asphodelian"
	) {
		return rng.uniform(0.9, 1.5)
	}
	return rng.uniform(0.6, 1.2)
}

function roll2d6(rng: ReturnType<typeof createRng>): number {
	return rng.randint(1, 6) + rng.randint(1, 6)
}

// Ported from galaxy-gen's MATH.orbits.eccentricity (orbits/index.ts), with
// the star-companion/moon/stellar-age modifiers dropped — none of those
// apply to a plain sibling planet around a lone main-sequence star.
function rollEccentricity(rng: ReturnType<typeof createRng>): number {
	const roll = roll2d6(rng)
	if (roll <= 5) return 0
	if (roll <= 7) return rng.uniform(0.01, 0.03)
	if (roll <= 9) return rng.uniform(0.04, 0.09)
	if (roll <= 10) return rng.uniform(0.1, 0.35)
	if (roll <= 11) return rng.uniform(0.15, 0.65)
	return rng.uniform(0.4, 0.9)
}

// Ported from galaxy-gen's MATH.tilt.compute (non-homeworld branch).
function rollAxialTiltDeg(rng: ReturnType<typeof createRng>): number {
	const standard = roll2d6(rng)
	if (standard <= 4) return rng.uniform(0.01, 0.1)
	if (standard <= 5) return rng.uniform(0.2, 1.2)
	if (standard <= 6) return rng.uniform(1, 6)
	if (standard <= 7) return rng.uniform(7, 12)
	if (standard <= 9) return rng.uniform(10, 35)
	const extreme = rng.randint(1, 6)
	if (extreme <= 2) return rng.uniform(20, 70)
	if (extreme <= 4) return rng.uniform(40, 90)
	if (extreme <= 5) return rng.uniform(91, 126)
	return rng.uniform(144, 180)
}

// Ported from galaxy-gen's ROTATION.get — the sidereal-day-length dice
// table, including its stellar-age modifier (older stars' systems roll
// slower base rotations), but without the tidal-lock cascade (locks/effect),
// since decorative siblings don't need the full lock simulation.
function rollSiderealDayHours(
	rng: ReturnType<typeof createRng>,
	isJovian: boolean,
	starAgeGyr: number,
): number {
	const mult = isJovian ? 2 : 4
	const ageMod = Math.floor(starAgeGyr / 2)
	let base = (roll2d6(rng) - 2) * mult + 2 + rng.randint(1, 6) + ageMod
	let rotation = base
	while (base > 40 && rng.randint(1, 6) >= 5) {
		base = (roll2d6(rng) - 2) * mult + rng.randint(1, 6)
		rotation += base
	}
	return rotation * rng.uniform(0.95, 1.05)
}

// Star age is rolled from its own salted rng derived from the same system
// seed, decorrelated from the main body-generation rng sequence (created
// with a fresh `createRng` instance below) so callers (e.g. the UI's star
// stat card) can reproduce the exact same value from just (seed, massSol)
// without needing to replay the whole body-generation sequence.
const STAR_AGE_SEED_SALT = 0x9e3779b1

export function getStarAgeGyr(seed: number, massSol: number): number {
	if (seed === SOL_SEED) return SOL_STAR_AGE_GYR
	const rng = createRng(seed + STAR_AGE_SEED_SALT)
	return rollStarAgeGyr(rng, massSol)
}

function massKgFromEarthRelativeDensity(
	diameterKm: number,
	densityEarthRelative: number,
): number {
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = densityEarthRelative * diameterEarths ** 3
	return massEarths * EARTH_MASS_KG
}

function computeGravityG(massKg: number, diameterKm: number): number {
	const radiusM = (diameterKm / 2) * 1000
	return (GRAVITATIONAL_CONSTANT * massKg) / radiusM ** 2 / STANDARD_GRAVITY_MS2
}

/** The main world's raw physical parameters come from the user's live UI
 * sliders, not RNG rolls — everything else (classification, atmosphere,
 * density, greenhouse factor, ...) is derived via the same
 * buildBodyEnvironment() path every sibling planet uses. */
/** The main world's raw physical parameters come from the user's live UI
 * sliders, not RNG rolls -- everything else (classification, hydrosphere,
 * texture, ...) is fixed the same way it is for every other Sol body, since
 * the main world is hydrated by the exact same buildPlanet() (see
 * buildMainWorldSeed below). */
export interface HomeWorldParams {
	name?: string
	orbitalDistanceAU: number
	diameterKm: number
	moons: MoonParams[]
	massKg: number
	gravityG: number
	siderealDayHours: number
	eccentricity: number
	longitudeOfPerihelionDeg?: number
	axialTiltDeg: number
	inclinationDeg?: number
	tideLock?: TideLock | null
	atmosphere?: AtmosphereProfile | null
	/** Real fitted values (see sol-system.ts's SOL_MAIN_WORLD_DEFAULTS) --
	 * only supplied when generating the real Sol seed's Earth. A
	 * procedurally generated main world has no "real" albedo (left unset,
	 * same as any other generated body -- the UI estimates one from land
	 * coverage) but still needs a real greenhouseFactor NUMBER (unlike
	 * albedo, the stats UI has no estimate fallback for a missing one), so
	 * that one gets a heuristic estimate when not supplied. */
	albedo?: number
	greenhouseFactor?: number
}

interface GenerateSystemBodiesParams {
	seed: number
	spectralClass: MainSequenceClass
	starSubtype: number
	hoursPerDay: number
	mainWorld: HomeWorldParams
}

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
	const density = buildDensityProfile(
		mainWorld.massKg,
		mainWorld.diameterKm,
		"tectonic",
	)
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
		atmosphere: mainWorld.atmosphere ?? undefined,
		hydrosphereFraction: 0.71,
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
	const { seed, spectralClass, starSubtype, hoursPerDay, mainWorld } = params
	const rng = createRng(seed)

	if (seed === SOL_SEED) {
		const mainWorldSeed: SolPlanetSeed = {
			...buildMainWorldSeed(mainWorld),
			inclinationDeg:
				mainWorld.inclinationDeg ?? SOL_MAIN_WORLD_DEFAULTS.inclinationDeg,
		}
		return [
			...SOL_SYSTEM_BODIES,
			buildPlanet(mainWorldSeed, seed, -1, {
				textureOverride: "/2k_earth.jpg",
				moonsOverride: mainWorld.moons,
			}),
		].sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU)
	}

	const luminositySol = getStarLuminositySol(spectralClass, starSubtype)
	const starMassKg = M_SOL_KG

	const epistellarCount = rng.randint(0, 2)
	const innerCount = rng.randint(1, 3)
	const outerCount = rng.randint(1, 5)

	const slots: Slot[] = [
		...rng
			.sample(EPISTELLAR_DEVIATIONS, epistellarCount)
			.map((deviation) => ({ zone: "epistellar" as const, deviation })),
		// One inner slot is reserved for the main world (deviation 0, the
		// "temperate" slot) — same guarantee galaxy-gen gives its homeworld.
		...rng
			.sample(
				INNER_DEVIATIONS.filter((d) => d !== 0),
				Math.max(0, innerCount - 1),
			)
			.map((deviation) => ({ zone: "inner" as const, deviation })),
		...rng
			.sample(OUTER_DEVIATIONS, outerCount)
			.map((deviation) => ({ zone: "outer" as const, deviation })),
	]

	const starMassSol = getStarMassSol(spectralClass, starSubtype)
	const starAgeGyr = getStarAgeGyr(seed, starMassSol)

	const siblings: SystemBody[] = slots.map((slot, siblingIdx) => {
		const orbitalDistanceAU = deviationToAU(slot.deviation, luminositySol)
		const group = rollOrbitGroup(rng, slot.zone)
		const sizeClass = rollSizeClass(rng, group)
		const classification = classifyBody({
			groupHint: group,
			zone: slot.zone,
			orbitalDistanceAU,
			sizeClass,
			isPrimaryWorld: false,
			isMoon: false,
			tidal: false,
		}).classification
		const diameterKm = rollDiameterKmFromSizeClass(rng, sizeClass)
		const densityEarthRelative =
			group === "asteroid belt"
				? 0
				: pickDensityEarthRelative(rng, group, classification)
		const massKg =
			group === "asteroid belt"
				? 0
				: massKgFromEarthRelativeDensity(diameterKm, densityEarthRelative)
		const moonCount =
			group === "asteroid belt"
				? 0
				: rollMoonCountForParent(rng, group, sizeClass, orbitalDistanceAU)
		const moons =
			moonCount > 0
				? generateMoons(
						moonCount,
						rng.randint(1, 1_000_000_000),
						diameterKm / 2,
						orbitalDistanceAU,
						hoursPerDay,
						starMassKg,
						group,
					).map((moon) => ({
						...buildMoonEnvironment({
							rng,
							diameterKm: moon.diameterKm,
							massKg: moon.massKg,
							orbitalDistanceAU,
							zone: slot.zone,
							deviation: slot.deviation,
							isPrimaryWorld: false,
							orbitRange: moon.orbitRange,
							semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters,
						}),
						...moon,
					}))
				: []
		const moonsWithTideLocks = attachParentTideLocks(moons, siblingIdx)
		const environment = buildBodyEnvironment({
			rng,
			groupHint: group,
			zone: slot.zone,
			deviation: slot.deviation,
			diameterKm,
			massKg,
			orbitalDistanceAU,
			isPrimaryWorld: false,
			isMoon: false,
			tidal: false,
		})
		return {
			...environment,
			idx: siblingIdx,
			isMainWorld: false,
			orbitalDistanceAU,
			diameterKm,
			massKg,
			gravityG:
				group === "asteroid belt" ? 0 : computeGravityG(massKg, diameterKm),
			orbitalPeriodDays:
				getKeplerYearYears(orbitalDistanceAU, starMassSol) * DAYS_PER_YEAR,
			siderealDayHours:
				group === "asteroid belt"
					? 0
					: rollSiderealDayHours(rng, group === "jovian", starAgeGyr),
			eccentricity: group === "asteroid belt" ? 0 : rollEccentricity(rng),
			longitudeOfPerihelionDeg: rng.uniform(0, 360),
			axialTiltDeg: group === "asteroid belt" ? 0 : rollAxialTiltDeg(rng),
			inclinationDeg: group === "asteroid belt" ? 0 : rollInclinationDeg(rng),
			longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
			moons: moonsWithTideLocks,
		}
	})

	const mainBody = buildPlanet(buildMainWorldSeed(mainWorld), seed, -1, {
		starMassSol,
		moonsOverride: mainWorld.moons,
	})

	return [...siblings, mainBody].sort(
		(a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU,
	)
}
