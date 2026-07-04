/**
 * Planet code encode/decode ΓÇö stores the seed separately from the packed params
 * segment so the seed stays recoverable across param format changes.
 */

import {
	MAIN_SEQUENCE_CLASSES,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import { DEFAULT_ERA, ERA_ORDER, type SocietyEra } from "@/model/society/eras"
import type { GenesisParams } from ".."
import { SLIDER_RANGES } from "./slider-ranges"

const DEFAULT_PRESSURE = 1.0
const PLANET_CODE_PART_SEPARATOR = "."

export const SEED_MAX = 2147483647
type FieldSpec = {
	name: string
	min: number
	step: number
	count: number
	read: (params: GenesisParams) => number
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
		name: "landDistribution",
		min: SR.landDistribution.min,
		step: SR.landDistribution.step,
		count: rangeCount(SR.landDistribution),
		read: (p) => p.landDistribution,
	},
	{
		name: "seaLevel",
		min: SR.seaLevel.min,
		step: SR.seaLevel.step,
		count: rangeCount(SR.seaLevel),
		read: (p) => p.seaLevel,
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
		name: "spectralClass",
		min: 0,
		step: 1,
		count: MAIN_SEQUENCE_CLASSES.length,
		read: (p) => {
			const idx = MAIN_SEQUENCE_CLASSES.indexOf(
				p.spectralClass as MainSequenceClass,
			)
			return idx >= 0 ? idx : 4 // default G
		},
	},
	{
		name: "starSubtype",
		min: SR.starSubtype.min,
		step: SR.starSubtype.step,
		count: rangeCount(SR.starSubtype),
		read: (p) => p.starSubtype,
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
		// 0 = terrestrial, 1 = gas-giant-moon
		name: "planetType",
		min: 0,
		step: 1,
		count: 2,
		read: (p) => (p.planetType === "gas-giant-moon" ? 1 : 0),
	},
	{
		// 0 = none, 1 = solar
		// lunar: 2 = moon idx 0 (terrestrial) or gas giant idx (gas-giant-moon)
		//        3 = moon idx 1, 4 = moon idx 2 (terrestrial moons 2+; or sibling moons)
		name: "tidallyLocked",
		min: 0,
		step: 1,
		count: 5,
		read: (p) => {
			if (!p.tideLock) return 0
			if (p.tideLock.type === "solar") return 1
			return 2 + p.tideLock.target
		},
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
		read: (p) => p.volcanism ?? 1,
	},
	{
		name: "craters",
		min: SR.craters.min,
		step: SR.craters.step,
		count: rangeCount(SR.craters),
		read: (p) => clampUnit(p.craters ?? 0),
	},
	{
		name: "maxElevation",
		min: SR.maxElevation.min,
		step: SR.maxElevation.step,
		count: rangeCount(SR.maxElevation),
		read: (p) => p.maxElevation ?? 6000,
	},
	{
		name: "era",
		min: 0,
		step: 1,
		count: ERA_ORDER.length,
		read: (p) => {
			const era = p.era ?? DEFAULT_ERA
			const idx = ERA_ORDER.indexOf(era)
			return idx >= 0 ? idx : 0
		},
	},
	{
		name: "moonCount",
		min: 0,
		step: 1,
		count: 6, // 0–5
		read: (p) => p.moonCount ?? 0,
	},
	{
		name: "moonSeed",
		min: 0,
		step: 1,
		count: SEED_MAX,
		read: (p) =>
			Math.max(0, Math.min(SEED_MAX - 1, Math.floor(p.moonSeed ?? 0))),
	},
	{
		name: "orbitalDistanceAU",
		min: SR.orbitalDistanceAU.min,
		step: SR.orbitalDistanceAU.step,
		count: rangeCount(SR.orbitalDistanceAU),
		read: (p) => p.orbitalDistanceAU,
	},
]

