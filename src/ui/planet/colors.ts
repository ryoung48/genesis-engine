import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import type { RgbColor } from "@/model/shared/color/color-interpolation/types"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import {
	elevationToColor,
	grayscaleColor,
	hex,
} from "@/ui/planet/colors/elevation"
import { temperatureDifferenceColor } from "@/ui/planet/colors/temperature"

export { OCEAN_LIGHT_BLUE } from "@/ui/planet/colors/misc"
/**
 * Genesis elevation and temperature color mapping.
 */

export type ColorMode =
	| "terrain"
	| "landHeightmap"
	| "slope"
	| "topography"
	| "temperature"
	| "realTemperature"
	| "temperatureDiff"
	| "realDtr"
	| "dtrDiff"
	| "temperatureDelta"
	| "precipitation"
	| "realPrecipitation"
	| "precipitationDiff"
	| "moisture"
	| "vegetation"
	| "vegetationMaps"
	| "vegetationSatellite"
	| "climate"
	| "pastaClimate"
	| "koppenClimate"
	| "realPastaClimate"
	| "realKoppenClimate"
	| "oceanCurrents"
	| "dangerZones"
	| "hotspots"
	| "nations"
	| "population"
	| "realPopulation"
	| "populationDiff"
	| "provinces"
	| "earthProvinces"
	| "basins"
	| "terrainFeatures"
	| "dtr"
	| "humidity"
	| "realHumidity"
	| "humidityDiff"
	| "trade_goods"
	| "timezone"
	| "wind"
	| "misery"
	| "realMisery"
	| "eu5Topography"
	| "eu5Vegetation"
	| "eu5Climate"

/**
 * EU5 (Project Caesar) location category labels, in the fixed alphabetical
 * order produced by scripts/build-eu5-categorical.py (`sorted()` over each
 * field's distinct values from locations.gpkg). The per-region category
 * codes stored on GenesisWorld.eu5Topography/eu5Vegetation/eu5Climate are
 * indices into these arrays; keep them in sync with the .json `categories`
 * field the build script writes to public/earth-data/eu5-*.json.
 */
export const EU5_TOPOGRAPHY_CATEGORIES = [
	"atoll",
	"coastal_ocean",
	"deep_ocean",
	"dune_wasteland",
	"flatland",
	"flatland_wasteland",
	"high_lakes",
	"hills",
	"hills_wasteland",
	"inland_sea",
	"lakes",
	"mesa_wasteland",
	"mountain_wasteland",
	"mountains",
	"narrows",
	"ocean",
	"ocean_wasteland",
	"plateau",
	"plateau_wasteland",
	"salt_pans",
	"wetlands",
	"wetlands_wasteland",
] as const

export const EU5_VEGETATION_CATEGORIES = [
	"desert",
	"farmland",
	"forest",
	"grasslands",
	"jungle",
	"sparse",
	"woods",
] as const

export const EU5_CLIMATE_CATEGORIES = [
	"arctic",
	"arid",
	"cold_arid",
	"continental",
	"mediterranean",
	"oceanic",
	"subtropical",
	"tropical",
] as const
// EU5 category colors below reuse the app's existing topography
// (TOPOGRAPHY_COLORS in region-colors.ts) and vegetation (biomeBaseColors
// above) palettes wherever a category is conceptually the same landform or
// cover type, so the EU5 overlay reads consistently with the procedural
// "Topography"/"Vegetation" overlays. Categories with no clean equivalent
// (atoll, salt_pans, farmland, wasteland-of-nothing textures) keep bespoke
// semantic colors.
const TOPO_FLAT = hex(0x6c9d35)
const TOPO_HILL = hex(0x728476)
const TOPO_PLATEAU = hex(0x92762d)
const TOPO_MOUNTAINS = hex(0x6c2c14)
const TOPO_MARSH = hex(0x2d8e72)
const TOPO_OCEAN = hex(0x75afd4)
const TOPO_LAKE = TOPO_OCEAN
const VEG_DESERT = hex(0xccc4bc)

