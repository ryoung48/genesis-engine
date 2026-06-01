import type { ColorMode } from "../../colors"
import type { DangerSubMode, LabelMode, MeasureMode } from "../../controls/OverlayControls"
import type { OrogenViewMode } from "../../renderer"
import type { NationMapMode, PopulationMapMode } from "../shared/map-modes"
import { DEFAULT_GEOGRAPHY_MODE } from "../shared/map-modes"
import type { UnitSystem } from "../shared/ui-format"

interface StoredViewPrefs {
	colorMode: ColorMode
	geographyMode: ColorMode
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	viewMode: OrogenViewMode
	showWireframe: boolean
	showGrid: boolean
	showNationBorders: boolean
	showNationHierarchy: boolean
	labelMode: LabelMode
	showElevation: boolean
	showThermalEquator: boolean
	showWindArrows: boolean
	showRivers: boolean
	showSettlements: boolean
	showRoads: boolean
	overlaysExpanded: boolean
	gridSpacing: number
	unitSystem: UnitSystem
	mapProjectionLatitude: number
	debugMapModes: boolean
	measureMode: MeasureMode
	pathfindingLand: boolean
	pathfindingSea: boolean
	climateTimeMode: "current" | "annual" | "monthly"
	climateMonth: number
	climateSubMode: "basic" | "pasta" | "koppen"
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: "classification" | "slope"
	dangerSubMode: DangerSubMode
}

const COLOR_MODES = new Set<ColorMode>([
	"terrain",
	"landHeightmap",
	"slope",
	"topography",
	"temperature",
	"temperatureDelta",
	"precipitation",
	"moisture",
	"vegetation",
	"climate",
	"pastaClimate",
	"koppenClimate",
	"oceanCurrents",
	"dangerZones",
	"hotspots",
	"nations",
	"population",
	"provinces",
	"basins",
	"terrainFeatures",
	"dtr",
	"humidity",
	"trade_goods",
	"timezone",
	"wind",
])

const NATION_MAP_MODES = new Set<NationMapMode>([
	"borders",
	"provinces",
	"dynasty",
	"diplomacy",
	"government",
])

const POPULATION_MAP_MODES = new Set<PopulationMapMode>([
	"density",
	"development",
	"culture",
	"heritage",
	"faith",
	"religion",
	"migration",
])

const VIEW_MODES = new Set<OrogenViewMode>(["globe", "map"])
const UNIT_SYSTEMS = new Set<UnitSystem>(["metric", "imperial"])
const MEASURE_MODES = new Set<MeasureMode>(["off", "ruler", "pathfinding"])
export const DEFAULT_VIEW_PREFS: StoredViewPrefs = {
	colorMode: DEFAULT_GEOGRAPHY_MODE,
	geographyMode: DEFAULT_GEOGRAPHY_MODE,
	nationMode: "borders",
	populationMode: "density",
	viewMode: "globe",
	showWireframe: false,
	showGrid: true,
	showNationBorders: false,
	showNationHierarchy: false,
	labelMode: { nations: false, dynasty: false, settlements: false },
	showElevation: true,
	showThermalEquator: false,
	showWindArrows: false,
	showRivers: false,
	showSettlements: false,
	showRoads: false,
	overlaysExpanded: false,
	gridSpacing: 15,
	unitSystem: "metric",
	mapProjectionLatitude: 0,
	debugMapModes: false,
	measureMode: "off",
	pathfindingLand: true,
	pathfindingSea: true,
	climateTimeMode: "current",
	climateMonth: 0,
	climateSubMode: "basic",
	elevationSubMode: "colored",
	topographySubMode: "classification",
	dangerSubMode: "earthquake",
}

function isColorMode(value: unknown): value is ColorMode {
	return typeof value === "string" && COLOR_MODES.has(value as ColorMode)
}

function isNationMapMode(value: unknown): value is NationMapMode {
	return (
		typeof value === "string" && NATION_MAP_MODES.has(value as NationMapMode)
	)
}

function isPopulationMapMode(value: unknown): value is PopulationMapMode {
	return (
		typeof value === "string" &&
		POPULATION_MAP_MODES.has(value as PopulationMapMode)
	)
}

function isViewMode(value: unknown): value is OrogenViewMode {
	return typeof value === "string" && VIEW_MODES.has(value as OrogenViewMode)
}

function isUnitSystem(value: unknown): value is UnitSystem {
	return typeof value === "string" && UNIT_SYSTEMS.has(value as UnitSystem)
}

function isMeasureMode(value: unknown): value is MeasureMode {
	return typeof value === "string" && MEASURE_MODES.has(value as MeasureMode)
}

