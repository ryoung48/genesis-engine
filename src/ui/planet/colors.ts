import { PASTA_LABELS } from "@/model/climate/pasta"
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
	quantizeRgb,
	type RgbColor,
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

/** Light blue used for ocean on thematic maps (non-terrain modes). */
export const OCEAN_LIGHT_BLUE: [number, number, number] = [0.75, 0.88, 0.96]

/**
 * EU5 (Project Caesar) location category labels, in the fixed alphabetical
 * order produced by scripts/build-eu5-categorical.py (`sorted()` over each
 * field's distinct values from locations.gpkg). The per-region category
 * codes stored on GenesisWorld.eu5Topography/eu5Vegetation/eu5Climate are
 * indices into these arrays; keep them in sync with the .json `categories`
 * field the build script writes to public/heightmap/eu5-*.json.
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

function hex(rgb: number): [number, number, number] {
	return [
		((rgb >> 16) & 0xff) / 255,
		((rgb >> 8) & 0xff) / 255,
		(rgb & 0xff) / 255,
	]
}

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
 * Grayscale terrain: ocean = black, land on 0 -> maxElev km scale.
 * Accepts elevation in km.
 */
function grayscaleColor(km: number, maxElevKm = 6): [number, number, number] {
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

const observedDiffStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -15, r: 0.08, g: 0.22, b: 0.62 },
	{ v: -8, r: 0.29, g: 0.53, b: 0.87 },
	{ v: -3, r: 0.72, g: 0.86, b: 0.97 },
	{ v: 0, r: 0.98, g: 0.97, b: 0.95 },
	{ v: 3, r: 0.99, g: 0.8, b: 0.61 },
	{ v: 8, r: 0.9, g: 0.38, b: 0.22 },
	{ v: 15, r: 0.57, g: 0.06, b: 0.08 },
]

export function temperatureDifferenceColor(
	celsiusDiff: number,
): [number, number, number] {
	const clamped = Math.max(
		observedDiffStops[0].v,
		Math.min(observedDiffStops[observedDiffStops.length - 1].v, celsiusDiff),
	)
	for (let i = 0; i < observedDiffStops.length - 1; i++) {
		const a = observedDiffStops[i]
		const b = observedDiffStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = observedDiffStops[observedDiffStops.length - 1]
	return [last.r, last.g, last.b]
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

function precipitationMonthlyColor(mm: number): [number, number, number] {
	return interpolatePrecipitationStops(mm, monthlyPrecipStops)
}

export function precipitationAnnualColor(mm: number): [number, number, number] {
	return interpolatePrecipitationStops(mm, annualPrecipStops)
}

export function precipitationColor(mm: number): [number, number, number] {
	return precipitationMonthlyColor(mm)
}

const precipDiffStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -200, r: 0.35, g: 0.16, b: 0.06 },
	{ v: -100, r: 0.79, g: 0.46, b: 0.18 },
	{ v: -25, r: 0.96, g: 0.86, b: 0.62 },
	{ v: 0, r: 0.98, g: 0.97, b: 0.95 },
	{ v: 25, r: 0.76, g: 0.9, b: 0.78 },
	{ v: 100, r: 0.23, g: 0.63, b: 0.69 },
	{ v: 200, r: 0.08, g: 0.28, b: 0.48 },
]