/** Flat per-category colors for the "eu5Topography" overlay, index-aligned to EU5_TOPOGRAPHY_CATEGORIES. */
export const EU5_TOPOGRAPHY_COLORS: [number, number, number][] = [
	hex(0x4fc3d9), // atoll (no app equivalent)
	TOPO_OCEAN, // coastal_ocean
	TOPO_OCEAN, // deep_ocean
	VEG_DESERT, // dune_wasteland (dunes ~ desert cover)
	TOPO_FLAT, // flatland
	TOPO_FLAT, // flatland_wasteland (same landform, barren)
	TOPO_LAKE, // high_lakes
	TOPO_HILL, // hills
	TOPO_HILL, // hills_wasteland
	TOPO_OCEAN, // inland_sea
	TOPO_LAKE, // lakes
	TOPO_PLATEAU, // mesa_wasteland (mesa ~ plateau landform)
	TOPO_MOUNTAINS, // mountain_wasteland
	TOPO_MOUNTAINS, // mountains
	TOPO_OCEAN, // narrows
	TOPO_OCEAN, // ocean
	TOPO_OCEAN, // ocean_wasteland
	TOPO_PLATEAU, // plateau
	TOPO_PLATEAU, // plateau_wasteland
	hex(0xe8e2c8), // salt_pans (no app equivalent)
	TOPO_MARSH, // wetlands
	TOPO_MARSH, // wetlands_wasteland
]

/** Flat per-category colors for the "eu5Vegetation" overlay, index-aligned to EU5_VEGETATION_CATEGORIES. */
export const EU5_VEGETATION_COLORS: [number, number, number][] = [
	hex(0x85855d), // desert
	hex(0x0c8709), // farmland
	hex(0x284b1d), // forest
	hex(0x548331), // grasslands
	hex(0x1b3a11), // jungle
	hex(0x697850), // sparse
	hex(0x3a692b), // woods
]

/** Flat per-category colors for the "eu5Climate" overlay, index-aligned to EU5_CLIMATE_CATEGORIES. */
export const EU5_CLIMATE_COLORS: [number, number, number][] = [
	hex(0x6d7c7b), // arctic
	hex(0x6d5d44), // arid
	hex(0x726f5e), // cold_arid
	hex(0x486b4d), // continental
	hex(0x7a8950), // mediterranean
	hex(0x598741), // oceanic
	hex(0x285635), // subtropical
	hex(0x23431d), // tropical
]

/** Collapses EU5_TOPOGRAPHY_CATEGORIES down to land-only landforms for
 * distribution charts (e.g. Environmental/nation-page "Topography"): water
 * categories map to null (dropped entirely -- topography distributions
 * describe land, not sea coverage) and each `_wasteland` variant folds into
 * its non-wasteland counterpart's label (same landform, just barren) rather
 * than getting its own bucket. dune_wasteland has no non-wasteland
 * counterpart in the category list, so it keeps its own "Dune" bucket. */
export const EU5_TOPOGRAPHY_MERGE_LABEL: Record<
	(typeof EU5_TOPOGRAPHY_CATEGORIES)[number],
	string | null
> = {
	atoll: "atoll",
	coastal_ocean: null,
	deep_ocean: null,
	dune_wasteland: "dune",
	flatland: "flatland",
	flatland_wasteland: "flatland",
	high_lakes: null,
	hills: "hills",
	hills_wasteland: "hills",
	inland_sea: null,
	lakes: null,
	mesa_wasteland: "plateau",
	mountain_wasteland: "mountains",
	mountains: "mountains",
	narrows: null,
	ocean: null,
	ocean_wasteland: null,
	plateau: "plateau",
	plateau_wasteland: "plateau",
	salt_pans: "salt pans",
	wetlands: "wetlands",
	wetlands_wasteland: "wetlands",
}

if (EU5_TOPOGRAPHY_COLORS.length !== EU5_TOPOGRAPHY_CATEGORIES.length) {
	throw new Error("EU5 topography categories/colors are out of sync")
}
if (EU5_VEGETATION_COLORS.length !== EU5_VEGETATION_CATEGORIES.length) {
	throw new Error("EU5 vegetation categories/colors are out of sync")
}
if (EU5_CLIMATE_COLORS.length !== EU5_CLIMATE_CATEGORIES.length) {
	throw new Error("EU5 climate categories/colors are out of sync")
}

