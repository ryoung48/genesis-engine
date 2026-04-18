/**
 * Planet code encode/decode — packs seed + all exposed world settings into a
 * fixed-width base36 string. No suffixes, no legacy decoding.
 */

import type { OrogenParams } from "../types"
import { SLIDER_RANGES } from "./slider-ranges"

const DEFAULT_PRESSURE = 1.0

const SEED_MAX = 16777216
type FieldSpec = {
	name: string
	min: number
	step: number
	count: number
	read: (params: OrogenParams) => number
}

function rangeCount(r: { min: number; max: number; step: number }): number {
	return Math.round((r.max - r.min) / r.step) + 1
}

const SR = SLIDER_RANGES

const FIELD_SPECS: FieldSpec[] = [
	{
		name: "numPoints",
		min: SR.numPoints.min,
		step: SR.numPoints.step,
		count: rangeCount(SR.numPoints),
		read: (p) => p.numPoints,
	},
	{
		name: "jitter",
		min: SR.jitter.min,
		step: SR.jitter.step,
		count: rangeCount(SR.jitter),
		read: (p) => p.jitter,
	},
	{
		name: "numPlates",
		min: SR.numPlates.min,
		step: SR.numPlates.step,
		count: rangeCount(SR.numPlates),
		read: (p) => p.numPlates,
	},
	{
		name: "landDistribution",
		min: SR.landDistribution.min,
		step: SR.landDistribution.step,
		count: rangeCount(SR.landDistribution),
		read: (p) => p.landDistribution,
	},
	{
		name: "roughness",
		min: SR.roughness.min,
		step: SR.roughness.step,
		count: rangeCount(SR.roughness),
		read: (p) => p.roughness,
	},
	{
		name: "smoothing",
		min: SR.smoothing.min,
		step: SR.smoothing.step,
		count: rangeCount(SR.smoothing),
		read: (p) => p.smoothing,
	},
	{
		name: "glacialErosion",
		min: SR.glacialErosion.min,
		step: SR.glacialErosion.step,
		count: rangeCount(SR.glacialErosion),
		read: (p) => p.glacialErosion,
	},
	{
		name: "hydraulicErosion",
		min: SR.hydraulicErosion.min,
		step: SR.hydraulicErosion.step,
		count: rangeCount(SR.hydraulicErosion),
		read: (p) => p.hydraulicErosion,
	},
	{
		name: "thermalErosion",
		min: SR.thermalErosion.min,
		step: SR.thermalErosion.step,
		count: rangeCount(SR.thermalErosion),
		read: (p) => p.thermalErosion,
	},
	{
		name: "ridgeSharpening",
		min: SR.ridgeSharpening.min,
		step: SR.ridgeSharpening.step,
		count: rangeCount(SR.ridgeSharpening),
		read: (p) => p.ridgeSharpening,
	},
	{
		name: "terrainWarp",
		min: SR.terrainWarp.min,
		step: SR.terrainWarp.step,
		count: rangeCount(SR.terrainWarp),
		read: (p) => p.terrainWarp,
	},
	{
		name: "continentSizeVariety",
		min: SR.continentSizeVariety.min,
		step: SR.continentSizeVariety.step,
		count: rangeCount(SR.continentSizeVariety),
		read: (p) => p.continentSizeVariety,
	},
	{
		name: "landCoverage",
		min: SR.landCoverage.min,
		step: SR.landCoverage.step,
		count: rangeCount(SR.landCoverage),
		read: (p) => p.landCoverage,
	},
	{
		name: "planetRadiusKm",
		min: SR.planetRadiusKm.min,
		step: SR.planetRadiusKm.step,
		count: rangeCount(SR.planetRadiusKm),
		read: (p) => p.planetRadiusKm,
	},
	{
		name: "obliquity",
		min: SR.obliquity.min,
		step: SR.obliquity.step,
		count: rangeCount(SR.obliquity),
		read: (p) => p.obliquity,
	},
	{
		name: "eccentricity",
		min: SR.eccentricity.min,
		step: SR.eccentricity.step,
		count: rangeCount(SR.eccentricity),
		read: (p) => p.eccentricity,
	},
	{
		name: "sunTempFactor",
		min: SR.sunTempFactor.min,
		step: SR.sunTempFactor.step,
		count: rangeCount(SR.sunTempFactor),
		read: (p) => p.sunTempFactor,
	},
	{
		name: "daysPerYear",
		min: SR.daysPerYear.min,
		step: SR.daysPerYear.step,
		count: rangeCount(SR.daysPerYear),
		read: (p) => p.daysPerYear,
	},
	{
		name: "hoursPerDay",
		min: SR.hoursPerDay.min,
		step: SR.hoursPerDay.step,
		count: rangeCount(SR.hoursPerDay),
		read: (p) => p.hoursPerDay,
	},
	{
		name: "tidallyLocked",
		min: 0,
		step: 1,
		count: 2,
		read: (p) => (p.tidallyLocked ? 1 : 0),
	},
	{
		name: "antistellarLon",
		min: SR.antistellarLon.min,
		step: SR.antistellarLon.step,
		count: rangeCount(SR.antistellarLon),
		read: (p) => p.antistellarLon,
	},
	{
		name: "perihelion",
		min: SR.perihelion.min,
		step: SR.perihelion.step,
		count: rangeCount(SR.perihelion),
		read: (p) => p.perihelion,
	},
	{
		name: "pressure",
		min: SR.pressure.min,
		step: SR.pressure.step,
		count: rangeCount(SR.pressure),
		read: (p) => clampPressure(p.pressure),
	},
	{
		name: "volcanism",
		min: SR.volcanism.min,
		step: SR.volcanism.step,
		count: rangeCount(SR.volcanism),
		read: (p) => clampUnit(p.volcanism ?? 0.5),
	},
	{
		name: "craters",
		min: SR.craters.min,
		step: SR.craters.step,
		count: rangeCount(SR.craters),
		read: (p) => clampUnit(p.craters ?? 0),
	},
	{
		name: "tectonicMode",
		min: SR.tectonicMode.min,
		step: SR.tectonicMode.step,
		count: rangeCount(SR.tectonicMode),
		read: (p) =>
			p.tectonicMode === "stagnant" || (p.tectonicMode as unknown) === 1
				? 1
				: 0,
	},
]

const BASE_LEN = (() => {
	let packed = BigInt(SEED_MAX - 1)
	for (const field of FIELD_SPECS)
		packed = packed * BigInt(field.count) + BigInt(field.count - 1)
	return packed.toString(36).length
})()

function clampUnit(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function clampPressure(value?: number): number {
	if (typeof value !== "number" || !Number.isFinite(value))
		return DEFAULT_PRESSURE
	return Math.max(0.1, Math.min(10, value))
}

function toIndex(
	value: number,
	field: Pick<FieldSpec, "min" | "step" | "count">,
): number {
	return Math.max(
		0,
		Math.min(field.count - 1, Math.round((value - field.min) / field.step)),
	)
}

function fromIndex(
	index: number,
	field: Pick<FieldSpec, "min" | "step">,
): number {
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
		packed =
			packed * BigInt(field.count) + BigInt(toIndex(field.read(params), field))
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