function isLabelMode(value: unknown): value is LabelMode {
	return (
		typeof value === "object" &&
		value !== null &&
		"nations" in value &&
		"dynasty" in value &&
		"settlements" in value &&
		typeof (value as LabelMode).nations === "boolean" &&
		typeof (value as LabelMode).dynasty === "boolean" &&
		typeof (value as LabelMode).settlements === "boolean"
	)
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function parseStoredViewPrefs(
	stored: string | null,
): StoredViewPrefs | null {
	if (!stored) return null
	try {
		const parsed = JSON.parse(stored) as Record<string, unknown>
		return {
			colorMode: isColorMode(parsed.colorMode)
				? parsed.colorMode
				: DEFAULT_VIEW_PREFS.colorMode,
			geographyMode: isColorMode(parsed.geographyMode)
				? parsed.geographyMode
				: DEFAULT_VIEW_PREFS.geographyMode,
			nationMode: isNationMapMode(parsed.nationMode)
				? parsed.nationMode
				: DEFAULT_VIEW_PREFS.nationMode,
			populationMode: isPopulationMapMode(parsed.populationMode)
				? parsed.populationMode
				: DEFAULT_VIEW_PREFS.populationMode,
			viewMode: isViewMode(parsed.viewMode)
				? parsed.viewMode
				: DEFAULT_VIEW_PREFS.viewMode,
			showWireframe: readBoolean(
				parsed.showWireframe,
				DEFAULT_VIEW_PREFS.showWireframe,
			),
			showGrid: readBoolean(parsed.showGrid, DEFAULT_VIEW_PREFS.showGrid),
			showNationBorders: readBoolean(
				parsed.showNationBorders,
				DEFAULT_VIEW_PREFS.showNationBorders,
			),
			showNationHierarchy: readBoolean(
				parsed.showNationHierarchy,
				DEFAULT_VIEW_PREFS.showNationHierarchy,
			),
			labelMode: isLabelMode(parsed.labelMode)
				? parsed.labelMode
				: DEFAULT_VIEW_PREFS.labelMode,
			showElevation: readBoolean(
				parsed.showElevation,
				DEFAULT_VIEW_PREFS.showElevation,
			),
			showThermalEquator: readBoolean(
				parsed.showThermalEquator,
				DEFAULT_VIEW_PREFS.showThermalEquator,
			),
			showWindArrows: readBoolean(
				parsed.showWindArrows,
				DEFAULT_VIEW_PREFS.showWindArrows,
			),
			showRivers: readBoolean(parsed.showRivers, DEFAULT_VIEW_PREFS.showRivers),
			showSettlements: readBoolean(
				parsed.showSettlements,
				DEFAULT_VIEW_PREFS.showSettlements,
			),
			showRoads: readBoolean(parsed.showRoads, DEFAULT_VIEW_PREFS.showRoads),
			overlaysExpanded: readBoolean(
				parsed.overlaysExpanded,
				DEFAULT_VIEW_PREFS.overlaysExpanded,
			),
			gridSpacing: readNumber(
				parsed.gridSpacing,
				DEFAULT_VIEW_PREFS.gridSpacing,
			),
			unitSystem: isUnitSystem(parsed.unitSystem)
				? parsed.unitSystem
				: DEFAULT_VIEW_PREFS.unitSystem,
			mapProjectionLatitude: readNumber(
				parsed.mapProjectionLatitude,
				DEFAULT_VIEW_PREFS.mapProjectionLatitude,
			),
			debugMapModes: readBoolean(
				parsed.debugMapModes,
				DEFAULT_VIEW_PREFS.debugMapModes,
			),
			measureMode: isMeasureMode(parsed.measureMode)
				? parsed.measureMode
				: DEFAULT_VIEW_PREFS.measureMode,
			pathfindingLand: readBoolean(
				parsed.pathfindingLand,
				DEFAULT_VIEW_PREFS.pathfindingLand,
			),
			pathfindingSea: readBoolean(
				parsed.pathfindingSea,
				DEFAULT_VIEW_PREFS.pathfindingSea,
			),
			climateTimeMode:
				parsed.climateTimeMode === "current" ||
				parsed.climateTimeMode === "annual" ||
				parsed.climateTimeMode === "monthly"
					? parsed.climateTimeMode
					: DEFAULT_VIEW_PREFS.climateTimeMode,
			climateMonth: readNumber(
				parsed.climateMonth,
				DEFAULT_VIEW_PREFS.climateMonth,
			),
			climateSubMode:
				parsed.climateSubMode === "basic" ||
				parsed.climateSubMode === "pasta" ||
				parsed.climateSubMode === "koppen"
					? parsed.climateSubMode
					: DEFAULT_VIEW_PREFS.climateSubMode,
			elevationSubMode:
				parsed.elevationSubMode === "colored" ||
				parsed.elevationSubMode === "grayscale"
					? parsed.elevationSubMode
					: DEFAULT_VIEW_PREFS.elevationSubMode,
			topographySubMode:
				parsed.topographySubMode === "classification" ||
				parsed.topographySubMode === "slope"
					? parsed.topographySubMode
					: DEFAULT_VIEW_PREFS.topographySubMode,
			dangerSubMode:
				parsed.dangerSubMode === "earthquake" ||
				parsed.dangerSubMode === "volcanic" ||
				parsed.dangerSubMode === "cyclone" ||
				parsed.dangerSubMode === "tornado" ||
				parsed.dangerSubMode === "tidal"
					? parsed.dangerSubMode
					: DEFAULT_VIEW_PREFS.dangerSubMode,
		}
	} catch {
		return null
	}
}

export function serializeStoredViewPrefs(prefs: StoredViewPrefs): string {
	return JSON.stringify(prefs)
}
