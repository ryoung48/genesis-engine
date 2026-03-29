/**
 * Planet code encode/decode — packs seed + all exposed world settings into a
 * fixed-width base36 string. No suffixes, no legacy decoding.
 */

import type { OrogenParams } from "./types"
import {
	DEFAULT_ANTISTELLAR_LON,
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_PERIHELION,
	DEFAULT_PLANET_RADIUS_KM,
	DEFAULT_SUN_TEMP_FACTOR,
	getAntistellarLon,
	getDaysPerYear,
	getEccentricity,
	getHoursPerDay,
	getObliquityDeg,
	getPerihelion,
	getSunTempFactor,
} from "./units"

const SEED_MAX = 16777216
const DEFAULT_PRESSURE = 1.0

type FieldSpec = {
	name: string
	min: number
	step: number
	count: number
	read: (params: OrogenParams) => number
}

const FIELD_SPECS: FieldSpec[] = [
	{ name: "numPoints", min: 5000, step: 1000, count: 2556, read: (p) => p.numPoints },
	{ name: "jitter", min: 0, step: 0.05, count: 21, read: (p) => p.jitter },
	{ name: "numPlates", min: 4, step: 1, count: 117, read: (p) => p.numPlates },
	{ name: "landDistribution", min: 0, step: 0.05, count: 21, read: (p) => p.landDistribution },
	{ name: "roughness", min: 0, step: 0.01, count: 51, read: (p) => p.roughness },
	{ name: "smoothing", min: 0, step: 0.05, count: 21, read: (p) => p.smoothing },
	{ name: "glacialErosion", min: 0, step: 0.05, count: 21, read: (p) => p.glacialErosion },
	{ name: "hydraulicErosion", min: 0, step: 0.05, count: 21, read: (p) => p.hydraulicErosion },
	{ name: "thermalErosion", min: 0, step: 0.05, count: 21, read: (p) => p.thermalErosion },
	{ name: "ridgeSharpening", min: 0, step: 0.05, count: 21, read: (p) => p.ridgeSharpening },
	{ name: "terrainWarp", min: 0, step: 0.05, count: 21, read: (p) => p.terrainWarp },
	{ name: "continentSizeVariety", min: 0, step: 0.05, count: 21, read: (p) => p.continentSizeVariety },
	{ name: "landCoverage", min: 0, step: 0.01, count: 101, read: (p) => p.landCoverage },
	{ name: "planetRadiusKm", min: 3200, step: 100, count: 224, read: (p) => p.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM },
	{ name: "obliquity", min: 0, step: 0.5, count: 361, read: (p) => getObliquityDeg(p.obliquity) },
	{ name: "eccentricity", min: 0, step: 0.001, count: 201, read: (p) => getEccentricity(p.eccentricity) },
	{ name: "sunTempFactor", min: 0.9, step: 0.01, count: 31, read: (p) => getSunTempFactor(p.sunTempFactor) },
	{ name: "daysPerYear", min: 100, step: 5, count: 181, read: (p) => getDaysPerYear(p.daysPerYear) },
	{ name: "hoursPerDay", min: 8, step: 0.5, count: 81, read: (p) => getHoursPerDay(p.hoursPerDay) },
	{ name: "tidallyLocked", min: 0, step: 1, count: 2, read: (p) => (p.tidallyLocked ? 1 : 0) },
	{ name: "antistellarLon", min: 0, step: 1, count: 361, read: (p) => getAntistellarLon(p.antistellarLon) },
	{ name: "perihelion", min: 0, step: 1, count: 361, read: (p) => getPerihelion(p.perihelion) },
	{ name: "pressure", min: 0.1, step: 0.1, count: 100, read: (p) => clampPressure(p.pressure) },
	{ name: "volcanism", min: 0, step: 0.05, count: 21, read: (p) => clampUnit(p.volcanism ?? 0.5) },
	{ name: "craters", min: 0, step: 0.05, count: 21, read: (p) => clampUnit(p.craters ?? 0) },
	{ name: "tectonicMode", min: 0, step: 1, count: 2, read: (p) => (p.tectonicMode === "stagnant" || p.tectonicMode as unknown === 1) ? 1 : 0 },
]