export const VEGETATION_WATER_BLUE: [number, number, number] = [
	0x90 / 255,
	0xd9 / 255,
	0xed / 255,
]

export function dangerColor(score: number): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleBasisColorStops({
			stops: DANGER_BASIS_STOPS,
			t: Math.max(0, Math.min(1, score)),
		}),
	)
}

const DANGER_BASIS_STOPS: RgbColor[] = [
	"#eff6ff",
	"#facc15",
	"#f97316",
	"#dc2626",
	"#fff7ed",
].map(COLOR_INTERPOLATION.cssColorToRgb)
const HOTSPOT_BASIS_STOPS: RgbColor[] = [
	"#0f172a",
	"#1d4ed8",
	"#22d3ee",
	"#facc15",
	"#fb7185",
	"#fff7ed",
].map(COLOR_INTERPOLATION.cssColorToRgb)
const SLOPE_BASIS_STOPS: RgbColor[] = [
	"#f8fafc",
	"#d9f99d",
	"#facc15",
	"#f97316",
	"#7f1d1d",
].map(COLOR_INTERPOLATION.cssColorToRgb)
const TORNADO_LAND_STOPS: RgbColor[] = [
	"#ffffff", // no risk — pure white
	"#d9f99d", // lime-200
	"#84cc16", // lime-500
	"#3f6212", // lime-900 — ominous dark green
].map(COLOR_INTERPOLATION.cssColorToRgb)

/** Land color for tornado sub-mode: white → lime → dark forest green. */
export function tornadoLandColor(risk: number): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleBasisColorStops({
			stops: TORNADO_LAND_STOPS,
			t: Math.max(0, Math.min(1, risk)),
		}),
	)
}

// Five stops for the continuous tidal range gradient (raw metres).
const TIDAL_ZERO: [number, number, number] = [1.0, 1.0, 1.0] // white  —  0 m (matches continent)
const TIDAL_MICRO: [number, number, number] = [0.525, 0.91, 0.867] // seafoam —  1 m
const TIDAL_MESO: [number, number, number] = [0.059, 0.729, 0.8] // teal    —  3 m
const TIDAL_MACRO: [number, number, number] = [0.043, 0.302, 0.557] // navy    — 16 m
const TIDAL_EXTREME: [number, number, number] = [0.42, 0.129, 0.659] // indigo  — 60 m

function tidalLerp(
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

/**
 * Continuous tide color by raw tidal range in metres, piecewise-linear across five stops:
 *   0 m  — white (matches continent background)
 *   1 m  — pale seafoam
 *   3 m  — ocean teal
 *   16 m — deep navy
 *   60 m — deep indigo
 */
export function tidalTierColor(valueM: number): [number, number, number] {
	if (valueM <= 0) return TIDAL_ZERO
	if (valueM < 1) return tidalLerp(TIDAL_ZERO, TIDAL_MICRO, valueM / 1)
	if (valueM < 3) return tidalLerp(TIDAL_MICRO, TIDAL_MESO, (valueM - 1) / 2)
	if (valueM < 16) return tidalLerp(TIDAL_MESO, TIDAL_MACRO, (valueM - 3) / 13)
	if (valueM < 60)
		return tidalLerp(TIDAL_MACRO, TIDAL_EXTREME, (valueM - 16) / 44)
	return TIDAL_EXTREME
}

/** Land color for cyclone sub-mode: white (no risk) → deep navy (high risk). */
export function cycloneLandColor(risk: number): [number, number, number] {
	const t = Math.max(0, Math.min(1, risk))
	return [1 - 0.9 * t, 1 - 0.8 * t, 1 - 0.35 * t]
}

const EARTHQUAKE_LAND_STOPS: RgbColor[] = [
	"#ffffff", // no risk — pure white
	"#ffedd5", // very light orange
	"#fdba74", // light orange
	"#f97316", // orange
].map(COLOR_INTERPOLATION.cssColorToRgb)

/** Land color for earthquake sub-mode: white → light yellow → amber → orange. */
export function earthquakeLandColor(score: number): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleBasisColorStops({
			stops: EARTHQUAKE_LAND_STOPS,
			t: Math.max(0, Math.min(1, score)),
		}),
	)
}

