import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import { OCEAN_CURRENTS } from "@/model/climate/ocean-currents"
import { RAIN } from "@/model/climate/rain"
import { HEAT } from "@/model/climate/tidal-locked/heat"
import { OCEAN_CURRENTS as LOCKED_OCEAN_CURRENTS } from "@/model/climate/tidal-locked/ocean-currents"
import { WIND } from "@/model/climate/wind"
import { DATA_SOURCE } from "@/model/history/earth/data-source"
import type { Eu4ProvinceFillGeometry } from "@/model/history/earth/data-source/types"
import { DATE } from "@/model/history/earth/date"
import { HISTORY_DAYS } from "@/model/history/generated/history-days"
import { STATE } from "@/model/history/generated/state"
import type { StageTiming } from "@/model/pipelines/types"
import { SEED_LABEL } from "@/model/shared/random/seed-label"
import { SEEDS } from "@/model/shared/random/seeds"
import { UNITS } from "@/model/shared/units"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { ModeBar } from "@/ui/genesis/controls/ModeBar"
import {
	type MeasureMode,
	OverlayControls,
} from "@/ui/genesis/controls/OverlayControls"
import { SimulationControls } from "@/ui/genesis/controls/SimulationControls"
import {
	DEFAULT_WORLD_PARAMS,
	PLANET_SEED_STORAGE_KEY,
	VIEW_PREFS_STORAGE_KEY,
} from "@/ui/genesis/generation/defaults"
import { EarthHistoryBookmarks } from "@/ui/genesis/generation/EarthHistoryBookmarks"
import {
	attachEarthProvinceAreas,
	buildBestSettlementByProvince,
	buildGhslSettlementPopulationSlice,
	buildRealPopulationSlice,
	buildRealUrbanPopulationSlice,
	Eu4GhslSettlementAsset,
	Eu4PopulationTimelineAsset,
	loadEarthRealPopulationEu4,
	loadEarthRealUrbanPopulationEu4,
	loadEu4GhslSettlements,
} from "@/ui/genesis/generation/earth-assets"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import {
	historyTimeToMonth,
	historyYearToTime,
} from "@/ui/genesis/generation/history-time"
import { loadGenerationSessionSnapshotSync } from "@/ui/genesis/generation/session-persistence"
import {
	buildPlanetSliders,
	buildTerrainSliders,
} from "@/ui/genesis/generation/sliders"
import { useEarthHistoryTimeline } from "@/ui/genesis/generation/useEarthHistoryTimeline"
import { useProceduralHistory } from "@/ui/genesis/generation/useProceduralHistory"
import { useWorldDistributions } from "@/ui/genesis/generation/useWorldDistributions"
import { useWorldGeneration } from "@/ui/genesis/generation/useWorldGeneration"
import {
	DEFAULT_VIEW_PREFS,
	parseStoredViewPrefs,
} from "@/ui/genesis/generation/view-prefs"
import { type HoverInfo } from "@/ui/genesis/hover/hover"
import { InfoPanel } from "@/ui/genesis/hover/InfoPanel"
import { OceanCurrentParticleCanvas } from "@/ui/genesis/particles/OceanCurrentParticleCanvas"
import { WindParticleCanvas } from "@/ui/genesis/particles/WindParticleCanvas"
import { findEu4ProvinceForLonLat } from "@/ui/genesis/political/eu4-hover-province"
import { buildSelectedNationDetails } from "@/ui/genesis/political/nation-details-model"
import { createGenesisScene, type GenesisScene } from "@/ui/genesis/renderer"
import { scaleClockDialHourToDayLength } from "@/ui/genesis/shared/clock"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"
import {
	DEFAULT_GEOGRAPHY_MODE,
	isDebugGeographyMode,
	isDebugNationMode,
	normalizeGeographyColorMode,
	normalizeNationMapMode,
} from "@/ui/genesis/shared/map-modes"
import { canHandlePlanetClick } from "@/ui/genesis/shared/measurement-click"
import { computePlanetStats } from "@/ui/genesis/shared/planet-stats"
import { formatDistance, rgbToCss } from "@/ui/genesis/shared/ui-format"
import { SolarSystemControls } from "@/ui/genesis/solar-system/SolarSystemControls"
import { useSolarSystemBodies } from "@/ui/genesis/solar-system/useSolarSystemBodies"
import { useSolarSystemView } from "@/ui/genesis/solar-system/useSolarSystemView"
import {
	buildDisplayNationModel,
	buildDisplayWorld,
} from "@/ui/genesis/view/display-model"
import { useGenesisSceneSync } from "@/ui/genesis/view/useGenesisSceneSync"
import { useMapColoring } from "@/ui/genesis/view/useMapColoring"
import { useMapExport } from "@/ui/genesis/view/useMapExport"
import { useOverlayState } from "@/ui/genesis/view/useOverlayState"
import { useWorldDisplayData } from "@/ui/genesis/view/useWorldDisplayData"
import { useNationWikiData } from "@/ui/genesis/wiki-bridge/useNationWikiData"
import { useOrganizationWikiData } from "@/ui/genesis/wiki-bridge/useOrganizationWikiData"
import { useProceduralNationWikiData } from "@/ui/genesis/wiki-bridge/useProceduralNationWikiData"
import { useWarWikiData } from "@/ui/genesis/wiki-bridge/useWarWikiData"
import { GenerationPanel } from "@/ui/wiki/GenerationPanel"