const BASE_LEN = (() => {
	let packed = BigInt(SEED_MAX - 1)
	for (const field of FIELD_SPECS) packed = packed * BigInt(field.count) + BigInt(field.count - 1)
	return packed.toString(36).length
})()

function clampUnit(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function clampPressure(value?: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PRESSURE
	return Math.max(0.1, Math.min(10, value))
}

function toIndex(value: number, field: Pick<FieldSpec, "min" | "step" | "count">): number {
	return Math.max(0, Math.min(field.count - 1, Math.round((value - field.min) / field.step)))
}

function fromIndex(index: number, field: Pick<FieldSpec, "min" | "step">): number {
	const raw = field.min + index * field.step
	const decimals = field.step < 1 ? String(field.step).split(".")[1].length : 0
	return decimals > 0 ? parseFloat(raw.toFixed(decimals)) : raw
}

function parseBase36(str: string): bigint {
	return [...str].reduce((acc, ch) => {
		const digit = Number.parseInt(ch, 36)
		if (Number.isNaN(digit)) throw new Error("bad char")
		return acc * 36n + BigInt(digit)
	}, 0n)
}

export function encodePlanetCode(seed: number, params: OrogenParams): string {
	let packed = BigInt(seed)
	for (const field of FIELD_SPECS) {
		packed = packed * BigInt(field.count) + BigInt(toIndex(field.read(params), field))
	}
	return packed.toString(36).padStart(BASE_LEN, "0")
}

export interface DecodedPlanetCode {
	seed: number
	numPoints: number
	jitter: number
	numPlates: number
	landDistribution: number
	roughness: number
	smoothing: number
	glacialErosion: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	terrainWarp: number
	continentSizeVariety: number
	landCoverage: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	sunTempFactor: number
	daysPerYear: number
	hoursPerDay: number
	tidallyLocked: boolean
	antistellarLon: number
	perihelion: number
	pressure: number
	volcanism: number
	craters?: number
	tectonicMode?: "active" | "stagnant"
}

export function decodePlanetCode(code: string): DecodedPlanetCode | null {
	const normalized = code.trim().toLowerCase()
	if (normalized.length !== BASE_LEN) return null
	if (!/^[0-9a-z]+$/.test(normalized)) return null

	let packed: bigint
	try {
		packed = parseBase36(normalized)
	} catch {
		return null
	}

	const decodedFields: Record<string, number> = {}
	for (let i = FIELD_SPECS.length - 1; i >= 0; i--) {
		const field = FIELD_SPECS[i]
		const index = Number(packed % BigInt(field.count))
		packed = packed / BigInt(field.count)
		decodedFields[field.name] = fromIndex(index, field)
	}

	const seed = Number(packed)
	if (!Number.isInteger(seed) || seed < 0 || seed >= SEED_MAX) return null

	const craters = decodedFields.craters

	return {
		seed,
		numPoints: decodedFields.numPoints,
		jitter: decodedFields.jitter,
		numPlates: decodedFields.numPlates,
		landDistribution: decodedFields.landDistribution,
		roughness: decodedFields.roughness,
		smoothing: decodedFields.smoothing,
		glacialErosion: decodedFields.glacialErosion,
		hydraulicErosion: decodedFields.hydraulicErosion,
		thermalErosion: decodedFields.thermalErosion,
		ridgeSharpening: decodedFields.ridgeSharpening,
		terrainWarp: decodedFields.terrainWarp,
		continentSizeVariety: decodedFields.continentSizeVariety,
		landCoverage: decodedFields.landCoverage,
		planetRadiusKm: decodedFields.planetRadiusKm,
		obliquity: decodedFields.obliquity,
		eccentricity: decodedFields.eccentricity,
		sunTempFactor: decodedFields.sunTempFactor,
		daysPerYear: decodedFields.daysPerYear,
		hoursPerDay: decodedFields.hoursPerDay,
		tidallyLocked: decodedFields.tidallyLocked >= 0.5,
		antistellarLon: decodedFields.antistellarLon,
		perihelion: decodedFields.perihelion,
		pressure: decodedFields.pressure,
		volcanism: decodedFields.volcanism,
		craters: craters > 0 ? craters : undefined,
		tectonicMode: decodedFields.tectonicMode >= 0.5 ? "stagnant" : "active",
	}
}
