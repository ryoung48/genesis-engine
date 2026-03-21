/**
 * Planet code encode/decode — packs seed + slider values into a compact base36 string.
 * Compatible with the source orogen planet codes (22-char format).
 */

import type { OrogenParams } from "./types"
import { DEFAULT_PLANET_RADIUS_KM } from "./units"

const SLIDERS = [
	{ min: 5000,  step: 1000, count: 2556 }, // 0: Detail (N)
	{ min: 0,     step: 0.05, count: 21   }, // 1: Irregularity (jitter)
	{ min: 4,     step: 1,    count: 117  }, // 2: Plates (P)
	{ min: 1,     step: 1,    count: 10   }, // 3: Continents
	{ min: 0,     step: 0.01, count: 51   }, // 4: Roughness
	{ min: 0,     step: 0.05, count: 21   }, // 5: Smoothing
	{ min: 0,     step: 0.05, count: 21   }, // 6: Glacial Erosion
	{ min: 0,     step: 0.05, count: 21   }, // 7: Hydraulic Erosion
	{ min: 0,     step: 0.05, count: 21   }, // 8: Thermal Erosion
	{ min: 0,     step: 0.05, count: 21   }, // 9: Ridge Sharpening
	{ min: 0,     step: 0.05, count: 21   }, // 10: Soil Creep (not in port, fixed 0.75)
	{ min: 0,     step: 0.05, count: 21   }, // 11: Terrain Warp
	{ min: 0,     step: 0.05, count: 21   }, // 12: Continent Size Variety
	{ min: -15,   step: 1,    count: 31   }, // 13: Temperature (not in port)
	{ min: -1,    step: 0.1,  count: 21   }, // 14: Precipitation (not in port)
	{ min: 0,     step: 0.01, count: 101  }, // 15: Land Coverage
]

const RADICES = [101, 21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556]
const SEED_MAX = 16777216
const BASE_LEN = 22
const IDX_CHARS = 2

function toIndex(value: number, slider: { min: number; step: number }): number {
	return Math.round((value - slider.min) / slider.step)
}

function fromIndex(idx: number, slider: { min: number; step: number }): number {
	const raw = slider.min + idx * slider.step
	const decimals = slider.step < 1 ? String(slider.step).split(".")[1].length : 0
	return decimals > 0 ? parseFloat(raw.toFixed(decimals)) : raw
}

function parseBase36(str: string): bigint {
	return [...str].reduce((acc, ch) => {
		const d = parseInt(ch, 36)
		if (isNaN(d)) throw new Error("bad char")
		return acc * 36n + BigInt(d)
	}, 0n)
}

export function encodePlanetCode(seed: number, params: OrogenParams): string {
	const nIdx   = toIndex(params.numPoints, SLIDERS[0])
	const jIdx   = toIndex(params.jitter, SLIDERS[1])
	const pIdx   = toIndex(params.numPlates, SLIDERS[2])
	const cnIdx  = toIndex(params.numContinents, SLIDERS[3])
	const nsIdx  = toIndex(params.roughness, SLIDERS[4])
	const smIdx  = toIndex(params.smoothing, SLIDERS[5])
	const glIdx  = toIndex(params.glacialErosion, SLIDERS[6])
	const heIdx  = toIndex(params.hydraulicErosion, SLIDERS[7])
	const teIdx  = toIndex(params.thermalErosion, SLIDERS[8])
	const rsIdx  = toIndex(params.ridgeSharpening, SLIDERS[9])
	const scIdx  = toIndex(0.75, SLIDERS[10]) // soil creep fixed
	const twIdx  = toIndex(params.terrainWarp, SLIDERS[11])
	const csvIdx = toIndex(params.continentSizeVariety, SLIDERS[12])
	const tmpIdx = toIndex(0, SLIDERS[13]) // temperature offset not in port
	const prcIdx = toIndex(0, SLIDERS[14]) // precipitation offset not in port
	const lcIdx  = toIndex(params.landCoverage, SLIDERS[15])

	let packed = BigInt(seed)
	packed = packed * BigInt(RADICES[15]) + BigInt(nIdx)
	packed = packed * BigInt(RADICES[14]) + BigInt(jIdx)
	packed = packed * BigInt(RADICES[13]) + BigInt(pIdx)
	packed = packed * BigInt(RADICES[12]) + BigInt(cnIdx)
	packed = packed * BigInt(RADICES[11]) + BigInt(nsIdx)
	packed = packed * BigInt(RADICES[10]) + BigInt(smIdx)
	packed = packed * BigInt(RADICES[9])  + BigInt(glIdx)
	packed = packed * BigInt(RADICES[8])  + BigInt(heIdx)
	packed = packed * BigInt(RADICES[7])  + BigInt(teIdx)
	packed = packed * BigInt(RADICES[6])  + BigInt(rsIdx)
	packed = packed * BigInt(RADICES[5])  + BigInt(scIdx)
	packed = packed * BigInt(RADICES[4])  + BigInt(twIdx)
	packed = packed * BigInt(RADICES[3])  + BigInt(csvIdx)
	packed = packed * BigInt(RADICES[2])  + BigInt(tmpIdx)
	packed = packed * BigInt(RADICES[1])  + BigInt(prcIdx)
	packed = packed * BigInt(RADICES[0])  + BigInt(lcIdx)

	const base = packed.toString(36).padStart(BASE_LEN, "0")
	const radiusKm = Math.round(params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM)
	return radiusKm === DEFAULT_PLANET_RADIUS_KM ? base : `${base}-r${radiusKm}`
}

