import {
	MAIN_SEQUENCE_CLASSES,
	type MainSequenceClass,
} from "@/model/celestial/star/types"
import type {
	DecodedPlanetCode,
	EncodePlanetCodeParams,
	FieldSpec,
	FromIndexParams,
	ToIndexParams,
} from "@/model/genesis-params/code/types"
import { SLIDER_RANGES } from "@/model/genesis-params/ranges"
import type { GenesisParams } from "@/model/pipelines/types"
import { SEEDS } from "@/model/shared/random/seeds"
import { ERAS } from "@/model/society/eras"

const DEFAULT_PRESSURE = 1.0

const PLANET_CODE_PART_SEPARATOR = "."

function rangeCount(r: { min: number; max: number; step: number }): number {
	return Math.round((r.max - r.min) / r.step) + 1
}

const SR = SLIDER_RANGES

const FIELD_SPECS: FieldSpec[] = [
	{
		// Prepended (most-significant digit) so previously-shared codes —
		// which have no bits allocated for this field — decode it as the
		// leftover 0, i.e. SOL_SEED, once all the fields below are peeled off.
		name: "restSeed",
		min: 0,
		step: 1,
		count: SEEDS.seedMax,
		read: (p) =>
			Math.max(0, Math.min(SEEDS.seedMax - 1, Math.floor(p.restSeed ?? 0))),
	},
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
		// Reserved (formerly terrestrial/gas-giant-moon planet type, now that
		// mode is gone) — kept as a fixed 0 so every field packed after it
		// stays at its original position for previously-shared codes.
		name: "planetType",
		min: 0,
		step: 1,
		count: 2,
		read: () => 0,
	},
	{
		// 0 = none, 1 = solar
		// lunar: 2 = moon idx 0, 3 = moon idx 1, 4 = moon idx 2
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
		name: "substellarLon",
		min: SR.substellarLon.min,
		step: SR.substellarLon.step,
		count: rangeCount(SR.substellarLon),
		read: (p) => p.substellarLon,
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
		count: ERAS.eraOrder.length,
		read: (p) => {
			const era = p.era ?? ERAS.defaultEra
			const idx = ERAS.eraOrder.indexOf(era)
			return idx >= 0 ? idx : 0
		},
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

function toIndex({ value, field }: ToIndexParams): number {
	return Math.max(
		0,
		Math.min(field.count - 1, Math.round((value - field.min) / field.step)),
	)
}

function fromIndex({ index, field }: FromIndexParams): number {
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
	if (!Number.isInteger(seed) || seed < 0 || seed >= SEEDS.seedMax) return null
	return seed
}

function encodePlanetParams(params: GenesisParams): string {
	let packed = 0n
	for (const field of FIELD_SPECS) {
		packed =
			packed * BigInt(field.count) +
			BigInt(toIndex({ value: field.read(params), field }))
	}
	return packed.toString(36).padStart(PARAMS_BASE_LEN, "0")
}

function encodePlanetCode({ seed, params }: EncodePlanetCodeParams): string {
	const seedPart = BigInt(seed).toString(36)
	const paramsPart = encodePlanetParams(params)
	return [seedPart, paramsPart].join(PLANET_CODE_PART_SEPARATOR)
}

function decodePlanetCode(code: string): DecodedPlanetCode | null {
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
		decodedFields[field.name] = fromIndex({ index, field })
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
		tideLock: (() => {
			const v = decodedFields.tidallyLocked
			if (v === 1) return { type: "solar" as const, target: 0 }
			if (v >= 2) return { type: "lunar" as const, target: v - 2 }
			return null
		})(),
		substellarLon: decodedFields.substellarLon,
		perihelion: decodedFields.perihelion,
		pressure: decodedFields.pressure,
		volcanism: decodedFields.volcanism,
		craters: craters > 0 ? craters : undefined,
		maxElevation: decodedFields.maxElevation,
		era: ERAS.eraOrder[eraIdx] ?? ERAS.defaultEra,
		restSeed: decodedFields.restSeed ?? 0,
	}
}

export const PLANET_CODE = {
	encodePlanetCode,
	decodePlanetCode,
}
