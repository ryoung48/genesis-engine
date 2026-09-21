import type { LabelMode } from "@/ui/genesis/controls/OverlayControls"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"

export type SocietyMapMode =
	| "density"
	| "urban"
	| "development"
	| "culture"
	| "heritage"
	| "religion"
	| "migration"

export type ReligionMapMode = "religions" | "types"

export type TitlesNationMode =
	| "titlesBarony"
	| "titlesCounty"
	| "titlesDuchy"
	| "titlesKingdom"
	| "titlesEmpire"
	| "titlesHegemony"
	| "titlesRanks"

export type TitleBorderTier =
	| "barony"
	| "county"
	| "duchy"
	| "kingdom"
	| "empire"
	| "hegemony"

export const TITLE_BORDER_TIERS: readonly TitleBorderTier[] = [
	"barony",
	"county",
	"duchy",
	"kingdom",
	"empire",
	"hegemony",
]

export type NationMapMode =
	| "borders"
	| "provinces"
	| "earthProvinces"
	| "dynasty"
	| "government"
	/** Not in DEFAULT_POLITICAL_MODE_OPTIONS (no ModeBar tray button) --
	 * reachable only via NationsModeSection's Normal/Organizations toggle in
	 * OverlayControls, which appears while "borders" or this mode is active. */
	| "organizations"
	| TitlesNationMode

export type SocietyMapOption =
	| NationMapMode
	| SocietyMapMode
	| "timezone"
	| "titles"

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
	["cloudCover", "Clouds"],
	["realCloudCover", "Observed Clouds"],
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
	readonly [SocietyMapMode, string]
> = [
	["density", "Population"],
	["development", "Development"],
	["culture", "Culture"],
	["religion", "Religion"],
]

const DEBUG_DEMOGRAPHIC_MODE_OPTIONS: ReadonlyArray<
	readonly [SocietyMapMode, string]
> = [
	["urban", "Urban"],
	["heritage", "Heritage"],
	["migration", "Migration"],
]

const DEFAULT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [SocietyMapOption, string]
> = [
	["borders", "Nations"],
	["government", "Government"],
	["dynasty", "Dynasty"],
	["titles", "Titles"],
]

const DEBUG_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [["provinces", "Provinces"]]

// Only meaningful for a real-Earth import (see world.isEarthImport). Province
// boundaries/names come from imported real-world data rather than the
// procedural BFS partition.
const EARTH_IMPORT_POLITICAL_MODE_OPTIONS: ReadonlyArray<
	readonly [NationMapMode, string]
> = [["earthProvinces", "Provinces (Real)"]]

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

const TITLES_NATION_MODES: readonly TitlesNationMode[] = [
	"titlesBarony",
	"titlesCounty",
	"titlesDuchy",
	"titlesKingdom",
	"titlesEmpire",
	"titlesHegemony",
	"titlesRanks",
]

export const DEFAULT_TITLES_MODE: TitlesNationMode = "titlesDuchy"

export function isTitlesNationMode(
	nationMode: NationMapMode,
): nationMode is TitlesNationMode {
	return (TITLES_NATION_MODES as readonly string[]).includes(nationMode)
}

export function isDebugNationMode(nationMode: NationMapMode): boolean {
	return (
		DEBUG_POLITICAL_MODE_OPTIONS.some(([mode]) => mode === nationMode) ||
		EARTH_IMPORT_POLITICAL_MODE_OPTIONS.some(([mode]) => mode === nationMode)
	)
}

const EARTH_IMPORT_ONLY_NATION_MODES: ReadonlySet<NationMapMode> =
	new Set<NationMapMode>(
		EARTH_IMPORT_POLITICAL_MODE_OPTIONS.map(([mode]) => mode),
	)

/**
 * Falls back to "borders" when a persisted nation mode has no data source on
 * the current world — e.g. a saved "earthProvinces" pref carried into a
 * procedural world.
 */
export function normalizeNationMapMode(
	nationMode: NationMapMode,
	isEarthImport: boolean,
): NationMapMode {
	if (!isEarthImport && EARTH_IMPORT_ONLY_NATION_MODES.has(nationMode)) {
		return "borders"
	}
	if (isEarthImport && isTitlesNationMode(nationMode)) return "borders"
	return nationMode
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

export function getVisibleSocietyModeOptions(
	debugEnabled: boolean,
	isEarthImport = false,
): ReadonlyArray<readonly [SocietyMapOption, string]> {
	const politicalOptions = debugEnabled
		? [...DEFAULT_POLITICAL_MODE_OPTIONS, ...DEBUG_POLITICAL_MODE_OPTIONS]
		: [...DEFAULT_POLITICAL_MODE_OPTIONS]
	if (isEarthImport) {
		const titlesIndex = politicalOptions.findIndex(
			([mode]) => mode === "titles",
		)
		if (titlesIndex >= 0) politicalOptions.splice(titlesIndex, 1)
	}
	if (debugEnabled && isEarthImport) {
		politicalOptions.push(...EARTH_IMPORT_POLITICAL_MODE_OPTIONS)
	}
	const demographicOptions = debugEnabled
		? [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS, ...DEBUG_DEMOGRAPHIC_MODE_OPTIONS]
		: [...DEFAULT_DEMOGRAPHIC_MODE_OPTIONS]
	const trailingSocietyModes = new Set<SocietyMapMode>([
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
	societyMode: SocietyMapMode
}): LabelMode {
	const { labelMode, colorMode, nationMode, societyMode } = params
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
		if (societyMode === "culture") {
			return {
				...labelMode,
				nations: false,
				dynasty: false,
				culture: true,
				heritage: false,
				religion: false,
			}
		}
		if (societyMode === "religion") {
			return {
				...labelMode,
				nations: false,
				dynasty: false,
				culture: false,
				heritage: false,
				religion: true,
			}
		}
		if (societyMode === "heritage") {
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
