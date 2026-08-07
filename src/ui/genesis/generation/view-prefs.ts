import type {
	ClimateSubMode,
	DangerSubMode,
	LabelMode,
	MeasureMode,
	TopographySubMode,
	VegetationSubMode,
} from "@/ui/genesis/controls/OverlayControls"
import type { GenesisViewMode } from "@/ui/genesis/renderer"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/genesis/shared/map-modes"
import { DEFAULT_GEOGRAPHY_MODE } from "@/ui/genesis/shared/map-modes"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"

export interface StoredViewPrefs {
	colorMode: ColorMode
	geographyMode: ColorMode
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	viewMode: GenesisViewMode
	solarSystemViewActive: boolean
	showSolarSystemEllipticalOrbits: boolean
	showSolarSystemDaylight: boolean
	showSolarSystemInclination: boolean
	showSolarSystemAxialTilt: boolean
	showSolarSystemRealisticSizes: boolean
	showSolarSystemBodyNames: boolean
	showWireframe: boolean
	showGrid: boolean
	showNationBorders: boolean
	showNationHierarchy: boolean
	labelMode: LabelMode
	showElevation: boolean
	showThermalEquator: boolean
	showCoastlines: boolean
	showWindArrows: boolean
	showGdd: boolean
	showGint: boolean
	showPet: boolean
	showAet: boolean
	showOceanCurrents: boolean
	showRivers: boolean
	showInfrastructure: boolean
	overlaysExpanded: boolean
	gridSpacing: number
	unitSystem: UnitSystem
	mapProjectionLatitude: number
	debugMapModes: boolean
	measureMode: MeasureMode
	pathfindingLand: boolean
	pathfindingSea: boolean
	showDaylight: boolean
	clockCurrent: boolean
	clockDay: number
	clockHour: number
	clockUseMeridiem: boolean
	clockMonthMode: "annual" | "monthly"
	clockMonth: number
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
	dangerSubMode: DangerSubMode
}

const COLOR_MODES = new Set<ColorMode>([
	"terrain",
	"landHeightmap",
	"slope",
	"topography",
	"temperature",
	"realTemperature",
	"temperatureDiff",
	"realDtr",
	"dtrDiff",
	"temperatureDelta",
	"precipitation",
	"realPrecipitation",
	"precipitationDiff",
	"moisture",
	"vegetation",
	"vegetationMaps",
	"vegetationSatellite",
	"realVegetation",
	"realVegetationMaps",
	"realVegetationSatellite",
	"climate",
	"realClimate",
	"pastaClimate",
	"koppenClimate",
	"oceanCurrents",
	"dangerZones",
	"hotspots",
	"nations",
	"population",
	"realPopulation",
	"populationDiff",
	"provinces",
	"basins",
	"terrainFeatures",
	"dtr",
	"humidity",
	"realHumidity",
	"humidityDiff",
	"trade_goods",
	"timezone",
	"wind",
	"misery",
	"realMisery",
])

const NATION_MAP_MODES = new Set<NationMapMode>([
	"borders",
	"provinces",
	"earthProvinces",
	"dynasty",
	"diplomacy",
	"government",
])

const POPULATION_MAP_MODES = new Set<PopulationMapMode>([
	"density",
	"urban",
	"development",
	"culture",
	"heritage",
	"religion",
	"migration",
])

