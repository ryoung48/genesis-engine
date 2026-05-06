import type { ColorMode } from "../../colors"

export type PopulationMapMode =
	| "density"
	| "development"
	| "culture"
	| "heritage"
	| "faith"
	| "religion"

export type NationMapMode = "borders" | "provinces" | "dynasty" | "diplomacy"

export type MapModePrimary = "geography" | "political" | "demographics"

export const DEFAULT_GEOGRAPHY_MODE: ColorMode = "terrain"

export const PRIMARY_MAP_MODE_OPTIONS: ReadonlyArray<
	readonly [MapModePrimary, string]
> = [
	["geography", "Geography"],
	["political", "Political"],
	["demographics", "Demographics"],
]

const DEFAULT_GEOGRAPHY_MODE_OPTIONS: ReadonlyArray<
	readonly [ColorMode, string]
> = [
	["terrain", "Elevation"],
	["topography", "Topography"],
	["vegetation", "Vegetation"],
	["climate", "Climate"],
	["pastaClimate", "Pasta"],
	["temperature", "Temperature"],
	["precipitation", "Rain"],
]

const DEBUG_GEOGRAPHY_MODE_OPTIONS: ReadonlyArray<
	readonly [ColorMode, string]
> = [
	["slope", "Slope"],
	["landHeightmap", "Grayscale"],
	["terrainFeatures", "Features"],
	["basins", "Basins"],
	["dangerZones", "Danger"],
	["hotspots", "Hotspots"],
	["moisture", "Moist"],
	["koppenClimate", "Koppen"],
	["temperatureDelta", "Temp Δ"],
	["oceanCurrents", "Current"],
	["dtr", "DTR"],
]

const DEFAULT_DEMOGRAPHIC_MODE_OPTIONS: ReadonlyArray<
	readonly [PopulationMapMode, string]
> = [
	["density", "Population"],
	["development", "Development"],
	["culture", "Culture"],
	["heritage", "Heritage"],
	["faith", "Faith"],
	["religion", "Religion"],
]

const DEBUG_DEMOGRAPHIC_MODE_OPTIONS: ReadonlyArray<
	readonly [PopulationMapMode, string]
> = []

export const POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [
	["borders", "Nations"],
	["provinces", "Provinces"],
	["dynasty", "Dynasty"],
	["diplomacy", "Diplomacy"],
]

export function getMapModePrimary(colorMode: ColorMode): MapModePrimary {
	return colorMode === "nations"
		? "political"
		: colorMode === "population"
			? "demographics"
			: "geography"
}

export function isDebugGeographyMode(colorMode: ColorMode): boolean {
	return DEBUG_GEOGRAPHY_MODE_OPTIONS.some(([mode]) => mode === colorMode)
}

export function normalizeGeographyColorMode({
	colorMode,
	hasHazards,
	hasVolcanism,
}: {
	colorMode: ColorMode
	hasHazards: boolean
	hasVolcanism: boolean
}): ColorMode {
	if (!hasHazards && colorMode === "dangerZones") return "terrain"
	if (!hasVolcanism && colorMode === "hotspots") return "terrain"
	return colorMode
}

export function getVisibleGeographyModeOptions(
	debugEnabled: boolean,
): ReadonlyArray<readonly [ColorMode, string]> {
	return debugEnabled
		? [...DEFAULT_GEOGRAPHY_MODE_OPTIONS, ...DEBUG_GEOGRAPHY_MODE_OPTIONS]
		: [...DEFAULT_GEOGRAPHY_MODE_OPTIONS]
}

export function getVisibleDemographicModeOptions(
	debugEnabled: boolean,
): ReadonlyArray<readonly [PopulationMapMode, string]> {
	return debugEnabled
		? [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS, ...DEBUG_DEMOGRAPHIC_MODE_OPTIONS]
		: [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS]
}
