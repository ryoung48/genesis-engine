import {
	CHAOTIC_MAX,
	TEMPERATURE_BOUNDARY_BOREAL,
	TEMPERATURE_BOUNDARY_SUBARCTIC,
	TEMPERATURE_BOUNDARY_SUBTROPICAL,
	TEMPERATURE_BOUNDARY_TEMPERATE,
	TEMPERATURE_BOUNDARY_TROPICAL,
} from "@/model/climate/vegetation"
import {
	cssColorToRgb,
	mixRgb,
	quantizeRgb,
	type RgbColor,
	rgbToCss,
	sampleBasisColorStops,
	sampleColorStops,
} from "@/model/shared/color-interpolation"
import {
	BUPU_STOPS,
	ORANGES_STOPS,
	PURPLES_STOPS,
	YL_OR_RD_STOPS,
} from "@/model/shared/color-palettes"

/**
 * Orogen elevation and temperature color mapping.
 */

export type ColorMode =
	| "terrain"
	| "heightmap"
	| "landHeightmap"
	| "slope"
	| "topography"
	| "temperature"
	| "temperatureDelta"
	| "precipitation"
	| "moisture"
	| "vegetation"
	| "climate"
	| "pastaClimate"
	| "koppenClimate"
	| "oceanCurrents"
	| "dangerZones"
	| "hotspots"
	| "nations"
	| "population"
	| "provinces"
	| "gravity"
	| "basins"
	| "terrainFeatures"
	| "terrainFeaturesLand"
	| "terrainFeaturesOcean"
	| "terrainFeaturesCoast"
	| "debugGdd"
	| "debugGddz"
	| "debugGint"
	| "debugAr"
	| "debugGar"
	| "debugGrs"
	| "debugEvr"
	| "debugMinT"
	| "debugMaxT"
	| "dtr"

/** Light blue used for ocean on thematic maps (non-terrain modes). */
export const OCEAN_LIGHT_BLUE: [number, number, number] = [0.75, 0.88, 0.96]

const oceanColorStops: RgbColor[] = [
	[0xd8 / 255, 0xf2 / 255, 0xfe / 255],
	[0xc6 / 255, 0xec / 255, 0xff / 255],
	[0xb9 / 255, 0xe3 / 255, 0xff / 255],
	[0xac / 255, 0xdb / 255, 0xfb / 255],
	[0xa1 / 255, 0xd2 / 255, 0xf7 / 255],
	[0x96 / 255, 0xc9 / 255, 0xf0 / 255],
	[0x8d / 255, 0xc1 / 255, 0xea / 255],
	[0x84 / 255, 0xb9 / 255, 0xe3 / 255],
	[0x79 / 255, 0xb2 / 255, 0xde / 255],
	[0x71 / 255, 0xab / 255, 0xd8 / 255],
]

const landColorStops: RgbColor[] = [
	[0xac / 255, 0xd0 / 255, 0xa5 / 255],
	[0x94 / 255, 0xbf / 255, 0x8b / 255],
	[0xa8 / 255, 0xc6 / 255, 0x8f / 255],
	[0xbd / 255, 0xcc / 255, 0x96 / 255],
	[0xd1 / 255, 0xd7 / 255, 0xab / 255],
	[0xe1 / 255, 0xe4 / 255, 0xb5 / 255],
	[0xef / 255, 0xeb / 255, 0xc0 / 255],
	[0xe8 / 255, 0xe1 / 255, 0xb6 / 255],
	[0xde / 255, 0xd6 / 255, 0xa3 / 255],
	[0xd3 / 255, 0xca / 255, 0x9d / 255],
	[0xca / 255, 0xb9 / 255, 0x82 / 255],
	[0xc3 / 255, 0xa7 / 255, 0x6b / 255],
	[0xb9 / 255, 0x98 / 255, 0x5a / 255],
	[0xaa / 255, 0x87 / 255, 0x53 / 255],
	[0xac / 255, 0x9a / 255, 0x7c / 255],
	[0xba / 255, 0xae / 255, 0x9a / 255],
	[0xca / 255, 0xc3 / 255, 0xb8 / 255],
	[0xe0 / 255, 0xde / 255, 0xd8 / 255],
	[0xf5 / 255, 0xf4 / 255, 0xf2 / 255],
]

/**
 * Terrain color ramp using the shared world metrics palette for land,
 * while keeping the existing ocean palette.
 * Accepts elevation in km (use elevation_km array, not raw).
 */
