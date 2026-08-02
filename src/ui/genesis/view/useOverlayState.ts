import { useCallback, useEffect, useState } from "react"
import type {
	ClimateSubMode,
	LabelMode,
	MeasureMode,
	TopographySubMode,
	VegetationSubMode,
} from "@/ui/genesis/controls/OverlayControls"
import { VIEW_PREFS_STORAGE_KEY } from "@/ui/genesis/generation/defaults"
import { serializeStoredViewPrefs } from "@/ui/genesis/generation/view-prefs"
import type { GenesisViewMode } from "@/ui/genesis/renderer"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import {
	applyDataVariant,
	type DataVariant,
	getBaseMapMode,
	getDataVariant,
} from "@/ui/genesis/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/genesis/shared/map-modes"
import { syncLabelModeToMapMode } from "@/ui/genesis/shared/map-modes"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import type { OverlayStateInput } from "@/ui/genesis/view/types"

/**
 * Owns every persisted map/overlay view preference: the active map mode and
 * its sub-modes, the overlay toggles, the day/month clock, the measure and
 * pathfinding modes, and the projection/unit settings -- plus the single
 * effect that serializes the whole blob back to localStorage whenever any of
 * them changes.
 *
 * Scene side effects are deliberately NOT here: toggles that also have to
 * push state into the renderer (wireframe, elevation, measure-mode reset)
 * stay with the scene wiring so the coupling is visible at the call site.
 */
