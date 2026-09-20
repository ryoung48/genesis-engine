import type { GenesisViewMode } from "@/ui/genesis/renderer"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { DataVariant } from "@/ui/genesis/shared/data-variant"
import type {
	NationMapMode,
	ReligionMapMode,
	SocietyMapMode,
	TitleBorderTier,
} from "@/ui/genesis/shared/map-modes"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"

export type MeasureMode = "off" | "ruler" | "pathfinding"
export type DangerSubMode =
	| "earthquake"
	| "volcanic"
	| "cyclone"
	| "tornado"
	| "tidal"
export type VegetationSubMode = "base" | "maps" | "satellite" | "eu5"
export type ClimateSubMode = "basic" | "pasta" | "koppen" | "eu5"
export type TopographySubMode = "classification" | "slope" | "eu5"
export type ExportWidthPreset = "4096" | "8192" | "16384" | "32768"
export interface LabelMode {
	nations: boolean
	dynasty: boolean
	settlements: boolean
	culture: boolean
	heritage: boolean
	/** Only meaningful for Earth-imported worlds -- there is no procedural
	 * religion label overlay (world.religions is culture-indexed, not
	 * province-indexed). See create-genesis-scene.ts's
	 * earthHistoryLabelPartitions. */
	religion: boolean
	script: boolean
}

export interface OverlayControlsProps {
	overlaysExpanded: boolean
	setOverlaysExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	measureMode: MeasureMode
	setMeasureMode: (v: MeasureMode) => void
	pathfindingLand: boolean
	setPathfindingLand: (v: boolean) => void
	pathfindingSea: boolean
	setPathfindingSea: (v: boolean) => void
	pathfindingResult: {
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
	} | null
	showWireframe: boolean
	setShowWireframe: (v: boolean) => void
	showRivers: boolean
	setShowRivers: (v: boolean) => void
	showThermalEquator: boolean
	setShowThermalEquator: (v: boolean) => void
	showClouds: boolean
	setShowClouds: (v: boolean) => void
	showCoastlines: boolean
	setShowCoastlines: (v: boolean) => void
	showWindArrows: boolean
	setShowWindArrows: (v: boolean) => void
	showGdd: boolean
	setShowGdd: (v: boolean) => void
	showGint: boolean
	setShowGint: (v: boolean) => void
	showPet: boolean
	setShowPet: (v: boolean) => void
	showAet: boolean
	setShowAet: (v: boolean) => void
	showOceanCurrents: boolean
	setShowOceanCurrents: (v: boolean) => void
	showGrid: boolean
	setShowGrid: (v: boolean) => void
	showNationBorders: boolean
	setShowNationBorders: (v: boolean) => void
	titleBorderTiers: readonly TitleBorderTier[]
	setTitleBorderTiers: (tiers: TitleBorderTier[]) => void
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	populationMode: SocietyMapMode
	religionMode: ReligionMapMode
	setReligionMode: (v: ReligionMapMode) => void
	labelMode: LabelMode
	setLabelMode: (v: LabelMode) => void
	showElevation: boolean
	setShowElevation: (v: boolean) => void
	showInfrastructure: boolean
	setShowInfrastructure: (v: boolean) => void
	gridSpacing: number
	setGridSpacing: (v: number) => void
	viewMode: GenesisViewMode
	setViewMode: (v: GenesisViewMode) => void
	unitSystem: UnitSystem
	setUnitSystem: (v: UnitSystem) => void
	mapProjectionLatitude: number
	draftMapProjectionLatitude: number
	setDraftMapProjectionLatitude: (v: number) => void
	setMapProjectionLatitude: (v: number) => void
	debugMapModes: boolean
	setDebugMapModes: (v: boolean) => void
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	dataVariant: DataVariant
	setDataVariant: (v: DataVariant) => void
	clockCurrent: boolean
	setClockCurrent: (v: boolean) => void
	clockMonthMode: "annual" | "monthly"
	setClockMonthMode: (v: "annual" | "monthly") => void
	clockMonth: number
	setClockMonth: (v: number) => void
	clockDay: number
	setClockDay: (v: number) => void
	clockHour?: number
	setClockHour?: (v: number) => void
	clockUseMeridiem?: boolean
	setClockUseMeridiem?: (v: boolean) => void
	hoursPerDay?: number
	tidallyLocked?: boolean
	daysPerYear: number
	vegetationSubMode: VegetationSubMode
	setVegetationSubMode: (v: VegetationSubMode) => void
	climateSubMode: ClimateSubMode
	setClimateSubMode: (v: ClimateSubMode) => void
	elevationSubMode: "colored" | "grayscale"
	setElevationSubMode: (v: "colored" | "grayscale") => void
	topographySubMode: TopographySubMode
	setTopographySubMode: (v: TopographySubMode) => void
	dangerSubMode: DangerSubMode
	setDangerSubMode: (v: DangerSubMode) => void
	hasCycloneRisk: boolean
	hasTornadoRisk: boolean
	hasTidalRisk: boolean
	exportExpanded?: boolean
	setExportExpanded?: (v: boolean | ((prev: boolean) => boolean)) => void
	exportWidthPreset: ExportWidthPreset
	setExportWidthPreset: (v: ExportWidthPreset) => void
	exportCenterLongitude: number
	setExportCenterLongitude: (v: number) => void
	exportDisabled: boolean
	exportBusy: boolean
	exportProgress: { percent: number; label: string } | null
	exportError?: string | null
	onExport: () => void
	onReset?: () => void
	generationPanelOpen?: boolean
	onToggleGenerationPanel?: () => void
	showDaylight?: boolean
	setShowDaylight?: (v: boolean) => void
	onEnterSolarSystem?: () => void
	isEarthImport?: boolean
}
