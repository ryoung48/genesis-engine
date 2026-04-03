import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PopulationMapMode } from "@/components/world/types"
import type {
	OrogenWorkerResponse,
	SerializedOrogenWorld,
} from "@/model/orogen/worker-types"
import { encodePlanetCode } from "@/model/orogen/planet-code"
import { createOrogenScene, type OrogenScene, type OrogenViewMode } from "../renderer"
import type { ColorMode } from "../colors"
import { ENABLE_PASTA_CLASSIFICATION, ENABLE_PROVINCES, ENABLE_WIND_FIELDS } from "@/model/orogen/features"
import { computeClouds } from "@/model/orogen/climate/clouds"
import { computeThermalEquatorLine } from "@/model/orogen/climate/rain"

import { DEFAULT_WORLD_PARAMS, MAX_RECENT_CODES, PLANET_CODE_STORAGE_KEY, RECENT_CODES_STORAGE_KEY } from "./constants"
import { computeRegionColors, applyCloudOverlay } from "./region-colors"
import {
	getHoverElevationKm, getHoverTopography, getHoverCoordinates,
	getHoverTemperature, getHoverBiotemperature, getHoverTemperatureDelta, getHoverRainfall,
	getHoverClimateZone, getHoverPastaClimate, getHoverIceDebug,
	getHoverKoppenClimate, getHoverBiome, getHoverProvince,
	getHoverLandmark, getHoverIsLand, getHoverOceanDist,
	getHoverDistCoast, getHoverWind, getCoastHopLengthKm,
	getHoverDistCoastKm, getHoverClimateDisplay, getHoverHazards, getHoverHotspot, getHoverRiver, getHoverBasinId, getHoverTerrainFeature,
	type HoverInfo,
} from "./hover"
import { computePlanetStats } from "./planet-stats"
import { buildPlanetSliders, buildTerrainSliders, resetWorldDefaults } from "./sliders"
import { decodePlanetCode, generateWorld, importHeightmap, loadImageAsGrayscale, type GenerationCallbacks } from "./generation"

import { Sidebar } from "./Sidebar"
import { GlobalInfoPanel, InfoPanel } from "./InfoPanel"
import { ModeBar, type NationMapMode } from "./ModeBar"
import { OverlayControls } from "./OverlayControls"
import { TimeControls } from "./TimeControls"

interface OrogenViewProps {
	onBack: () => void
}

