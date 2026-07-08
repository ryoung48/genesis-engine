import type { AtmosphereProfile } from "@/model/celestial/moons/moon-types"
import type {
	DensityProfile,
	OrbitClassification,
	OrbitGroup,
} from "@/model/celestial/orbit-body"
import {
	estimateGreenhouseFactor,
	rollGasGiantGreenhouseFactor,
	rollGreenhouseFactor,
} from "@/model/climate/ebm/greenhouse-estimate"
import { createRng } from "@/model/shared/rng"

export type { DensityProfile, OrbitClassification, OrbitGroup }

const EARTH_DIAMETER_KM = 12_742
const EARTH_MASS_KG = 5.973886146404331e24

export type Zone = "epistellar" | "inner" | "outer"

interface ClassifiedEnvironment {
	atmosphereCode: number
	hydrosphereCode: number
	chemistry: string
}

const DEVIATION_DOMAIN = [
	-4.5, -4.0, -4.0, -3.5, -3.5, -3.0, -3.0, -2.5, -2.5, -2.0, -2.0, -1.5, -1.5,
	-1.0, -1.0, -0.5, -0.5, 0.5, 0.5, 1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 2.5,
] as const

const DEVIATION_RANGE = [
	-250, -230, -210, -190, -180, -160, -150, -130, -120, -100, -95, -75, -65,
	-50, -40, 0, 5, 25, 35, 75, 85, 180, 200, 300, 350, 450,
] as const

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

function celsiusForOrbitalDistance(
	orbitalDistanceAU: number,
	luminositySol: number,
): number {
	return 279 * (luminositySol / orbitalDistanceAU ** 2) ** 0.25 - 273.15
}

function auFromTemperature(kelvinTemp: number, luminositySol: number): number {
	return (luminositySol / (kelvinTemp / 279) ** 4) ** 0.5
}

export function deviationToAU(
	deviation: number,
	luminositySol: number,
): number {
	return auFromTemperature(
		deviationToCelsius(deviation) + 273.15,
		luminositySol,
	)
}

export function estimateDeviationFromOrbitalDistance(
	orbitalDistanceAU: number,
	luminositySol: number,
): number {
	const targetCelsius = celsiusForOrbitalDistance(
		orbitalDistanceAU,
		luminositySol,
	)
	let closestDeviation = 0
	let closestDelta = Number.POSITIVE_INFINITY
	for (let step = -45; step <= 25; step++) {
		const deviation = step / 10
		const delta = Math.abs(deviationToCelsius(deviation) - targetCelsius)
		if (delta < closestDelta) {
			closestDelta = delta
			closestDeviation = deviation
		}
	}
	return closestDeviation
}

export function zoneFromDeviation(deviation: number): Zone {
	if (deviation >= 1) return "epistellar"
	if (deviation <= -1) return "outer"
	return "inner"
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

export function buildDensityProfile(
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

function roll2d6(rng: ReturnType<typeof createRng>): number {
	return rng.randint(1, 6) + rng.randint(1, 6)
}

// Relative to Earth (see body-metrics.ts's computeGravityG doc) -- G cancels
// out of the ratio, so this is exact instead of drifting off 1.000g at
// Earth's own defaults.
function computeGravityG(massKg: number, diameterKm: number): number {
	const massEarths = massKg / EARTH_MASS_KG
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	return massEarths / diameterEarths ** 2
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
	acheronian: { atmosphereCode: 1, hydrosphereCode: 0, chemistry: "water" },
	arid: { atmosphereCode: 6, hydrosphereCode: 2, chemistry: "water" },
	asphodelian: { atmosphereCode: 1, hydrosphereCode: 0, chemistry: "water" },
	asteroid: { atmosphereCode: 0, hydrosphereCode: 0, chemistry: "rocky" },
	"asteroid belt": {
		atmosphereCode: 0,
		hydrosphereCode: 0,
		chemistry: "rocky",
	},
	chthonian: {
		atmosphereCode: 1,
		hydrosphereCode: 0,
		chemistry: "hydrogen-helium",
	},
	"geo-cyclic": { atmosphereCode: 1, hydrosphereCode: 2, chemistry: "water" },
	"geo-tidal": { atmosphereCode: 7, hydrosphereCode: 3, chemistry: "water" },
	hebean: { atmosphereCode: 10, hydrosphereCode: 3, chemistry: "water" },
	helian: { atmosphereCode: 13, hydrosphereCode: 6, chemistry: "water" },
	"jani-lithic": { atmosphereCode: 1, hydrosphereCode: 0, chemistry: "water" },
	jovian: {
		atmosphereCode: 17,
		hydrosphereCode: 13,
		chemistry: "hydrogen-helium",
	},
	meltball: {
		atmosphereCode: 1,
		hydrosphereCode: 12,
		chemistry: "silicate vapor",
	},
	oceanic: { atmosphereCode: 8, hydrosphereCode: 10, chemistry: "water" },
	panthalassic: { atmosphereCode: 11, hydrosphereCode: 11, chemistry: "water" },
	rockball: { atmosphereCode: 0, hydrosphereCode: 0, chemistry: "rocky" },
	snowball: { atmosphereCode: 1, hydrosphereCode: 10, chemistry: "water" },
	stygian: { atmosphereCode: 0, hydrosphereCode: 0, chemistry: "rocky" },
	tectonic: { atmosphereCode: 7, hydrosphereCode: 7, chemistry: "water" },
	telluric: { atmosphereCode: 12, hydrosphereCode: 0, chemistry: "water" },
	vesperian: { atmosphereCode: 7, hydrosphereCode: 4, chemistry: "water" },
}

export function classifyGroup(params: {
	groupHint?: OrbitGroup
	sizeClass: number
}): OrbitGroup {
	if (params.groupHint) return params.groupHint
	if (params.sizeClass <= 4) return "dwarf"
	if (params.sizeClass <= 10) return "terrestrial"
	return "helian"
}

export function classifyBody(params: {
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

export function buildClassificationEnvironment(params: {
	rng: ReturnType<typeof createRng>
	group: OrbitGroup
	classification: OrbitClassification
	sizeClass: number
	deviation: number
	diameterKm: number
	massKg: number
	isPrimaryWorld: boolean
	greenhouseMode?: "estimate" | "roll"
}): {
	density: DensityProfile | null
	landCoverage: number
	atmosphere: AtmosphereProfile | null
	greenhouseFactor: number
} {
	const environment = CLASS_ENVIRONMENTS[params.classification]
	const gravityG =
		params.massKg > 0 ? computeGravityG(params.massKg, params.diameterKm) : 0
	const atmosphere = atmosphereCodeToProfile(
		params.rng,
		environment.atmosphereCode,
		{
			chemistry: environment.chemistry,
			sizeClass: params.sizeClass,
			deviation: params.deviation,
			hydrosphereCode: environment.hydrosphereCode,
			gravityG,
			classification: params.classification,
			isPrimaryWorld: params.isPrimaryWorld,
		},
	)
	const greenhouseFactor =
		params.group === "jovian"
			? rollGasGiantGreenhouseFactor(params.rng)
			: params.greenhouseMode === "estimate"
				? estimateGreenhouseFactor(atmosphere?.pressureBar ?? 0)
				: rollGreenhouseFactor(
						params.rng,
						atmosphere?.pressureBar ?? 0,
						atmosphere?.code ?? 0,
					)
	return {
		density: buildDensityProfile(
			params.massKg,
			params.diameterKm,
			params.classification,
		),
		landCoverage: 1 - hydrosphereCodeToFraction(environment.hydrosphereCode),
		atmosphere,
		greenhouseFactor,
	}
}
