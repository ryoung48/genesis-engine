import type { ColorMode } from "../../colors"

export type PopulationMapMode =
	| "density"
	| "development"
	| "culture"
	| "heritage"
	| "faith"
	| "religion"
	| "migration"

export type NationMapMode =
	| "borders"
	| "provinces"
	| "dynasty"
	| "diplomacy"
	| "government"

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
	["temperature", "Temperature"],
	["precipitation", "Rain"],
	["dangerZones", "Danger"],
	["trade_goods", "Trade Goods"],
]

const DEBUG_GEOGRAPHY_MODE_OPTIONS: ReadonlyArray<
	readonly [ColorMode, string]
> = [
	["terrainFeatures", "Features"],
	["basins", "Basins"],
	["hotspots", "Hotspots"],
	["moisture", "Moist"],
	["temperatureDelta", "Temp Δ"],
	["oceanCurrents", "Current"],
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
> = [["migration", "Migration"]]

const DEFAULT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [
	["borders", "Nations"],
	["dynasty", "Dynasty"],
	["diplomacy", "Diplomacy"],
	["government", "Government"],
]

const DEBUG_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [["provinces", "Provinces"]]

export function getMapModePrimary(colorMode: ColorMode): MapModePrimary {
	return colorMode === "nations" || colorMode === "timezone"
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

export function getVisiblePoliticalModeOptions(
	debugEnabled: boolean,
): ReadonlyArray<readonly [NationMapMode, string]> {
	return debugEnabled
		? [...DEFAULT_POLITICAL_MODE_OPTIONS, ...DEBUG_POLITICAL_MODE_OPTIONS]
		: [...DEFAULT_POLITICAL_MODE_OPTIONS]
}