export const OrogenView: React.FC<OrogenViewProps> = ({ onBack }) => {
	const makeRandomSeed = useCallback(() => Math.floor(Math.random() * 16777216), [])
	// Refs
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const sceneRef = useRef<OrogenScene | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const lastWorldRef = useRef<SerializedOrogenWorld | null>(null)
	const mapCenterLongitudeValueRef = useRef<HTMLSpanElement>(null)
	const hoverCardRef = useRef<HTMLDivElement>(null)

	// Core state
	const [world, setWorld] = useState<SerializedOrogenWorld | null>(null)
	const [generating, setGenerating] = useState(false)
	const [generationProgress, setGenerationProgress] = useState(0)
	const [generationLabel, setGenerationLabel] = useState("Idle")
	const [colorMode, setColorMode] = useState<ColorMode>("terrain")
	const [nationMode, setNationMode] = useState<NationMapMode>("borders")
	const [populationMode, setPopulationMode] =
		useState<PopulationMapMode>("density")
	const [globalMonth, setGlobalMonth] = useState(1)
	const [timeOfDay, setTimeOfDay] = useState(12)
	const [tempAnnual, setTempAnnual] = useState(true)
	const [rainAnnual, setRainAnnual] = useState(true)
	const [windAnnual, setWindAnnual] = useState(true)
	const temperatureMonth = tempAnnual ? 0 : globalMonth
	const rainfallMonth = rainAnnual ? 0 : globalMonth
	const windMonth = windAnnual ? 0 : globalMonth
	const [viewMode, setViewMode] = useState<OrogenViewMode>("globe")
	const [fullAmbient, setFullAmbient] = useState(true)
	const [mapCenterLongitude, setMapCenterLongitude] = useState(0)

	// Overlay state
	const [showWireframe, setShowWireframe] = useState(false)
	const [showGrid, setShowGrid] = useState(true)
	const [showThermalEquator, setShowThermalEquator] = useState(false)
	const [showRivers, setShowRivers] = useState(false)
	const [showClouds, setShowClouds] = useState(false)
	const [timeExpanded, setTimeExpanded] = useState(false)
	const [overlaysExpanded, setOverlaysExpanded] = useState(false)
	const [gridSpacing, setGridSpacing] = useState(15)
	const [showPastaDebug, setShowPastaDebug] = useState(false)
	const [worldTab, setWorldTab] = useState<"planet" | "terrain">("planet")
	const [sidebarOpen, setSidebarOpen] = useState(true)

	// Hover & measurement
	const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
	const [isMeasuring, setIsMeasuring] = useState(false)
	const [measureStart, setMeasureStart] = useState<number | null>(null)
	const [measureEnd, setMeasureEnd] = useState<number | null>(null)
	const [measureLabelPos, setMeasureLabelPos] = useState<[number, number] | null>(null)
	const measureRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null })

	// Generation params
	const [recentCodes, setRecentCodes] = useState<string[]>(() => {
		if (typeof window === "undefined") return []
		try {
			const stored = window.localStorage.getItem(RECENT_CODES_STORAGE_KEY)
			if (!stored) return []
			const parsed = JSON.parse(stored)
			return Array.isArray(parsed)
				? parsed.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, MAX_RECENT_CODES)
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

	// Planet params
	const [numPoints, setNumPoints] = useState(initialDecodedCode?.numPoints ?? DEFAULT_WORLD_PARAMS.numPoints)
	const [jitter, setJitter] = useState(initialDecodedCode?.jitter ?? DEFAULT_WORLD_PARAMS.jitter)
	const [numPlates, setNumPlates] = useState(initialDecodedCode?.numPlates ?? DEFAULT_WORLD_PARAMS.numPlates)
	const [landDistribution, setLandDistribution] = useState(initialDecodedCode?.landDistribution ?? DEFAULT_WORLD_PARAMS.landDistribution)
	const [continentSizeVariety, setContinentSizeVariety] = useState(initialDecodedCode?.continentSizeVariety ?? DEFAULT_WORLD_PARAMS.continentSizeVariety)
	const [landCoverage, setLandCoverage] = useState(initialDecodedCode?.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage)
	const [roughness, setRoughness] = useState(initialDecodedCode?.roughness ?? DEFAULT_WORLD_PARAMS.roughness)
	const [planetRadiusKm, setPlanetRadiusKm] = useState(initialDecodedCode?.planetRadiusKm ?? DEFAULT_WORLD_PARAMS.planetRadiusKm)
	const [obliquity, setObliquity] = useState(initialDecodedCode?.obliquity ?? DEFAULT_WORLD_PARAMS.obliquity)
	const [eccentricity, setEccentricity] = useState(initialDecodedCode?.eccentricity ?? DEFAULT_WORLD_PARAMS.eccentricity)
	const [sunTempFactor, setSunTempFactor] = useState(initialDecodedCode?.sunTempFactor ?? DEFAULT_WORLD_PARAMS.sunTempFactor)
	const [daysPerYear, setDaysPerYear] = useState(initialDecodedCode?.daysPerYear ?? DEFAULT_WORLD_PARAMS.daysPerYear)
	const [hoursPerDay, setHoursPerDay] = useState(initialDecodedCode?.hoursPerDay ?? DEFAULT_WORLD_PARAMS.hoursPerDay)
	const [tidallyLocked, setTidallyLocked] = useState(initialDecodedCode?.tidallyLocked ?? false)
	const [antistellarLon, setAntistellarLon] = useState(initialDecodedCode?.antistellarLon ?? DEFAULT_WORLD_PARAMS.antistellarLon)
	const [perihelion, setPerihelion] = useState(initialDecodedCode?.perihelion ?? DEFAULT_WORLD_PARAMS.perihelion)
	const [pressure, setPressure] = useState(initialDecodedCode?.pressure ?? DEFAULT_WORLD_PARAMS.pressure)

	// Terrain params
	const [terrainWarp, setTerrainWarp] = useState(initialDecodedCode?.terrainWarp ?? DEFAULT_WORLD_PARAMS.terrainWarp)
	const [smoothing, setSmoothing] = useState(initialDecodedCode?.smoothing ?? DEFAULT_WORLD_PARAMS.smoothing)
	const [hydraulicErosion, setHydraulicErosion] = useState(initialDecodedCode?.hydraulicErosion ?? DEFAULT_WORLD_PARAMS.hydraulicErosion)
	const [thermalErosion, setThermalErosion] = useState(initialDecodedCode?.thermalErosion ?? DEFAULT_WORLD_PARAMS.thermalErosion)
	const [ridgeSharpening, setRidgeSharpening] = useState(initialDecodedCode?.ridgeSharpening ?? DEFAULT_WORLD_PARAMS.ridgeSharpening)
	const [glacialErosion, setGlacialErosion] = useState(initialDecodedCode?.glacialErosion ?? DEFAULT_WORLD_PARAMS.glacialErosion)
	const [volcanism, setVolcanism] = useState(initialDecodedCode?.volcanism ?? DEFAULT_WORLD_PARAMS.volcanism)
	const [craters, setCraters] = useState(initialDecodedCode?.craters ?? DEFAULT_WORLD_PARAMS.craters)
	const [tectonicMode, setTectonicMode] = useState(initialDecodedCode?.tectonicMode === "stagnant" ? 1 : DEFAULT_WORLD_PARAMS.tectonicMode)

	// --- Three.js scene lifecycle ---
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const orogenScene = createOrogenScene(canvas)
		sceneRef.current = orogenScene
		orogenScene.setHoverHandler((info) => {
			setHoverInfo(info ? { region: info.region, x: info.clientX, y: info.clientY } : null)
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
	useEffect(() => { sceneRef.current?.setAtmospherePressure(world?.params.pressure ?? pressure) }, [world, pressure])
	useEffect(() => { if (!world) setHoverInfo(null) }, [world])
	useEffect(() => {
		if (typeof window === "undefined") return
		if (planetCode) window.localStorage.setItem(PLANET_CODE_STORAGE_KEY, planetCode)
		else window.localStorage.removeItem(PLANET_CODE_STORAGE_KEY)
	}, [planetCode])
	useEffect(() => {
		if (typeof window === "undefined") return
		window.localStorage.setItem(RECENT_CODES_STORAGE_KEY, JSON.stringify(recentCodes))
	}, [recentCodes])

	// --- Color mode guard ---
	useEffect(() => {
		if (!ENABLE_PASTA_CLASSIFICATION && (colorMode === "pastaClimate" || colorMode === "satellite")) setColorMode("climate")
		if (!ENABLE_WIND_FIELDS && colorMode === "windSpeed") setColorMode("terrain")
		if (!ENABLE_PROVINCES && (colorMode === "nations" || colorMode === "population")) setColorMode("terrain")
		if (world && !world.hazards && colorMode === "dangerZones") setColorMode("terrain")
		if (world && !world.volcanism && colorMode === "hotspots") setColorMode("terrain")
		if (colorMode === "landHeightmap") setColorMode("terrain")
		if (colorMode === "terrainFeaturesLand" || colorMode === "terrainFeaturesOcean" || colorMode === "terrainFeaturesCoast") {
			setColorMode("terrainFeatures")
		}
	}, [colorMode, world?.hazards, world?.volcanism])

	// --- Hover computations ---
	const hoverElevationKm = getHoverElevationKm(hoverInfo, world)
	const hoverTopography = getHoverTopography(hoverInfo, world)
	const hoverCoordinates = useMemo(() => getHoverCoordinates(hoverInfo, world), [hoverInfo, world])
	const hoverTemperature = getHoverTemperature(hoverInfo, world, temperatureMonth)
	const hoverBiotemperature = getHoverBiotemperature(hoverInfo, world)
	const hoverTemperatureDelta = getHoverTemperatureDelta(hoverInfo, world)
	const hoverRainfall = getHoverRainfall(hoverInfo, world, rainfallMonth)
	const hoverClimateZone = getHoverClimateZone(hoverInfo, world)
	const hoverPastaClimate = getHoverPastaClimate(hoverInfo, world)
	const hoverIceDebug = getHoverIceDebug(hoverInfo, world, colorMode)
	const hoverKoppenClimate = getHoverKoppenClimate(hoverInfo, world)
	const hoverBiome = getHoverBiome(hoverInfo, world)
	const hoverProvince = getHoverProvince(hoverInfo, world)
	const hoverBasinId = getHoverBasinId(hoverInfo, world)
	const hoverLandmark = getHoverLandmark(hoverInfo, world)
	const hoverIsLand = getHoverIsLand(hoverInfo, world)
	const hoverOceanDist = getHoverOceanDist(hoverInfo, world)
	const hoverDistCoast = getHoverDistCoast(hoverInfo, world)
	const hoverWind = getHoverWind(hoverInfo, world, windMonth)
	const hoverHazards = getHoverHazards(hoverInfo, world)
	const hoverHotspot = getHoverHotspot(hoverInfo, world)
	const hoverRiver = getHoverRiver(hoverInfo, world)
	const hoverTerrainFeature = getHoverTerrainFeature(hoverInfo, world)
	const coastHopLengthKm = useMemo(() => getCoastHopLengthKm(world), [world])
	const hoverDistCoastKm = getHoverDistCoastKm(hoverDistCoast, coastHopLengthKm)
	const hoverDaylightHours =
		hoverInfo && world?.climate?.daylight_hours_monthly
			? world.climate.daylight_hours_monthly[(globalMonth - 1) * world.mesh.numRegions + hoverInfo.region]
			: null
	const hoverIceSummary = (() => {
		if (!(hoverInfo && world)) return null
		const r = hoverInfo.region
		const iceThickness = world.iceThickness?.[r] ?? 0
		const iceMin = world.iceMinMonthly?.[r] ?? 0
		const iceMax = world.iceMaxMonthly?.[r] ?? 0
		if (iceThickness <= 0 && iceMax <= 0) return null
		return `${(iceThickness / 1000).toFixed(2)} m (${(iceMin / 1000).toFixed(2)}-${(iceMax / 1000).toFixed(2)})`
	})()

	const isClimateMode = colorMode === "climate" || (ENABLE_PASTA_CLASSIFICATION && colorMode === "pastaClimate") || colorMode === "koppenClimate" || colorMode === "oceanCurrents"
	const isTemperatureMode = colorMode === "temperature" || colorMode === "biotemperature" || colorMode === "temperatureDelta"
	const isWindMode = colorMode === "windSpeed"
	const isSatelliteMode = colorMode === "satellite" || colorMode === "satelliteKoppen"
	const hoverClimateDisplay = getHoverClimateDisplay(colorMode, hoverPastaClimate, hoverKoppenClimate, hoverClimateZone)

	// --- Region colors ---
	const regionColors = useMemo(() => {
		if (!world) return null
		return computeRegionColors(
			world,
			colorMode,
			nationMode,
			populationMode,
			temperatureMonth,
			rainfallMonth,
			windMonth,
			viewMode,
		)
	}, [colorMode, nationMode, populationMode, temperatureMonth, rainfallMonth, viewMode, windMonth, world])

	const cloudData = useMemo(() => {
		if (!showClouds || !world?.rainfall || !world?.isLand) return null
		return computeClouds(world.mesh, world.rainfall, world.isLand, world.params, world.monthlyTEQ)
	}, [showClouds, world])

	const regionColorsWithClouds = useMemo(() => {
		if (!regionColors || !cloudData) return regionColors
		return applyCloudOverlay(regionColors, cloudData)
	}, [regionColors, cloudData])

	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (!world) {
			scene.updateWorld(null)
			lastWorldRef.current = null
			return
		}
		if (lastWorldRef.current !== world) {
			scene.setRegionColors(regionColorsWithClouds)
			scene.updateWorld(world)
			lastWorldRef.current = world
			return
		}
		scene.setRegionColors(regionColorsWithClouds)
	}, [regionColorsWithClouds, world])

	const thermalEquator = useMemo(() => {
		if (!world?.climate) return null
		const N = world.mesh.numRegions
		const temps = world.climate.temperature_monthly.subarray((globalMonth - 1) * N, globalMonth * N)
		return computeThermalEquatorLine(world.mesh as any, temps)
	}, [globalMonth, world])

	useEffect(() => { sceneRef.current?.setThermalEquator(showThermalEquator ? thermalEquator : null) }, [thermalEquator, showThermalEquator])
	useEffect(() => { sceneRef.current?.setRivers(showRivers && world?.rivers ? world.rivers : null) }, [world, showRivers])
	useEffect(() => { sceneRef.current?.setRiversVisible(showRivers) }, [showRivers])

	// --- Sun & lighting ---
	useEffect(() => {
		if (!sceneRef.current) return
		if (tidallyLocked) {
			// Sun at substellar point = antistellar + 180°
			const subLonDeg = (antistellarLon + 180) % 360
			const effectiveTime = (0.5 + subLonDeg / 360) * hoursPerDay
			sceneRef.current.setSunPosition(0, 0, ((effectiveTime % hoursPerDay) + hoursPerDay) % hoursPerDay, hoursPerDay)
		} else {
			sceneRef.current.setSunPosition(globalMonth, obliquity, timeOfDay, hoursPerDay)
		}
	}, [globalMonth, obliquity, timeOfDay, hoursPerDay, tidallyLocked, antistellarLon])
	useEffect(() => { sceneRef.current?.setFullAmbient(fullAmbient) }, [fullAmbient])

	// --- Measurement ---
	useEffect(() => {
		if (!isMeasuring) {
			measureRef.current = { start: null, end: null }
			setMeasureStart(null)
			setMeasureEnd(null)
			setMeasureLabelPos(null)
			sceneRef.current?.setMeasureLine(null, null)
		}
	}, [isMeasuring])

	useEffect(() => {
		if (!sceneRef.current) return
		if (!isMeasuring) { sceneRef.current.setClickHandler(null); return }
		sceneRef.current.setClickHandler((info) => {
			const m = measureRef.current
			if (m.start === null || m.end !== null) {
				m.start = info.region; m.end = null
				setMeasureStart(info.region); setMeasureEnd(null)
			} else {
				m.end = info.region; setMeasureEnd(info.region)
			}
		})
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (measureRef.current.start !== null) {
					measureRef.current = { start: null, end: null }
					setMeasureStart(null); setMeasureEnd(null); setMeasureLabelPos(null)
					sceneRef.current?.setMeasureLine(null, null)
				} else { setIsMeasuring(false) }
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [isMeasuring])

	const measureDistanceKm = useMemo(() => {
		if (measureStart === null || measureEnd === null || !world) return null
		const r = world.mesh.r_xyz
		const s = [r[measureStart * 3], r[measureStart * 3 + 1], r[measureStart * 3 + 2]] as [number, number, number]
		const e = [r[measureEnd * 3], r[measureEnd * 3 + 1], r[measureEnd * 3 + 2]] as [number, number, number]
		const dot = s[0] * e[0] + s[1] * e[1] + s[2] * e[2]
		return Math.acos(Math.max(-1, Math.min(1, dot))) * world.params.planetRadiusKm
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		if (!sceneRef.current || !world) return
		if (measureStart === null || measureEnd === null) {
			sceneRef.current.setMeasureLine(null, null); setMeasureLabelPos(null); return
		}
		const r = world.mesh.r_xyz
		const s = [r[measureStart * 3], r[measureStart * 3 + 1], r[measureStart * 3 + 2]] as [number, number, number]
		const e = [r[measureEnd * 3], r[measureEnd * 3 + 1], r[measureEnd * 3 + 2]] as [number, number, number]
		sceneRef.current.setMeasureLine(s, e)
	}, [measureStart, measureEnd, world, viewMode])

	useEffect(() => {
		if (measureStart === null || measureEnd === null || !world || !sceneRef.current) { setMeasureLabelPos(null); return }
		const r = world.mesh.r_xyz
		const s = [r[measureStart * 3], r[measureStart * 3 + 1], r[measureStart * 3 + 2]] as [number, number, number]
		const e = [r[measureEnd * 3], r[measureEnd * 3 + 1], r[measureEnd * 3 + 2]] as [number, number, number]
		const mid: [number, number, number] = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2, (s[2] + e[2]) / 2]
		let rafId = 0
		function tick() { setMeasureLabelPos(sceneRef.current?.projectToScreen(mid) ?? null); rafId = requestAnimationFrame(tick) }
		rafId = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(rafId)
	}, [measureStart, measureEnd, world, viewMode])

	// --- Wind arrows ---
	const windArrowData = useMemo(() => {
		if (!world?.wind || !isWindMode) return null
		const N = world.mesh.numRegions
		const { wind_east_monthly, wind_north_monthly, wind_speed_monthly } = world.wind
		if (windMonth === 0) {
			const east = new Float32Array(N), north = new Float32Array(N), speed = new Float32Array(N)
			for (let r = 0; r < N; r++) {
				let ex = 0, nx = 0, sp = 0
				for (let m = 0; m < 12; m++) { ex += wind_east_monthly[m * N + r]; nx += wind_north_monthly[m * N + r]; sp += wind_speed_monthly[m * N + r] }
				east[r] = ex / 12; north[r] = nx / 12; speed[r] = sp / 12
			}
			return { east, north, speed }
		}
		const off = (windMonth - 1) * N
		return {
			east: wind_east_monthly.subarray(off, off + N) as Float32Array,
			north: wind_north_monthly.subarray(off, off + N) as Float32Array,
			speed: wind_speed_monthly.subarray(off, off + N) as Float32Array,
		}
	}, [world, windMonth, isWindMode])

	useEffect(() => { sceneRef.current?.setWindArrows(windArrowData); sceneRef.current?.setWindArrowsVisible(isWindMode) }, [windArrowData, isWindMode])
	useEffect(() => { sceneRef.current?.setColorMode(colorMode) }, [colorMode])
	useEffect(() => { sceneRef.current?.setViewMode(viewMode) }, [viewMode])
	useEffect(() => { sceneRef.current?.setWireframeVisible(showWireframe) }, [showWireframe])
	useEffect(() => { sceneRef.current?.setGridVisible(showGrid) }, [showGrid])
	useEffect(() => { sceneRef.current?.setGridSpacing(gridSpacing) }, [gridSpacing])

	// --- Map center longitude ---
	const formatLongitude = useCallback((longitude: number) => {
		const suffix = longitude > 0 ? "E" : longitude < 0 ? "W" : ""
		return `${Math.abs(longitude).toFixed(0)}°${suffix}`
	}, [])
	useEffect(() => { if (mapCenterLongitudeValueRef.current) mapCenterLongitudeValueRef.current.textContent = formatLongitude(mapCenterLongitude) }, [mapCenterLongitude, formatLongitude])

	// --- Generation callbacks ---
	const generationCallbacks: GenerationCallbacks = useMemo(() => ({
		setGenerating, setGenerationProgress, setGenerationLabel,
		setSeed,
		pushRecentCode: (nextCode: string) => {
			setRecentCodes((current) => [nextCode, ...current.filter((codeValue) => codeValue !== nextCode)].slice(0, MAX_RECENT_CODES))
		},
		setPlanetCode, setPlanetCodeInput, setWorld, workerRef,
	}), [])

	const currentParams = useMemo(() => ({
		tectonicMode,
		numPoints, numPlates, landDistribution, continentSizeVariety,
		landCoverage, planetRadiusKm, obliquity, eccentricity, perihelion, sunTempFactor,
		daysPerYear, hoursPerDay, tidallyLocked, antistellarLon, jitter, roughness,
		terrainWarp, smoothing, hydraulicErosion, thermalErosion,
		ridgeSharpening, glacialErosion, volcanism, craters, pressure,
	}), [tectonicMode, numPoints, numPlates, landDistribution, continentSizeVariety,
		landCoverage, planetRadiusKm, obliquity, eccentricity, perihelion, sunTempFactor,
		daysPerYear, hoursPerDay, tidallyLocked, antistellarLon, jitter, roughness,
		terrainWarp, smoothing, hydraulicErosion, thermalErosion,
		ridgeSharpening, glacialErosion, volcanism, craters, pressure])
	const derivedPlanetCode = useMemo(() => encodePlanetCode(seed, { seed, ...currentParams }), [currentParams, seed])

	useEffect(() => {
		setPlanetCode(derivedPlanetCode)
		if (!codeInputDirty) {
			setPlanetCodeInput(derivedPlanetCode)
			setCodeError(false)
		}
	}, [codeInputDirty, derivedPlanetCode])

	const handleGenerateWorld = useCallback((overrideSeed: number, overrides?: Record<string, number | boolean>) => {
		generateWorld(overrideSeed, overrides, currentParams, generationCallbacks)
	}, [currentParams, generationCallbacks])

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
			handleGenerateWorld(decoded.seed, decoded)
			return
		}
		handleGenerateWorld(seed)
	}, [handleGenerateWorld, planetCodeInput, resolveSeedInput, seed])

	const setters = useMemo(() => ({
		setTectonicMode, setNumPoints, setJitter, setNumPlates, setLandDistribution,
		setContinentSizeVariety, setLandCoverage, setRoughness,
		setPlanetRadiusKm, setObliquity, setEccentricity, setPerihelion,
		setSunTempFactor, setDaysPerYear, setHoursPerDay,
		setTidallyLocked, setAntistellarLon, setPressure, setTerrainWarp, setSmoothing,
		setHydraulicErosion, setThermalErosion, setRidgeSharpening,
		setGlacialErosion, setVolcanism, setCraters,
	}), [])
	const applyDecodedCode = useCallback((decoded: NonNullable<ReturnType<typeof decodePlanetCode>>) => {
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
		setters.setDaysPerYear(decoded.daysPerYear)
		setters.setHoursPerDay(decoded.hoursPerDay)
		setters.setTidallyLocked(decoded.tidallyLocked)
		setters.setAntistellarLon(decoded.antistellarLon)
		setters.setPressure(decoded.pressure)
		setters.setTerrainWarp(decoded.terrainWarp)
		setters.setSmoothing(decoded.smoothing)
		setters.setHydraulicErosion(decoded.hydraulicErosion)
		setters.setThermalErosion(decoded.thermalErosion)
		setters.setRidgeSharpening(decoded.ridgeSharpening)
		setters.setGlacialErosion(decoded.glacialErosion)
		setters.setVolcanism(decoded.volcanism)
		setters.setCraters(decoded.craters ?? 0)
		setters.setTectonicMode(decoded.tectonicMode === "stagnant" ? 1 : 0)
	}, [setters])
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

	const handleImportHeightmap = useCallback((grayscale: Uint8Array, imageWidth: number, imageHeight: number) => {
		const importParams = {
			seed, numPoints, jitter, planetRadiusKm, obliquity, eccentricity, perihelion, sunTempFactor,
			daysPerYear, hoursPerDay, pressure, tidallyLocked, antistellarLon, terrainWarp, smoothing,
			hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, volcanism, craters,
		}
		importHeightmap(grayscale, imageWidth, imageHeight, importParams, generationCallbacks)
	}, [seed, numPoints, jitter, planetRadiusKm, obliquity, eccentricity, perihelion, sunTempFactor,
		daysPerYear, hoursPerDay, tidallyLocked, antistellarLon, terrainWarp, smoothing,
		hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, volcanism, craters, pressure, generationCallbacks])

	const handleFileImport = useCallback(async (file: File) => {
		try {
			const { grayscale, width, height } = await loadImageAsGrayscale(file)
			handleImportHeightmap(grayscale, width, height)
		} catch (err) {
			console.error("Failed to load heightmap:", err)
			setGenerationLabel("Failed to load image")
		}
	}, [handleImportHeightmap])

	const handleEarthImport = useCallback(async () => {
		try {
			const { grayscale, width, height } = await loadImageAsGrayscale("/earth.png")
			handleImportHeightmap(grayscale, width, height)
		} catch (err) {
			console.error("Failed to load Earth heightmap:", err)
			setGenerationLabel("Failed to load Earth heightmap")
		}
	}, [handleImportHeightmap])

	const handleResetDefaults = useCallback(() => resetWorldDefaults(tectonicMode, setters), [tectonicMode, setters])
	const handleRandomizeCode = useCallback(() => {
		const nextSeed = makeRandomSeed()
		setSeed(nextSeed)
		setCodeInputDirty(false)
		setCodeError(false)
	}, [makeRandomSeed])

	const handleSelectRecentCode = useCallback((nextCode: string) => {
		setPlanetCodeInput(nextCode)
		setCodeInputDirty(false)
		setCodeError(false)
		const decoded = decodePlanetCode(nextCode)
		if (decoded) applyDecodedCode(decoded)
	}, [applyDecodedCode])

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

	// --- Slider definitions ---
	const planetSliders = buildPlanetSliders({
		tectonicMode,
		planetRadiusKm, obliquity, eccentricity, perihelion, sunTempFactor,
		daysPerYear, hoursPerDay, pressure, landDistribution, landCoverage,
		tidallyLocked, antistellarLon,
		setPlanetRadiusKm, setObliquity, setEccentricity, setPerihelion, setSunTempFactor,
		setDaysPerYear, setHoursPerDay, setPressure, setLandDistribution, setLandCoverage,
		setAntistellarLon,
	})
	const terrainSliders = buildTerrainSliders({
		tectonicMode,
		numPoints, jitter, numPlates, roughness, continentSizeVariety,
		terrainWarp, smoothing, hydraulicErosion, thermalErosion,
		ridgeSharpening, glacialErosion, volcanism, craters,
		setTectonicMode, setNumPoints, setJitter, setNumPlates, setRoughness, setContinentSizeVariety,
		setTerrainWarp, setSmoothing, setHydraulicErosion, setThermalErosion,
		setRidgeSharpening, setGlacialErosion, setVolcanism, setCraters,
	})

	// --- Planet stats ---
	const planetStats = useMemo(() => computePlanetStats(world, {
		obliquity, eccentricity, perihelion, sunTempFactor, daysPerYear, hoursPerDay,
		planetRadiusKm, pressure, tidallyLocked, antistellarLon,
	}), [daysPerYear, eccentricity, perihelion, hoursPerDay, obliquity, planetRadiusKm, pressure, sunTempFactor, tidallyLocked, antistellarLon, world])

	// --- Render ---
	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{sidebarOpen && <Sidebar
				worldTab={worldTab} setWorldTab={setWorldTab}
				resetWorldDefaults={handleResetDefaults}
				tidallyLocked={tidallyLocked} setTidallyLocked={setTidallyLocked} setObliquity={setObliquity}
				planetSliders={planetSliders} terrainSliders={terrainSliders}
				planetCode={planetCode} codeInput={planetCodeInput} setCodeInput={handleCodeInputChange} onApplyCode={handleApplyCode} codeError={codeError} recentCodes={recentCodes} onSelectRecentCode={handleSelectRecentCode} onRandomizeCode={handleRandomizeCode}
				generating={generating} generationLabel={generationLabel} generationProgress={generationProgress}
				handleGenerate={handleGenerate}
				handleFileImport={handleFileImport} handleEarthImport={handleEarthImport}
				onBack={onBack}
				onClose={() => setSidebarOpen(false)}
			/>}

			<div ref={viewportRef} className="flex-1 h-[56vh] xl:h-full relative overflow-hidden bg-[#050510]">
				<canvas ref={canvasRef} className={`w-full h-full block ${isMeasuring ? "cursor-crosshair" : ""}`} />

				{hoverInfo && hoverElevationKm !== null ? (
					<InfoPanel
						hoverInfo={hoverInfo}
						hoverElevationKm={hoverElevationKm} hoverTopography={hoverTopography}
						hoverCoordinates={hoverCoordinates} hoverLandmark={hoverLandmark}
						hoverIsLand={hoverIsLand}
						hoverTemperature={hoverTemperature} hoverBiotemperature={hoverBiotemperature} hoverTemperatureDelta={hoverTemperatureDelta}
						hoverRainfall={hoverRainfall}
						hoverClimateDisplay={hoverClimateDisplay} hoverIceDebug={hoverIceDebug} hoverIceSummary={hoverIceSummary}
						hoverBiome={hoverBiome}
						hoverProvince={hoverProvince}
						hoverBasinId={hoverBasinId}
						hoverOceanDist={hoverOceanDist} hoverDistCoast={hoverDistCoast} hoverDistCoastKm={hoverDistCoastKm}
						hoverWind={hoverWind}
						hoverHazards={hoverHazards}
						hoverHotspot={hoverHotspot}
						hoverRiver={hoverRiver}
						hoverTerrainFeature={hoverTerrainFeature}
						colorMode={colorMode} isClimateMode={isClimateMode} isSatelliteMode={isSatelliteMode} isWindMode={isWindMode}
						tempAnnual={tempAnnual} rainAnnual={rainAnnual} windAnnual={windAnnual}
						globalMonth={globalMonth}
						showPastaDebug={showPastaDebug}
						world={world} hoverCardRef={hoverCardRef}
					/>
				) : (
					<GlobalInfoPanel planetStats={planetStats} />
				)}

				<OverlayControls
					overlaysExpanded={overlaysExpanded} setOverlaysExpanded={setOverlaysExpanded}
					showWireframe={showWireframe} setShowWireframe={setShowWireframe}
					showRivers={showRivers} setShowRivers={setShowRivers}
					showClouds={showClouds} setShowClouds={setShowClouds}
					showThermalEquator={showThermalEquator} setShowThermalEquator={setShowThermalEquator}
					showGrid={showGrid} setShowGrid={setShowGrid}
					gridSpacing={gridSpacing} setGridSpacing={setGridSpacing}
					showPastaDebug={showPastaDebug} setShowPastaDebug={setShowPastaDebug}
					sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(true)}
				/>

				<TimeControls
					timeExpanded={timeExpanded} setTimeExpanded={setTimeExpanded}
					globalMonth={globalMonth} setGlobalMonth={setGlobalMonth}
					timeOfDay={timeOfDay} setTimeOfDay={setTimeOfDay}
					tidallyLocked={tidallyLocked} hoursPerDay={hoursPerDay}
				/>

				<div className="absolute top-3 right-3 z-10 flex items-center gap-2">
					{planetCode && (
						<button
							onClick={handleCopyCode}
							title={codeCopied ? "Copied" : "Copy code"}
							className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
								codeCopied
									? "border-emerald-300/60 bg-emerald-400/20 text-emerald-100"
									: "border-white/10 bg-slate-950/75 text-slate-400 hover:text-slate-200"
							} backdrop-blur-sm`}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
							</svg>
						</button>
					)}
					{viewMode === "globe" && (
						<button
							onClick={() => setFullAmbient(v => !v)}
							title={fullAmbient ? "Switch to sunlit" : "Switch to full ambient"}
							className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
								fullAmbient
									? "border-white/20 bg-white/15 text-yellow-300"
									: "border-white/10 bg-slate-950/75 text-slate-400 hover:text-slate-200"
							} backdrop-blur-sm`}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
								<circle cx="8" cy="8" r="3" />
							</svg>
						</button>
					)}
				</div>

				{measureDistanceKm !== null && measureLabelPos && (
					<div
						className="pointer-events-none absolute z-20 rounded-lg border border-white/10 bg-slate-950/85 px-2.5 py-1 text-white shadow-2xl backdrop-blur-sm"
						style={{ left: measureLabelPos[0], top: measureLabelPos[1] - 32, transform: "translateX(-50%)" }}
					>
						<span className="font-mono text-xs font-semibold">
							{measureDistanceKm < 100
								? `${measureDistanceKm.toFixed(1)} km`
								: `${Math.round(measureDistanceKm).toLocaleString()} km`}
						</span>
					</div>
				)}

				<ModeBar
					viewMode={viewMode} setViewMode={setViewMode}
					colorMode={colorMode} setColorMode={setColorMode}
					nationMode={nationMode}
					setNationMode={setNationMode}
					populationMode={populationMode}
					setPopulationMode={setPopulationMode}
					isClimateMode={isClimateMode} isTemperatureMode={isTemperatureMode}
					isSatelliteMode={isSatelliteMode} isWindMode={isWindMode}
					isMeasuring={isMeasuring} setIsMeasuring={setIsMeasuring}
					tempAnnual={tempAnnual} setTempAnnual={setTempAnnual}
					rainAnnual={rainAnnual} setRainAnnual={setRainAnnual}
					windAnnual={windAnnual} setWindAnnual={setWindAnnual}
					showPastaDebug={showPastaDebug}
				/>
			</div>
		</div>
	)
}