function elevationToColor(km: number, maxElevKm = 6): [number, number, number] {
	if (km <= 0) {
		const t = 1 - Math.max(0, Math.min(1, (km + 5) / 5))
		return sampleColorStops(oceanColorStops, t)
	}

	const t = Math.max(0, Math.min(1, km / maxElevKm))
	return sampleColorStops(landColorStops, t)
}

/**
 * Grayscale heightmap: maps km range to grayscale.
 * Accepts elevation in km.
 */
function heightmapColor(
	km: number,
	maxElevKm = 6,
	maxDepthKm = 10,
): [number, number, number] {
	const range = maxDepthKm / 2 + maxElevKm
	const t = Math.max(0, Math.min(1, (km + maxDepthKm / 2) / range))
	return [t, t, t]
}

/**
 * Land heightmap: ocean = black, land on 0 -> maxElev km scale.
 * Accepts elevation in km.
 */
function landHeightmapColor(
	km: number,
	maxElevKm = 6,
): [number, number, number] {
	if (km <= 0) return [0, 0, 0]
	const t = Math.max(0, Math.min(1, km / maxElevKm))
	return [t, t, t]
}

const tempStops: { c: number; r: number; g: number; b: number }[] = [
	{ c: -73, r: 0.973, g: 0.984, b: 1.0 },
	{ c: -51.11, r: 0.863, g: 0.933, b: 0.98 },
	{ c: -40, r: 0.639, g: 0.761, b: 0.902 },
	{ c: -28.89, r: 0.549, g: 0.714, b: 0.847 },
	{ c: -17.78, r: 0.392, g: 0.584, b: 0.804 },
	{ c: 0, r: 0.18, g: 0.349, b: 0.518 },
	{ c: 4.44, r: 0.231, g: 0.62, b: 0.749 },
	{ c: 10, r: 0.416, g: 0.804, b: 0.847 },
	{ c: 15.56, r: 0.608, g: 0.835, b: 0.624 },
	{ c: 21.11, r: 0.824, g: 0.902, b: 0.498 },
	{ c: 23.89, r: 0.945, g: 0.894, b: 0.494 },
	{ c: 26.67, r: 0.941, g: 0.776, b: 0.435 },
	{ c: 29.44, r: 0.949, g: 0.631, b: 0.369 },
	{ c: 32.22, r: 0.957, g: 0.608, b: 0.259 },
	{ c: 35, r: 0.937, g: 0.49, b: 0.231 },
	{ c: 37.78, r: 0.882, g: 0.361, b: 0.31 },
	{ c: 40.56, r: 0.839, g: 0.286, b: 0.392 },
	{ c: 43.33, r: 0.729, g: 0.184, b: 0.427 },
	{ c: 46.11, r: 0.639, g: 0.082, b: 0.388 },
	{ c: 48.89, r: 0.49, g: 0.0, b: 0.31 },
	{ c: 80, r: 0.353, g: 0.0, b: 0.184 },
]