export function precipitationDifferenceColor(
	diffMm: number,
): [number, number, number] {
	const clamped = Math.max(
		precipDiffStops[0].v,
		Math.min(precipDiffStops[precipDiffStops.length - 1].v, diffMm),
	)
	for (let i = 0; i < precipDiffStops.length - 1; i++) {
		const a = precipDiffStops[i]
		const b = precipDiffStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = precipDiffStops[precipDiffStops.length - 1]
	return [last.r, last.g, last.b]
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

const biomeBaseColors: [number, number, number][] = [
	VEGETATION_WATER_BLUE,
	[0xcc / 255, 0xc4 / 255, 0xbc / 255],
	[0xa0 / 255, 0xa6 / 255, 0x96 / 255],
	[0x8e / 255, 0x9a / 255, 0x82 / 255],
	[0x78 / 255, 0x80 / 255, 0x6a / 255],
	[0x52 / 255, 0x5c / 255, 0x4a / 255],
	[0x34 / 255, 0x44 / 255, 0x32 / 255],
]

export function vegetationColor(biomeCode: number): [number, number, number] {
	return biomeBaseColors[biomeCode] ?? biomeBaseColors[0]
}

const biomeMapColors: [number, number, number][] = [
	VEGETATION_WATER_BLUE,
	[1, 1, 1],
	[0xee / 255, 0xe3 / 255, 0xd2 / 255],
	[0xf0 / 255, 0xed / 255, 0xe2 / 255],
	[0xc0 / 255, 0xe8 / 255, 0xd4 / 255],
	[0x94 / 255, 0xda / 255, 0xc4 / 255],
	[0x94 / 255, 0xda / 255, 0xc4 / 255],
]

const ARCTIC_CLIMATE_ZONE = 1
const SUBARCTIC_CLIMATE_ZONE = 2
const COLD_OPEN_LAND_COLOR: [number, number, number] = [
	0xca / 255,
	0xcd / 255,
	0xca / 255,
]

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

const PASTA_SATELLITE_TRUE_COLOR: Partial<
	Record<(typeof PASTA_LABELS)[number], [number, number, number]>
> = {
	Ofi: [240, 240, 240],
	Ofd: [10, 10, 51],
	Ofg: [10, 10, 51],
	Og: [10, 10, 51],
	Oc: [10, 10, 51],
	Ot: [10, 10, 51],
	Oh: [10, 10, 51],
	Or: [10, 10, 51],
	Oe: [10, 10, 51],
	TUr: [41, 63, 13],
	TUrp: [42, 65, 16],
	TUf: [55, 74, 20],
	TUfp: [59, 80, 24],
	TUs: [75, 85, 33],
	TUsp: [89, 102, 47],
	TUA: [107, 105, 53],
	TUAp: [124, 116, 63],
	TQf: [59, 78, 23],
	TQfp: [54, 73, 24],
	TQs: [75, 80, 35],
	TQsp: [67, 76, 30],
	TQA: [107, 105, 53],
	TQAp: [124, 116, 63],
	TF: [78, 84, 66],
	TG: [98, 91, 59],
	CTf: [59, 78, 23],
	CTfp: [54, 73, 24],
	CTs: [75, 80, 35],
	CTsp: [67, 76, 30],
	CDa: [60, 78, 23],
	CDap: [36, 54, 15],
	CDb: [55, 75, 21],
	CDbp: [38, 62, 11],
	CEa: [60, 63, 29],
	CEap: [38, 52, 18],
	CEb: [49, 61, 18],
	CEbp: [52, 64, 25],
	CEc: [62, 71, 24],
	CEcp: [64, 74, 27],
	CMa: [60, 73, 26],
	CMb: [51, 63, 22],
	CAMa: [103, 97, 54],
	CAMb: [118, 108, 68],
	CAa: [105, 98, 58],
	CAap: [58, 68, 25],
	CAb: [102, 100, 55],
	CAbp: [94, 87, 55],
	CFa: [78, 84, 66],
	CFb: [93, 88, 54],
	CG: [98, 91, 59],
	CI: [240, 240, 240],
	HTf: [55, 74, 20],
	HTfp: [59, 80, 24],
	HTs: [75, 85, 33],
	HTsp: [89, 102, 47],
	HDa: [60, 78, 23],
	HDap: [36, 54, 15],
	HDb: [55, 75, 21],
	HDbp: [38, 62, 11],
	HDc: [62, 71, 24],
	HDcp: [64, 74, 27],
	HMa: [60, 73, 26],
	HMb: [51, 63, 22],
	HMc: [51, 63, 22],
	HAMa: [103, 97, 54],
	HAMb: [118, 108, 68],
	HAMc: [118, 108, 68],
	HAa: [107, 105, 53],
	HAap: [124, 116, 63],
	HAb: [107, 105, 53],
	HAbp: [124, 116, 63],
	HAc: [107, 105, 53],
	HAcp: [124, 116, 63],
	HFa: [78, 84, 66],
	HFb: [93, 88, 54],
	HFc: [93, 88, 54],
	HG: [98, 91, 59],
	ETf: [59, 78, 23],
	ETfp: [54, 73, 24],
	ETs: [75, 80, 35],
	ETsp: [67, 76, 30],
	EDa: [60, 78, 23],
	EDap: [36, 54, 15],
	EDb: [55, 75, 21],
	EDbp: [38, 62, 11],
	EMa: [60, 73, 26],
	EMb: [51, 63, 22],
	EAMa: [103, 97, 54],
	EAMb: [118, 108, 68],
	EAa: [105, 98, 58],
	EAap: [58, 68, 25],
	EAb: [102, 100, 55],
	EAbp: [94, 87, 55],
	EFa: [78, 84, 66],
	EFb: [93, 88, 54],
	EG: [98, 91, 59],
	Ada: [167, 137, 95],
	Aha: [238, 210, 156],
	Adc: [177, 153, 110],
	Ahc: [208, 181, 141],
	Adh: [167, 137, 95],
	Ahh: [238, 210, 156],
	Ade: [177, 153, 110],
	Ahe: [208, 181, 141],
}

const DEFAULT_PASTA_SATELLITE_OCEAN: [number, number, number] = [
	VEGETATION_WATER_BLUE[0],
	VEGETATION_WATER_BLUE[1],
	VEGETATION_WATER_BLUE[2],
]

export function vegetationSatelliteColor(
	pastaClimateCode: number,
): [number, number, number] {
	const label = PASTA_LABELS[pastaClimateCode] ?? "ocean"
	const rgb = PASTA_SATELLITE_TRUE_COLOR[label]
	if (!rgb) return DEFAULT_PASTA_SATELLITE_OCEAN
	return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
}

/**
 * Diverging warm/cold ocean current color ramp.
 * -1 (cold, deep blue) → 0 (white, weak/neutral) → +1 (warm, deep red).
 */
const oceanCurrentStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -1.0, r: 0.1, g: 0.2, b: 0.7 },
	{ v: -0.5, r: 0.3, g: 0.55, b: 0.9 },
	{ v: -0.1, r: 0.8, g: 0.9, b: 1.0 },
	{ v: 0.0, r: 1.0, g: 1.0, b: 1.0 },
	{ v: 0.1, r: 1.0, g: 0.85, b: 0.75 },
	{ v: 0.5, r: 0.95, g: 0.35, b: 0.2 },
	{ v: 1.0, r: 0.6, g: 0.08, b: 0.05 },
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
const SLOPE_BASIS_STOPS: RgbColor[] = [
	"#f8fafc",
	"#d9f99d",
	"#facc15",
	"#f97316",
	"#7f1d1d",
].map(cssColorToRgb)
const TORNADO_LAND_STOPS: RgbColor[] = [
	"#ffffff", // no risk — pure white
	"#d9f99d", // lime-200
	"#84cc16", // lime-500
	"#3f6212", // lime-900 — ominous dark green
].map(cssColorToRgb)

/** Land color for tornado sub-mode: white → lime → dark forest green. */
export function tornadoLandColor(risk: number): [number, number, number] {
	return quantizeRgb(
		sampleBasisColorStops(TORNADO_LAND_STOPS, Math.max(0, Math.min(1, risk))),
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
].map(cssColorToRgb)

/** Land color for earthquake sub-mode: white → light yellow → amber → orange. */
export function earthquakeLandColor(score: number): [number, number, number] {
	return quantizeRgb(
		sampleBasisColorStops(
			EARTHQUAKE_LAND_STOPS,
			Math.max(0, Math.min(1, score)),
		),
	)
}

/** Land color for volcanic sub-mode: white → orange → deep red. */
export function volcanicLandColor(score: number): [number, number, number] {
	const t = Math.max(0, Math.min(1, score))
	return [1 - 0.3 * t, 1 - 0.9 * t, 1 - t]
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
	return quantizeRgb(
		sampleBasisColorStops(
			SLOPE_BASIS_STOPS,
			Math.pow(Math.max(0, Math.min(1, normalizedSlope)), 0.7),
		),
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
	return sampleColorStops(windSpeedStops, t)
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
