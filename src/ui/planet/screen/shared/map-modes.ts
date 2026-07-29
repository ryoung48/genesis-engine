import type { ColorMode } from "@/ui/planet/colors"
import type { LabelMode } from "@/ui/planet/controls/OverlayControls"
import { getBaseMapMode } from "@/ui/planet/screen/shared/data-variant"

export type PopulationMapMode =
	| "density"
	| "urban"
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
	["humidity", "Humidity"],
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

const EARTH_IMPORT_DEMOGRAPHIC_MODE_OPTIONS: ReadonlyArray<
	readonly [PopulationMapMode, string]
> = [["urban", "Urban"]]

const DEFAULT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [
	["borders", "Nations"],
	["government", "Government"],
]

const DEBUG_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [["provinces", "Provinces"]]

// Earth-import-only, but not a debug mode: dynasty coloring was fed by the
// procedural history sim's leader timelines, which no longer exist, so on a
// procedural world it would render blank. Earth import sources dynasties from
// the earth-history engine instead.
const EARTH_IMPORT_DEFAULT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [["dynasty", "Dynasty"]]

// Only meaningful for a real-Earth import (see world.isEarthImport). Province
// boundaries/names come from imported real-world data rather than the
// procedural BFS partition; diplomacy was fed by the procedural sim's relation
// timelines, which are likewise gone.
const EARTH_IMPORT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [
	["earthProvinces", "Provinces (Real)"],
	["diplomacy", "Diplomacy"],
]

export function getMapModePrimary(colorMode: ColorMode): MapModePrimary {
	return colorMode === "nations" ||
		colorMode === "timezone" ||
		colorMode === "population" ||
		colorMode === "realPopulation" ||
		colorMode === "populationDiff"
		? "society"
		: "geography"
}

export function isDebugGeographyMode(colorMode: ColorMode): boolean {
	return DEBUG_GEOGRAPHY_MODE_OPTIONS.some(([mode]) => mode === colorMode)
}

export function isDebugNationMode(nationMode: NationMapMode): boolean {
	return (
		DEBUG_POLITICAL_MODE_OPTIONS.some(([mode]) => mode === nationMode) ||
		EARTH_IMPORT_POLITICAL_MODE_OPTIONS.some(([mode]) => mode === nationMode)
	)
}

const EARTH_IMPORT_ONLY_MODES: ReadonlySet<ColorMode> = new Set<ColorMode>([
	"realTemperature",
	"temperatureDiff",
	"realDtr",
	"dtrDiff",
	"realPrecipitation",
	"precipitationDiff",
	"realHumidity",
	"humidityDiff",
	"realPopulation",
	"populationDiff",
	"realPastaClimate",
	"realKoppenClimate",
	"eu5Topography",
	"eu5Vegetation",
	"eu5Climate",
	"earthProvinces",
])

const EARTH_IMPORT_ONLY_NATION_MODES: ReadonlySet<NationMapMode> =
	new Set<NationMapMode>([
		...EARTH_IMPORT_DEFAULT_POLITICAL_MODE_OPTIONS.map(([mode]) => mode),
		...EARTH_IMPORT_POLITICAL_MODE_OPTIONS.map(([mode]) => mode),
	])

/**
 * Falls back to "borders" when a persisted nation mode has no data source on
 * the current world — e.g. a saved "dynasty" pref carried into a procedural
 * world, whose leader and relation data went away with the history sim.
 */
export function normalizeNationMapMode(
	nationMode: NationMapMode,
	isEarthImport: boolean,
): NationMapMode {
	if (!isEarthImport && EARTH_IMPORT_ONLY_NATION_MODES.has(nationMode)) {
		return "borders"
	}
	return nationMode
}

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
	if (isEarthImport) {
		politicalOptions.push(...EARTH_IMPORT_DEFAULT_POLITICAL_MODE_OPTIONS)
	}
	if (debugEnabled && isEarthImport) {
		politicalOptions.push(...EARTH_IMPORT_POLITICAL_MODE_OPTIONS)
	}
	const demographicOptions = debugEnabled
		? [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS, ...DEBUG_DEMOGRAPHIC_MODE_OPTIONS]
		: [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS]
	if (isEarthImport) {
		demographicOptions.splice(1, 0, ...EARTH_IMPORT_DEMOGRAPHIC_MODE_OPTIONS)
	}
	const trailingSocietyModes = new Set<PopulationMapMode>([
		"density",
		"urban",
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

export function syncLabelModeToMapMode(params: {
	labelMode: LabelMode
	colorMode: ColorMode
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	isEarthImport: boolean
}): LabelMode {
	const { labelMode, colorMode, nationMode, populationMode, isEarthImport } =
		params
	const anyActive =
		labelMode.nations ||
		labelMode.dynasty ||
		labelMode.culture ||
		labelMode.heritage ||
		labelMode.religion
	if (!anyActive) return labelMode

	const politicalFallback = {
		...labelMode,
		nations: nationMode !== "dynasty",
		dynasty: nationMode === "dynasty",
		culture: false,
		heritage: false,
		religion: false,
	}

	if (getBaseMapMode(colorMode) === "population") {
		if (populationMode === "culture") {
			return {
				...labelMode,
				nations: false,
				dynasty: false,
				culture: true,
				heritage: false,
				religion: false,
			}
		}
		if (populationMode === "religion") {
			// Real per-province religion labels only exist for Earth imports
			// (see create-genesis-scene.ts's earthHistoryLabelPartitions);
			// the procedural generator has no religion label overlay at all
			// (world.religions is culture-indexed, not province-indexed), so
			// procedural worlds keep the previous heritage-label
			// approximation rather than showing nothing.
			return isEarthImport
				? {
						...labelMode,
						nations: false,
						dynasty: false,
						culture: false,
						heritage: false,
						religion: true,
					}
				: {
						...labelMode,
						nations: false,
						dynasty: false,
						culture: false,
						heritage: true,
						religion: false,
					}
		}
		if (populationMode === "heritage") {
			return {
				...labelMode,
				nations: false,
				dynasty: false,
				culture: false,
				heritage: true,
				religion: false,
			}
		}
		return politicalFallback
	}
	return politicalFallback
}