export function temperatureColor(celsius: number): [number, number, number] {
	const clamped = Math.max(
		tempStops[0].c,
		Math.min(tempStops[tempStops.length - 1].c, celsius),
	)
	for (let i = 0; i < tempStops.length - 1; i++) {
		const a = tempStops[i]
		const b = tempStops[i + 1]
		if (clamped <= b.c) {
			const t = (clamped - a.c) / (b.c - a.c)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = tempStops[tempStops.length - 1]
	return [last.r, last.g, last.b]
}

export function daylightColor(hours: number): [number, number, number] {
	const normalized = Math.max(0, Math.min(1, 1 - hours / 24))
	return quantizeRgb(sampleColorStops(PURPLES_STOPS, normalized))
}

export function temperatureDeltaColor(
	celsiusDelta: number,
): [number, number, number] {
	const normalized = Math.pow(Math.max(0, Math.min(1, celsiusDelta / 60)), 0.8)
	return quantizeRgb(sampleColorStops(YL_OR_RD_STOPS, normalized))
}

const monthlyPrecipStops: { mm: number; r: number; g: number; b: number }[] = [
	{ mm: 0, r: 0.76, g: 0.7, b: 0.5 },
	{ mm: 10, r: 0.85, g: 0.78, b: 0.45 },
	{ mm: 40, r: 0.7, g: 0.82, b: 0.42 },
	{ mm: 83, r: 0.4, g: 0.75, b: 0.45 },
	{ mm: 125, r: 0.2, g: 0.65, b: 0.55 },
	{ mm: 165, r: 0.15, g: 0.5, b: 0.7 },
	{ mm: 250, r: 0.15, g: 0.3, b: 0.8 },
	{ mm: 400, r: 0.3, g: 0.15, b: 0.7 },
]

const annualPrecipStops = monthlyPrecipStops.map((stop) => ({
	...stop,
	mm: stop.mm * 12,
}))

function interpolatePrecipitationStops(
	mm: number,
	stops: ReadonlyArray<{ mm: number; r: number; g: number; b: number }>,
): [number, number, number] {
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i]
		const b = stops[i + 1]
		if (mm <= b.mm) {
			const t = (mm - a.mm) / (b.mm - a.mm)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = stops[stops.length - 1]
	return [last.r, last.g, last.b]
}

export function precipitationMonthlyColor(
	mm: number,
): [number, number, number] {
	return interpolatePrecipitationStops(mm, monthlyPrecipStops)
}

export function precipitationAnnualColor(mm: number): [number, number, number] {
	return interpolatePrecipitationStops(mm, annualPrecipStops)
}

export function precipitationColor(mm: number): [number, number, number] {
	return precipitationMonthlyColor(mm)
}

export function precipitationCssColor(mm: number): string {
	return rgbToCss(precipitationColor(mm))
}

const eastMoistureTints: [number, number, number][] = [
	[0.98, 0.95, 0.9],
	[0.97, 0.8, 0.52],
	[0.95, 0.58, 0.3],
	[0.75, 0.28, 0.18],
	[0.4, 0.12, 0.18],
]

const westMoistureTints: [number, number, number][] = [
	[0.97, 0.97, 0.92],
	[0.83, 0.95, 0.77],
	[0.54, 0.86, 0.6],
	[0.2, 0.65, 0.62],
	[0.12, 0.34, 0.62],
]

export function moistureDirectionalColor(
	normalized: number,
	isEastDominant: boolean,
): [number, number, number] {
	const tintStops = isEastDominant ? eastMoistureTints : westMoistureTints
	const clamped = Math.max(0, Math.min(1, normalized))
	const scaled = clamped * (tintStops.length - 1)
	const i = Math.min(tintStops.length - 2, Math.floor(scaled))
	const localT = scaled - i
	const a = tintStops[i]
	const b = tintStops[i + 1]
	return [
		a[0] + (b[0] - a[0]) * localT,
		a[1] + (b[1] - a[1]) * localT,
		a[2] + (b[2] - a[2]) * localT,
	]
}

const climateZoneColors: [number, number, number][] = [
	OCEAN_LIGHT_BLUE,
	[0xd3 / 255, 0xef / 255, 0xff / 255],
	[0x7f / 255, 0xd0 / 255, 0xff / 255],
	[0x91 / 255, 0xff / 255, 0xdc / 255],
	[0xe6 / 255, 0xf5 / 255, 0x98 / 255],
	[0xff / 255, 0xa7 / 255, 0x5b / 255],
	[0xff / 255, 0x77 / 255, 0x85 / 255],
	[0x7e / 255, 0x43 / 255, 0x49 / 255],
	[0xc2 / 255, 0x93 / 255, 0xff / 255],
]

export function climateZoneColor(zoneCode: number): [number, number, number] {
	return climateZoneColors[zoneCode] ?? climateZoneColors[0]
}

function midpoint(a: number, b: number): number {
	return (a + b) / 2
}

/**
 * Continuous climate color ramp by mean temperature.
 * Matches MAP_METRICS.climate.tempColor from shapes/metrics.ts.
 */
const climateTempStops: { t: number; r: number; g: number; b: number }[] = [
	{
		t: TEMPERATURE_BOUNDARY_SUBARCTIC,
		r: 0xd3 / 255,
		g: 0xef / 255,
		b: 0xff / 255,
	},
	{
		t: midpoint(TEMPERATURE_BOUNDARY_SUBARCTIC, TEMPERATURE_BOUNDARY_BOREAL),
		r: 0x7f / 255,
		g: 0xd0 / 255,
		b: 0xff / 255,
	},
	{
		t: midpoint(TEMPERATURE_BOUNDARY_BOREAL, TEMPERATURE_BOUNDARY_TEMPERATE),
		r: 0x91 / 255,
		g: 0xff / 255,
		b: 0xdc / 255,
	},
	{
		t: midpoint(
			TEMPERATURE_BOUNDARY_TEMPERATE,
			TEMPERATURE_BOUNDARY_SUBTROPICAL,
		),
		r: 0xe6 / 255,
		g: 0xf5 / 255,
		b: 0x98 / 255,
	},
	{
		t: midpoint(
			TEMPERATURE_BOUNDARY_SUBTROPICAL,
			TEMPERATURE_BOUNDARY_TROPICAL,
		),
		r: 0xff / 255,
		g: 0xa7 / 255,
		b: 0x5b / 255,
	},
	{
		t: midpoint(TEMPERATURE_BOUNDARY_TROPICAL, CHAOTIC_MAX),
		r: 0xff / 255,
		g: 0x77 / 255,
		b: 0x85 / 255,
	},
	{ t: CHAOTIC_MAX, r: 0x7e / 255, g: 0x43 / 255, b: 0x49 / 255 },
]

export function climateTempColor(celsius: number): [number, number, number] {
	const clamped = Math.max(
		climateTempStops[0].t,
		Math.min(climateTempStops[climateTempStops.length - 1].t, celsius),
	)
	for (let i = 0; i < climateTempStops.length - 1; i++) {
		const a = climateTempStops[i]
		const b = climateTempStops[i + 1]
		if (clamped <= b.t) {
			const f = (clamped - a.t) / (b.t - a.t)
			return [
				a.r + f * (b.r - a.r),
				a.g + f * (b.g - a.g),
				a.b + f * (b.b - a.b),
			]
		}
	}
	const last = climateTempStops[climateTempStops.length - 1]
	return [last.r, last.g, last.b]
}

const biomeColors: [number, number, number][] = [
	OCEAN_LIGHT_BLUE,
	[0xe8 / 255, 0xcc / 255, 0xa7 / 255],
	[0xb9 / 255, 0xbc / 255, 0x91 / 255],
	[0x9d / 255, 0xb4 / 255, 0x7b / 255],
	[0x7d / 255, 0x8c / 255, 0x5c / 255],
	[0x4d / 255, 0x61 / 255, 0x3c / 255],
	[0x2d / 255, 0x4d / 255, 0x29 / 255],
]

export function vegetationColor(biomeCode: number): [number, number, number] {
	return biomeColors[biomeCode] ?? biomeColors[0]
}

/**
 * Diverging warm/cold ocean current color ramp.
 * -1 (cold, deep blue) → 0 (neutral gray) → +1 (warm, deep red/orange).
 */
const oceanCurrentStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -1.0, r: 0.12, g: 0.15, b: 0.6 },
	{ v: -0.5, r: 0.2, g: 0.45, b: 0.8 },
	{ v: -0.15, r: 0.55, g: 0.75, b: 0.9 },
	{ v: 0.0, r: 0.8, g: 0.8, b: 0.8 },
	{ v: 0.15, r: 0.95, g: 0.7, b: 0.5 },
	{ v: 0.5, r: 0.9, g: 0.4, b: 0.2 },
	{ v: 1.0, r: 0.65, g: 0.12, b: 0.08 },
]