export interface DecodedPlanetCode {
	seed: number
	numPoints: number
	jitter: number
	numPlates: number
	numContinents: number
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
}

interface DecodeConfig {
	radices: number[]
	fields: [string, number][]
	defaults: Record<string, number>
}

const DECODE_FORMATS: Record<number, DecodeConfig> = {
	[BASE_LEN]: {
		radices: RADICES,
		fields: [
			["landCoverage", 15], ["precipitationOffset", 14], ["temperatureOffset", 13],
			["continentSizeVariety", 12], ["terrainWarp", 11], ["soilCreep", 10], ["ridgeSharpening", 9],
			["thermalErosion", 8], ["hydraulicErosion", 7], ["glacialErosion", 6],
			["smoothing", 5], ["roughness", 4], ["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: {},
	},
	21: {
		radices: [21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556],
		fields: [
			["precipitationOffset", 14], ["temperatureOffset", 13], ["continentSizeVariety", 12],
			["terrainWarp", 11], ["soilCreep", 10], ["ridgeSharpening", 9],
			["thermalErosion", 8], ["hydraulicErosion", 7], ["glacialErosion", 6],
			["smoothing", 5], ["roughness", 4], ["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: { landCoverage: 0.3 },
	},
	18: {
		radices: [21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556],
		fields: [
			["terrainWarp", 11], ["soilCreep", 10], ["ridgeSharpening", 9],
			["thermalErosion", 8], ["hydraulicErosion", 7], ["glacialErosion", 6],
			["smoothing", 5], ["roughness", 4], ["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: { continentSizeVariety: 0, temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3 },
	},
	17: {
		radices: [21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2559],
		fields: [
			["soilCreep", 10], ["ridgeSharpening", 9], ["thermalErosion", 8], ["hydraulicErosion", 7],
			["glacialErosion", 6], ["smoothing", 5], ["roughness", 4],
			["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: { terrainWarp: 0.5, continentSizeVariety: 0, temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3 },
	},
	16: {
		radices: [21, 21, 21, 21, 21, 51, 10, 117, 21, 2559],
		fields: [
			["soilCreep", 10], ["ridgeSharpening", 9], ["thermalErosion", 8], ["hydraulicErosion", 7],
			["smoothing", 5], ["roughness", 4], ["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: { terrainWarp: 0.5, glacialErosion: 0, continentSizeVariety: 0, temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3 },
	},
	14: {
		radices: [21, 21, 21, 51, 10, 117, 21, 2559],
		fields: [
			["thermalErosion", 8], ["hydraulicErosion", 7], ["smoothing", 5], ["roughness", 4],
			["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: { terrainWarp: 0.5, glacialErosion: 0, ridgeSharpening: 0.35, soilCreep: 0.05, continentSizeVariety: 0, temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3 },
	},
	13: {
		radices: [21, 21, 51, 10, 117, 21, 2559],
		fields: [
			["hydraulicErosion", 7], ["smoothing", 5], ["roughness", 4],
			["numContinents", 3], ["numPlates", 2], ["jitter", 1], ["numPoints", 0],
		],
		defaults: { terrainWarp: 0.5, glacialErosion: 0, thermalErosion: 0.1, ridgeSharpening: 0.35, soilCreep: 0.05, continentSizeVariety: 0, temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3 },
	},
}

export function decodePlanetCode(code: string): DecodedPlanetCode | null {
	code = code.trim().toLowerCase()

	const dashIdx = code.indexOf("-")
	const base = dashIdx === -1 ? code : code.slice(0, dashIdx)
	const suffix = dashIdx === -1 ? "" : code.slice(dashIdx + 1)

	const config = DECODE_FORMATS[base.length]
	if (!config) return null
	if (!/^[0-9a-z]+$/.test(base)) return null

	let packed: bigint
	try {
		packed = parseBase36(base)
	} catch {
		return null
	}

	const raw: Record<string, number> = {}
	for (let i = 0; i < config.radices.length; i++) {
		const [name, si] = config.fields[i]
		const idx = Number(packed % BigInt(config.radices[i]))
		packed = packed / BigInt(config.radices[i])
		if (idx >= SLIDERS[si].count) return null
		raw[name] = fromIndex(idx, SLIDERS[si])
	}
	const seed = Number(packed)
	if (seed < 0 || seed >= SEED_MAX) return null
	Object.assign(raw, config.defaults)

	let planetRadiusKm = DEFAULT_PLANET_RADIUS_KM
	if (suffix) {
		const radiusMatch = /^r(\d+)$/.exec(suffix)
		if (!radiusMatch) return null
		planetRadiusKm = Math.max(1000, parseInt(radiusMatch[1], 10))
	}

	return {
		seed,
		numPoints: raw.numPoints ?? raw.N ?? 204000,
		jitter: raw.jitter ?? 0.75,
		numPlates: raw.numPlates ?? raw.P ?? 80,
		numContinents: raw.numContinents ?? 4,
		roughness: raw.roughness ?? 0.40,
		smoothing: raw.smoothing ?? 0.10,
		glacialErosion: raw.glacialErosion ?? 0.50,
		hydraulicErosion: raw.hydraulicErosion ?? 0.50,
		thermalErosion: raw.thermalErosion ?? 0.10,
		ridgeSharpening: raw.ridgeSharpening ?? 0.50,
		terrainWarp: raw.terrainWarp ?? 0.75,
		continentSizeVariety: raw.continentSizeVariety ?? 0.35,
		landCoverage: raw.landCoverage ?? 0.30,
		planetRadiusKm,
	}
}