export function useOverlayState(input: OverlayStateInput) {
	const { initialViewPrefs, initialGenerationSession, isEarthImport } = input

	const [colorMode, setColorMode] = useState<ColorMode>(
		initialViewPrefs.colorMode,
	)
	const [dataVariant, setDataVariant] = useState<DataVariant>(() =>
		getDataVariant(initialViewPrefs.colorMode),
	)
	const setGeographyColorMode = useCallback(
		(mode: ColorMode) => setColorMode(applyDataVariant(mode, dataVariant)),
		[dataVariant],
	)
	const handleSetDataVariant = useCallback((next: DataVariant) => {
		setDataVariant(next)
		setColorMode((current) => applyDataVariant(getBaseMapMode(current), next))
	}, [])
	const [geographyMode, setGeographyMode] = useState<ColorMode>(
		initialViewPrefs.geographyMode,
	)
	const [nationMode, setNationMode] = useState<NationMapMode>(
		initialViewPrefs.nationMode,
	)
	const [populationMode, setPopulationMode] = useState<PopulationMapMode>(
		initialViewPrefs.populationMode,
	)
	const [viewMode, setViewMode] = useState<GenesisViewMode>(
		initialViewPrefs.viewMode,
	)
	const [solarSystemViewActive, setSolarSystemViewActive] = useState(
		initialGenerationSession?.solarSystemViewActive ??
			initialViewPrefs.solarSystemViewActive,
	)
	const [solarSystemControlsExpanded, setSolarSystemControlsExpanded] =
		useState(false)
	const [showSolarSystemEllipticalOrbits, setShowSolarSystemEllipticalOrbits] =
		useState(initialViewPrefs.showSolarSystemEllipticalOrbits)
	const [showSolarSystemDaylight, setShowSolarSystemDaylight] = useState(
		initialViewPrefs.showSolarSystemDaylight,
	)
	const [showSolarSystemInclination, setShowSolarSystemInclination] = useState(
		initialViewPrefs.showSolarSystemInclination,
	)
	const [showSolarSystemAxialTilt, setShowSolarSystemAxialTilt] = useState(
		initialViewPrefs.showSolarSystemAxialTilt,
	)
	const [showSolarSystemRealisticSizes, setShowSolarSystemRealisticSizes] =
		useState(initialViewPrefs.showSolarSystemRealisticSizes)
	const [showSolarSystemBodyNames, setShowSolarSystemBodyNames] = useState(
		initialViewPrefs.showSolarSystemBodyNames,
	)
	const [mapProjectionLatitude, setMapProjectionLatitude] = useState(
		initialViewPrefs.mapProjectionLatitude,
	)
	const [exportCenterLongitude, setExportCenterLongitude] = useState(0)
	const [draftMapProjectionLatitude, setDraftMapProjectionLatitude] = useState(
		initialViewPrefs.mapProjectionLatitude,
	)
	const [unitSystem, setUnitSystem] = useState<UnitSystem>(
		initialViewPrefs.unitSystem,
	)

	// Overlay state
	const [showWireframe, setShowWireframe] = useState(
		initialViewPrefs.showWireframe,
	)
	const [showGrid, setShowGrid] = useState(initialViewPrefs.showGrid)
	const [showNationBorders, setShowNationBorders] = useState(
		initialViewPrefs.showNationBorders,
	)
	const [showLandBorders, setShowLandBorders] = useState(
		initialViewPrefs.showLandBorders,
	)
	const [showNationHierarchy, setShowNationHierarchy] = useState(
		initialViewPrefs.showNationHierarchy,
	)
	const [showThermalEquator, setShowThermalEquator] = useState(
		initialViewPrefs.showThermalEquator,
	)
	const [showCoastlines, setShowCoastlines] = useState(
		initialViewPrefs.showCoastlines,
	)
	const [showWindArrows, setShowWindArrows] = useState(
		initialViewPrefs.showWindArrows,
	)
	const [showOceanCurrents, setShowOceanCurrents] = useState(
		initialViewPrefs.showOceanCurrents,
	)
	const [showRivers, setShowRivers] = useState(initialViewPrefs.showRivers)
	const [showGdd, setShowGdd] = useState(initialViewPrefs.showGdd)
	const [showGint, setShowGint] = useState(initialViewPrefs.showGint)
	const [showPet, setShowPet] = useState(initialViewPrefs.showPet)
	const [showAet, setShowAet] = useState(initialViewPrefs.showAet)
	const [showInfrastructure, setShowInfrastructure] = useState(
		initialViewPrefs.showInfrastructure,
	)
	const [labelMode, setLabelMode] = useState<LabelMode>(
		initialViewPrefs.labelMode,
	)
	useEffect(() => {
		setLabelMode((prev) =>
			syncLabelModeToMapMode({
				labelMode: prev,
				colorMode,
				nationMode,
				populationMode,
				isEarthImport,
			}),
		)
	}, [nationMode, colorMode, populationMode, isEarthImport])
	const [showElevation, setShowElevation] = useState(
		initialViewPrefs.showElevation,
	)
	const [overlaysExpanded, setOverlaysExpanded] = useState(
		initialViewPrefs.overlaysExpanded,
	)
	const [clockDay, setClockDay] = useState(initialViewPrefs.clockDay)
	const [clockCurrent, setClockCurrent] = useState(
		initialViewPrefs.clockCurrent,
	)
	const [showDaylight, setShowDaylight] = useState(
		initialViewPrefs.showDaylight,
	)
	const [clockMonthMode, setClockMonthMode] = useState<"annual" | "monthly">(
		initialViewPrefs.clockMonthMode === "annual" ? "annual" : "monthly",
	)
	const [clockMonth, setClockMonth] = useState(initialViewPrefs.clockMonth)
	const [clockHour, setClockHour] = useState(initialViewPrefs.clockHour)
	const [clockUseMeridiem, setClockUseMeridiem] = useState(
		initialViewPrefs.clockUseMeridiem,
	)
	const [vegetationSubMode, setVegetationSubMode] = useState<VegetationSubMode>(
		initialViewPrefs.vegetationSubMode,
	)
	const [climateSubMode, setClimateSubMode] = useState<ClimateSubMode>(
		initialViewPrefs.climateSubMode,
	)
	const [elevationSubMode, setElevationSubMode] = useState<
		"colored" | "grayscale"
	>(initialViewPrefs.elevationSubMode)
	const [topographySubMode, setTopographySubMode] = useState<TopographySubMode>(
		initialViewPrefs.topographySubMode,
	)
	const [dangerSubMode, setDangerSubMode] = useState<
		"earthquake" | "volcanic" | "cyclone" | "tornado" | "tidal"
	>(initialViewPrefs.dangerSubMode)
	const [debugMapModes, setDebugMapModes] = useState(
		initialViewPrefs.debugMapModes,
	)
	const [gridSpacing, setGridSpacing] = useState(initialViewPrefs.gridSpacing)

	const [measureMode, setMeasureModeState] = useState<MeasureMode>(
		initialViewPrefs.measureMode,
	)

	const [pathfindingLand, setPathfindingLand] = useState(
		initialViewPrefs.pathfindingLand,
	)
	const [pathfindingSea, setPathfindingSea] = useState(
		initialViewPrefs.pathfindingSea,
	)

	useEffect(() => {
		if (typeof window === "undefined") return
		window.localStorage.setItem(
			VIEW_PREFS_STORAGE_KEY,
			serializeStoredViewPrefs({
				colorMode,
				geographyMode,
				nationMode,
				populationMode,
				viewMode,
				solarSystemViewActive,
				showSolarSystemEllipticalOrbits,
				showSolarSystemDaylight,
				showSolarSystemInclination,
				showSolarSystemAxialTilt,
				showSolarSystemRealisticSizes,
				showSolarSystemBodyNames,
				showWireframe,
				showGrid,
				showNationBorders,
				showLandBorders,
				showNationHierarchy,
				labelMode,
				showElevation,
				showThermalEquator,
				showCoastlines,
				showWindArrows,
				showGdd,
				showGint,
				showPet,
				showAet,
				showOceanCurrents,
				showRivers,
				showInfrastructure,
				overlaysExpanded,
				gridSpacing,
				unitSystem,
				mapProjectionLatitude,
				debugMapModes,
				measureMode,
				pathfindingLand,
				pathfindingSea,
				showDaylight,
				clockCurrent,
				clockDay,
				clockHour,
				clockUseMeridiem,
				clockMonthMode,
				clockMonth,
				vegetationSubMode,
				climateSubMode,
				elevationSubMode,
				topographySubMode,
				dangerSubMode,
			}),
		)
	}, [
		colorMode,
		solarSystemViewActive,
		showSolarSystemEllipticalOrbits,
		showSolarSystemDaylight,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		showDaylight,
		clockCurrent,
		clockDay,
		clockHour,
		clockUseMeridiem,
		clockMonthMode,
		clockMonth,
		vegetationSubMode,
		climateSubMode,
		elevationSubMode,
		topographySubMode,
		dangerSubMode,
		debugMapModes,
		geographyMode,
		gridSpacing,
		mapProjectionLatitude,
		nationMode,
		overlaysExpanded,
		populationMode,
		showGrid,
		showInfrastructure,
		showNationBorders,
		showLandBorders,
		showNationHierarchy,
		labelMode,
		showElevation,
		showRivers,
		showThermalEquator,
		showCoastlines,
		showWindArrows,
		showGdd,
		showGint,
		showPet,
		showAet,
		showOceanCurrents,
		showWireframe,
		unitSystem,
		viewMode,
		measureMode,
		pathfindingLand,
		pathfindingSea,
	])

	return {
		climateSubMode,
		clockCurrent,
		clockDay,
		clockHour,
		clockMonth,
		clockMonthMode,
		clockUseMeridiem,
		colorMode,
		dangerSubMode,
		dataVariant,
		debugMapModes,
		draftMapProjectionLatitude,
		elevationSubMode,
		exportCenterLongitude,
		geographyMode,
		gridSpacing,
		handleSetDataVariant,
		labelMode,
		mapProjectionLatitude,
		measureMode,
		nationMode,
		overlaysExpanded,
		pathfindingLand,
		pathfindingSea,
		populationMode,
		setClimateSubMode,
		setClockCurrent,
		setClockDay,
		setClockHour,
		setClockMonth,
		setClockMonthMode,
		setClockUseMeridiem,
		setColorMode,
		setDangerSubMode,
		setDataVariant,
		setDebugMapModes,
		setDraftMapProjectionLatitude,
		setElevationSubMode,
		setExportCenterLongitude,
		setGeographyColorMode,
		setGeographyMode,
		setGridSpacing,
		setLabelMode,
		setMapProjectionLatitude,
		setMeasureModeState,
		setNationMode,
		setOverlaysExpanded,
		setPathfindingLand,
		setPathfindingSea,
		setPopulationMode,
		setShowAet,
		setShowCoastlines,
		setShowDaylight,
		setShowElevation,
		setShowGdd,
		setShowGint,
		setShowGrid,
		setShowInfrastructure,
		setShowLandBorders,
		setShowNationBorders,
		setShowNationHierarchy,
		setShowOceanCurrents,
		setShowPet,
		setShowRivers,
		setShowSolarSystemAxialTilt,
		setShowSolarSystemBodyNames,
		setShowSolarSystemDaylight,
		setShowSolarSystemEllipticalOrbits,
		setShowSolarSystemInclination,
		setShowSolarSystemRealisticSizes,
		setShowThermalEquator,
		setShowWindArrows,
		setShowWireframe,
		setSolarSystemControlsExpanded,
		setSolarSystemViewActive,
		setTopographySubMode,
		setUnitSystem,
		setVegetationSubMode,
		setViewMode,
		showAet,
		showCoastlines,
		showDaylight,
		showElevation,
		showGdd,
		showGint,
		showGrid,
		showInfrastructure,
		showLandBorders,
		showNationBorders,
		showNationHierarchy,
		showOceanCurrents,
		showPet,
		showRivers,
		showSolarSystemAxialTilt,
		showSolarSystemBodyNames,
		showSolarSystemDaylight,
		showSolarSystemEllipticalOrbits,
		showSolarSystemInclination,
		showSolarSystemRealisticSizes,
		showThermalEquator,
		showWindArrows,
		showWireframe,
		solarSystemControlsExpanded,
		solarSystemViewActive,
		topographySubMode,
		unitSystem,
		vegetationSubMode,
		viewMode,
	}
}