/** Land color for volcanic sub-mode: white → orange → deep red. */
export function volcanicLandColor(score: number): [number, number, number] {
	const t = Math.max(0, Math.min(1, score))
	return [1 - 0.3 * t, 1 - 0.9 * t, 1 - t]
}

export function hotspotColor(score: number): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleBasisColorStops({
			stops: HOTSPOT_BASIS_STOPS,
			t: Math.max(0, Math.min(1, score)),
		}),
	)
}

export function populationColor(
	normalizedDensity: number,
): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleColorStops({
			stops: COLOR_PALETTES.orangesStops,
			t: Math.pow(Math.max(0, Math.min(1, normalizedDensity)), 0.4),
		}),
	)
}

const populationDiffStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -1, r: 0.1, g: 0.24, b: 0.58 },
	{ v: -0.5, r: 0.33, g: 0.57, b: 0.87 },
	{ v: -0.1, r: 0.77, g: 0.89, b: 0.97 },
	{ v: 0, r: 0.98, g: 0.97, b: 0.95 },
	{ v: 0.1, r: 0.98, g: 0.86, b: 0.71 },
	{ v: 0.5, r: 0.9, g: 0.46, b: 0.25 },
	{ v: 1, r: 0.55, g: 0.08, b: 0.09 },
]

export function populationDifferenceColor(
	normalizedDiff: number,
): [number, number, number] {
	const clamped = Math.max(
		populationDiffStops[0].v,
		Math.min(
			populationDiffStops[populationDiffStops.length - 1].v,
			normalizedDiff,
		),
	)
	for (let i = 0; i < populationDiffStops.length - 1; i++) {
		const a = populationDiffStops[i]
		const b = populationDiffStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = populationDiffStops[populationDiffStops.length - 1]
	return [last.r, last.g, last.b]
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

export function developmentColor(t: number): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleColorStops({
			stops: COLOR_PALETTES.bupuStops,
			t: Math.pow(Math.max(0, Math.min(1, t)), 0.9),
		}),
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

export function dtrDifferenceColor(
	celsiusDiff: number,
): [number, number, number] {
	return temperatureDifferenceColor(celsiusDiff)
}

// Relative-humidity ramp (0–100%): ochre → muted brown-gray-purple → dark blue-purple → saturated blue → violet-blue → cyan.
const humidityStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: 10, r: 0.902, g: 0.647, b: 0.118 }, // #E6A51E ochre
	{ v: 35, r: 0.384, g: 0.337, b: 0.373 }, // #62565F muted brown-gray-purple
	{ v: 60, r: 0.157, g: 0.173, b: 0.361 }, // #282C5C dark blue-purple
	{ v: 80, r: 0.153, g: 0.118, b: 0.812 }, // #271ECF saturated blue
	{ v: 88, r: 0.294, g: 0.251, b: 0.922 }, // #4B40EB violet-blue
	{ v: 95, r: 0.098, g: 1.0, b: 1.0 }, // #19FFFF cyan
]

export function humidityColor(rhPercent: number): [number, number, number] {
	const clamped = Math.max(
		humidityStops[0].v,
		Math.min(humidityStops[humidityStops.length - 1].v, rhPercent),
	)
	for (let i = 0; i < humidityStops.length - 1; i++) {
		const a = humidityStops[i]
		const b = humidityStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = humidityStops[humidityStops.length - 1]
	return [last.r, last.g, last.b]
}

const humidityDiffStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -40, r: 0.62, g: 0.36, b: 0.08 },
	{ v: -20, r: 0.89, g: 0.68, b: 0.22 },
	{ v: -5, r: 0.98, g: 0.91, b: 0.74 },
	{ v: 0, r: 0.98, g: 0.97, b: 0.95 },
	{ v: 5, r: 0.78, g: 0.9, b: 0.94 },
	{ v: 20, r: 0.28, g: 0.56, b: 0.84 },
	{ v: 40, r: 0.09, g: 0.23, b: 0.56 },
]

