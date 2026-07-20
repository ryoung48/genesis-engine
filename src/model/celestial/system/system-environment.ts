import type { AtmosphereProfile } from "@/model/celestial/moons/moon-types"
import type {
	DensityProfile,
	HydrosphereProfile,
	OrbitChemistry,
	OrbitClassification,
	OrbitComposition,
	OrbitGroup,
} from "@/model/celestial/orbit-body"
import type { MainSequenceClass } from "@/model/celestial/star/star-types"
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

export interface ClassifiedEnvironment {
	atmosphereCode: number
	hydrosphereCode: number
	composition: OrbitComposition
	chemistry?: OrbitChemistry
	subtype?: string
	eccentric?: boolean
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

export function auFromTemperature(
	kelvinTemp: number,
	luminositySol: number,
): number {
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

function roll2d5(rng: ReturnType<typeof createRng>): number {
	return rng.randint(1, 5) + rng.randint(1, 5)
}

function roll2d6(rng: ReturnType<typeof createRng>): number {
	return rng.randint(1, 6) + rng.randint(1, 6)
}

function rollDice(
	rng: ReturnType<typeof createRng>,
	count: number,
	sides: number,
): number {
	let total = 0
	for (let i = 0; i < count; i++) total += rng.randint(1, sides)
	return total
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
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

const WATER_BANDS: [number, number][] = [
	[0, 5],
	[5, 15],
	[15, 25],
	[25, 35],
	[35, 45],
	[45, 55],
	[55, 65],
	[65, 75],
	[75, 85],
	[85, 95],
	[95, 100],
]

const MAJOR_BANDS: [number, number][] = [
	[0, 0],
	[0.05, 0.1],
	[0.1, 0.2],
	[0.2, 0.3],
	[0.3, 0.4],
	[0.4, 0.6],
	[0.6, 0.7],
	[0.7, 0.8],
	[0.8, 0.9],
	[0.9, 0.95],
	[0.95, 1],
]

function waterPct(rng: ReturnType<typeof createRng>, hydrosphereCode: number) {
	const [lo, hi] = WATER_BANDS[clamp(hydrosphereCode, 0, 10)]!
	return rng.uniform(lo, hi)
}

/** Inverse of waterPct/WATER_BANDS -- the hydrosphereCode whose band contains
 * a given water percentage (0-100). Used to keep a main world's stored
 * hydrosphereCode (and its HYDROSPHERE_DESCRIPTIONS text) in sync whenever
 * the player hand-edits land coverage directly, rather than rolling it.
 * Never returns 11-13 (superdense/molten/gas-giant-core) -- those are
 * special-roll-only codes with no equivalent water-percentage band, not
 * reachable by editing an ordinary terrestrial world's land coverage. */
export function hydrosphereCodeFromWaterPct(waterPct: number): number {
	const clamped = clamp(waterPct, 0, 100)
	const index = WATER_BANDS.findIndex(
		([lo, hi]) => clamped >= lo && clamped <= hi,
	)
	return index === -1 ? 10 : index
}

function countBodies(
	rng: ReturnType<typeof createRng>,
	budget: number,
	min: number,
	max: number,
): number {
	let count = 0
	let remaining = budget
	while (remaining > min) {
		const size = rng.uniform(min, max)
		if (size > remaining) break
		remaining -= size
		count += 1
	}
	return count
}

function distributeSurface(
	rng: ReturnType<typeof createRng>,
	targetPct: number,
	code: number,
): HydrosphereProfile["surface"]["land"] {
	const empty = {
		major: { pct: 0, count: 0 },
		minor: { pct: 0, count: 0 },
		small: { pct: 0 },
	}
	if (targetPct <= 0) return empty
	const [majLo, majHi] = MAJOR_BANDS[clamp(code, 0, 10)]!
	const majorShare = rng.uniform(majLo, majHi)
	const smallShareOfRest =
		rng.uniform(0.05, 0.5) * Math.max(0.1, 1 - majorShare)
	const minorShare = (1 - majorShare) * (1 - smallShareOfRest)
	const smallShare = (1 - majorShare) * smallShareOfRest

	let majorPct = majorShare * targetPct
	let minorPct = minorShare * targetPct
	const smallPct = smallShare * targetPct

	if (majorPct < 5) {
		minorPct += majorPct
		majorPct = 0
	}

	const majorCount =
		majorPct >= 5 ? (code >= 9 ? 1 : countBodies(rng, majorPct, 5, 15)) : 0
	if (majorCount === 0 && majorPct > 0) {
		minorPct += majorPct
		majorPct = 0
	}
	const minorCount = countBodies(rng, minorPct, 1, 5)
	let smallFinal = smallPct
	if (minorCount === 0 && minorPct > 0) {
		smallFinal += minorPct
		minorPct = 0
	}

	return {
		major: { pct: majorPct, count: majorCount },
		minor: { pct: minorPct, count: minorCount },
		small: { pct: smallFinal },
	}
}

function buildHydrosphereProfile(
	rng: ReturnType<typeof createRng>,
	code: number,
): HydrosphereProfile {
	const distribution = roll2d6(rng) - 2
	const water = waterPct(rng, code)
	const land = 100 - water
	return {
		code,
		distribution,
		surface: {
			land: distributeSurface(rng, land, distribution),
			water: distributeSurface(rng, water, distribution),
		},
	}
}

function hydrosphereWaterFraction(hydrosphere: HydrosphereProfile): number {
	const { major, minor, small } = hydrosphere.surface.water
	return (major.pct + minor.pct + small.pct) / 100
}

function chooseColdChemistry(
	rng: ReturnType<typeof createRng>,
	params: { zone: Zone; primary: boolean; chemMod?: number; waterMax?: number },
): OrbitChemistry {
	const chemRoll =
		rng.randint(1, 6) +
		(params.zone === "outer" ? 2 : 0) +
		(params.chemMod ?? 0)
	const waterMax = params.waterMax ?? 6
	if (params.primary || chemRoll <= waterMax) return "water"
	if (chemRoll <= 8) return "ammonia"
	return "methane"
}

export function rollClassificationAssignment(params: {
	rng: ReturnType<typeof createRng>
	classification: OrbitClassification
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	isPrimaryWorld: boolean
}): ClassifiedEnvironment {
	const {
		rng,
		classification,
		sizeClass,
		zone,
		spectralClass,
		isPrimaryWorld,
	} = params
	const primary = isPrimaryWorld
	const spectralChemMod =
		spectralClass === "K" ? 2 : spectralClass === "M" ? 4 : 0
	switch (classification) {
		case "acheronian":
		case "asphodelian":
			return {
				atmosphereCode: 1,
				hydrosphereCode: 0,
				composition: "rocky",
			}
		case "asteroid belt":
			return {
				atmosphereCode: 0,
				hydrosphereCode: 0,
				composition: "rocky",
			}
		case "asteroid": {
			const composition =
				rng.weightedChoice<OrbitComposition>([
					{ v: "metallic", w: params.deviation >= 1.5 ? 1 : 0 },
					{ v: "rocky", w: 3 },
					{ v: "ice", w: params.deviation < -1.5 ? 6 : 0 },
				]) ?? "rocky"
			return {
				atmosphereCode: 0,
				hydrosphereCode: 0,
				composition,
				subtype: composition,
			}
		}
		case "chthonian":
			return {
				atmosphereCode: 1,
				hydrosphereCode: 0,
				composition: "gas",
			}
		case "arid": {
			const chemistry = chooseColdChemistry(rng, {
				zone,
				primary,
				chemMod: spectralChemMod,
			})
			const atmosphereCode =
				chemistry === "water"
					? clamp(roll2d6(rng) - 7 + sizeClass, 2, 9)
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: rng.randint(1, 3),
				chemistry,
				subtype:
					chemistry === "water"
						? "darwinian"
						: chemistry === "ammonia"
							? "saganian"
							: "asimovian",
				composition: "rocky",
			}
		}
		case "geo-cyclic": {
			const atmosphereRoll = Math.max(rng.randint(1, 6), 1)
			const atmosphereCode =
				atmosphereRoll > 3
					? (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
					: 1
			const hydrosphereCode = Math.max(
				0,
				roll2d6(rng) + sizeClass - 7 - (atmosphereCode === 1 ? 4 : 0),
			)
			const chemRoll = rng.randint(1, 6) + (zone === "outer" ? 2 : 0)
			const chemistry =
				primary || chemRoll <= 4
					? "water"
					: chemRoll <= 6
						? "ammonia"
						: "methane"
			return {
				atmosphereCode,
				hydrosphereCode,
				chemistry,
				subtype:
					chemistry === "water"
						? "arean"
						: chemistry === "ammonia"
							? "utgardian"
							: "titanian",
				composition: "rocky",
			}
		}
		case "geo-tidal": {
			let chemMod = 0
			if (zone === "epistellar") chemMod -= 2
			if (zone === "outer") chemMod += 2
			const chemRoll = rng.randint(1, 6) + chemMod
			const chemistry =
				primary || chemRoll <= 4
					? "water"
					: chemRoll <= 6
						? "ammonia"
						: "methane"
			const atmosphereCode =
				chemistry === "water"
					? clamp(roll2d6(rng) - 7 + sizeClass, 2, 9)
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: rollDice(rng, 2, 3) - 2,
				chemistry,
				subtype:
					chemistry === "water"
						? "promethean"
						: chemistry === "ammonia"
							? "burian"
							: "atlan",
				composition: chemistry === "methane" ? "ice" : "rocky",
				eccentric: true,
			}
		}
		case "hebean": {
			let atmosphereCode = Math.max(1, rng.randint(1, 6) + sizeClass - 6)
			if (atmosphereCode >= 2) atmosphereCode = 10
			return {
				atmosphereCode,
				hydrosphereCode: clamp(roll2d6(rng) + sizeClass - 11, 0, 11),
				eccentric: true,
				composition: "rocky",
			}
		}
		case "helian": {
			const hydroRoll = rng.randint(1, 6)
			return {
				atmosphereCode: 13,
				hydrosphereCode: hydroRoll <= 2 ? 0 : roll2d6(rng) - 1,
				composition: "rocky",
			}
		}
		case "jani-lithic": {
			const atmosphereRoll = rng.randint(1, 6)
			return {
				atmosphereCode:
					atmosphereRoll <= 3
						? 0
						: (rng.weightedChoice([
								{ v: 10, w: 8 },
								{ v: 11, w: 2 },
							]) ?? 10),
				hydrosphereCode: 0,
				composition: "rocky",
			}
		}
		case "jovian": {
			let subtype = "unknown"
			if (sizeClass === 16) {
				if (params.deviation >= 1) subtype = "osirian"
				else if (params.deviation >= -1) subtype = "brammian"
				else if (params.deviation >= -1.5) subtype = "khonsonian"
				else subtype = "neptunian"
			} else if (sizeClass === 17) {
				subtype = params.deviation >= -1.5 ? "junic" : "jovic"
			} else {
				subtype = params.deviation >= -1.5 ? "super-junic" : "super-jovic"
			}
			return {
				atmosphereCode: 14,
				hydrosphereCode: 13,
				composition: "gas",
				subtype,
			}
		}
		case "meltball":
			return {
				atmosphereCode: 1,
				hydrosphereCode: 12,
				eccentric: true,
				composition:
					rng.weightedChoice<OrbitComposition>([
						{ v: "rocky", w: 5 },
						{ v: "metallic", w: zone === "epistellar" ? 1 : 0 },
					]) ?? "rocky",
			}
		case "oceanic": {
			const chemistry = chooseColdChemistry(rng, {
				zone,
				primary,
				chemMod: spectralChemMod,
			})
			const atmosphereRoll = rng.randint(1, 6)
			const atmosphereCode =
				chemistry === "water"
					? clamp(
							roll2d6(rng) +
								sizeClass -
								6 -
								(spectralClass === "K" ? 1 : spectralClass === "M" ? 2 : 0),
							2,
							12,
						)
					: atmosphereRoll === 1
						? 1
						: atmosphereRoll <= 4
							? 10
							: 12
			return {
				atmosphereCode,
				hydrosphereCode:
					rng.weightedChoice([
						{ v: 10, w: 5 },
						{ v: 11, w: 1 },
					]) ?? 10,
				chemistry,
				subtype:
					chemistry === "water"
						? "pelagic"
						: chemistry === "ammonia"
							? "nunnic"
							: "teathic",
				composition: "rocky",
			}
		}
		case "panthalassic": {
			const chemRoll = rng.randint(1, 6) + spectralChemMod
			const secondChemRoll = roll2d6(rng)
			const chemistry =
				chemRoll <= 6
					? secondChemRoll <= 8
						? "water"
						: secondChemRoll <= 11
							? "sulfur"
							: "chlorine"
					: "methane"
			return {
				atmosphereCode: Math.min(rng.randint(1, 6) + 8, 13),
				hydrosphereCode: 11,
				chemistry,
				composition: "rocky",
			}
		}
		case "rockball": {
			let hydrosphereCode = roll2d6(rng) + sizeClass - 11
			if (zone === "epistellar") hydrosphereCode -= 2
			if (zone === "outer") hydrosphereCode += 2
			return {
				atmosphereCode: 0,
				hydrosphereCode: clamp(hydrosphereCode, 0, 10),
				composition:
					rng.weightedChoice<OrbitComposition>([
						{ v: "rocky", w: 5 },
						{ v: "metallic", w: zone === "outer" ? 0 : 1 },
					]) ?? "rocky",
			}
		}
		case "snowball": {
			const chemRoll = rng.randint(1, 6) + (zone === "outer" ? 2 : 0)
			return {
				atmosphereCode: rng.randint(1, 6) <= 4 ? 0 : 1,
				hydrosphereCode:
					rng.randint(1, 6) <= 2 ? 10 : Math.max(1, roll2d6(rng) - 2),
				chemistry:
					chemRoll <= 4 ? "water" : chemRoll <= 6 ? "ammonia" : "methane",
				composition: "ice",
			}
		}
		case "stygian":
			return {
				atmosphereCode: 0,
				hydrosphereCode: 0,
				composition:
					rng.weightedChoice<OrbitComposition>([
						{ v: "rocky", w: 5 },
						{ v: "metallic", w: zone === "outer" ? 0 : 1 },
					]) ?? "rocky",
			}
		case "tectonic": {
			const chemRoll =
				rng.randint(1, 6) + spectralChemMod + (zone === "outer" ? 2 : 0)
			const secondChemRoll = roll2d6(rng)
			const chemistry =
				primary || chemRoll <= 6
					? secondChemRoll <= 8
						? "water"
						: secondChemRoll <= 11
							? "sulfur"
							: "chlorine"
					: chemRoll <= 8
						? "ammonia"
						: "methane"
			const atmosphereCode =
				chemistry === "water"
					? clamp(roll2d6(rng) + sizeClass - 7, 2, 9)
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: rng.randint(4, 9),
				chemistry,
				subtype:
					chemistry === "water"
						? "gaian"
						: chemistry === "sulfur"
							? "thio-gaian"
							: chemistry === "chlorine"
								? "chloritic-gaian"
								: chemistry === "ammonia"
									? "amunian"
									: "tartarian",
				composition: "rocky",
			}
		}
		case "telluric":
			return {
				atmosphereCode: rng.choice([11, 12, 12]),
				hydrosphereCode: 0,
				composition: "rocky",
				subtype: params.deviation >= 1 ? "phosphorian" : "cytherean",
			}
		case "vesperian": {
			const chemRoll = rng.randint(1, 6)
			const chemistry = primary || chemRoll <= 11 ? "water" : "chlorine"
			const atmosphereCode =
				chemistry === "water"
					? clamp(roll2d6(rng) + sizeClass - 7, 2, 9)
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: Math.max(1, roll2d6(rng) - 2),
				chemistry,
				composition: "rocky",
			}
		}
	}
}

