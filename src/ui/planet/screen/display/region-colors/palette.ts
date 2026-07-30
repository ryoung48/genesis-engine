import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { OCEAN_LIGHT_BLUE } from "@/ui/planet/colors"

export function basinColor(id: number): [number, number, number] {
	if (id < 0) return OCEAN_LIGHT_BLUE
	let h = (id * 2654435761) >>> 0
	h ^= h >>> 16
	const hue = (h % 360) / 360
	const sat = 0.45 + ((h >>> 9) % 40) / 100
	const light = 0.42 + ((h >>> 17) % 18) / 100
	let r = light
	let g = light
	let b = light
	if (sat > 0) {
		const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
		const p = 2 * light - q
		const hueToRgb = (t: number) => {
			let x = t
			if (x < 0) x += 1
			if (x > 1) x -= 1
			if (x < 1 / 6) return p + (q - p) * 6 * x
			if (x < 1 / 2) return q
			if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
			return p
		}
		r = hueToRgb(hue + 1 / 3)
		g = hueToRgb(hue)
		b = hueToRgb(hue - 1 / 3)
	}
	return [r, g, b]
}

export function getDynastyColor(id: number): [number, number, number] {
	if (id < 0) return [0.35, 0.33, 0.32]
	let h = (id * 2246822519) >>> 0
	h ^= h >>> 15
	const hue = (h % 360) / 360
	const sat = 0.52 + ((h >>> 9) % 48) / 100
	const light = 0.18 + ((h >>> 17) % 62) / 100
	let r = light
	let g = light
	let b = light
	if (sat > 0) {
		const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
		const p = 2 * light - q
		const hueToRgb = (t: number) => {
			let x = t
			if (x < 0) x += 1
			if (x > 1) x -= 1
			if (x < 1 / 6) return p + (q - p) * 6 * x
			if (x < 1 / 2) return q
			if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
			return p
		}
		r = hueToRgb(hue + 1 / 3)
		g = hueToRgb(hue)
		b = hueToRgb(hue - 1 / 3)
	}
	return [r, g, b]
}

export function toPastelNationColor(
	color: readonly [number, number, number],
): [number, number, number] {
	const pastelMix = 0.52
	return [
		color[0] + (1 - color[0]) * pastelMix,
		color[1] + (1 - color[1]) * pastelMix,
		color[2] + (1 - color[2]) * pastelMix,
	]
}

export function getTerrainFeatureColor(
	feature: number,
): [number, number, number] | null {
	return TERRAIN_FEATURE_COLORS[feature] ?? null
}

export function getTopographyColor(
	topography: number,
): [number, number, number] | null {
	return TOPOGRAPHY_COLORS[topography] ?? null
}

export const TERRAIN_FEATURE_COLORS: Record<number, [number, number, number]> =
	{
		[TERRAIN_FEATURES.genesisTerrainFeature.RIFT_VALLEY]: [0.82, 0.29, 0.22],
		[TERRAIN_FEATURES.genesisTerrainFeature.PULL_APART_BASIN]: [
			0.7, 0.22, 0.18,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.BACK_ARC_BASIN]: [0.95, 0.55, 0.22],
		[TERRAIN_FEATURES.genesisTerrainFeature.FOLD_RIDGES]: [0.55, 0.24, 0.13],
		[TERRAIN_FEATURES.genesisTerrainFeature.PLATEAU_UPLIFT]: [0.8, 0.65, 0.28],
		[TERRAIN_FEATURES.genesisTerrainFeature.CONTINENTAL_INTERIOR]: [
			0.45, 0.63, 0.21,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.MID_OCEAN_RIDGE]: [
			0.17, 0.73, 0.88,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.FRACTURE_ZONE]: [0.18, 0.47, 0.92],
		[TERRAIN_FEATURES.genesisTerrainFeature.TRENCH]: [0.07, 0.17, 0.46],
		[TERRAIN_FEATURES.genesisTerrainFeature.COASTAL_ROUGHENING]: [
			0.98, 0.9, 0.5,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.ISLAND_ARC]: [0.9, 0.4, 0.72],
	}

export const TOPOGRAPHY_COLORS: Record<number, [number, number, number]> = {
	0: [0x6c / 255, 0x9d / 255, 0x35 / 255], // flat
	1: [0x72 / 255, 0x84 / 255, 0x76 / 255], // hill
	2: [0x92 / 255, 0x76 / 255, 0x2d / 255], // plateau
	3: [0x6c / 255, 0x2c / 255, 0x14 / 255], // mountains
	4: [0x2d / 255, 0x8e / 255, 0x72 / 255], // marsh
	5: [0x75 / 255, 0xaf / 255, 0xd4 / 255], // ocean
	6: [0x75 / 255, 0xaf / 255, 0xd4 / 255], // lake
}
