import type { LabelMode } from "@/ui/genesis/controls/OverlayControls"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"

/**
 * MAP MODE HIERARCHY -- three tiers, each a distinct concept. Before adding a
 * new map mode, figure out which tier it actually belongs to; picking the
 * wrong one is the single most common mistake here (it was gotten wrong once
 * already, for the Organizations mode below -- see the git history around
 * that "organizations" NationMapMode value for the false starts).
 *
 * 1. PRIMARY (`MapModePrimary`, this file): "geography" vs. "society". The
 *    two big buttons at the very top of ModeBar. Adding a new one here is
 *    extremely rare -- almost nothing you're asked to add belongs at this
 *    tier.
 *
 * 2. MODE (`ColorMode` in shared/colors.ts, or `NationMapMode`/
 *    `PopulationMapMode` in this file): the actual map-mode buttons a user
 *    clicks in ModeBar's tray -- "Elevation", "Climate", "Nations",
 *    "Government", "Population", etc. Each one recolors the whole globe
 *    differently and is listed in one of this file's `*_MODE_OPTIONS`
 *    arrays (`DEFAULT_GEOGRAPHY_MODE_OPTIONS`, `DEFAULT_POLITICAL_MODE_
 *    OPTIONS`, `DEFAULT_DEMOGRAPHIC_MODE_OPTIONS`, ...) so it renders as a
 *    tray button. This is the tier for "an entirely new way to color the
 *    map that deserves its own button."
 *
 * 3. SUBMODE (e.g. `ClimateSubMode`/`TopographySubMode`/`VegetationSubMode`/
 *    `DangerSubMode` in controls/OverlayControls/types.ts, or
 *    `NationMapMode`'s own "organizations" value below): a variant of an
 *    *existing* mode, toggled from a `RadioGroup` inside a `*ModeSection.tsx`
 *    in controls/OverlayControls/ (e.g. ClimateModeSection, Topography
 *    ModeSection, NationsModeSection) -- NOT a ModeBar tray button. Two
 *    submode shapes exist, both already in use:
 *      - A genuine second ColorMode value under one tray button (Climate's
 *        "pasta"/"koppen" swap colorMode to "pastaClimate"/"koppenClimate"
 *        while the tray still shows one "Climate" button selected).
 *      - A second NationMapMode value that isn't listed in any
 *        `*_MODE_OPTIONS` array, so it never gets its own tray button, only
 *        reachable via its ModeSection's RadioGroup (Organizations: still a
 *        real `NationMapMode`, colored in region-colors.ts exactly like
 *        "borders"/"government", but selectable only from
 *        NationsModeSection's Normal/Organizations toggle -- see that
 *        component's doc comment).
 *    This is the tier for "a variant/overlay on an existing mode" -- if the
 *    ask is "add a toggle for X within Y", it's a submode of Y, not a new
 *    top-level mode button.
 *
 * Getting this right matters because `*_MODE_OPTIONS` arrays feed ModeBar's
 * tray directly -- adding a value there when it was meant to be a submode
 * clutters the tray with a button nobody asked for, and conversely a value
 * left out of every `*_MODE_OPTIONS` array (like "organizations" here) is
 * correctly invisible in the tray but must still be wired into whichever
 * `*ModeSection.tsx` is supposed to expose it, or it's unreachable entirely.
 */

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
	| "diplomacy"
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
	["urban", "Urban"],
	["development", "Development"],
	["culture", "Culture"],
	["religion", "Religion"],
]

const DEBUG_DEMOGRAPHIC_MODE_OPTIONS: ReadonlyArray<
	readonly [SocietyMapMode, string]
> = [
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
> = [
	["provinces", "Provinces"],
	["diplomacy", "Diplomacy"],
]

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
