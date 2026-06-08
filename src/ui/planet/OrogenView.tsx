import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { StageTiming } from "@/model"
import { OROGEN_TOPOGRAPHY_LABELS } from "@/model"
import { apparentTemperatureC } from "@/model/climate/apparent-temp"
import { relativeHumidityFromTempRange } from "@/model/climate/humidity"
import { buildLockedOceanCurrentGrid } from "@/model/climate/locked/ocean-currents"
import { buildOceanCurrentGrid } from "@/model/climate/ocean-currents"
import {
	computeThermalEquatorLine,
	getClimateGeometry,
} from "@/model/climate/rain"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/climate/vegetation"
import { computeWindGrid, computeWindVectors } from "@/model/climate/wind"
import {
	TRADE_GOOD_LABELS,
	tradeGoodColor,
	tradeGoodDisplayName,
} from "@/model/economy/trade-goods"
import { encodePlanetCode, SEED_MAX } from "@/model/shared/planet-code"
import { titleCase } from "@/model/shared/text"
import {
	getEffectiveObliquityDeg,
	isRetrogradeObliquity,
} from "@/model/shared/units"
import {
	GOVERNMENT_TYPE_LABELS,
	GOVERNMENT_TYPES,
	type SocietyEra,
} from "@/model/society/eras"
import { TOPO_LAKE, TOPO_OCEAN } from "@/model/terrain/classification"
import type {
	SerializedHistoryFrame,
	SerializedOrogenWorld,
} from "@/model/transport/worker-types"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { useEbmPreview } from "@/ui/hooks/useEbmPreview"
import { useLockedClimatePreview } from "@/ui/hooks/useLockedClimatePreview"
import { ClimatePreviewOverlay } from "@/ui/preview/ClimatePreviewOverlay"
import type { ColorMode } from "./colors"
import {
	climateZoneColor,
	miseryColor,
	OCEAN_LIGHT_BLUE,
	vegetationColor,
	windSpeedColor,
} from "./colors"
import { GenerationPanel } from "./controls/GenerationPanel"
import { ModeBar } from "./controls/ModeBar"
import {
	type ExportWidthPreset,
	type LabelMode,
	type MeasureMode,
	OverlayControls,
} from "./controls/OverlayControls"
import { SimulationControls } from "./controls/SimulationControls"
import { DetailsDrawer } from "./details/DetailsDrawer"
import { createDrawerNationClickHandler } from "./details/nation-clicks"
import {
	getCoastHopLengthKm,
	getHoverBiome,
	getHoverClimateDisplay,
	getHoverClimateZone,
	getHoverCoordinates,
	getHoverDistCoast,
	getHoverDistCoastKm,
	getHoverDtr,
	getHoverElevationKm,
	getHoverHazards,
	getHoverHotspot,
	getHoverHumidity,
	getHoverIsLand,
	getHoverKoppenClimate,
	getHoverLandmark,
	getHoverMisery,
	getHoverOceanCurrents,
	getHoverOceanDist,
	getHoverPastaClimate,
	getHoverProvince,
	getHoverRainfall,
	getHoverRiver,
	getHoverTemperatureDelta,
	getHoverTerrainFeature,
	getHoverTimezone,
	getHoverTopography,
	type HoverInfo,
	type HoverMisery,
} from "./hover/hover"
import { InfoPanel } from "./hover/InfoPanel"
import { canHandlePlanetClick } from "./measurement-click"
import { OceanCurrentParticleCanvas } from "./OceanCurrentParticleCanvas"
import {
	createOrogenScene,
	type OrogenScene,
	type OrogenViewMode,
} from "./renderer"
import {
	buildDisplayNationModel,
	buildDisplayWorld,
	buildHistoryChildrenIndex,
	buildNationAdjacency,
} from "./screen/display/display-model"
import { createDisplayNames } from "./screen/display/display-names"
import {
	buildCultureLabelNames,
	buildFaithLabelNames,
	buildHeritageLabelNames,
	buildNationDynastyLabelNames,
	buildNationLabelNames,
	buildReligionLabelNames,
	buildSettlementLabelNames,
} from "./screen/display/label-names"
import {
	buildConflictDistribution,
	buildNationHistory,
	buildNationSizeDistribution,
	buildRelationDistribution,
	buildSelectedNationDetails,
	buildWindowedNationEvents,
} from "./screen/display/nation-details-model"
import { computePlanetStats } from "./screen/display/planet-stats"
import {
	buildCultureBlendOverlay,
	buildPoliticalOccupationOverlay,
	getPoliticalHoverNationId,
	getPoliticalHoverOccupation,
	getRebelDisplayColorNationId,
} from "./screen/display/political-conflict-display"
import {
	computeRegionColors,
	getTopographyColor,
} from "./screen/display/region-colors"
import {
	DEFAULT_WORLD_PARAMS,
	MAX_RECENT_CODES,
	PLANET_CODE_STORAGE_KEY,
	RECENT_CODES_STORAGE_KEY,
	VIEW_PREFS_STORAGE_KEY,
} from "./screen/generation/defaults"
import {
	decodePlanetCode,
	type GenerationCallbacks,
	type GenerationParams,
	generateWorld,
	importHeightmap,
	loadImageAsGrayscale,
	pauseSimulation,
	startSimulation,
} from "./screen/generation/generation"
import {
	buildGenerationPreviewConfig,
	type GenerationPreviewTab,
	getGenerationPreviewCanvasClassName,
} from "./screen/generation/generation-preview"
import {
	buildPlanetSliders,
	buildTerrainSliders,
	resetWorldDefaults,
} from "./screen/generation/sliders"
import {
	DEFAULT_VIEW_PREFS,
	parseStoredViewPrefs,
	serializeStoredViewPrefs,
} from "./screen/generation/view-prefs"
import {
	createHistoryQuery,
	type TimelineBundle,
} from "./screen/history/history-query"
import {
	historyTimeToMonth,
	historyYearToTime,
} from "./screen/history/history-time"
import { buildLiveHistoryView } from "./screen/history/live-history-view"
import type {
	NationMapMode,
	PopulationMapMode,
} from "./screen/shared/map-modes"
import {
	DEFAULT_GEOGRAPHY_MODE,
	getMapModePrimary,
	isDebugGeographyMode,
	normalizeGeographyColorMode,
} from "./screen/shared/map-modes"
import {
	formatDistance,
	rgbToCss,
	type UnitSystem,
} from "./screen/shared/ui-format"
import { WindParticleCanvas } from "./WindParticleCanvas"

const WIND_DIR_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
// "coming from" convention: negate u/v to get the source direction
function windDirectionLabel(u: number, v: number): string {
	const deg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360
	return WIND_DIR_LABELS[Math.round(deg / 45) % 8] ?? "N"
}

function buildDistribution(
	labels: ReadonlyArray<string>,
	values: ArrayLike<number> | undefined,
	colorFn: (index: number) => string,
	excludeIndexes: ReadonlySet<number> = new Set(),
) {
	const counts = new Array(labels.length).fill(0)
	if (values) {
		for (let i = 0; i < values.length; i++) {
			const value = values[i]
			if (value >= 0 && value < counts.length && !excludeIndexes.has(value))
				counts[value]++
		}
	}

	return labels
		.map((label, index) => ({
			label: titleCase(label),
			count: counts[index] ?? 0,
			color: colorFn(index),
		}))
		.filter((bucket) => bucket.count > 0)
}

function buildExportTimestamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, "-")
}

function sanitizeExportIdentity(
	value: string | null | undefined,
): string | null {
	if (!value) return null
	const sanitized = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
	return sanitized.length > 0 ? sanitized : null
}

export function buildMapExportFilename(
	planetCode: string | null | undefined,
	width: number,
	date: Date = new Date(),
): string {
	const identity =
		sanitizeExportIdentity(planetCode) ?? buildExportTimestamp(date)
	return `genesis-map-${identity}-${width}w.png`
}