export function humidityDifferenceColor(
	diffPercent: number,
): [number, number, number] {
	const clamped = Math.max(
		humidityDiffStops[0].v,
		Math.min(humidityDiffStops[humidityDiffStops.length - 1].v, diffPercent),
	)
	for (let i = 0; i < humidityDiffStops.length - 1; i++) {
		const a = humidityDiffStops[i]
		const b = humidityDiffStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = humidityDiffStops[humidityDiffStops.length - 1]
	return [last.r, last.g, last.b]
}

// Misery Index (apparent temperature) ramp. Black zone (6–26 °C) = comfortable.
// Cold end → blues/whites; hot end → dark red → yellow → white.
const miseryStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -40, r: 1.0, g: 1.0, b: 1.0 },
	{ v: -35, r: 241 / 255, g: 245 / 255, b: 1.0 },
	{ v: -32, r: 137 / 255, g: 173 / 255, b: 1.0 },
	{ v: -30, r: 27 / 255, g: 96 / 255, b: 1.0 },
	{ v: -23, r: 18 / 255, g: 96 / 255, b: 1.0 },
	{ v: -18, r: 41 / 255, g: 125 / 255, b: 1.0 },
	{ v: -11, r: 46 / 255, g: 131 / 255, b: 1.0 },
	{ v: -4, r: 31 / 255, g: 89 / 255, b: 173 / 255 },
	{ v: 3, r: 9 / 255, g: 26 / 255, b: 50 / 255 },
	{ v: 6, r: 0, g: 0, b: 0 },
	{ v: 26, r: 0, g: 0, b: 0 },
	{ v: 30, r: 155 / 255, g: 13 / 255, b: 22 / 255 },
	{ v: 32, r: 247 / 255, g: 20 / 255, b: 35 / 255 },
	{ v: 37, r: 247 / 255, g: 39 / 255, b: 32 / 255 },
	{ v: 40, r: 246 / 255, g: 157 / 255, b: 13 / 255 },
	{ v: 43, r: 245 / 255, g: 210 / 255, b: 5 / 255 },
	{ v: 47, r: 245 / 255, g: 210 / 255, b: 5 / 255 },
	{ v: 51, r: 250 / 255, g: 230 / 255, b: 117 / 255 },
	{ v: 55, r: 1.0, g: 1.0, b: 1.0 },
	{ v: 60, r: 1.0, g: 1.0, b: 1.0 },
]

export function miseryColor(apparentTempC: number): [number, number, number] {
	const clamped = Math.max(
		miseryStops[0].v,
		Math.min(miseryStops[miseryStops.length - 1].v, apparentTempC),
	)
	for (let i = 0; i < miseryStops.length - 1; i++) {
		const a = miseryStops[i]
		const b = miseryStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = miseryStops[miseryStops.length - 1]
	return [last.r, last.g, last.b]
}

export function slopeColor(normalizedSlope: number): [number, number, number] {
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleBasisColorStops({
			stops: SLOPE_BASIS_STOPS,
			t: Math.pow(Math.max(0, Math.min(1, normalizedSlope)), 0.7),
		}),
	)
}

const windSpeedStops: RgbColor[] = [
	[0.72, 0.87, 0.96], // 0 m/s  — calm, pale blue
	[0.56, 0.84, 0.64], // 4 m/s  — light breeze, green
	[0.94, 0.91, 0.35], // 8 m/s  — moderate, yellow
	[0.97, 0.6, 0.14], // 14 m/s — fresh/strong, orange
	[0.85, 0.13, 0.13], // 20 m/s — storm, red
	[0.45, 0.04, 0.45], // 30+ m/s — violent, deep purple-red
]

export function windSpeedColor(speedMs: number): [number, number, number] {
	const t = Math.max(0, Math.min(1, speedMs / 30))
	return COLOR_INTERPOLATION.sampleColorStops({ stops: windSpeedStops, t })
}

export function getColor(
	km: number,
	mode: ColorMode,
	maxElevKm = 6,
): [number, number, number] {
	switch (mode) {
		case "landHeightmap":
			return grayscaleColor(km, maxElevKm)
		case "slope":
			return slopeColor(Math.max(0, Math.min(1, km)))
		default:
			return elevationToColor(km, maxElevKm)
	}
}