const PARAMS_BASE_LEN = (() => {
	let packed = 0n
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
	return Math.max(0.1, Math.min(100, value))
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

function parsePlanetCodeParts(
	code: string,
): { seedPart: string; paramsPart: string } | null {
	const normalized = code.trim().toLowerCase()
	if (!normalized) return null

	const parts = normalized.split(PLANET_CODE_PART_SEPARATOR)
	if (parts.length !== 2) return null

	const [seedPart, paramsPart] = parts
	if (seedPart.length === 0 || paramsPart.length === 0) return null

	return { seedPart, paramsPart }
}

function parseSeedPart(seedPart: string): number | null {
	if (!/^[0-9a-z]+$/.test(seedPart)) return null

	let packed: bigint
	try {
		packed = parseBase36(seedPart)
	} catch {
		return null
	}

	const seed = Number(packed)
	if (!Number.isInteger(seed) || seed < 0 || seed >= SEED_MAX) return null
	return seed
}

function encodePlanetParams(params: GenesisParams): string {
	let packed = 0n
	for (const field of FIELD_SPECS) {
		packed =
			packed * BigInt(field.count) + BigInt(toIndex(field.read(params), field))
	}
	return packed.toString(36).padStart(PARAMS_BASE_LEN, "0")
}

export function encodePlanetCode(seed: number, params: GenesisParams): string {
	const seedPart = BigInt(seed).toString(36)
	const paramsPart = encodePlanetParams(params)
	return [seedPart, paramsPart].join(PLANET_CODE_PART_SEPARATOR)
}

interface DecodedPlanetCode {
	seed: number
	numPoints: number
	landDistribution: number
	seaLevel: number
	continentSizeVariety: number
	landCoverage: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	daysPerYear: number
	hoursPerDay: number
	planetType: import("../celestial/moons/moon-types").PlanetType
	tideLock: import("../celestial/moons/moon-types").TideLock | null
	antistellarLon: number
	perihelion: number
	pressure: number
	volcanism: number
	craters?: number
	maxElevation: number
	era: SocietyEra
	moonCount: number
	moonSeed: number
}

export function decodePlanetCode(code: string): DecodedPlanetCode | null {
	const parts = parsePlanetCodeParts(code)
	if (!parts) return null

	const seed = parseSeedPart(parts.seedPart)
	if (seed === null) return null
	if (
		parts.paramsPart.length === 0 ||
		parts.paramsPart.length > PARAMS_BASE_LEN ||
		!/^[0-9a-z]+$/.test(parts.paramsPart)
	)
		return null

	let packed: bigint
	try {
		packed = parseBase36(parts.paramsPart)
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
	if (packed !== 0n) return null

	const craters = decodedFields.craters
	const eraIdx = decodedFields.era

	return {
		seed,
		numPoints: decodedFields.numPoints,
		landDistribution: decodedFields.landDistribution,
		seaLevel: decodedFields.seaLevel,
		continentSizeVariety: decodedFields.continentSizeVariety,
		landCoverage: decodedFields.landCoverage,
		planetRadiusKm: decodedFields.planetRadiusKm,
		obliquity: decodedFields.obliquity,
		eccentricity: decodedFields.eccentricity,
		spectralClass: MAIN_SEQUENCE_CLASSES[decodedFields.spectralClass] ?? "G",
		starSubtype: decodedFields.starSubtype,
		orbitalDistanceAU: decodedFields.orbitalDistanceAU,
		daysPerYear: decodedFields.daysPerYear,
		hoursPerDay: decodedFields.hoursPerDay,
		planetType:
			decodedFields.planetType === 1
				? ("gas-giant-moon" as const)
				: ("terrestrial" as const),
		tideLock: (() => {
			const v = decodedFields.tidallyLocked
			if (v === 1) return { type: "solar" as const, target: 0 }
			if (v >= 2) return { type: "lunar" as const, target: v - 2 }
			return null
		})(),
		antistellarLon: decodedFields.antistellarLon,
		perihelion: decodedFields.perihelion,
		pressure: decodedFields.pressure,
		volcanism: decodedFields.volcanism,
		craters: craters > 0 ? craters : undefined,
		maxElevation: decodedFields.maxElevation,
		era: ERA_ORDER[eraIdx] ?? DEFAULT_ERA,
		moonCount: decodedFields.moonCount ?? 1,
		moonSeed: decodedFields.moonSeed ?? 0,
	}
}