export const OrogenView: React.FC = () => {
	const makeRandomSeed = useCallback(
		() => Math.floor(Math.random() * SEED_MAX),
		[],
	)
	// Refs
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const sceneRef = useRef<OrogenScene | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const lastWorldRef = useRef<SerializedOrogenWorld | null>(null)
	const hoverCardRef = useRef<HTMLDivElement>(null)
	const initialViewPrefs =
		typeof window === "undefined"
			? DEFAULT_VIEW_PREFS
			: (parseStoredViewPrefs(
					window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY),
				) ?? DEFAULT_VIEW_PREFS)

	// Core state
	const [world, setWorld] = useState<SerializedOrogenWorld | null>(null)
	const [generating, setGenerating] = useState(false)
	const [generationProgress, setGenerationProgress] = useState(0)
	const [generationLabel, setGenerationLabel] = useState("Idle")
	const [generationTimings, setGenerationTimings] = useState<
		StageTiming[] | null
	>(null)
	const [colorMode, setColorMode] = useState<ColorMode>(
		initialViewPrefs.colorMode,
	)
	const [geographyMode, setGeographyMode] = useState<ColorMode>(
		initialViewPrefs.geographyMode,
	)
	const [nationMode, setNationMode] = useState<NationMapMode>(
		initialViewPrefs.nationMode,
	)
	const [populationMode, setPopulationMode] = useState<PopulationMapMode>(
		initialViewPrefs.populationMode,
	)
	const [viewMode, setViewMode] = useState<OrogenViewMode>(
		initialViewPrefs.viewMode,
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
	const [showWindArrows, setShowWindArrows] = useState(
		initialViewPrefs.showWindArrows,
	)
	const [showOceanCurrents, setShowOceanCurrents] = useState(
		initialViewPrefs.showOceanCurrents,
	)
	const [showRivers, setShowRivers] = useState(initialViewPrefs.showRivers)
	const [showGdd, setShowGdd] = useState(false)
	const [showGint, setShowGint] = useState(false)
	const [showPet, setShowPet] = useState(false)
	const [showAet, setShowAet] = useState(false)
	const [showSettlements, setShowSettlements] = useState(
		initialViewPrefs.showSettlements,
	)
	const [showRoads, setShowRoads] = useState(initialViewPrefs.showRoads)
	const [labelMode, setLabelMode] = useState<LabelMode>(
		initialViewPrefs.labelMode,
	)
	useEffect(() => {
		setLabelMode((prev) => {
			const anyActive =
				prev.nations ||
				prev.dynasty ||
				prev.culture ||
				prev.heritage ||
				prev.faith ||
				prev.religion
			if (!anyActive) return prev
			const isPopMode = colorMode === "population"
			const isDynasty = nationMode === "dynasty"
			return {
				...prev,
				nations: !isPopMode && !isDynasty,
				dynasty: !isPopMode && isDynasty,
				culture: isPopMode && populationMode === "culture",
				heritage: isPopMode && populationMode === "heritage",
				faith: isPopMode && populationMode === "faith",
				religion: isPopMode && populationMode === "religion",
			}
		})
	}, [nationMode, colorMode, populationMode])
	const [showElevation, setShowElevation] = useState(
		initialViewPrefs.showElevation,
	)
	const [overlaysExpanded, setOverlaysExpanded] = useState(
		initialViewPrefs.overlaysExpanded,
	)
	const [climateTimeMode, setClimateTimeMode] = useState<
		"current" | "annual" | "monthly"
	>(initialViewPrefs.climateTimeMode)
	const [climateMonth, setClimateMonth] = useState(
		initialViewPrefs.climateMonth,
	)
	const [climateSubMode, setClimateSubMode] = useState<
		"basic" | "pasta" | "koppen"
	>(initialViewPrefs.climateSubMode)
	const [elevationSubMode, setElevationSubMode] = useState<
		"colored" | "grayscale"
	>(initialViewPrefs.elevationSubMode)
	const [topographySubMode, setTopographySubMode] = useState<
		"classification" | "slope"
	>(initialViewPrefs.topographySubMode)
	const [dangerSubMode, setDangerSubMode] = useState<
		"earthquake" | "volcanic" | "cyclone" | "tornado" | "tidal"
	>(initialViewPrefs.dangerSubMode)
	const [debugMapModes, setDebugMapModes] = useState(
		initialViewPrefs.debugMapModes,
	)
	const [gridSpacing, setGridSpacing] = useState(initialViewPrefs.gridSpacing)
	const [worldTab, setWorldTab] = useState<"planet" | "terrain" | "society">(
		"planet",
	)
	const [generationPanelOpen, setGenerationPanelOpen] = useState(true)
	const [showClimatePreview, setShowClimatePreview] = useState(false)
	const [generationPreviewTab, setGenerationPreviewTab] =
		useState<GenerationPreviewTab>("temperature")
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const [selectedNationId, setSelectedNationId] = useState<number | null>(null)

	// Simulation state
	const [simPlaying, setSimPlaying] = useState(false)
	const simStartTimeMs = historyYearToTime(800)
	const [simTimeMs, setSimTimeMs] = useState(simStartTimeMs)
	const [timelineBundle, setTimelineBundle] = useState<
		TimelineBundle | undefined
	>()
	const [liveFrame, setLiveFrame] = useState<SerializedHistoryFrame | null>(
		null,
	)
	const [selectedTimeMs, setSelectedTimeMs] = useState(simStartTimeMs)
	const displayMonth = historyTimeToMonth(selectedTimeMs)
	const resolvedClimateMonth =
		climateTimeMode === "current"
			? displayMonth
			: climateTimeMode === "annual"
				? 0
				: climateMonth + 1
	const temperatureMonth = resolvedClimateMonth
	const rainfallMonth = resolvedClimateMonth
	const dtrMonth = resolvedClimateMonth
	const currentMonth = resolvedClimateMonth
	const canSimulate = !!world && !!world.nations && !generating

	// Hover & measurement
	const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
	const [measureStart, setMeasureStart] = useState<number | null>(null)
	const [measureEnd, setMeasureEnd] = useState<number | null>(null)
	const [measureLabelPos, setMeasureLabelPos] = useState<
		[number, number] | null
	>(null)
	const measureRef = useRef<{ start: number | null; end: number | null }>({
		start: null,
		end: null,
	})

	// Measure state
	const [measureMode, setMeasureModeState] = useState<MeasureMode>(
		initialViewPrefs.measureMode,
	)
	const setMeasureMode = useCallback((mode: MeasureMode) => {
		measureRef.current = { start: null, end: null }
		setMeasureStart(null)
		setMeasureEnd(null)
		setMeasureLabelPos(null)
		sceneRef.current?.setMeasureLine(null, null)
		pathfindingRef.current = { start: null, end: null }
		setPathfindingResult(null)
		sceneRef.current?.setPathfindingOverlay(null, null, null)
		setMeasureModeState(mode)
	}, [])
	const [pathfindingLand, setPathfindingLand] = useState(
		initialViewPrefs.pathfindingLand,
	)
	const [pathfindingSea, setPathfindingSea] = useState(
		initialViewPrefs.pathfindingSea,
	)
	const [pathfindingResult, setPathfindingResult] = useState<{
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
	} | null>(null)
	const pathfindingRef = useRef<{ start: number | null; end: number | null }>({
		start: null,
		end: null,
	})

	// Generation params
	const [recentCodes, setRecentCodes] = useState<string[]>(() => {
		if (typeof window === "undefined") return []
		try {
			const stored = window.localStorage.getItem(RECENT_CODES_STORAGE_KEY)
			if (!stored) return []
			const parsed = JSON.parse(stored)
			return Array.isArray(parsed)
				? parsed
						.filter(
							(value): value is string =>
								typeof value === "string" && value.length > 0,
						)
						.slice(0, MAX_RECENT_CODES)
				: []
		} catch {
			return []
		}
	})
	const initialCode = (() => {
		if (typeof window !== "undefined") {
			const stored = window.localStorage.getItem(PLANET_CODE_STORAGE_KEY)
			if (stored) return stored
		}
		if (recentCodes[0]) return recentCodes[0]
		const fallbackSeed = makeRandomSeed()
		return encodePlanetCode(fallbackSeed, {
			seed: fallbackSeed,
			...DEFAULT_WORLD_PARAMS,
			tidallyLocked: false,
		})
	})()
	const initialDecodedCode = decodePlanetCode(initialCode)
	const initialSeed = initialDecodedCode?.seed ?? makeRandomSeed()
	const [seed, setSeed] = useState(() => initialSeed)
	const [planetCode, setPlanetCode] = useState(() => {
		return initialCode
	})
	const [planetCodeInput, setPlanetCodeInput] = useState(() => {
		return initialCode
	})
	const [codeInputDirty, setCodeInputDirty] = useState(false)
	const [codeError, setCodeError] = useState(false)
	const [codeCopied, setCodeCopied] = useState(false)
	const [exportWidthPreset, setExportWidthPreset] =
		useState<ExportWidthPreset>("8192")
	const [exportProgress, setExportProgress] = useState<{
		percent: number
		label: string
	} | null>(null)
	const [exportError, setExportError] = useState<string | null>(null)

	// Planet params
	const [numPoints, setNumPoints] = useState(
		initialDecodedCode?.numPoints ?? DEFAULT_WORLD_PARAMS.numPoints,
	)
	const [jitter, setJitter] = useState(
		initialDecodedCode?.jitter ?? DEFAULT_WORLD_PARAMS.jitter,
	)
	const [numPlates, setNumPlates] = useState(
		initialDecodedCode?.numPlates ?? DEFAULT_WORLD_PARAMS.numPlates,
	)
	const [landDistribution, setLandDistribution] = useState(
		initialDecodedCode?.landDistribution ??
			DEFAULT_WORLD_PARAMS.landDistribution,
	)
	const [continentSizeVariety, setContinentSizeVariety] = useState(
		initialDecodedCode?.continentSizeVariety ??
			DEFAULT_WORLD_PARAMS.continentSizeVariety,
	)
	const [landCoverage, setLandCoverage] = useState(
		initialDecodedCode?.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage,
	)
	const [roughness, setRoughness] = useState(
		initialDecodedCode?.roughness ?? DEFAULT_WORLD_PARAMS.roughness,
	)
	const [planetRadiusKm, setPlanetRadiusKm] = useState(
		initialDecodedCode?.planetRadiusKm ?? DEFAULT_WORLD_PARAMS.planetRadiusKm,
	)
	const [obliquity, setObliquity] = useState(
		initialDecodedCode?.obliquity ?? DEFAULT_WORLD_PARAMS.obliquity,
	)
	const [eccentricity, setEccentricity] = useState(
		initialDecodedCode?.eccentricity ?? DEFAULT_WORLD_PARAMS.eccentricity,
	)
	const [sunTempFactor, setSunTempFactor] = useState(
		initialDecodedCode?.sunTempFactor ?? DEFAULT_WORLD_PARAMS.sunTempFactor,
	)
	const [insolationFactor, setInsolationFactor] = useState(
		initialDecodedCode?.insolationFactor ??
			DEFAULT_WORLD_PARAMS.insolationFactor,
	)
	const [daysPerYear, setDaysPerYear] = useState(
		initialDecodedCode?.daysPerYear ?? DEFAULT_WORLD_PARAMS.daysPerYear,
	)
	const [hoursPerDay, setHoursPerDay] = useState(
		initialDecodedCode?.hoursPerDay ?? DEFAULT_WORLD_PARAMS.hoursPerDay,
	)
	const [tidallyLocked, setTidallyLocked] = useState(
		initialDecodedCode?.tidallyLocked ?? false,
	)
	const [antistellarLon, setAntistellarLon] = useState(
		initialDecodedCode?.antistellarLon ?? DEFAULT_WORLD_PARAMS.antistellarLon,
	)
	const [perihelion, setPerihelion] = useState(
		initialDecodedCode?.perihelion ?? DEFAULT_WORLD_PARAMS.perihelion,
	)
	const [pressure, setPressure] = useState(
		initialDecodedCode?.pressure ?? DEFAULT_WORLD_PARAMS.pressure,
	)
	const [tidalStrength, setTidalStrength] = useState(
		initialDecodedCode?.tidalStrength ?? DEFAULT_WORLD_PARAMS.tidalStrength,
	)

	// Terrain params
	const [terrainWarp, setTerrainWarp] = useState(
		initialDecodedCode?.terrainWarp ?? DEFAULT_WORLD_PARAMS.terrainWarp,
	)
	const [smoothing, setSmoothing] = useState(
		initialDecodedCode?.smoothing ?? DEFAULT_WORLD_PARAMS.smoothing,
	)
	const [hydraulicErosion, setHydraulicErosion] = useState(
		initialDecodedCode?.hydraulicErosion ??
			DEFAULT_WORLD_PARAMS.hydraulicErosion,
	)
	const [thermalErosion, setThermalErosion] = useState(
		initialDecodedCode?.thermalErosion ?? DEFAULT_WORLD_PARAMS.thermalErosion,
	)
	const [ridgeSharpening, setRidgeSharpening] = useState(
		initialDecodedCode?.ridgeSharpening ?? DEFAULT_WORLD_PARAMS.ridgeSharpening,
	)
	const [glacialErosion, setGlacialErosion] = useState(
		initialDecodedCode?.glacialErosion ?? DEFAULT_WORLD_PARAMS.glacialErosion,
	)
	const [seaLevel, setSeaLevel] = useState(
		initialDecodedCode?.seaLevel ?? DEFAULT_WORLD_PARAMS.seaLevel,
	)
	const [volcanism, setVolcanism] = useState(
		initialDecodedCode?.volcanism ?? DEFAULT_WORLD_PARAMS.volcanism,
	)
	const [craters, setCraters] = useState(
		initialDecodedCode?.craters ?? DEFAULT_WORLD_PARAMS.craters,
	)
	const [maxElevation, setMaxElevation] = useState(
		initialDecodedCode?.maxElevation ?? DEFAULT_WORLD_PARAMS.maxElevation,
	)
	const [era, setEra] = useState<SocietyEra>(
		initialDecodedCode?.era ?? DEFAULT_WORLD_PARAMS.era,
	)

	// --- Three.js scene lifecycle ---
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const orogenScene = createOrogenScene(canvas)
		sceneRef.current = orogenScene
		orogenScene.setHoverHandler((info) => {
			setHoverInfo(
				info ? { region: info.region, x: info.clientX, y: info.clientY } : null,
			)
		})
		const onResize = () => orogenScene.resize()
		window.addEventListener("resize", onResize)
		const ro = new ResizeObserver(() => orogenScene.resize())
		ro.observe(canvas)
		return () => {
			window.removeEventListener("resize", onResize)
			ro.disconnect()
			workerRef.current?.terminate()
			workerRef.current = null
			orogenScene.setHoverHandler(null)
			orogenScene.dispose()
			sceneRef.current = null
		}
	}, [])

	// --- Scene sync effects ---
	useEffect(() => {
		sceneRef.current?.setAtmospherePressure(world?.params.pressure ?? pressure)
	}, [world, pressure])
	useEffect(() => {
		if (!world) {
			setHoverInfo(null)
			return
		}
		setGenerationTimings(world.timings ?? null)
	}, [world])
	useEffect(() => {
		if (typeof window === "undefined") return
		if (planetCode)
			window.localStorage.setItem(PLANET_CODE_STORAGE_KEY, planetCode)
		else window.localStorage.removeItem(PLANET_CODE_STORAGE_KEY)
	}, [planetCode])
	useEffect(() => {
		if (typeof window === "undefined") return
		window.localStorage.setItem(
			RECENT_CODES_STORAGE_KEY,
			JSON.stringify(recentCodes),
		)
	}, [recentCodes])
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
				showWireframe,
				showGrid,
				showNationBorders,
				showLandBorders,
				showNationHierarchy,
				labelMode,
				showElevation,
				showThermalEquator,
				showWindArrows,
				showOceanCurrents,
				showRivers,
				showSettlements,
				showRoads,
				overlaysExpanded,
				gridSpacing,
				unitSystem,
				mapProjectionLatitude,
				debugMapModes,
				measureMode,
				pathfindingLand,
				pathfindingSea,
				climateTimeMode,
				climateMonth,
				climateSubMode,
				elevationSubMode,
				topographySubMode,
				dangerSubMode,
			}),
		)
	}, [
		colorMode,
		climateTimeMode,
		climateMonth,
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
		showSettlements,
		showRoads,
		showNationBorders,
		showLandBorders,
		showNationHierarchy,
		labelMode,
		showElevation,
		showRivers,
		showThermalEquator,
		showWindArrows,
		showOceanCurrents,
		showWireframe,
		unitSystem,
		viewMode,
		measureMode,
		pathfindingLand,
		pathfindingSea,
	])

	// --- Color mode guard ---
	useEffect(() => {
		if (!world) return
		const normalizedColorMode = normalizeGeographyColorMode({
			colorMode,
			hasHazards: !!world?.hazards,
			hasVolcanism: !!world?.volcanism,
		})
		if (normalizedColorMode !== colorMode) {
			setColorMode(normalizedColorMode)
			setGeographyMode(normalizedColorMode)
		}
	}, [colorMode, world?.hazards, world?.volcanism, world])

	useEffect(() => {
		if (debugMapModes) return
		if (isDebugGeographyMode(colorMode)) {
			setColorMode(DEFAULT_GEOGRAPHY_MODE)
			setGeographyMode(DEFAULT_GEOGRAPHY_MODE)
		}
	}, [colorMode, debugMapModes])

	useEffect(() => {
		if (!canSimulate) {
			setSimPlaying(false)
		}
	}, [canSimulate])

	const currentHistoryQuery = useMemo(
		() =>
			world && timelineBundle
				? createHistoryQuery(timelineBundle, world)
				: null,
		[world, timelineBundle],
	)

	const selectedHistoryView = useMemo(
		() =>
			currentHistoryQuery
				? currentHistoryQuery.getView(selectedTimeMs)
				: buildLiveHistoryView({
						selectedTimeMs,
						simTimeMs,
						liveFrame,
					}),
		[currentHistoryQuery, selectedTimeMs, simTimeMs, liveFrame],
	)
	const selectedHistoryChildren = useMemo(
		() => buildHistoryChildrenIndex(selectedHistoryView),
		[selectedHistoryView],
	)

	const worldForDisplay = useMemo(
		() =>
			buildDisplayWorld({
				world,
				selectedHistoryView,
				selectedHistoryChildren,
			}),
		[world, selectedHistoryChildren, selectedHistoryView],
	)
	const nationModel = useMemo(
		() => buildDisplayNationModel(worldForDisplay),
		[worldForDisplay],
	)
	const nationProvinceCounts = useMemo(() => {
		return nationModel?.counts ?? new Map<number, number>()
	}, [nationModel])
	const nationColorById = useMemo(() => {
		const baseColors =
			nationModel?.colorById ?? new Map<number, [number, number, number]>()
		if (!selectedHistoryView?.activeWars?.length) return baseColors
		const displayColors = new Map(baseColors)
		for (const nationId of displayColors.keys()) {
			const displayColorNationId = getRebelDisplayColorNationId(
				selectedHistoryView.activeWars,
				nationId,
			)
			if (displayColorNationId === null) continue
			const displayColor = baseColors.get(displayColorNationId)
			if (displayColor) displayColors.set(nationId, displayColor)
		}
		return displayColors
	}, [nationModel, selectedHistoryView])
	const getNationColor = useCallback(
		(nationId: number): string | null => {
			if (nationId < 0) return null
			const color = nationColorById.get(nationId)
			return color ? rgbToCss(color) : null
		},
		[nationColorById],
	)
	const getNationColorRgb = useCallback(
		(nationId: number): [number, number, number] | null => {
			if (nationId < 0) return null
			return nationColorById.get(nationId) ?? null
		},
		[nationColorById],
	)

	useEffect(() => {
		if (!worldForDisplay) {
			setSelectedNationId(null)
			return
		}
		if (!worldForDisplay.nations || selectedNationId === null) return
		if (selectedNationId < 0 || !nationProvinceCounts.has(selectedNationId)) {
			setSelectedNationId(null)
		}
	}, [nationProvinceCounts, selectedNationId, worldForDisplay])

	// --- Hover computations ---
	const hoverElevationKm = getHoverElevationKm(hoverInfo, worldForDisplay)
	const hoverTopography = getHoverTopography(hoverInfo, worldForDisplay)
	const hoverCoordinates = useMemo(
		() => getHoverCoordinates(hoverInfo, worldForDisplay),
		[hoverInfo, worldForDisplay],
	)
	const hoverTimezone = useMemo(
		() => getHoverTimezone(hoverInfo, worldForDisplay),
		[hoverInfo, worldForDisplay],
	)
	const hoverTemperatureDelta = getHoverTemperatureDelta(
		hoverInfo,
		worldForDisplay,
	)
	const hoverRainfall = getHoverRainfall(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverDtr = getHoverDtr(hoverInfo, worldForDisplay, dtrMonth)
	const hoverHumidity = getHoverHumidity(hoverInfo, worldForDisplay, dtrMonth)
	const hoverClimateZone = getHoverClimateZone(hoverInfo, worldForDisplay)
	const hoverPastaClimate = getHoverPastaClimate(hoverInfo, worldForDisplay)
	const hoverKoppenClimate = getHoverKoppenClimate(hoverInfo, worldForDisplay)
	const hoverBiome = getHoverBiome(hoverInfo, worldForDisplay)
	const hoverProvince = getHoverProvince(hoverInfo, worldForDisplay)
	const hoverLandmark = getHoverLandmark(hoverInfo, worldForDisplay)
	const hoverIsLand = getHoverIsLand(hoverInfo, worldForDisplay)
	const hoverOceanDist = getHoverOceanDist(hoverInfo, worldForDisplay)
	const hoverDistCoast = getHoverDistCoast(hoverInfo, worldForDisplay)
	const hoverHazards = getHoverHazards(hoverInfo, worldForDisplay)
	const hoverHotspot = getHoverHotspot(hoverInfo, worldForDisplay)
	const hoverRiver = getHoverRiver(hoverInfo, worldForDisplay)
	const hoverTerrainFeature = getHoverTerrainFeature(hoverInfo, worldForDisplay)
	const hoverOceanCurrents = getHoverOceanCurrents(hoverInfo, worldForDisplay)
	const hoverNationId = useMemo(() => {
		return getPoliticalHoverNationId({
			hoverProvince,
			assignment: nationModel?.assignment,
			activeWars: selectedHistoryView?.activeWars,
		})
	}, [nationModel, hoverProvince, selectedHistoryView])
	const worldNames = useMemo(
		() => (world ? createDisplayNames(world, timelineBundle) : null),
		[timelineBundle, world],
	)
	const nationLabelsArray = useMemo(() => {
		return buildNationLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const dynastyLabelsArray = useMemo(() => {
		return buildNationDynastyLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const settlementLabelsArray = useMemo(() => {
		return buildSettlementLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const cultureLabelsArray = useMemo(() => {
		return buildCultureLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const heritageLabelsArray = useMemo(() => {
		return buildHeritageLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const faithLabelsArray = useMemo(() => {
		return buildFaithLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const religionLabelsArray = useMemo(() => {
		return buildReligionLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const getNationName = useCallback(
		(nationId: number) => worldNames?.nation(nationId) ?? `#${nationId}`,
		[worldNames],
	)
	const getProvinceName = useCallback(
		(provinceId: number) =>
			worldNames?.province(provinceId) ?? `Province #${provinceId}`,
		[worldNames],
	)
	const getCultureName = useCallback(
		(cultureId: number) =>
			worldNames?.culture(cultureId) ?? `Culture #${cultureId}`,
		[worldNames],
	)
	const getHeritageName = useCallback(
		(heritageId: number) =>
			worldNames?.heritage(heritageId) ?? `Heritage #${heritageId}`,
		[worldNames],
	)
	const getFaithName = useCallback(
		(faithId: number) => worldNames?.faith(faithId) ?? `Faith #${faithId}`,
		[worldNames],
	)
	const getReligionName = useCallback(
		(religionId: number) =>
			worldNames?.religion(religionId) ?? `Religion #${religionId}`,
		[worldNames],
	)
	const getLeaderName = useCallback(
		(nationId: number, timeMs: number) =>
			worldNames?.leader(nationId, timeMs) ?? `Leader #${nationId}`,
		[worldNames],
	)
	const getDynastyName = useCallback(
		(dynastyId: number) =>
			worldNames?.dynasty(dynastyId) ?? `Dynasty #${dynastyId}`,
		[worldNames],
	)
	const getLandmarkName = useCallback(
		(landmarkId: number) =>
			worldNames?.landmark(landmarkId) ?? `#${landmarkId}`,
		[worldNames],
	)
	const getRiverName = useCallback(
		(riverId: number) => worldNames?.river(riverId) ?? `River #${riverId}`,
		[worldNames],
	)
	const getProvinceColor = useCallback(
		(provinceId: number) => {
			if (
				!worldForDisplay?.provinces?.colors ||
				provinceId < 0 ||
				provinceId * 3 + 2 >= worldForDisplay.provinces.colors.length
			) {
				return null
			}
			return rgbToCss([
				worldForDisplay.provinces.colors[provinceId * 3],
				worldForDisplay.provinces.colors[provinceId * 3 + 1],
				worldForDisplay.provinces.colors[provinceId * 3 + 2],
			])
		},
		[worldForDisplay],
	)
	const coastHopLengthKm = useMemo(
		() => getCoastHopLengthKm(worldForDisplay),
		[worldForDisplay],
	)
	const hoverDistCoastKm = getHoverDistCoastKm(hoverDistCoast, coastHopLengthKm)
	const hoverOccupation = useMemo(() => {
		const occupation = getPoliticalHoverOccupation({
			hoverProvince,
			assignment: worldForDisplay?.nations?.assignment,
			activeWars: selectedHistoryView?.activeWars,
		})
		if (!occupation) return null
		return {
			id: occupation.id,
			name: getNationName(occupation.id),
			color: occupation.rebel
				? "rgb(0, 0, 0)"
				: (getNationColor(occupation.displayColorNationId) ?? "rgb(0, 0, 0)"),
			rebel: occupation.rebel,
		}
	}, [
		selectedHistoryView,
		getNationColor,
		getNationName,
		hoverProvince,
		worldForDisplay,
	])
	const hoverIceSummary = (() => {
		if (!(hoverInfo && worldForDisplay)) return null
		const r = hoverInfo.region
		const iceThickness = worldForDisplay.iceThickness?.[r] ?? 0
		const iceMin = worldForDisplay.iceMinMonthly?.[r] ?? 0
		const iceMax = worldForDisplay.iceMaxMonthly?.[r] ?? 0
		if (iceThickness <= 0 && iceMax <= 0) return null
		return `${(iceThickness / 1000).toFixed(2)} m (${(iceMin / 1000).toFixed(2)}-${(iceMax / 1000).toFixed(2)})`
	})()
	const hoverClimateDisplay = getHoverClimateDisplay(
		colorMode,
		hoverPastaClimate,
		hoverKoppenClimate,
		hoverClimateZone,
	)

	// Shared wind computation — runs when wind arrows or wind color mode is active
	const windVectors = useMemo(() => {
		if (
			!world?.climate ||
			(!showWindArrows && colorMode !== "wind" && colorMode !== "misery")
		)
			return null
		const month =
			resolvedClimateMonth > 0 ? resolvedClimateMonth - 1 : undefined
		return computeWindVectors(
			world.mesh,
			world.climate,
			world.elevation_km,
			world.params,
			month,
			{
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		)
	}, [world, showWindArrows, colorMode, resolvedClimateMonth])

	// Monthly wind: computed lazily across setTimeout ticks when wind is active
	const monthlyWindRef = useRef<
		Array<{ windU: Float32Array; windV: Float32Array; windSpeed: Float32Array }>
	>([])
	const [monthlyWindReady, setMonthlyWindReady] = useState(false)
	const windActive =
		showWindArrows ||
		colorMode === "wind" ||
		getMapModePrimary(colorMode) === "geography"
	useEffect(() => {
		if (!world?.climate || !windActive) {
			monthlyWindRef.current = []
			setMonthlyWindReady(false)
			return
		}
		const results: typeof monthlyWindRef.current = []
		setMonthlyWindReady(false)
		let m = 0
		const tick = () => {
			if (m >= 12) {
				monthlyWindRef.current = results
				setMonthlyWindReady(true)
				return
			}
			results.push(
				computeWindVectors(
					world.mesh,
					world.climate,
					world.elevation_km,
					world.params,
					m++,
					{
						vegetation: world.vegetation,
						topography: world.topography,
						slopeScore: world.slopeScore,
						oceanDist: world.oceanDist,
					},
				),
			)
			setTimeout(tick, 0)
		}
		setTimeout(tick, 0)
		return () => {
			setMonthlyWindReady(false)
		}
	}, [world, windActive])

	const projectToScreen = useCallback(
		(xyz: [number, number, number], lonOffsetRad?: number) =>
			sceneRef.current?.projectToScreen(xyz, lonOffsetRad) ?? null,
		[],
	)
	const getGlobeCameraDir = useCallback(
		() => sceneRef.current?.getGlobeCameraDir() ?? null,
		[],
	)

	const hoverWindSpeed =
		hoverInfo && windVectors ? windVectors.windSpeed[hoverInfo.region] : null
	const hoverWindDir =
		hoverInfo && windVectors
			? windDirectionLabel(
					windVectors.windU[hoverInfo.region],
					windVectors.windV[hoverInfo.region],
				)
			: null
	const hoverWindMonthly = useMemo(() => {
		if (!hoverInfo || !monthlyWindReady || monthlyWindRef.current.length < 12)
			return null
		const r = hoverInfo.region
		return monthlyWindRef.current.map((wv) => ({
			speedMs: wv.windSpeed[r],
			dir: windDirectionLabel(wv.windU[r], wv.windV[r]),
		}))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hoverInfo?.region, monthlyWindReady, hoverInfo])

	const hoverMisery: HoverMisery | null = getHoverMisery(
		hoverInfo,
		worldForDisplay,
		dtrMonth,
		hoverWindSpeed,
		hoverWindMonthly?.map((w) => w.speedMs) ?? null,
	)

	const windStats = useMemo(() => {
		if (!world?.climate) return null
		const vectors = computeWindVectors(
			world.mesh,
			world.climate,
			world.elevation_km,
			world.params,
			undefined,
			{
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		)
		const speeds = vectors.windSpeed
		let sum = 0
		let max = 0
		for (let i = 0; i < speeds.length; i++) {
			const s = speeds[i]
			sum += s
			if (s > max) max = s
		}
		return { avg: speeds.length > 0 ? sum / speeds.length : 0, max }
	}, [world])

	// --- Region colors ---
	const regionColors = useMemo(() => {
		if (!worldForDisplay) return null
		if (colorMode === "wind" && windVectors) {
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const { windSpeed } = windVectors
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = windSpeedColor(windSpeed[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}
		if (
			colorMode === "misery" &&
			windVectors &&
			worldForDisplay.climate &&
			worldForDisplay.dtr_annual
		) {
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const isMonthly = dtrMonth > 0
			const offset = isMonthly ? (dtrMonth - 1) * N : 0
			const monthlyTemp = isMonthly
				? worldForDisplay.climate.temperature_monthly
				: null
			const monthlyDtr = isMonthly ? worldForDisplay.dtr_monthly : null
			const aet = worldForDisplay.hydrology?.aet_monthly
			const pet = worldForDisplay.climate.pet_monthly
			const { windSpeed } = windVectors
			for (let r = 0; r < N; r++) {
				if (!worldForDisplay.isLand?.[r]) {
					rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
					rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
					rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
					continue
				}
				const meanT = monthlyTemp
					? monthlyTemp[offset + r]
					: worldForDisplay.climate.temperature_avg[r]
				const dtr = monthlyDtr
					? (monthlyDtr[offset + r] ?? worldForDisplay.dtr_annual[r])
					: worldForDisplay.dtr_annual[r]
				let annualAridity: number | undefined
				if (aet && pet) {
					let aetSum = 0
					let petSum = 0
					for (let m = 0; m < 12; m++) {
						aetSum += aet[m * N + r]
						petSum += pet[m * N + r]
					}
					annualAridity = petSum > 0 ? aetSum / petSum : 1
				}
				const rh = relativeHumidityFromTempRange(
					meanT,
					dtr,
					annualAridity,
					worldForDisplay.rainfall?.annual[r],
				)
				const [cr, cg, cb] = miseryColor(
					apparentTemperatureC(meanT, rh, windSpeed[r]),
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}
		return computeRegionColors(
			worldForDisplay,
			colorMode,
			nationMode,
			populationMode,
			temperatureMonth,
			rainfallMonth,
			dtrMonth,
			currentMonth,
			viewMode,
			showElevation,
			undefined,
			selectedHistoryView?.activeWars,
			selectedNationId,
			selectedHistoryView?.relationAt ?? null,
			dangerSubMode,
		)
	}, [
		colorMode,
		nationMode,
		populationMode,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		viewMode,
		showElevation,
		currentMonth,
		selectedHistoryView,
		worldForDisplay,
		selectedNationId,
		windVectors,
		dangerSubMode,
	])

	const occupationOverlay = useMemo(() => {
		return buildPoliticalOccupationOverlay({
			regionProvince: worldForDisplay?.provinces?.regionProvince,
			assignment: worldForDisplay?.nations?.assignment,
			activeWars: selectedHistoryView?.activeWars,
			getNationColorRgb,
		})
	}, [selectedHistoryView, getNationColorRgb, worldForDisplay])

	const cultureBlendOverlay = useMemo(() => {
		if (colorMode !== "population") return null
		const world = worldForDisplay
		if (!world?.cultures) return null

		const blendSecondary = selectedHistoryView?.cultureBlendSecondary
		const blendWeight = selectedHistoryView?.cultureBlendWeight
		const cultureAssignment = world.cultures.assignment

		let getOverlayColor:
			| ((
					sec: number,
					prim: number,
			  ) => readonly [number, number, number] | null)
			| null = null

		if (populationMode === "culture") {
			const colors = world.cultures.colors
			getOverlayColor = (sec) =>
				[colors[3 * sec], colors[3 * sec + 1], colors[3 * sec + 2]] as const
		} else if (populationMode === "heritage" && world.heritages) {
			const { assignment: cultureToHeritage, colors } = world.heritages
			getOverlayColor = (sec, prim) => {
				const secH = cultureToHeritage[sec] ?? -1
				if (secH < 0 || secH === (cultureToHeritage[prim] ?? -1)) return null
				return [
					colors[3 * secH],
					colors[3 * secH + 1],
					colors[3 * secH + 2],
				] as const
			}
		} else if (populationMode === "faith" && world.faiths) {
			const { assignment: cultureToFaith, colors } = world.faiths
			getOverlayColor = (sec, prim) => {
				const secF = cultureToFaith[sec] ?? -1
				if (secF < 0 || secF === (cultureToFaith[prim] ?? -1)) return null
				return [
					colors[3 * secF],
					colors[3 * secF + 1],
					colors[3 * secF + 2],
				] as const
			}
		} else if (
			populationMode === "religion" &&
			world.religions &&
			world.faiths
		) {
			const { assignment: faithToReligion, colors } = world.religions
			const { assignment: cultureToFaith } = world.faiths
			getOverlayColor = (sec, prim) => {
				const secF = cultureToFaith[sec] ?? -1
				const primF = cultureToFaith[prim] ?? -1
				const secR = secF >= 0 ? (faithToReligion[secF] ?? -1) : -1
				const primR = primF >= 0 ? (faithToReligion[primF] ?? -1) : -1
				if (secR < 0 || secR === primR) return null
				return [
					colors[3 * secR],
					colors[3 * secR + 1],
					colors[3 * secR + 2],
				] as const
			}
		}

		if (!getOverlayColor) return null
		return buildCultureBlendOverlay({
			regionProvince: world.provinces?.regionProvince,
			cultureBlendSecondary: blendSecondary,
			cultureBlendWeight: blendWeight,
			cultureAssignment,
			getOverlayColor,
		})
	}, [colorMode, populationMode, worldForDisplay, selectedHistoryView])

	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (!worldForDisplay) {
			scene.updateWorld(null)
			scene.setOccupationOverlay(null)
			lastWorldRef.current = null
			return
		}
		scene.setDisplayColors(colorMode, regionColors)
		if (lastWorldRef.current !== worldForDisplay) {
			scene.updateWorld(worldForDisplay)
			lastWorldRef.current = worldForDisplay
		}
		scene.setOccupationOverlay(
			colorMode === "nations" && nationMode === "borders"
				? occupationOverlay
				: colorMode === "population" &&
						["culture", "heritage", "faith", "religion"].includes(
							populationMode,
						)
					? cultureBlendOverlay
					: null,
		)
	}, [
		colorMode,
		nationMode,
		populationMode,
		occupationOverlay,
		cultureBlendOverlay,
		regionColors,
		worldForDisplay,
	])

	const thermalEquator = useMemo(() => {
		if (!world?.climate) return null
		const N = world.mesh.numRegions
		const temps =
			resolvedClimateMonth === 0
				? world.climate.temperature_avg
				: world.climate.temperature_monthly.subarray(
						(resolvedClimateMonth - 1) * N,
						resolvedClimateMonth * N,
					)
		return computeThermalEquatorLine(world.mesh, temps)
	}, [resolvedClimateMonth, world])

	useEffect(() => {
		sceneRef.current?.setThermalEquator(
			showThermalEquator ? thermalEquator : null,
		)
	}, [thermalEquator, showThermalEquator])

	const windGrid = useMemo(() => {
		if (!windVectors || !world) return null
		return computeWindGrid(
			world.mesh,
			windVectors.windU,
			windVectors.windV,
			windVectors.windSpeed,
		)
	}, [windVectors, world])

	const oceanCurrentGrid = useMemo(() => {
		if (!world?.oceanCurrents || !showOceanCurrents) return null
		const N = world.mesh.numRegions
		const monthlyWarmth = world.oceanCurrents.oceanWarmthMonthly
		const warmth =
			monthlyWarmth && currentMonth > 0
				? monthlyWarmth.subarray((currentMonth - 1) * N, currentMonth * N)
				: world.oceanCurrents.oceanWarmth
		const { latDeg, lonDeg, regionBin } = getClimateGeometry(world.mesh)
		if (world.params.tidallyLocked) {
			return buildLockedOceanCurrentGrid(
				world.mesh,
				warmth,
				world.isLand,
				latDeg,
				lonDeg,
				world.params,
				currentMonth,
			)
		}
		return buildOceanCurrentGrid(
			world.mesh,
			warmth,
			world.isLand,
			latDeg,
			lonDeg,
			isRetrogradeObliquity(world.params.obliquity),
			undefined,
			regionBin,
			world.params.hoursPerDay,
			world.params.planetRadiusKm,
		)
	}, [world, showOceanCurrents, currentMonth])

	// Particles replace the static arrow overlay — keep arrows cleared
	useEffect(() => {
		sceneRef.current?.setWindArrows(null)
	}, [])

	useEffect(() => {
		sceneRef.current?.setRivers(
			showRivers && world?.rivers ? world.rivers : null,
		)
	}, [world, showRivers])
	useEffect(() => {
		sceneRef.current?.setRiversVisible(showRivers)
	}, [showRivers])

	// --- Sun & lighting ---
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		scene.setFullAmbient(true)
		if (tidallyLocked) {
			// Sun at substellar point = antistellar + 180°
			const subLonDeg = (antistellarLon + 180) % 360
			const effectiveTime = (0.5 + subLonDeg / 360) * hoursPerDay
			scene.setSunPosition(
				0,
				0,
				((effectiveTime % hoursPerDay) + hoursPerDay) % hoursPerDay,
				hoursPerDay,
			)
		} else {
			scene.setSunPosition(
				displayMonth,
				obliquity,
				hoursPerDay / 2,
				hoursPerDay,
			)
		}
	}, [displayMonth, obliquity, hoursPerDay, tidallyLocked, antistellarLon])

	// --- Measure click handler ---
	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setClickHandler((info) => {
			if (
				!canHandlePlanetClick(measureMode, {
					hasWorld: !!worldForDisplay,
					hasProvinces: !!worldForDisplay?.provinces,
					hasNationModel: !!nationModel,
				})
			) {
				return
			}

			// Pathfinding mode
			if (measureMode === "pathfinding") {
				const p = pathfindingRef.current
				if (p.start === null || p.end !== null) {
					p.start = info.region
					p.end = null
					setPathfindingResult(null)
					const r_xyz = worldForDisplay?.mesh?.r_xyz
					const startXYZ: [number, number, number] | null = r_xyz
						? [
								r_xyz[info.region * 3],
								r_xyz[info.region * 3 + 1],
								r_xyz[info.region * 3 + 2],
							]
						: null
					sceneRef.current?.setPathfindingOverlay(null, startXYZ, null)
				} else {
					p.end = info.region
					// Send pathfinding request to worker
					if (workerRef.current) {
						workerRef.current.postMessage({
							type: "pathfind",
							startRegion: p.start,
							endRegion: info.region,
							allowLand: pathfindingLand,
							allowSea: pathfindingSea,
							network: worldForDisplay.network ?? null,
						})
					}
				}
				return
			}

			const province =
				worldForDisplay.provinces.regionProvince[info.region] ?? -1
			const nation =
				province >= 0 ? (nationModel.assignment[province] ?? -1) : -1

			if (measureMode === "off") {
				setSelectedNationId(nation >= 0 ? nation : null)
				if (nation >= 0) setDetailsDrawerOpen(true)
				return
			}

			const m = measureRef.current
			if (m.start === null || m.end !== null) {
				m.start = info.region
				m.end = null
				setMeasureStart(info.region)
				setMeasureEnd(null)
			} else {
				m.end = info.region
				setMeasureEnd(info.region)
			}
		})
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (measureRef.current.start !== null) {
					measureRef.current = { start: null, end: null }
					setMeasureStart(null)
					setMeasureEnd(null)
					setMeasureLabelPos(null)
					sceneRef.current?.setMeasureLine(null, null)
				} else if (pathfindingRef.current.start !== null) {
					pathfindingRef.current = { start: null, end: null }
					setPathfindingResult(null)
					sceneRef.current?.setPathfindingOverlay(null, null, null)
				} else {
					setMeasureMode("off")
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [
		nationModel,
		measureMode,
		pathfindingLand,
		pathfindingSea,
		worldForDisplay,
		setMeasureMode,
	])

	const selectedNation = useMemo(() => {
		return buildSelectedNationDetails({
			selectedNationId,
			selectedTimeMs,
			world: worldForDisplay,
			nationModel,
			selectedHistoryView,
			getNationColor,
			getNationName,
			getLeaderName,
			getDynastyName,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})
	}, [
		selectedHistoryView,
		nationModel,
		getNationColor,
		getNationName,
		getLeaderName,
		getDynastyName,
		getCultureName,
		getHeritageName,
		getFaithName,
		getReligionName,
		selectedNationId,
		selectedTimeMs,
		worldForDisplay,
	])
	const handleDrawerNationClick = useMemo(
		() =>
			createDrawerNationClickHandler({
				openDetailsDrawer: () => setDetailsDrawerOpen(true),
				focusOnNation: (nationId) => sceneRef.current?.focusOnNation(nationId),
			}),
		[],
	)
	const handleProvinceClick = useCallback((provinceId: number) => {
		sceneRef.current?.focusOnProvince(provinceId)
	}, [])

	const nationHistory = useMemo(() => {
		return buildNationHistory({
			selectedNationId,
			historyQuery: currentHistoryQuery,
			selectedTimeMs,
			simStartTimeMs,
			simTimeMs,
			world: worldForDisplay,
		})
	}, [
		selectedNationId,
		currentHistoryQuery,
		selectedTimeMs,
		simStartTimeMs,
		simTimeMs,
		worldForDisplay,
	])

	const windowedEvents = useMemo(() => {
		return buildWindowedNationEvents({
			selectedNationId,
			historyQuery: currentHistoryQuery,
			nationHistory,
		})
	}, [selectedNationId, currentHistoryQuery, nationHistory])

	const allPastEvents = useMemo(() => {
		if (!currentHistoryQuery) return undefined
		return currentHistoryQuery.getEventsUntil(selectedTimeMs)
	}, [currentHistoryQuery, selectedTimeMs])

	const nationSizeDistribution = useMemo(
		() => buildNationSizeDistribution(nationProvinceCounts),
		[nationProvinceCounts],
	)

	const governmentDistribution = useMemo(() => {
		// Indexed by government type (aligns with GOVERNMENT_TYPES / region-colors).
		const GOV_COLORS = [
			"rgb(204, 143, 71)", // 0 chiefdom
			"rgb(140, 89, 36)", // 1 tribal monarchy
			"rgb(237, 194, 128)", // 2 tribal federation
			"rgb(112, 61, 28)", // 3 native council
			"rgb(107, 138, 184)", // 4 feudal monarchy
			"rgb(140, 199, 242)", // 5 elective monarchy
			"rgb(15, 41, 112)", // 6 absolute monarchy
			"rgb(33, 102, 217)", // 7 constitutional monarchy
			"rgb(26, 143, 117)", // 8 merchant republic
			"rgb(28, 92, 46)", // 9 noble republic
			"rgb(163, 204, 61)", // 10 city-state confederation
			"rgb(61, 163, 87)", // 11 presidential republic
			"rgb(122, 214, 117)", // 12 parliamentary republic
			"rgb(133, 61, 179)", // 13 theocracy
			"rgb(71, 28, 117)", // 14 monastic state
			"rgb(194, 143, 230)", // 15 prince-bishopric
			"rgb(209, 46, 148)", // 16 imperial cult
			"rgb(189, 36, 36)", // 17 socialist state
			"rgb(112, 117, 61)", // 18 military junta
			"rgb(230, 84, 61)", // 19 trading company
			"rgb(245, 140, 128)", // 20 settler colony
		]
		const counts = new Array(GOVERNMENT_TYPES.length).fill(0)
		const govType = worldForDisplay?.nations?.governmentType
		if (govType && nationModel) {
			for (const nationId of nationModel.counts.keys()) {
				const t = govType[nationId] ?? 0
				if (t >= 0 && t < counts.length) counts[t]++
			}
		}
		return GOVERNMENT_TYPES.map((key, i) => ({
			label: GOVERNMENT_TYPE_LABELS[key],
			count: counts[i] ?? 0,
			color: GOV_COLORS[i] ?? "rgb(148, 163, 184)",
		}))
	}, [worldForDisplay?.nations?.governmentType, nationModel])

	const conflictDistribution = useMemo(
		() => buildConflictDistribution(selectedHistoryView),
		[selectedHistoryView],
	)

	const nationAdjacency = useMemo(
		() =>
			colorMode === "nations" && nationModel && worldForDisplay
				? buildNationAdjacency(nationModel.assignment, worldForDisplay)
				: null,
		[colorMode, nationModel, worldForDisplay],
	)

	const relationDistribution = useMemo(
		() =>
			buildRelationDistribution(
				selectedHistoryView,
				nationModel,
				nationAdjacency,
			),
		[selectedHistoryView, nationModel, nationAdjacency],
	)

	const climateDistribution = useMemo(
		() =>
			buildDistribution(
				CLIMATE_LABELS,
				world?.climateZones,
				(index) => rgbToCss(climateZoneColor(index)),
				new Set([0]),
			),
		[world?.climateZones],
	)

	const vegetationDistribution = useMemo(
		() =>
			buildDistribution(
				BIOME_LABELS,
				world?.vegetation,
				(index) => rgbToCss(vegetationColor(index)),
				new Set([0]),
			),
		[world?.vegetation],
	)

	const topographyDistribution = useMemo(
		() =>
			buildDistribution(
				OROGEN_TOPOGRAPHY_LABELS,
				world?.topography,
				(index) => {
					const color = getTopographyColor(index)
					return color ? rgbToCss(color) : "rgb(148, 163, 184)"
				},
				new Set([TOPO_LAKE, TOPO_OCEAN]),
			),
		[world?.topography],
	)

	const tradeGoodsDistribution = useMemo(() => {
		const material = world?.tradeGoods
		if (!material) return []
		const counts = new Array<number>(TRADE_GOOD_LABELS.length).fill(0)
		for (let i = 0; i < material.length; i++) {
			const idx = material[i]!
			if (idx > 0 && idx < counts.length) counts[idx]++
		}
		return TRADE_GOOD_LABELS.flatMap((label, index) => {
			if (index === 0 || counts[index] === 0) return []
			const [r, g, b] = tradeGoodColor(index)
			return [
				{
					label: tradeGoodDisplayName(label),
					count: counts[index]!,
					color: rgbToCss([r!, g!, b!]),
				},
			]
		}).sort((a, b) => b.count - a.count)
	}, [world?.tradeGoods])

	const measureDistanceKm = useMemo(() => {
		if (measureStart === null || measureEnd === null || !world) return null
		const r = world.mesh.r_xyz
		const s = [
			r[measureStart * 3],
			r[measureStart * 3 + 1],
			r[measureStart * 3 + 2],
		] as [number, number, number]
		const e = [
			r[measureEnd * 3],
			r[measureEnd * 3 + 1],
			r[measureEnd * 3 + 2],
		] as [number, number, number]
		const dot = s[0] * e[0] + s[1] * e[1] + s[2] * e[2]
		return (
			Math.acos(Math.max(-1, Math.min(1, dot))) * world.params.planetRadiusKm
		)
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		if (!sceneRef.current || !world) return
		if (measureStart === null) {
			sceneRef.current.setMeasureLine(null, null)
			setMeasureLabelPos(null)
			return
		}
		const r = world.mesh.r_xyz
		const s = [
			r[measureStart * 3],
			r[measureStart * 3 + 1],
			r[measureStart * 3 + 2],
		] as [number, number, number]
		const e =
			measureEnd === null
				? null
				: ([
						r[measureEnd * 3],
						r[measureEnd * 3 + 1],
						r[measureEnd * 3 + 2],
					] as [number, number, number])
		sceneRef.current.setMeasureLine(s, e)
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		if (
			measureStart === null ||
			measureEnd === null ||
			!world ||
			!sceneRef.current
		) {
			setMeasureLabelPos(null)
			return
		}
		const r = world.mesh.r_xyz
		const s = [
			r[measureStart * 3],
			r[measureStart * 3 + 1],
			r[measureStart * 3 + 2],
		] as [number, number, number]
		const e = [
			r[measureEnd * 3],
			r[measureEnd * 3 + 1],
			r[measureEnd * 3 + 2],
		] as [number, number, number]
		const mid: [number, number, number] = [
			(s[0] + e[0]) / 2,
			(s[1] + e[1]) / 2,
			(s[2] + e[2]) / 2,
		]
		let rafId = 0
		function tick() {
			setMeasureLabelPos(sceneRef.current?.projectToScreen(mid) ?? null)
			rafId = requestAnimationFrame(tick)
		}
		rafId = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(rafId)
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		sceneRef.current?.setHoveredRegion(hoverInfo?.region ?? null)
	}, [hoverInfo])
	useEffect(() => {
		sceneRef.current?.setNationBordersVisible(showNationBorders)
	}, [showNationBorders])
	useEffect(() => {
		sceneRef.current?.setLandNationBordersVisible(showLandBorders)
	}, [showLandBorders])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showNationHierarchy && worldForDisplay && selectedNationId !== null) {
			scene.setHierarchyOverlay(worldForDisplay, selectedNationId)
		} else {
			scene.setHierarchyOverlay(null, -1)
		}
	}, [showNationHierarchy, worldForDisplay, selectedNationId])
	useEffect(() => {
		sceneRef.current?.setViewMode(viewMode)
	}, [viewMode])
	useEffect(() => {
		sceneRef.current?.setMapProjectionLatitude(mapProjectionLatitude)
	}, [mapProjectionLatitude])
	useEffect(() => {
		sceneRef.current?.setMapCenterLongitude(exportCenterLongitude)
		sceneRef.current?.commitMapCenterLongitude()
	}, [exportCenterLongitude])
	useEffect(() => {
		setDraftMapProjectionLatitude(mapProjectionLatitude)
	}, [mapProjectionLatitude])
	useEffect(() => {
		sceneRef.current?.setWireframeVisible(showWireframe)
	}, [showWireframe])
	useEffect(() => {
		sceneRef.current?.setGridVisible(showGrid)
	}, [showGrid])
	useEffect(() => {
		sceneRef.current?.setGridSpacing(gridSpacing)
	}, [gridSpacing])
	useEffect(() => {
		sceneRef.current?.setSettlementsVisible(showSettlements)
	}, [showSettlements])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showSettlements && worldForDisplay?.urbanPopulation) {
			scene.setSettlements(worldForDisplay.urbanPopulation)
		} else {
			scene.setSettlements(null)
		}
	}, [showSettlements, worldForDisplay])
	useEffect(() => {
		sceneRef.current?.setInfrastructureVisible(showRoads)
	}, [showRoads])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showRoads && worldForDisplay?.network) {
			scene.setInfrastructure(worldForDisplay.network)
		} else {
			scene.setInfrastructure(null)
		}
	}, [showRoads, worldForDisplay])

	// --- Labels ---
	useEffect(() => {
		sceneRef.current?.setLabelMode(labelMode)
	}, [labelMode])
	useEffect(() => {
		sceneRef.current?.setNationNames(nationLabelsArray)
	}, [nationLabelsArray])
	useEffect(() => {
		sceneRef.current?.setDynastyNames(dynastyLabelsArray)
	}, [dynastyLabelsArray])
	useEffect(() => {
		sceneRef.current?.setSettlementNames(settlementLabelsArray)
	}, [settlementLabelsArray])
	useEffect(() => {
		sceneRef.current?.setCultureNames(cultureLabelsArray)
	}, [cultureLabelsArray])
	useEffect(() => {
		sceneRef.current?.setHeritageNames(heritageLabelsArray)
	}, [heritageLabelsArray])
	useEffect(() => {
		sceneRef.current?.setFaithNames(faithLabelsArray)
	}, [faithLabelsArray])
	useEffect(() => {
		sceneRef.current?.setReligionNames(religionLabelsArray)
	}, [religionLabelsArray])

	// --- Elevation ---
	useEffect(() => {
		sceneRef.current?.setElevationVisible(showElevation)
	}, [showElevation])

	// --- Generation callbacks ---
	const generationCallbacks: GenerationCallbacks = useMemo(
		() => ({
			setGenerating,
			setGenerationProgress,
			setGenerationLabel,
			setSeed,
			pushRecentCode: (nextCode: string) => {
				setRecentCodes((current) =>
					[
						nextCode,
						...current.filter((codeValue) => codeValue !== nextCode),
					].slice(0, MAX_RECENT_CODES),
				)
			},
			setPlanetCode,
			setPlanetCodeInput,
			setWorld,
			workerRef,
			onGenerationFrame: (frame) => {
				setSimTimeMs(frame.timeMs)
				setSelectedTimeMs(frame.timeMs)
				setLiveFrame(frame)
			},
			onGenerationComplete: () => {
				setGenerationPanelOpen(false)
				setTimeout(() => setDetailsDrawerOpen(true), 400)
			},
			onSimProgress: (timeMs, frame) => {
				setSimTimeMs(timeMs)
				setSelectedTimeMs(timeMs)
				setLiveFrame(frame)
			},
			onSimComplete: (timeMs, timelines, events) => {
				setSimPlaying(false)
				setSimTimeMs(timeMs)
				setSelectedTimeMs(timeMs)
				setTimelineBundle({ timelines, events })
				setLiveFrame(null)
			},
			onPathfindResult: (result) => {
				if (result.reachable) {
					const pathArray = Array.from(result.pathRegions)
					setPathfindingResult({
						distanceKm: result.distanceKm,
						landKm: result.landKm,
						seaKm: result.seaKm,
						travelDays: result.travelDays,
					})
					// Render path overlay
					if (pathArray.length >= 2 && lastWorldRef.current) {
						const r = lastWorldRef.current.mesh.r_xyz
						const startXYZ: [number, number, number] = [
							r[pathArray[0] * 3],
							r[pathArray[0] * 3 + 1],
							r[pathArray[0] * 3 + 2],
						]
						const endXYZ: [number, number, number] = [
							r[pathArray[pathArray.length - 1] * 3],
							r[pathArray[pathArray.length - 1] * 3 + 1],
							r[pathArray[pathArray.length - 1] * 3 + 2],
						]
						sceneRef.current?.setPathfindingOverlay(pathArray, startXYZ, endXYZ)
					}
				} else {
					setPathfindingResult(null)
					sceneRef.current?.setPathfindingOverlay(null, null, null)
				}
			},
		}),
		[],
	)

	const currentParams = useMemo<GenerationParams>(
		() => ({
			seed,
			numPoints,
			numPlates,
			landDistribution,
			continentSizeVariety,
			era,
			landCoverage,
			planetRadiusKm,
			obliquity,
			eccentricity,
			perihelion,
			sunTempFactor,
			insolationFactor,
			daysPerYear,
			hoursPerDay,
			tidallyLocked,
			antistellarLon,
			jitter,
			roughness,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			volcanism,
			craters,
			maxElevation,
			pressure,
			tidalStrength,
		}),
		[
			seed,
			numPoints,
			numPlates,
			landDistribution,
			continentSizeVariety,
			era,
			landCoverage,
			planetRadiusKm,
			obliquity,
			eccentricity,
			perihelion,
			sunTempFactor,
			insolationFactor,
			daysPerYear,
			hoursPerDay,
			tidallyLocked,
			antistellarLon,
			jitter,
			roughness,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			volcanism,
			craters,
			maxElevation,
			pressure,
			tidalStrength,
		],
	)
	const derivedPlanetCode = useMemo(
		() => encodePlanetCode(seed, currentParams),
		[currentParams, seed],
	)

	useEffect(() => {
		setPlanetCode(derivedPlanetCode)
		if (!codeInputDirty) {
			setPlanetCodeInput(derivedPlanetCode)
			setCodeError(false)
		}
	}, [codeInputDirty, derivedPlanetCode])

	const handleGenerateWorld = useCallback(
		(overrideSeed: number, overrides?: Partial<GenerationParams>) => {
			// Reset simulation state
			setSimPlaying(false)
			setSimTimeMs(simStartTimeMs)
			setSelectedTimeMs(simStartTimeMs)
			setTimelineBundle(undefined)
			setLiveFrame(null)
			generateWorld(overrideSeed, overrides, currentParams, generationCallbacks)
		},
		[currentParams, generationCallbacks, simStartTimeMs],
	)

	const resolveSeedInput = useCallback(() => {
		const trimmed = planetCodeInput.trim()
		if (!trimmed) return null
		return decodePlanetCode(trimmed)
	}, [planetCodeInput])
	const handleGenerate = useCallback(() => {
		const decoded = resolveSeedInput()
		if (planetCodeInput.trim()) {
			if (!decoded) {
				setCodeError(true)
				window.setTimeout(() => setCodeError(false), 1500)
				return
			}
			setCodeError(false)
			handleGenerateWorld(decoded.seed, decoded as Partial<GenerationParams>)
			return
		}
		handleGenerateWorld(seed)
	}, [handleGenerateWorld, planetCodeInput, resolveSeedInput, seed])

	const handleCloseClimatePreview = useCallback(() => {
		setShowClimatePreview(false)
	}, [])

	const handleToggleClimatePreview = useCallback(() => {
		if (showClimatePreview) {
			handleCloseClimatePreview()
			return
		}
		setShowClimatePreview(true)
	}, [handleCloseClimatePreview, showClimatePreview])

	const setters = useMemo(
		() => ({
			setNumPoints,
			setJitter,
			setNumPlates,
			setLandDistribution,
			setContinentSizeVariety,
			setLandCoverage,
			setRoughness,
			setPlanetRadiusKm,
			setObliquity,
			setEccentricity,
			setPerihelion,
			setSunTempFactor,
			setInsolationFactor,
			setDaysPerYear,
			setHoursPerDay,
			setTidallyLocked,
			setAntistellarLon,
			setPressure,
			setTidalStrength,
			setTerrainWarp,
			setSmoothing,
			setHydraulicErosion,
			setThermalErosion,
			setRidgeSharpening,
			setGlacialErosion,
			setSeaLevel,
			setVolcanism,
			setCraters,
			setMaxElevation,
			setEra,
		}),
		[],
	)
	const applyDecodedCode = useCallback(
		(decoded: NonNullable<ReturnType<typeof decodePlanetCode>>) => {
			setSeed(decoded.seed)
			setters.setNumPoints(decoded.numPoints)
			setters.setJitter(decoded.jitter)
			setters.setNumPlates(decoded.numPlates)
			setters.setLandDistribution(decoded.landDistribution)
			setters.setContinentSizeVariety(decoded.continentSizeVariety)
			setters.setLandCoverage(decoded.landCoverage)
			setters.setRoughness(decoded.roughness)
			setters.setPlanetRadiusKm(decoded.planetRadiusKm)
			setters.setObliquity(decoded.obliquity)
			setters.setEccentricity(decoded.eccentricity)
			setters.setPerihelion(decoded.perihelion)
			setters.setSunTempFactor(decoded.sunTempFactor)
			setters.setInsolationFactor(decoded.insolationFactor)
			setters.setDaysPerYear(decoded.daysPerYear)
			setters.setHoursPerDay(decoded.hoursPerDay)
			setters.setTidallyLocked(decoded.tidallyLocked)
			setters.setAntistellarLon(decoded.antistellarLon)
			setters.setPressure(decoded.pressure)
			setters.setTidalStrength(decoded.tidalStrength)
			setters.setTerrainWarp(decoded.terrainWarp)
			setters.setSmoothing(decoded.smoothing)
			setters.setHydraulicErosion(decoded.hydraulicErosion)
			setters.setThermalErosion(decoded.thermalErosion)
			setters.setRidgeSharpening(decoded.ridgeSharpening)
			setters.setGlacialErosion(decoded.glacialErosion)
			setters.setSeaLevel(decoded.seaLevel)
			setters.setVolcanism(decoded.volcanism)
			setters.setCraters(decoded.craters ?? 0)
			setters.setMaxElevation(decoded.maxElevation)
			setters.setEra(decoded.era)
		},
		[setters],
	)
	const handleApplyCode = useCallback(() => {
		const trimmed = planetCodeInput.trim()
		if (!trimmed) {
			setCodeInputDirty(false)
			setCodeError(false)
			return
		}
		const decoded = decodePlanetCode(trimmed)
		if (!decoded) {
			setCodeError(true)
			return
		}
		setCodeError(false)
		setCodeInputDirty(false)
		applyDecodedCode(decoded)
	}, [applyDecodedCode, planetCodeInput])

	const handleCodeInputChange = useCallback((nextCode: string) => {
		setPlanetCodeInput(nextCode)
		setCodeInputDirty(true)
		setCodeError(false)
	}, [])

	const handleImportHeightmap = useCallback(
		(grayscale: Uint8Array, imageWidth: number, imageHeight: number) => {
			const importParams = {
				seed,
				numPoints,
				jitter,
				planetRadiusKm,
				obliquity,
				eccentricity,
				perihelion,
				sunTempFactor,
				insolationFactor,
				daysPerYear,
				hoursPerDay,
				pressure,
				tidallyLocked,
				antistellarLon,
				terrainWarp,
				smoothing,
				hydraulicErosion,
				thermalErosion,
				ridgeSharpening,
				glacialErosion,
				seaLevel,
				volcanism,
				maxElevation,
				craters,
			}
			importHeightmap(
				grayscale,
				imageWidth,
				imageHeight,
				importParams,
				generationCallbacks,
			)
		},
		[
			seed,
			numPoints,
			jitter,
			planetRadiusKm,
			obliquity,
			eccentricity,
			perihelion,
			sunTempFactor,
			daysPerYear,
			hoursPerDay,
			tidallyLocked,
			antistellarLon,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			volcanism,
			craters,
			pressure,
			generationCallbacks,
			insolationFactor,
			maxElevation,
		],
	)

	const handleFileImport = useCallback(
		async (file: File) => {
			try {
				const { grayscale, width, height } = await loadImageAsGrayscale(file)
				handleImportHeightmap(grayscale, width, height)
			} catch (err) {
				console.error("Failed to load heightmap:", err)
				setGenerationLabel("Failed to load image")
			}
		},
		[handleImportHeightmap],
	)

	const handleEarthImport = useCallback(async () => {
		try {
			const { grayscale, width, height } =
				await loadImageAsGrayscale("/earth.png")
			handleImportHeightmap(grayscale, width, height)
		} catch (err) {
			console.error("Failed to load Earth heightmap:", err)
			setGenerationLabel("Failed to load Earth heightmap")
		}
	}, [handleImportHeightmap])

	const handleResetDefaults = useCallback(
		() => resetWorldDefaults(setters),
		[setters],
	)
	const handleRandomizeCode = useCallback(() => {
		const nextSeed = makeRandomSeed()
		setSeed(nextSeed)
		setCodeInputDirty(false)
		setCodeError(false)
	}, [makeRandomSeed])

	const handleSelectRecentCode = useCallback(
		(nextCode: string) => {
			setPlanetCodeInput(nextCode)
			setCodeInputDirty(false)
			setCodeError(false)
			const decoded = decodePlanetCode(nextCode)
			if (decoded) applyDecodedCode(decoded)
		},
		[applyDecodedCode],
	)

	const handleCopyCode = useCallback(async () => {
		if (!planetCode) return
		try {
			await navigator.clipboard.writeText(planetCode)
			setCodeCopied(true)
			window.setTimeout(() => setCodeCopied(false), 1200)
		} catch (err) {
			console.error("Failed to copy code:", err)
		}
	}, [planetCode])

	const handleExportMap = useCallback(async () => {
		if (!worldForDisplay || !sceneRef.current || exportProgress) return
		const width = Number(exportWidthPreset)
		setExportError(null)
		setExportProgress({ percent: 0, label: "Preparing export" })
		try {
			const blob = await sceneRef.current.exportMapPng({
				width,
				centerLongitudeDeg: exportCenterLongitude,
				onProgress: (percent, label) => {
					setExportProgress({ percent, label })
				},
			})
			const objectUrl = window.URL.createObjectURL(blob)
			const link = document.createElement("a")
			link.href = objectUrl
			link.download = buildMapExportFilename(planetCode, width)
			document.body.appendChild(link)
			link.click()
			link.remove()
			window.URL.revokeObjectURL(objectUrl)
			setExportProgress(null)
		} catch (error) {
			console.error("Failed to export map PNG:", error)
			setExportError(error instanceof Error ? error.message : "Export failed")
			setExportProgress(null)
		}
	}, [
		exportCenterLongitude,
		exportProgress,
		exportWidthPreset,
		planetCode,
		worldForDisplay,
	])

	const handleStartSimulation = useCallback(() => {
		setSimPlaying(true)
		setTimelineBundle(null)
		startSimulation(workerRef)
	}, [])

	const handlePauseSimulation = useCallback(() => {
		setSimPlaying(false)
		pauseSimulation(workerRef)
	}, [])

	const handleToggleSimulationPlayback = useCallback(() => {
		if (simPlaying) {
			handlePauseSimulation()
			return
		}
		if (selectedTimeMs !== simTimeMs) {
			setSelectedTimeMs(simTimeMs)
		}
		handleStartSimulation()
	}, [
		handlePauseSimulation,
		handleStartSimulation,
		selectedTimeMs,
		simPlaying,
		simTimeMs,
	])

	const setAxialTilt = useCallback(
		(value: number) => {
			setObliquity(isRetrogradeObliquity(obliquity) ? 180 - value : value)
		},
		[obliquity],
	)
	const setAxialTiltDirection = useCallback(
		(value: number) => {
			const retrograde = value === 1
			const baseTilt = getEffectiveObliquityDeg(obliquity)
			setObliquity(retrograde ? 180 - baseTilt : baseTilt)
		},
		[obliquity],
	)

	// --- Slider definitions ---
	const planetSliders = buildPlanetSliders({
		planetRadiusKm,
		obliquity,
		eccentricity,
		perihelion,
		sunTempFactor,
		insolationFactor,
		daysPerYear,
		hoursPerDay,
		pressure,
		tidalStrength,
		landDistribution,
		landCoverage,
		tidallyLocked,
		antistellarLon,
		setPlanetRadiusKm,
		setObliquity: setAxialTilt,
		setEccentricity,
		setPerihelion,
		setSunTempFactor,
		setInsolationFactor,
		setDaysPerYear,
		setHoursPerDay,
		setPressure,
		setTidalStrength,
		setAxialTiltDirection,
		setLandDistribution,
		setLandCoverage,
		setAntistellarLon,
	})
	const terrainSliders = buildTerrainSliders({
		numPoints,
		jitter,
		numPlates,
		roughness,
		continentSizeVariety,
		terrainWarp,
		smoothing,
		hydraulicErosion,
		thermalErosion,
		ridgeSharpening,
		glacialErosion,
		seaLevel,
		craters,
		volcanism,
		maxElevation,
		setNumPoints,
		setJitter,
		setNumPlates,
		setRoughness,
		setContinentSizeVariety,
		setTerrainWarp,
		setSmoothing,
		setHydraulicErosion,
		setThermalErosion,
		setRidgeSharpening,
		setGlacialErosion,
		setSeaLevel,
		setCraters,
		setVolcanism,
		setMaxElevation,
		unitSystem,
	})

	// --- Planet stats ---
	const planetStats = useMemo(
		() =>
			computePlanetStats(
				world,
				{
					obliquity,
					eccentricity,
					perihelion,
					antistellarLon,
					sunTempFactor,
					daysPerYear,
					hoursPerDay,
					planetRadiusKm,
					pressure,
					tidallyLocked,
					seaLevel,
					maxElevation,
					avgWindSpeedMs: windStats?.avg ?? null,
					maxWindSpeedMs: windStats?.max ?? null,
				},
				unitSystem,
			),
		[
			daysPerYear,
			eccentricity,
			antistellarLon,
			perihelion,
			hoursPerDay,
			obliquity,
			planetRadiusKm,
			pressure,
			sunTempFactor,
			tidallyLocked,
			seaLevel,
			maxElevation,
			unitSystem,
			world,
			windStats,
		],
	)
	const generationPreview = useEbmPreview(
		buildGenerationPreviewConfig({
			tidallyLocked,
			obliquity,
			eccentricity,
			perihelion,
			antistellarLon,
			sunTempFactor,
			insolationFactor,
			hoursPerDay,
			daysPerYear,
			landCoverage,
			planetRadiusKm,
			pressure,
		}),
	)
	const lockedGenerationPreview = useLockedClimatePreview(
		buildGenerationPreviewConfig({
			tidallyLocked,
			obliquity,
			eccentricity,
			perihelion,
			antistellarLon,
			sunTempFactor,
			insolationFactor,
			hoursPerDay,
			daysPerYear,
			landCoverage,
			planetRadiusKm,
			pressure,
		}),
	)

	useEffect(() => {
		if (showClimatePreview) return
		requestAnimationFrame(() => {
			sceneRef.current?.resize()
		})
	}, [showClimatePreview])

	const exportBusy = exportProgress !== null
	const exportDisabled = !worldForDisplay || exportBusy

	// --- Render ---
	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{generationPanelOpen && (
				<GenerationPanel
					worldTab={worldTab}
					setWorldTab={setWorldTab}
					resetWorldDefaults={handleResetDefaults}
					tidallyLocked={tidallyLocked}
					setTidallyLocked={setTidallyLocked}
					setObliquity={setObliquity}
					planetSliders={planetSliders}
					terrainSliders={terrainSliders}
					era={era}
					setEra={setEra}
					planetCode={planetCode}
					codeInput={planetCodeInput}
					setCodeInput={handleCodeInputChange}
					onApplyCode={handleApplyCode}
					codeError={codeError}
					recentCodes={recentCodes}
					onSelectRecentCode={handleSelectRecentCode}
					onRandomizeCode={handleRandomizeCode}
					generating={generating}
					generationLabel={generationLabel}
					generationProgress={generationProgress}
					generationTimings={generationTimings}
					showClimatePreview={showClimatePreview}
					onToggleClimatePreview={handleToggleClimatePreview}
					handleGenerate={handleGenerate}
					handleFileImport={handleFileImport}
					handleEarthImport={handleEarthImport}
					onClose={() => setGenerationPanelOpen(false)}
				/>
			)}

			<div
				ref={viewportRef}
				className="flex-1 h-[56vh] xl:h-full relative overflow-hidden bg-[#050510]"
			>
				<canvas
					ref={canvasRef}
					className={`${getGenerationPreviewCanvasClassName(
						showClimatePreview,
						measureMode !== "off",
					)} ${measureMode === "pathfinding" ? "cursor-crosshair" : ""}`}
				/>
				<WindParticleCanvas
					windGrid={windGrid}
					projectToScreen={projectToScreen}
					getGlobeCameraDir={getGlobeCameraDir}
					visible={showWindArrows}
					viewMode={viewMode}
				/>
				<OceanCurrentParticleCanvas
					currentGrid={oceanCurrentGrid}
					projectToScreen={projectToScreen}
					getGlobeCameraDir={getGlobeCameraDir}
					visible={showOceanCurrents}
					viewMode={viewMode}
				/>

				{showClimatePreview && (
					<ClimatePreviewOverlay
						preview={
							tidallyLocked ? lockedGenerationPreview : generationPreview
						}
						tidallyLocked={tidallyLocked}
						activeTab={generationPreviewTab}
						unitSystem={unitSystem}
						onSelectTab={setGenerationPreviewTab}
						onClose={handleCloseClimatePreview}
					/>
				)}

				{!showClimatePreview && (
					<>
						{hoverInfo && hoverElevationKm !== null ? (
							<InfoPanel
								hoverInfo={hoverInfo}
								hoverElevationKm={hoverElevationKm}
								hoverTopography={hoverTopography}
								hoverCoordinates={hoverCoordinates}
								hoverTimezone={hoverTimezone}
								hoverLandmark={hoverLandmark}
								hoverIsLand={hoverIsLand}
								hoverTemperatureDelta={hoverTemperatureDelta}
								hoverRainfall={hoverRainfall}
								hoverDtr={hoverDtr}
								hoverHumidity={hoverHumidity}
								hoverMisery={hoverMisery}
								hoverClimateDisplay={hoverClimateDisplay}
								hoverIceSummary={hoverIceSummary}
								hoverBiome={hoverBiome}
								hoverProvince={hoverProvince}
								hoverNationId={hoverNationId}
								hoverOccupation={hoverOccupation}
								hoverOceanDist={hoverOceanDist}
								hoverDistCoast={hoverDistCoast}
								hoverDistCoastKm={hoverDistCoastKm}
								hoverHazards={hoverHazards}
								hoverHotspot={hoverHotspot}
								hoverRiver={hoverRiver}
								hoverTerrainFeature={hoverTerrainFeature}
								hoverOceanCurrents={hoverOceanCurrents}
								hoverWindSpeed={hoverWindSpeed}
								hoverWindDir={hoverWindDir}
								hoverWindMonthly={hoverWindMonthly}
								showWindArrows={showWindArrows}
								showRivers={showRivers}
								showGdd={showGdd}
								showGint={showGint}
								showPet={showPet}
								showAet={showAet}
								showOceanCurrentOverlay={showOceanCurrents}
								colorMode={colorMode}
								dangerSubMode={dangerSubMode}
								populationMode={populationMode}
								selectedTimeMs={selectedTimeMs}
								displayMonth={displayMonth}
								climateTimeMode={climateTimeMode}
								climateMonth={climateMonth}
								unitSystem={unitSystem}
								world={worldForDisplay}
								routes={worldForDisplay?.routes ?? null}
								hoverCardRef={hoverCardRef}
								getProvinceName={getProvinceName}
								getNationName={getNationName}
								getLeaderName={getLeaderName}
								getDynastyName={getDynastyName}
								getCultureName={getCultureName}
								getHeritageName={getHeritageName}
								getFaithName={getFaithName}
								getReligionName={getReligionName}
								getLandmarkName={getLandmarkName}
								getRiverName={getRiverName}
								hoverNationAdjOffset={
									colorMode === "nations"
										? (nationAdjacency?.adjOffset ?? null)
										: null
								}
								hoverNationAdjList={
									colorMode === "nations"
										? (nationAdjacency?.adjList ?? null)
										: null
								}
								hoverNationCounts={
									colorMode === "nations" ? nationProvinceCounts : null
								}
								relationAt={
									colorMode === "nations"
										? (selectedHistoryView?.relationAt ?? null)
										: null
								}
								detailsDrawerOpen={detailsDrawerOpen}
							/>
						) : null}

						<OverlayControls
							overlaysExpanded={overlaysExpanded}
							setOverlaysExpanded={setOverlaysExpanded}
							measureMode={measureMode}
							setMeasureMode={setMeasureMode}
							pathfindingLand={pathfindingLand}
							setPathfindingLand={setPathfindingLand}
							pathfindingSea={pathfindingSea}
							setPathfindingSea={setPathfindingSea}
							pathfindingResult={pathfindingResult}
							showWireframe={showWireframe}
							setShowWireframe={setShowWireframe}
							showRivers={showRivers}
							setShowRivers={setShowRivers}
							showThermalEquator={showThermalEquator}
							setShowThermalEquator={setShowThermalEquator}
							showWindArrows={showWindArrows}
							setShowWindArrows={setShowWindArrows}
							showGdd={showGdd}
							setShowGdd={setShowGdd}
							showGint={showGint}
							setShowGint={setShowGint}
							showPet={showPet}
							setShowPet={setShowPet}
							showAet={showAet}
							setShowAet={setShowAet}
							showOceanCurrents={showOceanCurrents}
							setShowOceanCurrents={setShowOceanCurrents}
							showGrid={showGrid}
							setShowGrid={setShowGrid}
							showNationBorders={showNationBorders}
							setShowNationBorders={setShowNationBorders}
							showLandBorders={showLandBorders}
							setShowLandBorders={setShowLandBorders}
							showNationHierarchy={showNationHierarchy}
							setShowNationHierarchy={setShowNationHierarchy}
							nationMode={nationMode}
							populationMode={populationMode}
							labelMode={labelMode}
							setLabelMode={setLabelMode}
							showElevation={showElevation}
							setShowElevation={setShowElevation}
							showSettlements={showSettlements}
							setShowSettlements={setShowSettlements}
							showRoads={showRoads}
							setShowRoads={setShowRoads}
							gridSpacing={gridSpacing}
							setGridSpacing={setGridSpacing}
							viewMode={viewMode}
							setViewMode={setViewMode}
							unitSystem={unitSystem}
							setUnitSystem={setUnitSystem}
							mapProjectionLatitude={mapProjectionLatitude}
							draftMapProjectionLatitude={draftMapProjectionLatitude}
							setDraftMapProjectionLatitude={setDraftMapProjectionLatitude}
							setMapProjectionLatitude={setMapProjectionLatitude}
							debugMapModes={debugMapModes}
							setDebugMapModes={setDebugMapModes}
							colorMode={colorMode}
							setColorMode={setColorMode}
							climateTimeMode={climateTimeMode}
							setClimateTimeMode={setClimateTimeMode}
							climateMonth={climateMonth}
							setClimateMonth={setClimateMonth}
							climateSubMode={climateSubMode}
							setClimateSubMode={setClimateSubMode}
							elevationSubMode={elevationSubMode}
							setElevationSubMode={setElevationSubMode}
							topographySubMode={topographySubMode}
							setTopographySubMode={setTopographySubMode}
							dangerSubMode={dangerSubMode}
							setDangerSubMode={setDangerSubMode}
							hasCycloneRisk={!!world?.cycloneRisk}
							hasTornadoRisk={!!world?.tornadoRisk}
							hasTidalRisk={!!world?.tidalRange}
							exportWidthPreset={exportWidthPreset}
							setExportWidthPreset={setExportWidthPreset}
							exportCenterLongitude={exportCenterLongitude}
							setExportCenterLongitude={setExportCenterLongitude}
							exportDisabled={exportDisabled}
							exportBusy={exportBusy}
							exportProgress={exportProgress}
							exportError={exportError}
							onExport={() => {
								void handleExportMap()
							}}
							canCopyCode={!!planetCode}
							codeCopied={codeCopied}
							onCopyCode={() => {
								void handleCopyCode()
							}}
							onReset={() => {
								setViewMode("globe")
								setUnitSystem("metric")
								setShowGrid(true)
								setGridSpacing(15)
								setShowWireframe(false)
								setShowRivers(false)
								setShowThermalEquator(false)
								setShowNationBorders(false)
								setShowNationHierarchy(false)
								setLabelMode({
									nations: false,
									dynasty: false,
									settlements: false,
								})
								setShowElevation(false)
								setShowSettlements(false)
								setShowRoads(false)
								setMeasureMode("off")
								setPathfindingLand(true)
								setPathfindingSea(true)
								setDebugMapModes(false)
								setExportCenterLongitude(0)
								setMapProjectionLatitude(0)
								setDraftMapProjectionLatitude(0)
							}}
							generationPanelOpen={generationPanelOpen}
							onToggleGenerationPanel={() => setGenerationPanelOpen(true)}
						/>

						{measureDistanceKm !== null && measureLabelPos && (
							<FloatingPanel
								interactive={false}
								padding="sm"
								className="pointer-events-none absolute z-20 px-2.5 py-1"
								style={{
									left: measureLabelPos[0],
									top: measureLabelPos[1] - 32,
									transform: "translateX(-50%)",
								}}
							>
								<span className="font-mono text-xs font-semibold">
									{formatDistance(measureDistanceKm, unitSystem, {
										under100Digits: 1,
										over100Digits: 0,
									})}
								</span>
							</FloatingPanel>
						)}

						{canSimulate && (
							<div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
								<div className="pointer-events-auto">
									<SimulationControls
										selectedTimeMs={selectedTimeMs}
										minTimeMs={simStartTimeMs}
										maxTimeMs={simTimeMs}
										onTimeChange={setSelectedTimeMs}
										floating={false}
										onPlayPause={handleToggleSimulationPlayback}
										simPlaying={simPlaying}
									/>
								</div>
							</div>
						)}
						<div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-1.5 pb-3 pointer-events-none">
							<div className="pointer-events-auto">
								<ModeBar
									colorMode={colorMode}
									setColorMode={setColorMode}
									geographyMode={geographyMode}
									setGeographyMode={setGeographyMode}
									nationMode={nationMode}
									setNationMode={setNationMode}
									populationMode={populationMode}
									setPopulationMode={setPopulationMode}
									debugMapModes={debugMapModes}
									climateSubMode={climateSubMode}
									elevationSubMode={elevationSubMode}
									topographySubMode={topographySubMode}
								/>
							</div>
						</div>
					</>
				)}
			</div>

			<DetailsDrawer
				open={detailsDrawerOpen}
				onToggle={() => setDetailsDrawerOpen((value) => !value)}
				nation={selectedNation}
				planetStats={planetStats}
				worldPopulation={
					selectedHistoryView?.totalPopulation ??
					world?.population?.totalPopulation ??
					null
				}
				activeWarCount={selectedHistoryView?.activeWars.length ?? null}
				cultureCount={worldForDisplay?.cultures?.count ?? null}
				heritageCount={worldForDisplay?.heritages?.count ?? null}
				faithCount={worldForDisplay?.faiths?.count ?? null}
				religionCount={worldForDisplay?.religions?.count ?? null}
				nationSizeDistribution={nationSizeDistribution}
				governmentDistribution={governmentDistribution}
				conflictDistribution={conflictDistribution}
				relationDistribution={relationDistribution}
				climateDistribution={climateDistribution}
				vegetationDistribution={vegetationDistribution}
				topographyDistribution={topographyDistribution}
				tradeGoodsDistribution={tradeGoodsDistribution}
				nationHistory={nationHistory}
				windowedEvents={windowedEvents}
				allPastEvents={allPastEvents}
				selectedTimeMs={selectedTimeMs}
				currentTimeMs={simTimeMs}
				onTimeSelect={setSelectedTimeMs}
				onNationClick={handleDrawerNationClick}
				onProvinceClick={handleProvinceClick}
				getNationName={getNationName}
				getNationColor={getNationColor}
				getProvinceName={getProvinceName}
				getProvinceColor={getProvinceColor}
				getDynastyName={getDynastyName}
			/>
		</div>
	)
}