export function oceanCurrentColor(warmth: number): [number, number, number] {
	const clamped = Math.max(-1, Math.min(1, warmth))
	for (let i = 0; i < oceanCurrentStops.length - 1; i++) {
		const a = oceanCurrentStops[i]
		const b = oceanCurrentStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = oceanCurrentStops[oceanCurrentStops.length - 1]
	return [last.r, last.g, last.b]
}

export function dangerColor(score: number): [number, number, number] {
	return quantizeRgb(
		sampleBasisColorStops(DANGER_BASIS_STOPS, Math.max(0, Math.min(1, score))),
	)
}

const DANGER_WHITE: [number, number, number] = [1, 1, 1]
const DANGER_BASIS_STOPS: RgbColor[] = [
	"#eff6ff",
	"#facc15",
	"#f97316",
	"#dc2626",
	"#fff7ed",
].map(cssColorToRgb)
const HOTSPOT_BASIS_STOPS: RgbColor[] = [
	"#0f172a",
	"#1d4ed8",
	"#22d3ee",
	"#facc15",
	"#fb7185",
	"#fff7ed",
].map(cssColorToRgb)
const GRAVITY_BASIS_STOPS: RgbColor[] = [
	"#0b1f3a",
	"#0f6ba8",
	"#27c7d9",
	"#f4d35e",
	"#f97316",
	"#b91c1c",
].map(cssColorToRgb)
const SLOPE_BASIS_STOPS: RgbColor[] = [
	"#f8fafc",
	"#d9f99d",
	"#facc15",
	"#f97316",
	"#7f1d1d",
].map(cssColorToRgb)
const DANGER_EARTHQUAKE_ORANGE = dangerColor(0.375)
const DANGER_VOLCANO_RED = dangerColor(0.625)

export function dangerMapColor(
	earthquake: number,
	volcano: number,
): [number, number, number] {
	const dominant =
		volcano >= earthquake ? DANGER_VOLCANO_RED : DANGER_EARTHQUAKE_ORANGE
	const score = Math.max(earthquake, volcano)
	const t = Math.max(0, Math.min(1, (score - 0.25) / 0.75))
	return mixRgb(DANGER_WHITE, dominant, t)
}

export function hotspotColor(score: number): [number, number, number] {
	return quantizeRgb(
		sampleBasisColorStops(HOTSPOT_BASIS_STOPS, Math.max(0, Math.min(1, score))),
	)
}

export function populationColor(
	normalizedDensity: number,
): [number, number, number] {
	return quantizeRgb(
		sampleColorStops(
			ORANGES_STOPS,
			Math.pow(Math.max(0, Math.min(1, normalizedDensity)), 0.4),
		),
	)
}

export function migrationColor(
	normalizedArrival: number,
): [number, number, number] {
	const stops = [
		{ value: 0, r: 0.091, g: 0.169, b: 0.478 },
		{ value: 0.125, r: 0.122, g: 0.353, b: 0.678 },
		{ value: 0.25, r: 0.106, g: 0.533, b: 0.745 },
		{ value: 0.375, r: 0.216, g: 0.686, b: 0.624 },
		{ value: 0.5, r: 0.486, g: 0.773, b: 0.447 },
		{ value: 0.625, r: 0.769, g: 0.835, b: 0.318 },
		{ value: 0.75, r: 0.941, g: 0.804, b: 0.255 },
		{ value: 0.875, r: 0.973, g: 0.608, b: 0.224 },
		{ value: 1, r: 0.882, g: 0.286, b: 0.224 },
	]
	const clamped = Math.max(0, Math.min(1, normalizedArrival))
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i]
		const b = stops[i + 1]
		if (clamped <= b.value) {
			const t = (clamped - a.value) / (b.value - a.value)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = stops[stops.length - 1]
	return [last.r, last.g, last.b]
}

export function gravityColor(t: number): [number, number, number] {
	return quantizeRgb(
		sampleBasisColorStops(
			GRAVITY_BASIS_STOPS,
			Math.pow(Math.max(0, Math.min(1, t)), 0.55),
		),
	)
}

export function developmentColor(t: number): [number, number, number] {
	return quantizeRgb(
		sampleColorStops(BUPU_STOPS, Math.pow(Math.max(0, Math.min(1, t)), 0.9)),
	)
}

const dtrStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: 0, r: 0.0, g: 0.016, b: 0.812 }, // #0004cf
	{ v: 5, r: 0.012, g: 0.373, b: 0.871 }, // #035fde
	{ v: 10, r: 0.008, g: 0.906, b: 0.31 }, // #02e74f
	{ v: 15, r: 0.596, g: 1.0, b: 0.067 }, // #98ff11
	{ v: 20, r: 1.0, g: 1.0, b: 0.0 }, // #ffff00
	{ v: 25, r: 1.0, g: 0.808, b: 0.0 }, // #ffce00
	{ v: 30, r: 1.0, g: 0.455, b: 0.0 }, // #ff7400
	{ v: 35, r: 1.0, g: 0.094, b: 0.0 }, // #ff1800
	{ v: 40, r: 0.8, g: 0.0, b: 0.0 }, // #cc0000
]

export function dtrColor(celsius: number): [number, number, number] {
	const clamped = Math.max(
		dtrStops[0].v,
		Math.min(dtrStops[dtrStops.length - 1].v, celsius),
	)
	for (let i = 0; i < dtrStops.length - 1; i++) {
		const a = dtrStops[i]
		const b = dtrStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = dtrStops[dtrStops.length - 1]
	return [last.r, last.g, last.b]
}

export function slopeColor(normalizedSlope: number): [number, number, number] {
	return quantizeRgb(
		sampleBasisColorStops(
			SLOPE_BASIS_STOPS,
			Math.pow(Math.max(0, Math.min(1, normalizedSlope)), 0.7),
		),
	)
}

export function getColor(
	km: number,
	mode: ColorMode,
	maxElevKm = 6,
	maxDepthKm = 10,
): [number, number, number] {
	switch (mode) {
		case "heightmap":
			return heightmapColor(km, maxElevKm, maxDepthKm)
		case "landHeightmap":
			return landHeightmapColor(km, maxElevKm)
		case "slope":
			return slopeColor(Math.max(0, Math.min(1, km)))
		default:
			return elevationToColor(km, maxElevKm)
	}
}