export const GenesisView: React.FC = () => {
	const makeRandomSeed = useCallback(
		() => Math.floor(Math.random() * SEEDS.seedMax),
		[],
	)
	// Refs
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const sceneRef = useRef<GenesisScene | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const lastWorldRef = useRef<SerializedGenesisWorld | null>(null)
	const hoverCardRef = useRef<HTMLDivElement>(null)
	const initialViewPrefs =
		typeof window === "undefined"
			? DEFAULT_VIEW_PREFS
			: (parseStoredViewPrefs(
					window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY),
				) ?? DEFAULT_VIEW_PREFS)
	const initialGenerationSession =
		typeof window === "undefined" ? null : loadGenerationSessionSnapshotSync()

	// Core state
	const [world, setWorld] = useState<SerializedGenesisWorld | null>(null)
	const [generationTimings, setGenerationTimings] = useState<
		StageTiming[] | null
	>(null)
	const {
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
	} = useOverlayState({
		initialViewPrefs,
		initialGenerationSession,
		isEarthImport: !!world?.isEarthImport,
	})
	const [worldTab, setWorldTab] = useState<"planet" | "society">("planet")
	const [generationPanelOpen, setGenerationPanelOpen] = useState(
		initialGenerationSession?.generationPanelOpen ?? true,
	)
	const [generationPreviewTab, setGenerationPreviewTab] =
		useState<GenerationPreviewTab>(
			initialGenerationSession?.generationPreviewTab ?? "climate",
		)
	const [selectedNationId, setSelectedNationId] = useState<number | null>(null)
	// Left-panel "nation wiki page" selection for Earth-import worlds,
	// identified by EU4 tag rather than a procedural nation id. Procedural
	// worlds instead drive the wiki page off selectedNationId above (see
	// proceduralNationWikiData).
	const [selectedWikiNationTag, setSelectedWikiNationTagRaw] = useState<
		string | null
	>(null)
	// International organization wiki page selection (e.g. "HRE"/"HSA") --
	// mutually exclusive with the nation wiki page above; selecting either
	// clears the other so GenerationPanel only ever renders one at a time.
	const [selectedWikiOrganizationId, setSelectedWikiOrganizationIdRaw] =
		useState<string | null>(null)
	// War wiki page selection (wars.json warId) -- also mutually exclusive
	// with the nation/organization wiki pages above.
	const [selectedWikiWarId, setSelectedWikiWarIdRaw] = useState<string | null>(
		null,
	)
	const setSelectedWikiNationTag = useCallback((tag: string | null) => {
		setSelectedWikiOrganizationIdRaw(null)
		setSelectedWikiWarIdRaw(null)
		setSelectedWikiNationTagRaw(tag)
	}, [])
	const setSelectedWikiOrganizationId = useCallback((orgId: string | null) => {
		setSelectedWikiNationTagRaw(null)
		setSelectedWikiWarIdRaw(null)
		setSelectedWikiOrganizationIdRaw(orgId)
	}, [])
	const setSelectedWikiWarId = useCallback((warId: string | null) => {
		setSelectedWikiNationTagRaw(null)
		setSelectedWikiOrganizationIdRaw(null)
		setSelectedWikiWarIdRaw(warId)
	}, [])
	const [generationSessionRestored, setGenerationSessionRestored] = useState(
		initialGenerationSession !== null,
	)
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleSetWireframe = useCallback((next: boolean) => {
		setShowWireframe(next)
		sceneRef.current?.setWireframeVisible(next)
	}, [])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleSetElevation = useCallback(
		(next: boolean) => {
			setShowElevation(next)
			sceneRef.current?.setElevationVisible(next)
			if (!next && (colorMode === "terrain" || colorMode === "landHeightmap")) {
				setColorMode(geographyMode)
			}
		},
		[colorMode, geographyMode],
	)

	const [earthHistoryPlaying, setEarthHistoryPlaying] = useState(false)
	const simStartTimeMs = historyYearToTime(800)
	const [selectedTimeMs, setSelectedTimeMs] = useState(simStartTimeMs)
	// Earth-imported worlds scrub real Gregorian dates via earthHistory's own
	// slider. selectedTimeMs tracks it so Social's population/culture/heritage/
	// religion counts follow the scrubber. historyDaysToYear/historyYearToTime share
	// the same linear year axis, so this is a direct year-for-year mapping, not
	// a rescale.
	const earthHistory = useEarthHistoryTimeline(
		world?.provinces,
		!!world?.isEarthImport,
	)
	useEffect(() => {
		if (!world?.isEarthImport) return
		setSelectedTimeMs(
			historyYearToTime(DATE.historyDaysToYear(earthHistory.selectedDays)),
		)
	}, [world?.isEarthImport, earthHistory.selectedDays])
	const [earthRealPopulation, setEarthRealPopulation] =
		useState<Eu4PopulationTimelineAsset | null>(null)
	const [earthRealUrbanPopulation, setEarthRealUrbanPopulation] =
		useState<Eu4PopulationTimelineAsset | null>(null)
	const [eu4GhslSettlements, setEu4GhslSettlements] =
		useState<Eu4GhslSettlementAsset | null>(null)
	useEffect(() => {
		if (!world?.isEarthImport) {
			setEarthHistoryPlaying(false)
			setEarthRealPopulation(null)
			setEarthRealUrbanPopulation(null)
			setEu4GhslSettlements(null)
			return
		}
		let cancelled = false
		loadEarthRealPopulationEu4()
			.then((asset) => {
				if (!cancelled) setEarthRealPopulation(asset)
			})
			.catch((error) => {
				console.error("Failed to load Earth population asset", error)
				if (!cancelled) setEarthRealPopulation(null)
			})
		loadEarthRealUrbanPopulationEu4()
			.then((asset) => {
				if (!cancelled) setEarthRealUrbanPopulation(asset)
			})
			.catch((error) => {
				console.error("Failed to load Earth urban population asset", error)
				if (!cancelled) setEarthRealUrbanPopulation(null)
			})
		loadEu4GhslSettlements()
			.then((asset) => {
				if (!cancelled) setEu4GhslSettlements(asset)
			})
			.catch((error) => {
				console.error("Failed to load GHSL settlements asset", error)
				if (!cancelled) setEu4GhslSettlements(null)
			})
		return () => {
			cancelled = true
		}
	}, [world?.isEarthImport])
	const displayMonth = historyTimeToMonth(selectedTimeMs)
	// When clock is locked to current sim time, sync month control (day resets to 0)
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (clockCurrent) {
			setClockMonth(displayMonth - 1)
			setClockDay(0)
		}
	}, [clockCurrent, displayMonth])
	const resolvedClimateMonth =
		clockMonthMode === "annual"
			? 0
			: clockCurrent
				? displayMonth
				: clockMonth + 1
	const temperatureMonth = resolvedClimateMonth
	const rainfallMonth = resolvedClimateMonth
	const dtrMonth = resolvedClimateMonth
	const currentMonth = resolvedClimateMonth
	useEffect(() => {
		if (!world?.isEarthImport || earthHistory.loading || !earthHistoryPlaying)
			return
		const timer = window.setInterval(() => {
			earthHistory.setSelectedDays((prev) => {
				if (prev >= earthHistory.maxDays) {
					setEarthHistoryPlaying(false)
					return prev
				}
				const next = Math.min(prev + 365, earthHistory.maxDays)
				if (next >= earthHistory.maxDays) setEarthHistoryPlaying(false)
				return next
			})
		}, 1000)
		return () => window.clearInterval(timer)
	}, [
		earthHistory.loading,
		earthHistory.maxDays,
		earthHistory.setSelectedDays,
		earthHistoryPlaying,
		world?.isEarthImport,
	])
	useEffect(() => {
		if (earthHistory.selectedDays >= earthHistory.maxDays) {
			setEarthHistoryPlaying(false)
		}
	}, [earthHistory.maxDays, earthHistory.selectedDays])

	// --- Procedural (non-Earth-import) live-play history sim ---
	// Unlike earthHistory (a precomputed fold scrubbable across the whole
	// span), procedural worlds only ever exist as far as "simulate" has
	// ticked them forward in the worker -- see PROCEDURAL-HISTORY-PLAN.md.
	// There is no stored past: only the latest frame is kept, so the
	// timeline below can't scrub backward, only play/pause at the sim's
	// current time.
	const {
		handleToggleProceduralHistoryPlayback,
		proceduralHistoryEventsRef,
		proceduralHistoryFrame,
		proceduralHistoryPlaying,
		proceduralHistoryTimeMs,
		proceduralProvinceHistoryRef,
		recordProceduralFrame,
		resetProceduralHistoryAccumulation,
		setProceduralHistoryFrame,
		setProceduralHistoryPlaying,
		setProceduralHistoryTimeMs,
	} = useProceduralHistory({
		workerRef,
	})

	// Hover & measurement
	const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
	const [eu4HoverFillGeometry, setEu4HoverFillGeometry] =
		useState<Eu4ProvinceFillGeometry | null>(null)
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
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
	const initialStoredSeed = (() => {
		if (typeof window === "undefined") return null
		const stored = window.localStorage.getItem(PLANET_SEED_STORAGE_KEY)
		return stored ? SEED_LABEL.resolveSeedLabel(stored) : null
	})()
	const initialSeed = initialStoredSeed ?? makeRandomSeed()
	const [seed, setSeed] = useState(() => initialSeed)
	const [seedInput, setSeedInput] = useState(() =>
		SEED_LABEL.formatSeedLabel(initialSeed),
	)
	const [seedInputDirty, setSeedInputDirty] = useState(false)
	const [seedError, setSeedError] = useState(false)

	// Planet params
	const numPoints = DEFAULT_WORLD_PARAMS.numPoints
	const jitter = DEFAULT_WORLD_PARAMS.jitter
	const numPlates = DEFAULT_WORLD_PARAMS.numPlates
	const roughness = DEFAULT_WORLD_PARAMS.roughness
	const {
		continentSizeVariety,
		daysPerYear,
		displayMoons,
		eccentricity,
		effectiveDaysPerYear,
		forceMainWorld,
		glacialErosion,
		hoursPerDay,
		hydraulicErosion,
		landCoverage,
		landDistribution,
		mainWorldSystemBody,
		maxElevation,
		namesEnabled,
		obliquity,
		orbitalDistanceAU,
		perihelion,
		planetRadiusKm,
		pressure,
		rebuildSystemBody,
		resetSystemMoon,
		restSeed,
		ridgeSharpening,
		seaLevel,
		setAxialTiltDirection,
		setContinentSizeVariety,
		setEccentricity,
		setForceMainWorld,
		setHoursPerDay,
		setLandCoverage,
		setLandDistribution,
		setObliquity,
		setOrbitalDistanceAU,
		setPerihelion,
		setPlanetRadiusKm,
		setPressure,
		setRestSeed,
		setSeaLevel,
		setSolarSystem,
		setSpectralClass,
		setStarSubtype,
		setSubstellarLon,
		setTideLock,
		setEra,
		era,
		setters,
		skipNextGeneratedSystemBodiesSyncRef,
		smoothing,
		solarSystem,
		spectralClass,
		starName,
		starSubtype,
		substellarLon,
		systemBodies,
		systemBodiesRef,
		terrainWarp,
		thermalErosion,
		tidallyLocked,
		tideLock,
		updateEditableSystemBody,
		updateEditableSystemMoon,
	} = useSolarSystemBodies({ initialGenerationSession })
	const scaledClockHour = scaleClockDialHourToDayLength(clockHour, hoursPerDay)

	// --- Three.js scene lifecycle ---
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const genesisScene = createGenesisScene(canvas)
		sceneRef.current = genesisScene
		genesisScene.setHoverHandler((info) => {
			setHoverInfo(
				info ? { region: info.region, x: info.clientX, y: info.clientY } : null,
			)
		})
		const onResize = () => genesisScene.resize()
		window.addEventListener("resize", onResize)
		const ro = new ResizeObserver(() => genesisScene.resize())
		ro.observe(canvas)
		return () => {
			window.removeEventListener("resize", onResize)
			ro.disconnect()
			workerRef.current?.terminate()
			workerRef.current = null
			genesisScene.setHoverHandler(null)
			genesisScene.dispose()
			sceneRef.current = null
		}
	}, [])

	// --- Scene sync effects ---
	useEffect(() => {
		sceneRef.current?.setAtmospherePressure(world?.params.pressure ?? pressure)
	}, [world, pressure])
	useEffect(() => {
		sceneRef.current?.setGlobeCloudTexturePath(
			restSeed === SOL_DATA.solSeed ? SOL_DATA.solEarthCloudsTexturePath : null,
		)
	}, [restSeed])
	useEffect(() => {
		if (!world) {
			setHoverInfo(null)
			return
		}
		setGenerationTimings(world.timings ?? null)
	}, [world])
	useEffect(() => {
		if (typeof window === "undefined") return
		window.localStorage.setItem(
			PLANET_SEED_STORAGE_KEY,
			SEED_LABEL.formatSeedLabel(seed),
		)
	}, [seed])
	// --- Color mode guard ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
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
	}, [colorMode, world?.hazards, world?.volcanism, world?.isEarthImport, world])

	// --- Nation mode guard ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (!world) return
		const normalizedNationMode = normalizeNationMapMode(
			nationMode,
			!!world.isEarthImport,
		)
		if (normalizedNationMode !== nationMode) setNationMode(normalizedNationMode)
	}, [nationMode, world?.isEarthImport, world])

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (debugMapModes) return
		if (isDebugGeographyMode(colorMode)) {
			setColorMode(DEFAULT_GEOGRAPHY_MODE)
			setGeographyMode(DEFAULT_GEOGRAPHY_MODE)
			return
		}
		if (colorMode === "nations" && isDebugNationMode(nationMode)) {
			setNationMode("borders")
		}
	}, [colorMode, debugMapModes, nationMode])

	const worldForDisplay = useMemo(() => {
		const displayWorld = buildDisplayWorld({ world })
		if (!displayWorld) return null
		const displayProvinces = attachEarthProvinceAreas({
			provinces: displayWorld.provinces,
			asset: earthRealPopulation,
		})
		const realPopulationSlice =
			displayWorld.isEarthImport && earthRealPopulation
				? buildRealPopulationSlice({
						asset: earthRealPopulation,
						provinces: displayProvinces,
						syntheticPopulation: displayWorld.population?.population,
						selectedDays: earthHistory.selectedDays,
					})
				: null
		const realUrbanPopulationSlice =
			displayWorld.isEarthImport && earthRealUrbanPopulation
				? buildRealUrbanPopulationSlice({
						asset: earthRealUrbanPopulation,
						provinces: displayProvinces,
						selectedDays: earthHistory.selectedDays,
					})
				: null
		const realSettlementSlice =
			displayWorld.isEarthImport &&
			eu4GhslSettlements &&
			displayProvinces.realIds
				? (() => {
						const population = buildGhslSettlementPopulationSlice(
							eu4GhslSettlements,
							earthHistory.selectedDays,
						)
						if (!population) return null
						const bestByProvince = buildBestSettlementByProvince(
							population,
							eu4GhslSettlements.provinceIds,
						)
						const provinceCount = displayProvinces.count
						const names = new Array<string | null>(provinceCount).fill(null)
						const pops = new Float32Array(provinceCount)
						const realIds = displayProvinces.realIds!
						for (let compactIdx = 0; compactIdx < provinceCount; compactIdx++) {
							const settlementIdx = bestByProvince.get(realIds[compactIdx])
							if (settlementIdx === undefined) continue
							names[compactIdx] = eu4GhslSettlements.names[settlementIdx]
							pops[compactIdx] = population[settlementIdx]
						}
						return { names, population: pops }
					})()
				: null
		return realPopulationSlice ||
			realUrbanPopulationSlice ||
			realSettlementSlice ||
			displayProvinces !== displayWorld.provinces
			? {
					...displayWorld,
					provinces: displayProvinces,
					...(realPopulationSlice
						? { realPopulation: realPopulationSlice }
						: {}),
					...(realUrbanPopulationSlice
						? { realUrbanPopulation: realUrbanPopulationSlice }
						: {}),
					...(realSettlementSlice
						? { realSettlement: realSettlementSlice }
						: {}),
				}
			: displayWorld
	}, [
		world,
		earthRealPopulation,
		earthRealUrbanPopulation,
		eu4GhslSettlements,
		earthHistory.selectedDays,
	])
	useEffect(() => {
		let cancelled = false
		if (!worldForDisplay?.isEarthImport) {
			setEu4HoverFillGeometry(null)
			return () => {
				cancelled = true
			}
		}
		DATA_SOURCE.loadEu4ProvinceFillGeometry()
			.then((geometry) => {
				if (!cancelled) setEu4HoverFillGeometry(geometry)
			})
			.catch((err) => {
				console.error("Failed to load EU4 province fill geometry:", err)
			})
		return () => {
			cancelled = true
		}
	}, [worldForDisplay?.isEarthImport])
	const earthHistoryFormatLabel = useCallback(
		(timeValue: number) => earthHistory.formatLabel(timeValue),
		[earthHistory.formatLabel],
	)
	const nationModel = useMemo(
		() => buildDisplayNationModel(worldForDisplay),
		[worldForDisplay],
	)
	const nationProvinceCounts = useMemo(() => {
		return nationModel?.counts ?? new Map<number, number>()
	}, [nationModel])
	const nationColorById = useMemo(
		() => nationModel?.colorById ?? new Map<number, [number, number, number]>(),
		[nationModel],
	)
	const getNationColor = useCallback(
		(nationId: number): string | null => {
			if (nationId < 0) return null
			const color = nationColorById.get(nationId)
			return color ? rgbToCss(color) : null
		},
		[nationColorById],
	)
	const drawerWorldPopulation = useMemo(() => {
		if (
			getBaseMapMode(colorMode) === "population" &&
			dataVariant === "observed" &&
			worldForDisplay?.realPopulation
		) {
			return worldForDisplay.realPopulation.totalPopulation
		}
		// worldForDisplay.realPopulation is real, per-real-date data (built from
		// earthRealPopulation/earthRealUrbanPopulation via
		// earthHistory.selectedDays), so prefer it outright for Earth import
		// rather than only when the map's own colorMode happens to be on the
		// population overlay -- otherwise this pins to the static
		// generation-time total regardless of the real-history slider.
		if (worldForDisplay?.isEarthImport && worldForDisplay?.realPopulation) {
			return worldForDisplay.realPopulation.totalPopulation
		}
		return world?.population?.totalPopulation ?? null
	}, [
		colorMode,
		dataVariant,
		worldForDisplay?.isEarthImport,
		worldForDisplay?.realPopulation,
		world?.population?.totalPopulation,
	])

	// Same underlying issue as drawerWorldPopulation above -- Earth import has
	// no procedural timelineBundle to read culture/religion/war counts from,
	// so for that path prefer earthHistory's own real per-date engine
	// (already time-varying with the real-history slider) over the static
	// procedural worldForDisplay fields used below.
	const earthSocialCounts = useMemo(() => {
		if (!world?.isEarthImport || !earthHistory.query) return null
		const frame = earthHistory.query.frame
		return {
			cultureCount: frame.cultureCount,
			religionCount: frame.religionCount,
			activeWarCount: frame.activeWars.length,
		}
	}, [world?.isEarthImport, earthHistory.query])

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
	const {
		earthImportRawIdToCompact,
		getCultureName,
		getDynastyName,
		getGlobeCameraDir,
		getHeritageName,
		getLandmarkName,
		getLeaderName,
		getNationName,
		getProvinceColor,
		getProvinceName,
		getRiverName,
		hoverBiome,
		hoverClimateDisplay,
		hoverCloudCover,
		hoverCoordinates,
		hoverDistCoast,
		hoverDistCoastKm,
		hoverDtr,
		hoverDtrDiff,
		hoverElevationKm,
		hoverHazards,
		hoverHotspot,
		hoverHumidity,
		hoverHumidityDiff,
		hoverIceSummary,
		hoverIsLand,
		hoverLandmark,
		hoverMisery,
		hoverNationId,
		hoverOccupation,
		hoverOceanCurrents,
		hoverOceanDist,
		hoverProvince,
		hoverRainfall,
		hoverRainfallDiff,
		hoverRealDtr,
		hoverRealCloudCover,
		hoverRealHumidity,
		hoverRealRainfall,
		hoverRealTemperature,
		hoverRiver,
		hoverTemperatureDelta,
		hoverTemperatureDiff,
		hoverTerrainFeature,
		hoverTimezone,
		hoverTopography,
		hoverWindDir,
		hoverWindMonthly,
		hoverWindSpeed,
		labelsPlaybackActive,
		projectToScreen,
		sampledCultureLabelsArray,
		sampledDynastyLabelsArray,
		sampledHeritageLabelsArray,
		sampledNationLabelsArray,
		sampledSettlementLabelsArray,
		windVectors,
	} = useWorldDisplayData({
		sceneRef,
		world,
		worldForDisplay,
		hoverInfo,
		eu4HoverFillGeometry,
		nationModel,
		colorMode,
		dataVariant,
		showWindArrows,
		resolvedClimateMonth,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		earthHistoryPlaying,
	})

	// A single Model/Observed/Diff radio drives every observed-vs-model
	// overlay (color mode variants, wind, ocean currents) instead of each
	// having its own toggle.
	const showRealWind = dataVariant === "observed"
	const showRealOceanCurrents = dataVariant === "observed"

	const windStats = useMemo(() => {
		if (!world?.climate) return null
		const vectors = showRealWind
			? WIND.observedWindVectorsForMonth({
					observedWind: world.observedWind,
					numRegions: world.mesh.numRegions,
				})
			: WIND.computeWindVectors({
					mesh: world.mesh,
					climate: world.climate,
					elevation_km: world.elevation_km,
					params: world.params,
					surface: {
						vegetation: world.vegetation,
						topography: world.topography,
						slopeScore: world.slopeScore,
						oceanDist: world.oceanDist,
					},
				})
		const speeds = vectors.windSpeed
		let sum = 0
		let max = 0
		for (let i = 0; i < speeds.length; i++) {
			const s = speeds[i]
			sum += s
			if (s > max) max = s
		}
		return { avg: speeds.length > 0 ? sum / speeds.length : 0, max }
	}, [world, showRealWind])

	// Resolves the per-org category schema (organization-categories.ts) into
	// a ready-to-use categorizer + color lookup for one folded state --
	// shared by resolveOrgProvinceColor below (the base region-color fill)
	// and the occupationOverlay memo's stripe pass (computeOrgStripeOverlay),
	// so both always agree on which province belongs to which category. Only
	// built once per (state, org) rather than once per region/call site --
	// see OrgCategorySchema's doc comment for why that matters. Returns null
	// for an org with no registered schema (organization-categories.ts's
	// ORG_CATEGORY_SCHEMAS) -- callers fall back to plain solid-member-color/
	// white-elsewhere coloring with no stripe in that case.
	const {
		buildOrgCategorizer,
		cultureBlendOverlay,
		earthHistoryHoverOverride,
		earthHistorySceneLabelPartitions,
		earthHistorySceneNationOverride,
		nationFillColorForRawId,
		occupationOverlay,
		occupationStripeColorForRawId,
		organizationHighlightSpec,
		regionColors,
	} = useMapColoring({
		world,
		worldForDisplay,
		earthHistory,
		colorMode,
		nationMode,
		populationMode,
		viewMode,
		showElevation,
		dangerSubMode,
		selectedNationId,
		selectedWikiOrganizationId,
		windVectors,
		earthImportRawIdToCompact,
		hoverProvince,
		labelsPlaybackActive,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		currentMonth,
	})

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
		scene.setNationFillColorForRawId(nationFillColorForRawId)
		scene.setNationOccupationStripeColorForRawId(occupationStripeColorForRawId)
		if (lastWorldRef.current !== worldForDisplay) {
			scene.updateWorld(worldForDisplay)
			lastWorldRef.current = worldForDisplay
		}
		scene.setOccupationOverlay(
			selectedWikiOrganizationId === "HRE" ||
				(colorMode === "nations" && nationMode === "borders")
				? occupationOverlay
				: getBaseMapMode(colorMode) === "population" &&
						["culture", "heritage", "religion"].includes(populationMode)
					? cultureBlendOverlay
					: null,
		)
		// Border LINES and nation LABELS are traced/placed from
		// world.nations.assignment/seeds independently of the fill colors
		// above -- swap them the same way for Earth-imported worlds so
		// "Nations > Borders" and nation labels actually follow the scrubbed
		// date and show real EU4 names instead of the static generation-time
		// assignment and procedural names.
		scene.setEarthHistoryNationOverride(earthHistorySceneNationOverride)
		scene.setOrganizationHighlight(organizationHighlightSpec)
		// Culture/religion LABELS are also placed from a different id space
		// than the procedural world.cultures/world.heritages -- see
		// earthHistoryLabelPartitions's doc comment in
		// create-genesis-scene.ts.
		scene.setEarthHistoryLabelPartitions(earthHistorySceneLabelPartitions)
	}, [
		colorMode,
		nationMode,
		populationMode,
		occupationOverlay,
		regionColors,
		nationFillColorForRawId,
		occupationStripeColorForRawId,
		worldForDisplay,
		earthHistorySceneNationOverride,
		earthHistorySceneLabelPartitions,
		organizationHighlightSpec,
		selectedWikiOrganizationId,
		cultureBlendOverlay,
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
		return RAIN.computeThermalEquatorLine({ mesh: world.mesh, temps })
	}, [resolvedClimateMonth, world])

	useEffect(() => {
		sceneRef.current?.setThermalEquator(
			showThermalEquator ? thermalEquator : null,
		)
	}, [thermalEquator, showThermalEquator])

	const windGrid = useMemo(() => {
		if (!windVectors || !world) return null
		return WIND.computeWindGrid({
			mesh: world.mesh,
			windU: windVectors.windU,
			windV: windVectors.windV,
			windSpeed: windVectors.windSpeed,
		})
	}, [windVectors, world])

	const oceanCurrentGrid = useMemo(() => {
		if (!world || !showOceanCurrents) return null
		if (showRealOceanCurrents) {
			return OCEAN_CURRENTS.observedOceanCurrentGridForMonth({
				mesh: world.mesh,
				isLand: world.isLand,
				observedCurrent: world.observedCurrent,
				month: currentMonth > 0 ? currentMonth - 1 : undefined,
			})
		}
		if (!world.oceanCurrents) return null
		const N = world.mesh.numRegions
		const monthlyWarmth = world.oceanCurrents.oceanWarmthMonthly
		const warmth =
			monthlyWarmth && currentMonth > 0
				? monthlyWarmth.subarray((currentMonth - 1) * N, currentMonth * N)
				: world.oceanCurrents.oceanWarmth
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
		if (world.params.tideLock?.type === "solar") {
			return LOCKED_OCEAN_CURRENTS.buildLockedOceanCurrentGrid({
				mesh: world.mesh,
				oceanWarmth: warmth,
				isLand: world.isLand,
				latDeg,
				lonDeg,
				params: world.params,
				currentMonth,
			})
		}
		return OCEAN_CURRENTS.buildOceanCurrentGrid({
			mesh: world.mesh,
			oceanWarmth: warmth,
			isLand: world.isLand,
			latDeg,
			lonDeg,
			reverseCirculation: UNITS.isRetrogradeObliquity(world.params.obliquity),
			planetRadiusKm: world.params.planetRadiusKm,
		})
	}, [world, showOceanCurrents, showRealOceanCurrents, currentMonth])

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
		scene.setFullAmbient(!showDaylight)
		scene.setSolarTerminatorUseMeridiem(clockUseMeridiem)
		scene.setSolarTerminatorVisible(showDaylight)
		if (tidallyLocked) {
			const selectedMonth = clockMonthMode === "annual" ? 5 : clockMonth
			const monthlyLibration = HEAT.computeMonthlyLibration({
				eccentricity,
				perihelion,
			})
			const monthlyDeclination = HEAT.computeMonthlyLockedDeclination({
				obliquity,
				eccentricity,
				perihelion,
			})
			const [sx, sy, sz] = HEAT.getSubstellarDirWithOffsetAndDeclination({
				substellarLon,
				lonOffsetRad: monthlyLibration[selectedMonth] ?? 0,
				declinationRad: monthlyDeclination[selectedMonth] ?? 0,
			})
			scene.setSunDirection(sx, sy, sz, hoursPerDay)
		} else {
			const lightingMonth =
				clockMonthMode === "annual"
					? 0
					: clockMonth + 1 + clockDay / (effectiveDaysPerYear / 12)
			scene.setSunPosition(
				lightingMonth,
				obliquity,
				scaledClockHour,
				hoursPerDay,
			)
		}
	}, [
		showDaylight,
		clockUseMeridiem,
		clockMonthMode,
		clockMonth,
		clockDay,
		effectiveDaysPerYear,
		scaledClockHour,
		obliquity,
		eccentricity,
		perihelion,
		hoursPerDay,
		tidallyLocked,
		substellarLon,
	])

	// --- Measure click handler ---
	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setClickHandler((info) => {
			if (
				!canHandlePlanetClick(measureMode, {
					hasWorld: !!worldForDisplay,
					hasProvinces: !!worldForDisplay?.provinces,
					hasNationModel: !!nationModel,
					isEarthImport: !!worldForDisplay?.isEarthImport,
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

			if (measureMode === "off") {
				// Earth import routes clicks to the left-panel nation wiki page
				// instead of the procedural right-side drawer -- see
				// selectedWikiNationTag's doc. Falls through to the procedural
				// path below when there's no real EU4 mapping for this province
				// (e.g. still loading) or no owner.
				if (worldForDisplay.isEarthImport) {
					// No procedural nations exist for Earth import (see
					// derive-province-society.ts's isEarthImportRaster check), so
					// nationModel is always null here -- never fall through to the
					// procedural path below, which would crash on it. Just no-op
					// until the real EU4 engine has loaded.
					if (!earthHistory.engine) return
					// The procedural regionProvince[region] mapping is only an
					// approximation for Earth import -- real EU4 province polygons
					// don't align with the underlying mesh cells, so prefer a
					// point-in-polygon lookup against the actual province vector
					// geometry (same approach hoverProvince uses above), falling
					// back to the approximate mapping only when that geometry
					// isn't loaded yet.
					let rawId: string | null = null
					if (worldForDisplay.provinces?.realIds && eu4HoverFillGeometry) {
						const base = info.region * 3
						const r_xyz = worldForDisplay.mesh.r_xyz
						const latDeg =
							Math.asin(Math.max(-1, Math.min(1, r_xyz[base + 2]))) *
							(180 / Math.PI)
						const lonDeg =
							Math.atan2(r_xyz[base + 1], r_xyz[base]) * (180 / Math.PI)
						const rawProvinceId = findEu4ProvinceForLonLat(
							eu4HoverFillGeometry,
							lonDeg,
							latDeg,
						)
						if (rawProvinceId !== null) rawId = String(rawProvinceId)
					}
					if (rawId === null && province >= 0) {
						rawId = String(
							earthHistory.engine.provinceMap.compactToRealId[province],
						)
					}
					const owner = rawId
						? (earthHistory.query?.state.provinces.get(rawId)?.owner ?? null)
						: null
					setSelectedWikiNationTag(owner)
					return
				}
				const nation =
					province >= 0 ? (nationModel.assignment[province] ?? -1) : -1
				setSelectedNationId(nation >= 0 ? nation : null)
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
		earthHistory.engine,
		earthHistory.query,
		eu4HoverFillGeometry,
		setSelectedWikiNationTag,
	])

	const selectedNation = useMemo(() => {
		return buildSelectedNationDetails({
			selectedNationId,
			world: worldForDisplay,
			nationModel,
			getNationColor,
			getNationName,
			getCultureName,
			getHeritageName,
		})
	}, [
		nationModel,
		getNationColor,
		getNationName,
		getCultureName,
		getHeritageName,
		selectedNationId,
		worldForDisplay,
	])
	const handleWikiNationClick = useCallback((nationId: number) => {
		setSelectedNationId(nationId)
		sceneRef.current?.focusOnNation(nationId)
	}, [])
	// Real per-nation province counts + government type for Earth import --
	// same rationale as earthSocialCounts above: worldForDisplay.nations is
	// static procedural data there, so build these straight from earthHistory's
	// own real per-date engine instead.
	const {
		climateDistribution,
		conflictDistribution,
		governmentDistribution,
		nationAdjacency,
		nationSizeDistribution,
		relationDistribution,
		religionTypeDistribution,
		showObservedDistributions,
		topographyDistribution,
		tradeGoodsDistribution,
		vegetationDistribution,
	} = useWorldDistributions({
		world,
		worldForDisplay,
		earthHistory,
		nationModel,
		nationProvinceCounts,
		colorMode,
		dataVariant,
	})

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

	useGenesisSceneSync({
		sceneRef,
		worldForDisplay,
		earthHistory,
		hoverInfo,
		selectedNationId,
		viewMode,
		solarSystemViewActive,
		mapProjectionLatitude,
		setDraftMapProjectionLatitude,
		exportCenterLongitude,
		showNationBorders,
		showLandBorders,
		showNationHierarchy,
		showWireframe,
		showCoastlines,
		showGrid,
		gridSpacing,
		showInfrastructure,
		showElevation,
		eu4GhslSettlements,
		labelMode,
		sampledNationLabelsArray,
		sampledDynastyLabelsArray,
		sampledSettlementLabelsArray,
		sampledCultureLabelsArray,
		sampledHeritageLabelsArray,
	})

	// --- Generation callbacks ---
	const {
		generating,
		generationProgress,
		generationLabel,
		handleApplySeed,
		handleEarthImport,
		handleGenerate,
		handleRandomizeCode,
		handleResetDefaults,
		handleReturnToPlanetView,
		handleSeedInputChange,
	} = useWorldGeneration({
		sceneRef,
		workerRef,
		lastWorldRef,
		setWorld,
		setSelectedTimeMs,
		simStartTimeMs,
		setShowCoastlines,
		setSolarSystemViewActive,
		setPathfindingResult,
		setProceduralHistoryFrame,
		setProceduralHistoryPlaying,
		setProceduralHistoryTimeMs,
		resetProceduralHistoryAccumulation,
		recordProceduralFrame,
		seed,
		setSeed,
		seedInput,
		setSeedInput,
		seedInputDirty,
		setSeedInputDirty,
		setSeedError,
		setters,
		era,
		numPoints,
		numPlates,
		jitter,
		roughness,
		terrainWarp,
		smoothing,
		hydraulicErosion,
		thermalErosion,
		ridgeSharpening,
		glacialErosion,
		maxElevation,
		landDistribution,
		continentSizeVariety,
		landCoverage,
		planetRadiusKm,
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		daysPerYear,
		hoursPerDay,
		tideLock,
		substellarLon,
		seaLevel,
		pressure,
		mainWorldSystemBody,
	})

	// Earth import shows real-world observed data by default; a fresh
	// procedural generation shows the EBM-modeled climate.
	const handleGenerateWithDataVariant = useCallback(() => {
		handleSetDataVariant("generated")
		handleGenerate()
	}, [handleGenerate, handleSetDataVariant])
	const handleEarthImportWithDataVariant = useCallback(() => {
		handleSetDataVariant("observed")
		handleEarthImport()
	}, [handleEarthImport, handleSetDataVariant])

	const {
		exportWidthPreset,
		setExportWidthPreset,
		exportProgress,
		exportError,
		handleExportMap,
		exportBusy,
		exportDisabled,
	} = useMapExport({
		sceneRef,
		worldForDisplay,
		seed,
		exportCenterLongitude,
	})

	const handleToggleEarthHistoryPlayback = useCallback(() => {
		if (earthHistory.loading) return
		if (earthHistory.selectedDays >= earthHistory.maxDays) {
			earthHistory.setSelectedDays(earthHistory.minDays)
			setEarthHistoryPlaying(true)
			return
		}
		setEarthHistoryPlaying((playing) => !playing)
	}, [
		earthHistory.loading,
		earthHistory.maxDays,
		earthHistory.minDays,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
	])

	// --- Slider definitions ---
	const planetSliders = buildPlanetSliders({
		planetRadiusKm,
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		daysPerYear,
		hoursPerDay,
		pressure,
		landDistribution,
		landCoverage,
		tideLock,
		substellarLon,
		setPlanetRadiusKm,
		setObliquity,
		setEccentricity,
		setPerihelion,
		setOrbitalDistanceAU,
		setHoursPerDay,
		setPressure,
		setAxialTiltDirection,
		setLandDistribution,
		setLandCoverage,
		setSubstellarLon,
	})
	const terrainSliders = buildTerrainSliders({
		continentSizeVariety,
		seaLevel,
		setContinentSizeVariety,
		setSeaLevel,
		unitSystem,
	})

	// --- Planet identity ---
	// Same name the main world shows everywhere else in GenerationPanel (its
	// stat card title, breadcrumbs, etc.) -- previously this was a separate,
	// unrelated generatePlanetName(seed) call, which could (and did) produce
	// a completely different name than the one shown in the generation panel
	// for the same body.
	const planetName = mainWorldSystemBody?.name || "Main World"

	const nationWikiData = useNationWikiData({
		selectedWikiNationTag,
		world,
		worldForDisplay,
		earthHistory,
		earthImportRawIdToCompact,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		sceneRef,
	})

	const proceduralNationWikiData = useProceduralNationWikiData({
		world,
		selectedNation,
		planetName,
		proceduralHistoryTimeMs,
		proceduralHistoryEventsRef,
		proceduralProvinceHistoryRef,
		getNationName,
		getNationColor,
		setSelectedNationId,
		onSelectNation: handleWikiNationClick,
		sceneRef,
	})

	const organizationWikiData = useOrganizationWikiData({
		selectedWikiOrganizationId,
		world,
		worldForDisplay,
		earthHistory,
		earthImportRawIdToCompact,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		selectedWikiNationTag,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		buildOrgCategorizer,
		sceneRef,
	})

	const warWikiData = useWarWikiData({
		selectedWikiWarId,
		world,
		earthHistory,
		earthImportRawIdToCompact,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		sceneRef,
	})

	// --- Planet stats ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const planetStats = useMemo(
		() =>
			computePlanetStats(
				// worldForDisplay, not world: for an Earth import it carries the
				// per-province areaKm2 attached by attachEarthProvinceAreas, which
				// Avg Province Area averages directly.
				worldForDisplay ?? world,
				{
					obliquity,
					eccentricity,
					perihelion,
					substellarLon,
					spectralClass,
					starSubtype,
					daysPerYear,
					hoursPerDay,
					planetRadiusKm,
					pressure,
					tideLock,
					seaLevel,
					maxElevation,
					avgWindSpeedMs: windStats?.avg ?? null,
					maxWindSpeedMs: windStats?.max ?? null,
					useObservedTemperature: dataVariant === "observed",
				},
				unitSystem,
			),
		[
			daysPerYear,
			eccentricity,
			substellarLon,
			perihelion,
			hoursPerDay,
			obliquity,
			planetRadiusKm,
			pressure,
			spectralClass,
			starSubtype,
			tideLock,
			seaLevel,
			unitSystem,
			world,
			worldForDisplay,
			windStats,
			dataVariant,
		],
	)

	const {
		currentFocus,
		handleEnterSolarSystem,
		handleFocusBody,
		setSolarSystemOrbitFraction,
		setSolarSystemRotationFraction,
		solarSystemClock,
		solarSystemOrbitFraction,
		solarSystemRotationFraction,
		surfaceTidesM,
		tidalSchedulePreview,
	} = useSolarSystemView({
		sceneRef,
		initialGenerationSession,
		solarSystem,
		setSolarSystem,
		skipNextGeneratedSystemBodiesSyncRef,
		systemBodies,
		systemBodiesRef,
		displayMoons,
		effectiveDaysPerYear,
		daysPerYear,
		hoursPerDay,
		planetRadiusKm,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
		tideLock,
		spectralClass,
		starSubtype,
		starName,
		namesEnabled,
		restSeed,
		seed,
		solarSystemViewActive,
		setSolarSystemViewActive,
		showSolarSystemEllipticalOrbits,
		showSolarSystemDaylight,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		generationPanelOpen,
		setGenerationPanelOpen,
		generationPreviewTab,
		setGenerationPreviewTab,
		generationSessionRestored,
		setGenerationSessionRestored,
	})

	// --- Render ---
	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{generationPanelOpen && (
				<GenerationPanel
					worldTab={worldTab}
					setWorldTab={setWorldTab}
					resetWorldDefaults={handleResetDefaults}
					setTideLock={setTideLock}
					setObliquity={setObliquity}
					restSeed={restSeed}
					starName={starName}
					showRealSolNames={restSeed === SOL_DATA.solSeed}
					setRestSeed={setRestSeed}
					forceMainWorld={forceMainWorld}
					setForceMainWorld={setForceMainWorld}
					tidalSchedulePreview={tidalSchedulePreview}
					surfaceTidesM={surfaceTidesM}
					orbitBodies={systemBodies.filter((b) => !b.isMainWorld)}
					systemBodies={systemBodies}
					onUpdateSystemBody={updateEditableSystemBody}
					onUpdateSystemMoon={updateEditableSystemMoon}
					onRebuildSystemBody={rebuildSystemBody}
					onResetSystemMoon={resetSystemMoon}
					onFocusBody={handleFocusBody}
					currentFocus={currentFocus}
					daysPerYear={daysPerYear}
					setHoursPerDay={setHoursPerDay}
					planetRadiusKm={planetRadiusKm}
					generatedMoons={displayMoons}
					planetSliders={planetSliders}
					terrainSliders={terrainSliders}
					spectralClass={spectralClass}
					setSpectralClass={setSpectralClass}
					starSubtype={starSubtype}
					setStarSubtype={setStarSubtype}
					orbitalDistanceAU={orbitalDistanceAU}
					eccentricity={eccentricity}
					perihelion={perihelion}
					obliquity={obliquity}
					era={era}
					setEra={setEra}
					seedInput={seedInput}
					setSeedInput={handleSeedInputChange}
					onApplySeed={handleApplySeed}
					seedError={seedError}
					onRandomizeSeed={handleRandomizeCode}
					generating={generating}
					generationLabel={generationLabel}
					generationProgress={generationProgress}
					generationTimings={generationTimings}
					landCoverage={landCoverage}
					generationPreviewTab={generationPreviewTab}
					onSelectGenerationPreviewTab={setGenerationPreviewTab}
					unitSystem={unitSystem}
					handleGenerate={handleGenerateWithDataVariant}
					handleEarthImport={handleEarthImportWithDataVariant}
					onClose={() => setGenerationPanelOpen(false)}
					worldDetails={{
						hasGeneratedWorld: !!world && !generating,
						planetName,
						planetStats,
						worldPopulation: drawerWorldPopulation,
						activeWarCount: earthSocialCounts?.activeWarCount ?? null,
						cultureCount:
							earthSocialCounts?.cultureCount ??
							worldForDisplay?.cultures?.count ??
							null,
						religionCount:
							earthSocialCounts?.religionCount ??
							worldForDisplay?.religions?.count ??
							null,
						nationSizeDistribution,
						governmentDistribution,
						religionDistribution: religionTypeDistribution,
						conflictDistribution,
						relationDistribution,
						climateDistribution,
						vegetationDistribution,
						topographyDistribution,
						showObservedDistributions,
						tradeGoodsDistribution,
					}}
					nationWiki={nationWikiData ?? proceduralNationWikiData}
					organizationWiki={organizationWikiData}
					warWiki={warWikiData}
				/>
			)}

			<div
				ref={viewportRef}
				className="flex-1 h-[56vh] xl:h-full relative overflow-hidden bg-[#050510]"
			>
				<canvas
					ref={canvasRef}
					className={`h-full w-full block ${
						measureMode !== "off" ? "cursor-crosshair" : ""
					}`}
				/>
				<WindParticleCanvas
					windGrid={windGrid}
					projectToScreen={projectToScreen}
					getGlobeCameraDir={getGlobeCameraDir}
					visible={showWindArrows && !solarSystemViewActive}
					viewMode={viewMode}
				/>
				<OceanCurrentParticleCanvas
					currentGrid={oceanCurrentGrid}
					projectToScreen={projectToScreen}
					getGlobeCameraDir={getGlobeCameraDir}
					visible={showOceanCurrents && !solarSystemViewActive}
					viewMode={viewMode}
				/>

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
							hoverRealTemperature={hoverRealTemperature}
							hoverTemperatureDiff={hoverTemperatureDiff}
							hoverRainfall={hoverRainfall}
							hoverCloudCover={hoverCloudCover}
							hoverRealRainfall={hoverRealRainfall}
							hoverRealCloudCover={hoverRealCloudCover}
							hoverRainfallDiff={hoverRainfallDiff}
							hoverDtr={hoverDtr}
							hoverRealDtr={hoverRealDtr}
							hoverDtrDiff={hoverDtrDiff}
							hoverHumidity={hoverHumidity}
							hoverRealHumidity={hoverRealHumidity}
							hoverHumidityDiff={hoverHumidityDiff}
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
							dataVariant={dataVariant}
							selectedTimeMs={selectedTimeMs}
							displayMonth={displayMonth}
							clockMonthMode={clockMonthMode}
							clockMonth={clockMonth}
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
							relationAt={null}
							earthHistoryHoverOverride={earthHistoryHoverOverride}
						/>
					) : null}

					{solarSystemViewActive ? (
						<SolarSystemControls
							expanded={solarSystemControlsExpanded}
							setExpanded={setSolarSystemControlsExpanded}
							onBack={handleReturnToPlanetView}
							canReturnToPlanetMap={!!worldForDisplay}
							generationPanelOpen={generationPanelOpen}
							onToggleGenerationPanel={() => setGenerationPanelOpen(true)}
							showEllipticalOrbits={showSolarSystemEllipticalOrbits}
							setShowEllipticalOrbits={setShowSolarSystemEllipticalOrbits}
							showDaylight={showSolarSystemDaylight}
							setShowDaylight={setShowSolarSystemDaylight}
							showInclination={showSolarSystemInclination}
							setShowInclination={setShowSolarSystemInclination}
							showAxialTilt={showSolarSystemAxialTilt}
							setShowAxialTilt={setShowSolarSystemAxialTilt}
							showRealisticSizes={showSolarSystemRealisticSizes}
							setShowRealisticSizes={setShowSolarSystemRealisticSizes}
							showBodyNames={showSolarSystemBodyNames}
							setShowBodyNames={setShowSolarSystemBodyNames}
							clock={
								solarSystemClock
									? {
											rotationFraction: solarSystemRotationFraction,
											setRotationFraction: setSolarSystemRotationFraction,
											orbitFraction: solarSystemOrbitFraction,
											setOrbitFraction: setSolarSystemOrbitFraction,
											rotationPeriodHours: solarSystemClock.rotationPeriodHours,
											orbitalPeriodDays: solarSystemClock.orbitalPeriodDays,
										}
									: null
							}
						/>
					) : (
						<OverlayControls
							isEarthImport={worldForDisplay?.isEarthImport ?? false}
							onEnterSolarSystem={handleEnterSolarSystem}
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
							setShowWireframe={handleSetWireframe}
							showRivers={showRivers}
							setShowRivers={setShowRivers}
							showThermalEquator={showThermalEquator}
							setShowThermalEquator={setShowThermalEquator}
							showCoastlines={showCoastlines}
							setShowCoastlines={setShowCoastlines}
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
							setShowElevation={handleSetElevation}
							showInfrastructure={showInfrastructure}
							setShowInfrastructure={setShowInfrastructure}
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
							setColorMode={setGeographyColorMode}
							dataVariant={dataVariant}
							setDataVariant={handleSetDataVariant}
							clockCurrent={clockCurrent}
							setClockCurrent={setClockCurrent}
							clockMonthMode={clockMonthMode}
							setClockMonthMode={setClockMonthMode}
							clockMonth={clockMonth}
							setClockMonth={setClockMonth}
							clockDay={clockDay}
							setClockDay={setClockDay}
							clockHour={clockHour}
							setClockHour={setClockHour}
							clockUseMeridiem={clockUseMeridiem}
							setClockUseMeridiem={setClockUseMeridiem}
							hoursPerDay={hoursPerDay}
							tidallyLocked={tidallyLocked}
							daysPerYear={effectiveDaysPerYear}
							vegetationSubMode={vegetationSubMode}
							setVegetationSubMode={setVegetationSubMode}
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
									culture: false,
									heritage: false,
									religion: false,
									script: false,
								})
								setShowElevation(false)
								setShowInfrastructure(false)
								setMeasureMode("off")
								setPathfindingLand(true)
								setPathfindingSea(true)
								setDebugMapModes(false)
								setShowDaylight(false)
								setClockHour(12)
								setExportCenterLongitude(0)
								setMapProjectionLatitude(0)
								setDraftMapProjectionLatitude(0)
							}}
							generationPanelOpen={generationPanelOpen}
							onToggleGenerationPanel={() => setGenerationPanelOpen(true)}
							showDaylight={showDaylight}
							setShowDaylight={setShowDaylight}
						/>
					)}

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

					{worldForDisplay?.isEarthImport ? (
						<div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
							<div className="pointer-events-auto">
								<SimulationControls
									selectedTimeMs={earthHistory.selectedDays}
									minTimeMs={earthHistory.minDays}
									maxTimeMs={earthHistory.maxDays}
									onTimeChange={earthHistory.setSelectedDays}
									floating={false}
									onPlayPause={handleToggleEarthHistoryPlayback}
									simPlaying={earthHistoryPlaying}
									formatLabel={earthHistoryFormatLabel}
									stepValue={365}
									playPauseLabels={{
										play: "Start timeline",
										pause: "Pause timeline",
									}}
									extraControls={
										<EarthHistoryBookmarks
											onSelect={earthHistory.setSelectedDays}
											selectedDate={earthHistory.selectedDays}
											placement="below"
										/>
									}
								/>
							</div>
						</div>
					) : null}
					{worldForDisplay &&
					!worldForDisplay.isEarthImport &&
					proceduralHistoryFrame ? (
						<div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
							<div className="pointer-events-auto">
								<SimulationControls
									selectedTimeMs={proceduralHistoryTimeMs}
									minTimeMs={proceduralHistoryTimeMs}
									maxTimeMs={proceduralHistoryTimeMs}
									onTimeChange={() => {
										// Scrubbing is disabled while this control is pinned to one frame.
									}}
									floating={false}
									onPlayPause={handleToggleProceduralHistoryPlayback}
									simPlaying={proceduralHistoryPlaying}
									formatLabel={(ms) =>
										DATE.formatHistoryDays(HISTORY_DAYS.historyMsToDays(ms))
									}
									stepValue={STATE.yearMs}
								/>
							</div>
						</div>
					) : null}
					{!solarSystemViewActive && (
						<div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-1.5 pb-3 pointer-events-none">
							<div className="pointer-events-auto">
								<ModeBar
									colorMode={colorMode}
									setColorMode={setGeographyColorMode}
									geographyMode={geographyMode}
									setGeographyMode={setGeographyMode}
									nationMode={nationMode}
									setNationMode={setNationMode}
									populationMode={populationMode}
									setPopulationMode={setPopulationMode}
									debugMapModes={debugMapModes}
									vegetationSubMode={vegetationSubMode}
									climateSubMode={climateSubMode}
									elevationSubMode={elevationSubMode}
									topographySubMode={topographySubMode}
									isEarthImport={worldForDisplay?.isEarthImport ?? false}
								/>
							</div>
						</div>
					)}
				</>
			</div>
		</div>
	)
}
