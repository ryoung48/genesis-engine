import type { ColorMode } from "../../colors"

export type PopulationMapMode =
	| "density"
	| "development"
	| "culture"
	| "heritage"
	| "religion"
	| "migration"

export type NationMapMode =
	| "borders"
	| "provinces"
	| "earthProvinces"
	| "dynasty"
	| "diplomacy"
	| "government"

export type SocietyMapMode = NationMapMode | PopulationMapMode | "timezone"

export type MapModePrimary = "geography" | "society"

export const DEFAULT_GEOGRAPHY_MODE: ColorMode = "terrain"

export const PRIMARY_MAP_MODE_OPTIONS: ReadonlyArray<
	readonly [MapModePrimary, string]
> = [
	["geography", "Geography"],
	["society", "Society"],
]

const DEFAULT_GEOGRAPHY_MODE_OPTIONS: ReadonlyArray<
	readonly [ColorMode, string]
> = [
	["terrain", "Elevation"],
	["topography", "Topography"],
	["vegetation", "Vegetation"],
	["climate", "Climate"],
	["temperature", "Temperature"],
	["realTemperature", "Observed Temp"],
	["temperatureDiff", "EBM - Real"],
	["realDtr", "Observed DTR"],
	["dtrDiff", "DTR Diff"],
	["precipitation", "Rain"],
	["realPrecipitation", "Observed Rain"],
	["precipitationDiff", "Rain Diff"],
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
	["religion", "Religion"],
]

const DEBUG_DEMOGRAPHIC_MODE_OPTIONS: ReadonlyArray<
	readonly [PopulationMapMode, string]
> = [
	["heritage", "Heritage"],
	["migration", "Migration"],
]

const DEFAULT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [
	["borders", "Nations"],
	["government", "Government"],
]

const DEBUG_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [
	["dynasty", "Dynasty"],
	["diplomacy", "Diplomacy"],
	["provinces", "Provinces"],
]

// Only meaningful for a real-Earth import (see world.isEarthImport) — the
// province boundaries/names come from imported real-world data, not the
// procedural BFS partition every other world uses.
const EARTH_IMPORT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [["earthProvinces", "Provinces (Real)"]]

export function getMapModePrimary(colorMode: ColorMode): MapModePrimary {
	return colorMode === "nations" ||
		colorMode === "timezone" ||
		colorMode === "population"
		? "society"
		: "geography"
}

export function isDebugGeographyMode(colorMode: ColorMode): boolean {
	return DEBUG_GEOGRAPHY_MODE_OPTIONS.some(([mode]) => mode === colorMode)
}

const EARTH_IMPORT_ONLY_MODES: ReadonlySet<ColorMode> = new Set<ColorMode>([
	"realTemperature",
	"temperatureDiff",
	"realDtr",
	"dtrDiff",
	"realPrecipitation",
	"precipitationDiff",
	"realPastaClimate",
	"realKoppenClimate",
	"eu5Topography",
	"eu5Vegetation",
	"eu5Climate",
	"earthProvinces",
])

export function normalizeGeographyColorMode({
	colorMode,
	hasHazards,
	hasVolcanism,
	isEarthImport = true,
}: {
	colorMode: ColorMode
	hasHazards: boolean
	hasVolcanism: boolean
	isEarthImport?: boolean
}): ColorMode {
	if (!hasHazards && colorMode === "dangerZones") return "terrain"
	if (!hasVolcanism && colorMode === "hotspots") return "terrain"
	if (!isEarthImport && EARTH_IMPORT_ONLY_MODES.has(colorMode)) return "terrain"
	return colorMode
}

export function getVisibleGeographyModeOptions(
	debugEnabled: boolean,
): ReadonlyArray<readonly [ColorMode, string]> {
	return debugEnabled
		? [...DEFAULT_GEOGRAPHY_MODE_OPTIONS, ...DEBUG_GEOGRAPHY_MODE_OPTIONS]
		: [...DEFAULT_GEOGRAPHY_MODE_OPTIONS]
}

export function getVisibleSocietyModeOptions(
	debugEnabled: boolean,
	isEarthImport = false,
): ReadonlyArray<readonly [SocietyMapMode, string]> {
	const politicalOptions = debugEnabled
		? [...DEFAULT_POLITICAL_MODE_OPTIONS, ...DEBUG_POLITICAL_MODE_OPTIONS]
		: [...DEFAULT_POLITICAL_MODE_OPTIONS]
	if (isEarthImport)
		politicalOptions.push(...EARTH_IMPORT_POLITICAL_MODE_OPTIONS)
	const demographicOptions = debugEnabled
		? [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS, ...DEBUG_DEMOGRAPHIC_MODE_OPTIONS]
		: [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS]
	const trailingSocietyModes = new Set<PopulationMapMode>([
		"density",
		"development",
	])
	const leadingDemographicOptions = demographicOptions.filter(
		([mode]) => !trailingSocietyModes.has(mode),
	)
	const trailingDemographicOptions = demographicOptions.filter(([mode]) =>
		trailingSocietyModes.has(mode),
	)
	return [
		...politicalOptions,
		...leadingDemographicOptions,
		...trailingDemographicOptions,
		["timezone", "Timezones"],
	]
}
