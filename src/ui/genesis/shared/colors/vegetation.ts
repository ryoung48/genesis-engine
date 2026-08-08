import { VEGETATION_WATER_BLUE } from "@/ui/genesis/shared/colors"

export function vegetationColor(biomeCode: number): [number, number, number] {
	return biomeBaseColors[biomeCode] ?? biomeBaseColors[0]
}

export function vegetationMapColor(
	biomeCode: number,
	climateZoneCode?: number,
): [number, number, number] {
	if (
		(climateZoneCode === ARCTIC_CLIMATE_ZONE ||
			climateZoneCode === SUBARCTIC_CLIMATE_ZONE) &&
		(biomeCode === 2 || biomeCode === 3)
	) {
		return COLD_OPEN_LAND_COLOR
	}
	return biomeMapColors[biomeCode] ?? biomeMapColors[0]
}

/** Continuous satellite-style land/ocean color driven by mean annual
 * temperature (°C) and annual rainfall (mm), replacing the old flat
 * per-PASTA-class lookup so neighboring regions with similar climate blend
 * smoothly instead of jumping between discrete swatches at class
 * boundaries. `isLand` is the final terrain mask, which correctly retains
 * drained lakebeds and other below-sea-level land as land. */
export function vegetationSatelliteColor(
	isLand: boolean,
	tempC: number,
	rainMm: number,
): [number, number, number] {
	return isLand ? landSatelliteColor(tempC, rainMm) : oceanSatelliteColor(tempC)
}

/** Icy pale blue below freezing, deep navy open water above -- smoothstepped
 * across a few degrees either side of 0C rather than the old hard split
 * between the "*fi" (frozen) and every other ocean PASTA class. */
function oceanSatelliteColor(tempC: number): [number, number, number] {
	const FROZEN: [number, number, number] = [190 / 255, 208 / 255, 226 / 255]
	const OPEN: [number, number, number] = [20 / 255, 30 / 255, 66 / 255]
	const f = smoothstep(-3, 2, tempC)
	return lerpRgb(FROZEN, OPEN, f)
}

/** Three temperature bands (cold/temperate/hot) each spanning a dry->wet
 * moisture gradient, bilinearly interpolated so any (temp, rain) pair maps
 * to a unique continuous color -- an approximation of a Whittaker biome
 * diagram rendered as satellite-true colors instead of biome labels. */
const TEMP_STOPS = [-20, 5, 30]

const DRY_COLORS: [number, number, number][] = [
	[196, 188, 162], // cold + dry: pale tundra/polar desert
	[176, 156, 88], // temperate + dry: golden steppe/grassland
	[214, 178, 120], // hot + dry: desert sand
]

const WET_COLORS: [number, number, number][] = [
	[35, 58, 38], // cold + wet: dark boreal conifer forest
	[70, 98, 48], // temperate + wet: mixed/deciduous forest green
	[28, 62, 24], // hot + wet: deep tropical rainforest green
]

function landSatelliteColor(
	tempC: number,
	rainMm: number,
): [number, number, number] {
	const moisture = clamp01(Math.sqrt(Math.max(0, rainMm)) / Math.sqrt(2500))

	let seg = 0
	while (seg < TEMP_STOPS.length - 2 && tempC > TEMP_STOPS[seg + 1]) seg++
	const lo = TEMP_STOPS[seg]
	const hi = TEMP_STOPS[seg + 1]
	const tFrac = clamp01((tempC - lo) / (hi - lo))

	const colorAt = (i: number): [number, number, number] =>
		lerpRgb(DRY_COLORS[i], WET_COLORS[i], moisture)

	const [r, g, b] = lerpRgb(colorAt(seg), colorAt(seg + 1), tFrac)
	return [r / 255, g / 255, b / 255]
}

function clamp01(x: number): number {
	return Math.min(1, Math.max(0, x))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp01((x - edge0) / (edge1 - edge0))
	return t * t * (3 - 2 * t)
}

function lerpRgb(
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	]
}

const biomeBaseColors: [number, number, number][] = [
	VEGETATION_WATER_BLUE,
	[0xcc / 255, 0xc4 / 255, 0xbc / 255],
	[0xa0 / 255, 0xa6 / 255, 0x96 / 255],
	[0x8e / 255, 0x9a / 255, 0x82 / 255],
	[0x78 / 255, 0x80 / 255, 0x6a / 255],
	[0x52 / 255, 0x5c / 255, 0x4a / 255],
	[0x34 / 255, 0x44 / 255, 0x32 / 255],
]

const ARCTIC_CLIMATE_ZONE = 1

const SUBARCTIC_CLIMATE_ZONE = 2

const COLD_OPEN_LAND_COLOR: [number, number, number] = [
	0xca / 255,
	0xcd / 255,
	0xca / 255,
]

const biomeMapColors: [number, number, number][] = [
	VEGETATION_WATER_BLUE,
	[1, 1, 1],
	[0xee / 255, 0xe3 / 255, 0xd2 / 255],
	[0xf0 / 255, 0xed / 255, 0xe2 / 255],
	[0xc0 / 255, 0xe8 / 255, 0xd4 / 255],
	[0x94 / 255, 0xda / 255, 0xc4 / 255],
	[0x94 / 255, 0xda / 255, 0xc4 / 255],
]