const VIEW_MODES = new Set<GenesisViewMode>(["globe", "map"])
const UNIT_SYSTEMS = new Set<UnitSystem>(["metric", "imperial"])
const MEASURE_MODES = new Set<MeasureMode>(["off", "ruler", "pathfinding"])
export const DEFAULT_VIEW_PREFS: StoredViewPrefs = {
	colorMode: DEFAULT_GEOGRAPHY_MODE,
	geographyMode: DEFAULT_GEOGRAPHY_MODE,
	nationMode: "borders",
	populationMode: "density",
	viewMode: "globe",
	solarSystemViewActive: false,
	showSolarSystemEllipticalOrbits: true,
	showSolarSystemDaylight: true,
	showSolarSystemInclination: true,
	showSolarSystemAxialTilt: true,
	showSolarSystemRealisticSizes: true,
	showSolarSystemBodyNames: true,
	showWireframe: false,
	showGrid: true,
	showNationBorders: false,
	showNationHierarchy: false,
	labelMode: {
		nations: false,
		dynasty: false,
		settlements: false,
		culture: false,
		heritage: false,
		religion: false,
		script: false,
	},
	showElevation: true,
	showThermalEquator: false,
	showCoastlines: false,
	showWindArrows: false,
	showGdd: false,
	showGint: false,
	showPet: false,
	showAet: false,
	showOceanCurrents: false,
	showRivers: false,
	showInfrastructure: false,
	overlaysExpanded: false,
	gridSpacing: 15,
	unitSystem: "metric",
	mapProjectionLatitude: 0,
	debugMapModes: false,
	measureMode: "off",
	pathfindingLand: true,
	pathfindingSea: true,
	showDaylight: false,
	clockCurrent: true,
	clockDay: 0,
	clockHour: 12,
	clockUseMeridiem: false,
	clockMonthMode: "monthly",
	clockMonth: 0,
	vegetationSubMode: "base",
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

function isViewMode(value: unknown): value is GenesisViewMode {
	return typeof value === "string" && VIEW_MODES.has(value as GenesisViewMode)
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

function parseLabelMode(value: unknown): LabelMode {
	const base = isLabelMode(value) ? value : DEFAULT_VIEW_PREFS.labelMode
	const v = value as Record<string, unknown> | null | undefined
	return {
		...base,
		culture: typeof v?.culture === "boolean" ? v.culture : false,
		heritage: typeof v?.heritage === "boolean" ? v.heritage : false,
		religion: typeof v?.religion === "boolean" ? v.religion : false,
		script: typeof v?.script === "boolean" ? v.script : false,
	}
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
			solarSystemViewActive: readBoolean(
				parsed.solarSystemViewActive,
				DEFAULT_VIEW_PREFS.solarSystemViewActive,
			),
			showSolarSystemEllipticalOrbits: readBoolean(
				parsed.showSolarSystemEllipticalOrbits,
				DEFAULT_VIEW_PREFS.showSolarSystemEllipticalOrbits,
			),
			showSolarSystemDaylight: readBoolean(
				parsed.showSolarSystemDaylight,
				DEFAULT_VIEW_PREFS.showSolarSystemDaylight,
			),
			showSolarSystemInclination: readBoolean(
				parsed.showSolarSystemInclination,
				DEFAULT_VIEW_PREFS.showSolarSystemInclination,
			),
			showSolarSystemAxialTilt: readBoolean(
				parsed.showSolarSystemAxialTilt,
				DEFAULT_VIEW_PREFS.showSolarSystemAxialTilt,
			),
			showSolarSystemRealisticSizes: readBoolean(
				parsed.showSolarSystemRealisticSizes,
				DEFAULT_VIEW_PREFS.showSolarSystemRealisticSizes,
			),
			showSolarSystemBodyNames: readBoolean(
				parsed.showSolarSystemBodyNames,
				DEFAULT_VIEW_PREFS.showSolarSystemBodyNames,
			),
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
			labelMode: parseLabelMode(parsed.labelMode),
			showElevation: readBoolean(
				parsed.showElevation,
				DEFAULT_VIEW_PREFS.showElevation,
			),
			showThermalEquator: readBoolean(
				parsed.showThermalEquator,
				DEFAULT_VIEW_PREFS.showThermalEquator,
			),
			showCoastlines: readBoolean(
				parsed.showCoastlines,
				DEFAULT_VIEW_PREFS.showCoastlines,
			),
			showWindArrows: readBoolean(
				parsed.showWindArrows,
				DEFAULT_VIEW_PREFS.showWindArrows,
			),
			showGdd: readBoolean(parsed.showGdd, DEFAULT_VIEW_PREFS.showGdd),
			showGint: readBoolean(parsed.showGint, DEFAULT_VIEW_PREFS.showGint),
			showPet: readBoolean(parsed.showPet, DEFAULT_VIEW_PREFS.showPet),
			showAet: readBoolean(parsed.showAet, DEFAULT_VIEW_PREFS.showAet),
			showOceanCurrents: readBoolean(
				parsed.showOceanCurrents,
				DEFAULT_VIEW_PREFS.showOceanCurrents,
			),
			showRivers: readBoolean(parsed.showRivers, DEFAULT_VIEW_PREFS.showRivers),
			showInfrastructure: readBoolean(
				parsed.showInfrastructure,
				DEFAULT_VIEW_PREFS.showInfrastructure,
			),
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
			showDaylight: readBoolean(
				parsed.showDaylight,
				DEFAULT_VIEW_PREFS.showDaylight,
			),
			clockCurrent: readBoolean(
				parsed.clockCurrent,
				DEFAULT_VIEW_PREFS.clockCurrent,
			),
			clockDay: readNumber(parsed.clockDay, DEFAULT_VIEW_PREFS.clockDay),
			clockHour: readNumber(parsed.clockHour, DEFAULT_VIEW_PREFS.clockHour),
			clockUseMeridiem: readBoolean(
				parsed.clockUseMeridiem,
				DEFAULT_VIEW_PREFS.clockUseMeridiem,
			),
			clockMonthMode:
				parsed.clockMonthMode === "annual" ||
				parsed.clockMonthMode === "monthly"
					? parsed.clockMonthMode
					: DEFAULT_VIEW_PREFS.clockMonthMode,
			clockMonth: readNumber(parsed.clockMonth, DEFAULT_VIEW_PREFS.clockMonth),
			vegetationSubMode:
				parsed.vegetationSubMode === "base" ||
				parsed.vegetationSubMode === "maps" ||
				parsed.vegetationSubMode === "satellite" ||
				parsed.vegetationSubMode === "eu5"
					? parsed.vegetationSubMode
					: DEFAULT_VIEW_PREFS.vegetationSubMode,
			climateSubMode:
				parsed.climateSubMode === "basic" ||
				parsed.climateSubMode === "pasta" ||
				parsed.climateSubMode === "koppen" ||
				parsed.climateSubMode === "eu5"
					? parsed.climateSubMode
					: DEFAULT_VIEW_PREFS.climateSubMode,
			elevationSubMode:
				parsed.elevationSubMode === "colored" ||
				parsed.elevationSubMode === "grayscale"
					? parsed.elevationSubMode
					: DEFAULT_VIEW_PREFS.elevationSubMode,
			topographySubMode:
				parsed.topographySubMode === "classification" ||
				parsed.topographySubMode === "slope" ||
				parsed.topographySubMode === "eu5"
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