function applyTemperatureHydrosphereLoss(
	hydrosphereCode: number,
	deviation: number,
): number {
	if (hydrosphereCode >= 10) return hydrosphereCode
	const kelvin = deviationToCelsius(deviation) + 273.15
	if (kelvin > 353.15) return Math.max(0, hydrosphereCode - 6)
	if (kelvin > 303.15) return Math.max(0, hydrosphereCode - 2)
	return hydrosphereCode
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
	/** Ported from galaxy-gen's forced-meltball roll (orbits/index.ts) -- a
	 * close-in epistellar dwarf beyond the star's dust-clearing boundary
	 * (see getStarMAO) that got shoved into a scorching orbit instead of
	 * forming further out. Short-circuits every other rule (including
	 * isPrimaryWorld) since generate-system-bodies.ts only ever sets this for
	 * a non-main-world sibling. */
	forceMeltball?: boolean
}): { group: OrbitGroup; classification: OrbitClassification } {
	const {
		zone,
		orbitalDistanceAU,
		sizeClass,
		isPrimaryWorld,
		isMoon,
		tidal,
		forceMeltball,
	} = params
	if (forceMeltball) return { group: "dwarf", classification: "meltball" }
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

// Ported from galaxy-gen's TEMPERATURE.finalize albedo roll (orbits/
// temperature/index.ts) -- a real composition/atmosphere/hydrosphere-driven
// Bond albedo, dice-rolled and stored at generation time. Chaos-machine
// previously had no equivalent: a generated body's albedo stayed unset, and
// the UI only ever synthesized a crude landCoverage-only linear blend
// on the fly wherever an EBM preview needed one (see useEbmPreview.ts's
// estimateAlbedo) -- that fallback still exists for a body that somehow
// still lacks a stored albedo, but every newly generated body now gets a
// real one from this roll instead of relying on it.
function rollAlbedo(
	rng: ReturnType<typeof createRng>,
	composition: OrbitComposition,
	atmosphere: AtmosphereProfile | null,
	hydrosphereCode: number,
): number {
	let albedo = 0
	if (composition === "rocky" || composition === "metallic") {
		albedo = (roll2d6(rng) - 2) * 0.02 + 0.04
	} else if (composition === "ice") {
		albedo = (roll2d6(rng) - 3) * 0.05 + 0.2
	} else if (composition === "gas") {
		albedo = 0.05 * roll2d6(rng) + 0.05
	}

	if (
		!atmosphere ||
		atmosphere.type === "vacuum" ||
		atmosphere.type === "trace" ||
		atmosphere.subtype === "very thin"
	) {
		albedo += (roll2d6(rng) - 3) * 0.01
	} else if (atmosphere.subtype === "very dense") {
		albedo += roll2d6(rng) * 0.03
	} else if (atmosphere.type === "breathable") {
		albedo += roll2d6(rng) * 0.01
	} else {
		albedo += (roll2d6(rng) - 2) * 0.05
	}

	if (hydrosphereCode >= 2 && hydrosphereCode <= 5) {
		albedo += (roll2d6(rng) - 2) * 0.02
	} else if (hydrosphereCode >= 6) {
		albedo += (roll2d6(rng) - 4) * 0.03
	}

	return clamp(albedo, 0.02, 0.98)
}

export function buildClassificationEnvironment(params: {
	rng: ReturnType<typeof createRng>
	group: OrbitGroup
	classification: OrbitClassification
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	diameterKm: number
	massKg: number
	isPrimaryWorld: boolean
	greenhouseMode?: "estimate" | "roll"
	assignment?: ClassifiedEnvironment
}): {
	density: DensityProfile | null
	landCoverage: number
	hydrosphereCode: number
	hydrosphere: HydrosphereProfile
	composition: OrbitComposition
	chemistry?: OrbitChemistry
	subtype?: string
	eccentricByClassification?: boolean
	atmosphere: AtmosphereProfile | null
	greenhouseFactor: number
	albedo: number
} {
	const rolledEnvironment =
		params.assignment ??
		rollClassificationAssignment({
			rng: params.rng,
			classification: params.classification,
			sizeClass: params.sizeClass,
			zone: params.zone,
			deviation: params.deviation,
			spectralClass: params.spectralClass,
			isPrimaryWorld: params.isPrimaryWorld,
		})
	const hydrosphereCode = applyTemperatureHydrosphereLoss(
		rolledEnvironment.hydrosphereCode,
		params.deviation,
	)
	const hydrosphere = buildHydrosphereProfile(params.rng, hydrosphereCode)
	const gravityG =
		params.massKg > 0 ? computeGravityG(params.massKg, params.diameterKm) : 0
	const atmosphere = atmosphereCodeToProfile(
		params.rng,
		rolledEnvironment.atmosphereCode,
		{
			chemistry: rolledEnvironment.chemistry ?? rolledEnvironment.composition,
			sizeClass: params.sizeClass,
			deviation: params.deviation,
			hydrosphereCode,
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
	const albedo = rollAlbedo(
		params.rng,
		rolledEnvironment.composition,
		atmosphere,
		hydrosphereCode,
	)
	return {
		density: buildDensityProfile(
			params.massKg,
			params.diameterKm,
			params.classification,
		),
		landCoverage: 1 - hydrosphereWaterFraction(hydrosphere),
		hydrosphereCode,
		hydrosphere,
		composition: rolledEnvironment.composition,
		chemistry: rolledEnvironment.chemistry,
		subtype: rolledEnvironment.subtype,
		eccentricByClassification: rolledEnvironment.eccentric,
		atmosphere,
		greenhouseFactor,
		albedo,
	}
}
