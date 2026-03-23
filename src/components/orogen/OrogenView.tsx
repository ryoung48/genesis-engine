import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { encodePlanetCode, decodePlanetCode } from "@/model/orogen/planet-code"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedOrogenWorld,
} from "@/model/orogen/worker-types"
import { createOrogenScene, type OrogenScene, type OrogenViewMode } from "./renderer"
import { elevToHeightKm, elevationToColor, getColor, temperatureColor, precipitationColor, vegetationColor, climateZoneColor, climateTempColor, oceanCurrentColor, windSpeedColor, type ColorMode } from "./colors"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/orogen/vegetation"
import { PASTA_LABELS, pastaClimateColor, pastaClimateName } from "@/model/orogen/pasta"
import { KOPPEN_LABELS, koppenClimateColor } from "@/model/orogen/koppen"
import { ENABLE_PASTA_CLASSIFICATION } from "@/model/orogen/features"
import { computeThermalEquatorLine } from "@/model/orogen/rain"
import { OROGEN_TOPOGRAPHY_LABELS } from "@/model/orogen/types"
import {
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_PLANET_RADIUS_KM,
	DEFAULT_SUN_TEMP_FACTOR,
	meanEdgeLengthKm,
} from "@/model/orogen/units"

function darkenVegetationAtElevation(
	color: [number, number, number],
	elevation: number,
): [number, number, number] {
	const heightKm = Math.max(0, elevToHeightKm(elevation))
	const shade = 1 - Math.min(0.55, heightKm * 0.075)
	return [color[0] * shade, color[1] * shade, color[2] * shade]
}

function darkenClimateAtElevation(
	color: [number, number, number],
	elevation: number,
): [number, number, number] {
	const heightKm = Math.max(0, elevToHeightKm(elevation))
	const shade = 1 - Math.min(0.45, heightKm * 0.06)
	return [color[0] * shade, color[1] * shade, color[2] * shade]
}

interface OrogenViewProps {
	onBack: () => void
}

export const OrogenView: React.FC<OrogenViewProps> = ({ onBack }) => {
	const monthLabels = ["Annual", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	const DEFAULT_WORLD_PARAMS = {
		numPoints: 204000,
		jitter: 0.75,
		numPlates: 80,
		landDistribution: 0.25,
		continentSizeVariety: 0.35,
		landCoverage: 0.3,
		roughness: 0.40,
		planetRadiusKm: DEFAULT_PLANET_RADIUS_KM,
		obliquity: DEFAULT_OBLIQUITY_DEG,
		eccentricity: DEFAULT_ECCENTRICITY,
		sunTempFactor: DEFAULT_SUN_TEMP_FACTOR,
		daysPerYear: DEFAULT_DAYS_PER_YEAR,
		hoursPerDay: DEFAULT_HOURS_PER_DAY,
		terrainWarp: 0.75,
		smoothing: 0.1,
		hydraulicErosion: 0.5,
		thermalErosion: 0.1,
		ridgeSharpening: 0.50,
		glacialErosion: 0.50,
		craters: 0,
	} as const
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const sceneRef = useRef<OrogenScene | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const mapCenterLongitudeValueRef = useRef<HTMLSpanElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [world, setWorld] = useState<SerializedOrogenWorld | null>(null)
	const [generating, setGenerating] = useState(false)
	const [generationProgress, setGenerationProgress] = useState(0)
	const [generationLabel, setGenerationLabel] = useState("Idle")
	const [colorMode, setColorMode] = useState<ColorMode>("terrain")
	const [temperatureMonth, setTemperatureMonth] = useState(0)
	const [rainfallMonth, setRainfallMonth] = useState(0)
	const [windMonth, setWindMonth] = useState(0)
	const [viewMode, setViewMode] = useState<OrogenViewMode>("globe")
	const [mapCenterLongitude, setMapCenterLongitude] = useState(0)
	const [showWireframe, setShowWireframe] = useState(false)
	const [showGrid, setShowGrid] = useState(true)
	const [showThermalEquator, setShowThermalEquator] = useState(false)
	const [showRivers, setShowRivers] = useState(false)
	const [gridSpacing, setGridSpacing] = useState(15)
	const [controlTab, setControlTab] = useState<"world" | "view">("world")
	const [worldTab, setWorldTab] = useState<"planet" | "terrain">("planet")
	const [hoverInfo, setHoverInfo] = useState<{
		region: number
		x: number
		y: number
	} | null>(null)

	const [seed, setSeed] = useState(() => Math.floor(Math.random() * 16777216))
	const [planetCode, setPlanetCode] = useState("")
	const [planetCodeInput, setPlanetCodeInput] = useState("")
	const [codeError, setCodeError] = useState(false)
	// Shape Your World - orogen defaults
	const [numPoints, setNumPoints] = useState(DEFAULT_WORLD_PARAMS.numPoints)
	const [jitter, setJitter] = useState(DEFAULT_WORLD_PARAMS.jitter)
	const [numPlates, setNumPlates] = useState(DEFAULT_WORLD_PARAMS.numPlates)
	const [landDistribution, setLandDistribution] = useState(DEFAULT_WORLD_PARAMS.landDistribution)
	const [continentSizeVariety, setContinentSizeVariety] = useState(DEFAULT_WORLD_PARAMS.continentSizeVariety)
	const [landCoverage, setLandCoverage] = useState(DEFAULT_WORLD_PARAMS.landCoverage)
	const [roughness, setRoughness] = useState(DEFAULT_WORLD_PARAMS.roughness)
	const [planetRadiusKm, setPlanetRadiusKm] = useState(DEFAULT_WORLD_PARAMS.planetRadiusKm)
	const [obliquity, setObliquity] = useState(DEFAULT_WORLD_PARAMS.obliquity)
	const [eccentricity, setEccentricity] = useState(DEFAULT_WORLD_PARAMS.eccentricity)
	const [sunTempFactor, setSunTempFactor] = useState(DEFAULT_WORLD_PARAMS.sunTempFactor)
	const [daysPerYear, setDaysPerYear] = useState(DEFAULT_WORLD_PARAMS.daysPerYear)
	const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_WORLD_PARAMS.hoursPerDay)
	const [tidallyLocked, setTidallyLocked] = useState(false)
	// Terrain Sculpting - orogen defaults
	const [terrainWarp, setTerrainWarp] = useState(DEFAULT_WORLD_PARAMS.terrainWarp)
	const [smoothing, setSmoothing] = useState(DEFAULT_WORLD_PARAMS.smoothing)
	const [hydraulicErosion, setHydraulicErosion] = useState(DEFAULT_WORLD_PARAMS.hydraulicErosion)
	const [thermalErosion, setThermalErosion] = useState(DEFAULT_WORLD_PARAMS.thermalErosion)
	const [ridgeSharpening, setRidgeSharpening] = useState(DEFAULT_WORLD_PARAMS.ridgeSharpening)
	const [glacialErosion, setGlacialErosion] = useState(DEFAULT_WORLD_PARAMS.glacialErosion)
	const [craters, setCraters] = useState(DEFAULT_WORLD_PARAMS.craters)

	// Initialize Three.js scene
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

		// ResizeObserver for container-driven resizing
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

	// Update scene when world changes
	useEffect(() => {
		if (world && sceneRef.current) {
			sceneRef.current.updateWorld(world)
		}
	}, [world])

	useEffect(() => {
		if (!world) {
			setHoverInfo(null)
		}
	}, [world])

	const hoverElevationKm = hoverInfo && world
		? elevToHeightKm(world.elevation[hoverInfo.region] ?? 0)
		: null

	const hoverTopography = hoverInfo && world?.topography
		? OROGEN_TOPOGRAPHY_LABELS[world.topography[hoverInfo.region]] ?? null
		: null

	const hoverCoordinates = useMemo(() => {
		if (!hoverInfo || !world) return null
		const base = hoverInfo.region * 3
		const x = world.mesh.r_xyz[base]
		const y = world.mesh.r_xyz[base + 1]
		const z = world.mesh.r_xyz[base + 2]
		const lat = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const lon = Math.atan2(y, x) * (180 / Math.PI)
		const latLabel = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`
		const lonLabel = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
		return `${latLabel}, ${lonLabel}`
	}, [hoverInfo, world])

	const hoverTemperature = hoverInfo && world?.climate
		? (temperatureMonth === 0
			? world.climate.temperature_avg[hoverInfo.region]
			: world.climate.temperature_monthly[(temperatureMonth - 1) * world.mesh.numRegions + hoverInfo.region])
		: null

	const hoverBiotemperature = hoverInfo && world?.climate
		? Math.max(0, world.climate.temperature_avg[hoverInfo.region])
		: null

	const hoverRainfall = hoverInfo && world?.rainfall && world.elevation[hoverInfo.region] > 0
		? (rainfallMonth === 0
			? world.rainfall.annual[hoverInfo.region]
			: world.rainfall.monthly[(rainfallMonth - 1) * world.mesh.numRegions + hoverInfo.region])
		: null

	const hoverClimateZone = hoverInfo && world?.climateZones && world.elevation[hoverInfo.region] > 0
		? CLIMATE_LABELS[world.climateZones[hoverInfo.region]] ?? null
		: null

	const hoverPastaClimate = hoverInfo && world?.pastaClimate
		? {
			code: PASTA_LABELS[world.pastaClimate[hoverInfo.region]] ?? null,
			name: pastaClimateName(world.pastaClimate[hoverInfo.region]),
		}
		: null

	const hoverKoppenClimate = hoverInfo && world?.koppenClimate && world.elevation[hoverInfo.region] > 0
		? KOPPEN_LABELS[world.koppenClimate[hoverInfo.region]] ?? null
		: null

	const hoverBiome = hoverInfo && world?.vegetation && world.elevation[hoverInfo.region] > 0
		? BIOME_LABELS[world.vegetation[hoverInfo.region]] ?? null
		: null

	const hoverRiverLand = hoverInfo && world?.riverLand
		? world.riverLand[hoverInfo.region]
		: null

	const hoverIsLand = hoverInfo && world?.isLand
		? world.isLand[hoverInfo.region]
		: null

	const hoverOceanDist = hoverInfo && world?.oceanDist
		? world.oceanDist[hoverInfo.region]
		: null

	const hoverDistCoast = hoverInfo && world?.distCoast && world.elevation[hoverInfo.region] <= 0
		? world.distCoast[hoverInfo.region]
		: null

	const hoverWind = hoverInfo && world?.wind
		? (() => {
			const r = hoverInfo.region
			const N = world.mesh.numRegions
			const m = windMonth === 0 ? -1 : windMonth - 1
			if (m < 0) {
				let eSum = 0, nSum = 0, sSum = 0
				for (let i = 0; i < 12; i++) {
					eSum += world.wind.wind_east_monthly[i * N + r]
					nSum += world.wind.wind_north_monthly[i * N + r]
					sSum += world.wind.wind_speed_monthly[i * N + r]
				}
				return { east: eSum / 12, north: nSum / 12, speed: sSum / 12 }
			}
			return {
				east: world.wind.wind_east_monthly[m * N + r],
				north: world.wind.wind_north_monthly[m * N + r],
				speed: world.wind.wind_speed_monthly[m * N + r],
			}
		})()
		: null

	const coastHopLengthKm = useMemo(() => {
		if (!world) return null
		return meanEdgeLengthKm(world.mesh, world.params.planetRadiusKm)
	}, [world])

	const hoverDistCoastKm = hoverDistCoast !== null && coastHopLengthKm !== null
		? (Number.isFinite(hoverDistCoast) ? hoverDistCoast * coastHopLengthKm : Infinity)
		: null

	const hoverCardLeft = (() => {
		if (!hoverInfo) return 0
		const viewportWidth = viewportRef.current?.clientWidth ?? 0
		return Math.max(16, Math.min(hoverInfo.x + 18, viewportWidth - 144))
	})()

	const hoverCardTop = hoverInfo
		? Math.max(16, hoverInfo.y - 18)
		: 0

	const isClimateMode =
		colorMode === "climate" ||
		(ENABLE_PASTA_CLASSIFICATION && colorMode === "pastaClimate") ||
		colorMode === "koppenClimate"

	const isTemperatureMode =
		colorMode === "temperature" ||
		colorMode === "biotemperature"

	const isWindMode = colorMode === "windSpeed"

	// Precompute per-region RGB colors for data-driven modes
	const regionColors = useMemo(() => {
		if (!world) return null
		const N = world.mesh.numRegions
		const rgb = new Float32Array(N * 3)

		if ((colorMode === "temperature" || colorMode === "biotemperature") && world.climate) {
			const temps = temperatureMonth === 0
				? world.climate.temperature_avg
				: world.climate.temperature_monthly.subarray(
					(temperatureMonth - 1) * N,
					temperatureMonth * N,
				)
			for (let r = 0; r < N; r++) {
				const temp = colorMode === "biotemperature"
					? Math.max(0, world.climate.temperature_avg[r])
					: temps[r]
				const [cr, cg, cb] = temperatureColor(temp)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}

		if (colorMode === "precipitation" && world.rainfall) {
			if (rainfallMonth === 0) {
				// Annual: scale down to monthly-equivalent for color ramp
				for (let r = 0; r < N; r++) {
					const [cr, cg, cb] = world.elevation[r] <= 0
						? precipitationColor(world.rainfall.annual[r] / 12)
						: darkenClimateAtElevation(
							precipitationColor(world.rainfall.annual[r] / 12),
							world.elevation[r],
						)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			} else {
				const offset = (rainfallMonth - 1) * N
				for (let r = 0; r < N; r++) {
					const [cr, cg, cb] = world.elevation[r] <= 0
						? precipitationColor(world.rainfall.monthly[offset + r])
						: darkenClimateAtElevation(
							precipitationColor(world.rainfall.monthly[offset + r]),
							world.elevation[r],
						)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			// Ocean cells: dark blue
			for (let r = 0; r < N; r++) {
				if (world.elevation[r] <= 0) {
					rgb[3 * r] = 0.05
					rgb[3 * r + 1] = 0.08
					rgb[3 * r + 2] = 0.18
				}
			}
			return rgb
		}

		if (colorMode === "vegetation" && world.vegetation) {
			const lakes = world.rivers?.lakes
			for (let r = 0; r < N; r++) {
				if (lakes?.[r]) {
					const [cr, cg, cb] = getColor(Math.min(0, world.elevation[r]), "terrain")
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					const [cr, cg, cb] = darkenVegetationAtElevation(
						vegetationColor(world.vegetation[r]),
						world.elevation[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}

		if (ENABLE_PASTA_CLASSIFICATION && colorMode === "pastaClimate" && world.pastaClimate) {
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = pastaClimateColor(world.pastaClimate[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}

		if (colorMode === "koppenClimate" && world.koppenClimate) {
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = koppenClimateColor(world.koppenClimate[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}

		if (colorMode === "climate" && world.climate) {
			const CHAOTIC_MIN = 10
			const CHAOTIC_MAX = 50
			const BLEND_THRESHOLD = 15
			const chaoticRgb = climateZoneColor(8) // chaotic purple
			for (let r = 0; r < N; r++) {
				if (world.elevation[r] <= 0) {
					rgb[3 * r] = 0.05; rgb[3 * r + 1] = 0.08; rgb[3 * r + 2] = 0.18
					continue
				}
				// Continuous color from mean temperature
				let [cr, cg, cb] = climateTempColor(world.climate.temperature_avg[r])
				// Blend toward chaotic when temperature swings approach extremes
				const minT = Math.min(BLEND_THRESHOLD, Math.max(CHAOTIC_MIN - world.climate.temperature_min[r], 0))
				const maxT = Math.min(BLEND_THRESHOLD, Math.max(world.climate.temperature_max[r] - CHAOTIC_MAX, 0))
				if (minT > 0 && maxT > 0) {
					const t = (minT + maxT) / 2 / BLEND_THRESHOLD
					cr += (chaoticRgb[0] - cr) * t
					cg += (chaoticRgb[1] - cg) * t
					cb += (chaoticRgb[2] - cb) * t
				}
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}

		if (colorMode === "windSpeed" && world.wind) {
			if (windMonth === 0) {
				// Annual average speed
				for (let r = 0; r < N; r++) {
					let sum = 0
					for (let m = 0; m < 12; m++) sum += world.wind.wind_speed_monthly[m * N + r]
					const [cr, cg, cb] = windSpeedColor(sum / 12)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			} else {
				const off = (windMonth - 1) * N
				for (let r = 0; r < N; r++) {
					const [cr, cg, cb] = windSpeedColor(world.wind.wind_speed_monthly[off + r])
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}

		if (colorMode === "oceanCurrents" && world.oceanCurrents) {
			const { oceanWarmth, coastalWarmth } = world.oceanCurrents
			for (let r = 0; r < N; r++) {
				const value = world.isLand?.[r]
					? coastalWarmth[r]
					: oceanWarmth[r]
				const [cr, cg, cb] = oceanCurrentColor(value)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
		}

		// Terrain / heightmap modes — use isLand to color depressions and lakes
		if (world.isLand) {
			// Sea-level land color (first land stop) → depression teal
			const seaR = 0xAC / 255, seaG = 0xD0 / 255, seaB = 0xA5 / 255
			const depR = 0xA7 / 255, depG = 0xDF / 255, depB = 0xD2 / 255
			const lakes = world.rivers?.lakes
			for (let r = 0; r < N; r++) {
				const e = world.elevation[r]
				if (lakes?.[r]) {
					// Lake cell — use elevation for depth, clamp positive elevations to 0
					const [cr, cg, cb] = getColor(Math.min(0, e), "terrain")
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (world.isLand[r] && e <= 0) {
					// Below-sea-level land depression (not filled with water)
					const depthKm = -elevToHeightKm(e)
					const t = Math.min(1, Math.sqrt(depthKm / 1))
					rgb[3 * r] = seaR + (depR - seaR) * t
					rgb[3 * r + 1] = seaG + (depG - seaG) * t
					rgb[3 * r + 2] = seaB + (depB - seaB) * t
				} else if (!world.isLand[r]) {
					// Ocean cell — always use water color, clamp elevation to <= 0
					const [cr, cg, cb] = getColor(Math.min(0, e), "terrain")
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					const [cr, cg, cb] = getColor(e, colorMode)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}

		return null
	}, [colorMode, temperatureMonth, rainfallMonth, windMonth, world])

	// Compute thermal equator: for each longitude bin, find latitude of max temperature
	const thermalEquator = useMemo(() => {
		if (!world?.climate) return null
		const N = world.mesh.numRegions
		const temps = temperatureMonth === 0
			? world.climate.temperature_avg
			: world.climate.temperature_monthly.subarray(
				(temperatureMonth - 1) * N,
				temperatureMonth * N,
			)
		return computeThermalEquatorLine(world.mesh as any, temps)
	}, [temperatureMonth, world])

	// Update color mode + region colors
	useEffect(() => {
		if (!ENABLE_PASTA_CLASSIFICATION && colorMode === "pastaClimate") {
			setColorMode("climate")
		}
	}, [colorMode])

	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setRegionColors(regionColors)
	}, [regionColors])

	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setThermalEquator(showThermalEquator ? thermalEquator : null)
	}, [thermalEquator, showThermalEquator])

	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setRivers(showRivers && world?.rivers ? world.rivers : null)
	}, [world, showRivers])

	useEffect(() => {
		sceneRef.current?.setRiversVisible(showRivers)
	}, [showRivers])

	// Wind arrows: compute per-month or annual average vectors
	const windArrowData = useMemo(() => {
		if (!world?.wind || !isWindMode) return null
		const N = world.mesh.numRegions
		const { wind_east_monthly, wind_north_monthly, wind_speed_monthly } = world.wind
		if (windMonth === 0) {
			const east = new Float32Array(N)
			const north = new Float32Array(N)
			const speed = new Float32Array(N)
			for (let r = 0; r < N; r++) {
				let ex = 0, nx = 0, sp = 0
				for (let m = 0; m < 12; m++) {
					ex += wind_east_monthly[m * N + r]
					nx += wind_north_monthly[m * N + r]
					sp += wind_speed_monthly[m * N + r]
				}
				east[r] = ex / 12
				north[r] = nx / 12
				speed[r] = sp / 12
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

	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setWindArrows(windArrowData)
		sceneRef.current.setWindArrowsVisible(isWindMode)
	}, [windArrowData, isWindMode])

	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setColorMode(colorMode)
	}, [colorMode])

	useEffect(() => {
		if (sceneRef.current) {
			sceneRef.current.setViewMode(viewMode)
		}
	}, [viewMode])

	useEffect(() => {
		sceneRef.current?.setWireframeVisible(showWireframe)
	}, [showWireframe])

	useEffect(() => {
		sceneRef.current?.setGridVisible(showGrid)
	}, [showGrid])

	useEffect(() => {
		sceneRef.current?.setGridSpacing(gridSpacing)
	}, [gridSpacing])

	const formatLongitude = useCallback((longitude: number) => {
		const suffix = longitude > 0 ? "E" : longitude < 0 ? "W" : ""
		return `${Math.abs(longitude).toFixed(0)}°${suffix}`
	}, [])

	useEffect(() => {
		if (mapCenterLongitudeValueRef.current) {
			mapCenterLongitudeValueRef.current.textContent = formatLongitude(mapCenterLongitude)
		}
	}, [mapCenterLongitude, formatLongitude])

	const handleMapCenterLongitudeInput = useCallback((value: number) => {
		if (mapCenterLongitudeValueRef.current) {
			mapCenterLongitudeValueRef.current.textContent = formatLongitude(value)
		}
		sceneRef.current?.setMapCenterLongitude(value)
	}, [formatLongitude])

	const commitMapCenterLongitude = useCallback((value: number) => {
		setMapCenterLongitude(value)
		sceneRef.current?.commitMapCenterLongitude()
	}, [])

	const resetWorldDefaults = useCallback(() => {
		setNumPoints(DEFAULT_WORLD_PARAMS.numPoints)
		setJitter(DEFAULT_WORLD_PARAMS.jitter)
		setNumPlates(DEFAULT_WORLD_PARAMS.numPlates)
		setLandDistribution(DEFAULT_WORLD_PARAMS.landDistribution)
		setContinentSizeVariety(DEFAULT_WORLD_PARAMS.continentSizeVariety)
		setLandCoverage(DEFAULT_WORLD_PARAMS.landCoverage)
		setRoughness(DEFAULT_WORLD_PARAMS.roughness)
		setPlanetRadiusKm(DEFAULT_WORLD_PARAMS.planetRadiusKm)
		setObliquity(DEFAULT_WORLD_PARAMS.obliquity)
		setEccentricity(DEFAULT_WORLD_PARAMS.eccentricity)
		setSunTempFactor(DEFAULT_WORLD_PARAMS.sunTempFactor)
		setDaysPerYear(DEFAULT_WORLD_PARAMS.daysPerYear)
		setHoursPerDay(DEFAULT_WORLD_PARAMS.hoursPerDay)
		setTidallyLocked(false)
		setTerrainWarp(DEFAULT_WORLD_PARAMS.terrainWarp)
		setSmoothing(DEFAULT_WORLD_PARAMS.smoothing)
		setHydraulicErosion(DEFAULT_WORLD_PARAMS.hydraulicErosion)
		setThermalErosion(DEFAULT_WORLD_PARAMS.thermalErosion)
		setRidgeSharpening(DEFAULT_WORLD_PARAMS.ridgeSharpening)
		setGlacialErosion(DEFAULT_WORLD_PARAMS.glacialErosion)
		setCraters(DEFAULT_WORLD_PARAMS.craters)
	}, [])

	const generateWorld = useCallback((overrideSeed: number, overrides?: Record<string, number>) => {
		setGenerating(true)
		setGenerationProgress(0)
		setGenerationLabel("Starting generation...")
		setSeed(overrideSeed)

		const params = {
			seed: overrideSeed,
			numPoints: overrides?.numPoints ?? numPoints,
			numPlates: overrides?.numPlates ?? numPlates,
			landDistribution: overrides?.landDistribution ?? landDistribution,
			continentSizeVariety: overrides?.continentSizeVariety ?? continentSizeVariety,
			landCoverage: overrides?.landCoverage ?? landCoverage,
			planetRadiusKm: overrides?.planetRadiusKm ?? planetRadiusKm,
			obliquity: (overrides?.tidallyLocked ? true : tidallyLocked) ? 0 : (overrides?.obliquity ?? obliquity),
			eccentricity: overrides?.eccentricity ?? eccentricity,
			sunTempFactor: overrides?.sunTempFactor ?? sunTempFactor,
			daysPerYear: overrides?.daysPerYear ?? daysPerYear,
			hoursPerDay: overrides?.hoursPerDay ?? hoursPerDay,
			pressure: 1.0,
			tidallyLocked: overrides?.tidallyLocked ? true : tidallyLocked,
			jitter: overrides?.jitter ?? jitter,
			roughness: overrides?.roughness ?? roughness,
			terrainWarp: overrides?.terrainWarp ?? terrainWarp,
			smoothing: overrides?.smoothing ?? smoothing,
			hydraulicErosion: overrides?.hydraulicErosion ?? hydraulicErosion,
			thermalErosion: overrides?.thermalErosion ?? thermalErosion,
			ridgeSharpening: overrides?.ridgeSharpening ?? ridgeSharpening,
			glacialErosion: overrides?.glacialErosion ?? glacialErosion,
			craters: overrides?.craters ?? craters,
		}

		workerRef.current?.terminate()
		const worker = new Worker(
			new URL("../../model/orogen/orogen.worker.ts", import.meta.url),
			{ type: "module" },
		)
		workerRef.current = worker

		worker.onmessage = (event: MessageEvent<OrogenWorkerResponse>) => {
			const message = event.data
			if (message.type === "progress") {
				setGenerationLabel(message.label)
				setGenerationProgress((current) => message.pct ?? current)
				return
			}

			if (message.type === "done") {
				const code = encodePlanetCode(overrideSeed, params)
				setPlanetCode(code)
				setPlanetCodeInput(code)
				setWorld(message.world)
				setGenerationLabel("Done")
				setGenerationProgress(100)
				setGenerating(false)
				worker.terminate()
				if (workerRef.current === worker) workerRef.current = null
				return
			}

			console.error("Orogen worker failed", message.message, message.stack)
			setGenerationLabel("Generation failed")
			setGenerating(false)
			worker.terminate()
			if (workerRef.current === worker) workerRef.current = null
		}

		worker.onerror = (event) => {
			console.error("Orogen worker crashed", event.message)
			setGenerationLabel("Generation failed")
			setGenerating(false)
			worker.terminate()
			if (workerRef.current === worker) workerRef.current = null
		}

	const request: OrogenWorkerRequest = { type: "generate", params }
		worker.postMessage(request)
	}, [numPoints, numPlates, landDistribution, continentSizeVariety,
		landCoverage, planetRadiusKm, obliquity, eccentricity, sunTempFactor, daysPerYear, hoursPerDay, tidallyLocked, jitter, roughness, terrainWarp, smoothing,
		hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, craters])

	const handleGenerate = useCallback(() => {
		generateWorld(Math.floor(Math.random() * 16777216))
	}, [generateWorld])

	const handleRegenerate = useCallback(() => {
		generateWorld(seed)
	}, [generateWorld, seed])

	const handleLoadCode = useCallback(() => {
		const decoded = decodePlanetCode(planetCodeInput)
		if (!decoded) {
			setCodeError(true)
			setTimeout(() => setCodeError(false), 1500)
			return
		}
		// Update sliders to reflect loaded values
		setNumPoints(decoded.numPoints)
		setJitter(decoded.jitter)
		setNumPlates(decoded.numPlates)
		setLandDistribution(decoded.landDistribution)
		setContinentSizeVariety(decoded.continentSizeVariety)
		setLandCoverage(decoded.landCoverage)
		setPlanetRadiusKm(decoded.planetRadiusKm)
		setObliquity(decoded.obliquity)
		setEccentricity(decoded.eccentricity)
		setSunTempFactor(decoded.sunTempFactor)
		setDaysPerYear(decoded.daysPerYear)
		setHoursPerDay(decoded.hoursPerDay)
		setTidallyLocked(decoded.tidallyLocked)
		setRoughness(decoded.roughness)
		setTerrainWarp(decoded.terrainWarp)
		setSmoothing(decoded.smoothing)
		setHydraulicErosion(decoded.hydraulicErosion)
		setThermalErosion(decoded.thermalErosion)
		setRidgeSharpening(decoded.ridgeSharpening)
		setGlacialErosion(decoded.glacialErosion)
		setCraters(decoded.craters ?? 0)
		setCodeError(false)
		// Generate immediately with the decoded params (bypasses stale state)
		generateWorld(decoded.seed, decoded)
	}, [planetCodeInput, generateWorld])

	const loadImageAsGrayscale = useCallback((src: string | File): Promise<{ grayscale: Uint8Array; width: number; height: number }> => {
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => {
				const canvas = document.createElement("canvas")
				canvas.width = img.width
				canvas.height = img.height
				const ctx = canvas.getContext("2d")!
				ctx.drawImage(img, 0, 0)
				const data = ctx.getImageData(0, 0, img.width, img.height).data
				const grayscale = new Uint8Array(img.width * img.height)
				for (let i = 0; i < grayscale.length; i++) {
					grayscale[i] = Math.round(
						0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2],
					)
				}
				resolve({ grayscale, width: img.width, height: img.height })
			}
			img.onerror = () => reject(new Error("Failed to load image"))
			if (typeof src === "string") {
				img.src = src
			} else {
				img.src = URL.createObjectURL(src)
			}
		})
	}, [])

	const importHeightmap = useCallback((grayscale: Uint8Array, imageWidth: number, imageHeight: number) => {
		setGenerating(true)
		setGenerationProgress(0)
		setGenerationLabel("Importing heightmap...")
		setPlanetCode("")
		setPlanetCodeInput("")

		workerRef.current?.terminate()
		const worker = new Worker(
			new URL("../../model/orogen/orogen.worker.ts", import.meta.url),
			{ type: "module" },
		)
		workerRef.current = worker

		worker.onmessage = (event: MessageEvent<OrogenWorkerResponse>) => {
			const message = event.data
			if (message.type === "progress") {
				setGenerationLabel(message.label)
				setGenerationProgress((current) => message.pct ?? current)
				return
			}
			if (message.type === "done") {
				setWorld(message.world)
				setGenerationLabel("Done")
				setGenerationProgress(100)
				setGenerating(false)
				worker.terminate()
				if (workerRef.current === worker) workerRef.current = null
				return
			}
			console.error("Orogen worker failed", message.message, message.stack)
			setGenerationLabel("Import failed")
			setGenerating(false)
			worker.terminate()
			if (workerRef.current === worker) workerRef.current = null
		}

		worker.onerror = (event) => {
			console.error("Orogen worker crashed", event.message)
			setGenerationLabel("Import failed")
			setGenerating(false)
			worker.terminate()
			if (workerRef.current === worker) workerRef.current = null
		}

		const request: OrogenWorkerRequest = {
			type: "import",
			params: {
				seed,
				numPoints,
				jitter,
				grayscale,
				imageWidth,
				imageHeight,
				planetRadiusKm,
				obliquity,
				eccentricity,
				sunTempFactor,
				daysPerYear,
				hoursPerDay,
				pressure: 1.0,
				tidallyLocked,
				terrainWarp,
				smoothing,
				hydraulicErosion,
				thermalErosion,
				ridgeSharpening,
				glacialErosion,
				craters,
			},
		}
		worker.postMessage(request, [grayscale.buffer])
	}, [seed, numPoints, jitter, planetRadiusKm, obliquity, eccentricity, sunTempFactor, daysPerYear, hoursPerDay, tidallyLocked, terrainWarp, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, craters])

	const handleFileImport = useCallback(async (file: File) => {
		try {
			const { grayscale, width, height } = await loadImageAsGrayscale(file)
			importHeightmap(grayscale, width, height)
		} catch (err) {
			console.error("Failed to load heightmap:", err)
			setGenerationLabel("Failed to load image")
		}
	}, [loadImageAsGrayscale, importHeightmap])

	const handleEarthImport = useCallback(async () => {
		try {
			const { grayscale, width, height } = await loadImageAsGrayscale("/earth.png")
			importHeightmap(grayscale, width, height)
		} catch (err) {
			console.error("Failed to load Earth heightmap:", err)
			setGenerationLabel("Failed to load Earth heightmap")
		}
	}, [loadImageAsGrayscale, importHeightmap])

	const planetSliders = [
		{
			label: "Radius",
			help: "Sets the planet's physical size for climate and distance calculations.",
			value: planetRadiusKm,
			display: `${(planetRadiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x Earth`,
			min: DEFAULT_PLANET_RADIUS_KM * 0.5,
			max: DEFAULT_PLANET_RADIUS_KM * 4,
			step: 100,
			set: setPlanetRadiusKm,
		},
		{
			label: "Axial Tilt",
			help: "Sets seasonal tilt from 0 to 180 degrees. Tilts above 90 are treated as retrograde and flip seasonal rainfall timing.",
			value: tidallyLocked ? 0 : obliquity,
			display: tidallyLocked ? "0.0°" : `${obliquity.toFixed(1)}°`,
			min: 0,
			max: 180,
			step: 0.5,
			set: setObliquity,
			disabled: tidallyLocked,
		},
		{
			label: "Eccentricity",
			help: "Controls how circular or stretched the orbit is, increasing seasonal contrast as it rises.",
			value: eccentricity,
			display: eccentricity.toFixed(3),
			min: 0,
			max: 0.2,
			step: 0.001,
			set: setEccentricity,
		},
		{
			label: "Sun Temp",
			help: "Scales stellar temperature relative to Sol. 1.0x matches the Sun, 0.5x is half as hot.",
			value: sunTempFactor,
			display: `${sunTempFactor.toFixed(2)}x`,
			min: 0.9,
			max: 1.2,
			step: 0.01,
			set: setSunTempFactor,
		},
		{
			label: "Year Length",
			help: "Sets the orbital year length in local days. Seasonal pacing changes without increasing sim resolution.",
			value: daysPerYear,
			display: `${daysPerYear.toFixed(0)} d`,
			min: 100,
			max: 1000,
			step: 5,
			set: setDaysPerYear,
			disabled: tidallyLocked,
		},
		{
			label: "Day Length",
			help: "Sets the rotation period in local hours. Shorter days mix heat more strongly; longer days reduce that effect.",
			value: hoursPerDay,
			display: `${hoursPerDay.toFixed(1)} h`,
			min: 8,
			max: 48,
			step: 0.5,
			set: setHoursPerDay,
			disabled: tidallyLocked,
		},
		{
			label: "Land Distribution",
			help: "Controls how concentrated the minority phase is: land below 50%, water above 50%.",
			value: landDistribution,
			display: landDistribution.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setLandDistribution,
		},
		{
			label: "Land Coverage",
			help: "Sets the overall land-to-ocean balance for the world.",
			value: landCoverage,
			display: `${(landCoverage * 100).toFixed(0)}%`,
			min: 0,
			max: 1,
			step: 0.01,
			set: setLandCoverage,
		},
	]

	const terrainSliders = [
		{
			label: "Detail",
			help: "Higher detail sharpens coastlines and terrain, but takes longer to build.",
			value: numPoints,
			display: numPoints.toLocaleString(),
			min: 5000,
			max: 2560000,
			step: 1000,
			set: setNumPoints,
		},
		{
			label: "Irregularity",
			help: "Controls how even or organic the underlying mesh feels.",
			value: jitter,
			display: jitter.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setJitter,
		},
		{
			label: "Plates",
			help: "More plates create more tectonic boundaries, coasts, and mountain belts.",
			value: numPlates,
			display: String(numPlates),
			min: 4,
			max: 120,
			step: 1,
			set: setNumPlates,
		},
		{
			label: "Roughness",
			help: "Adds fractal detail to mountains, ridges, and coastlines.",
			value: roughness,
			display: roughness.toFixed(2),
			min: 0,
			max: 0.5,
			step: 0.01,
			set: setRoughness,
		},
		{
			label: "Size Variety",
			help: "Makes landmasses or seas more equal-sized or more uneven.",
			value: continentSizeVariety,
			display: continentSizeVariety.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setContinentSizeVariety,
		},
		{
			label: "Terrain Warp",
			help: "Twists the raw terrain field into more organic coastlines and ridges.",
			value: terrainWarp,
			display: terrainWarp.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setTerrainWarp,
		},
		{
			label: "Smoothing",
			help: "Softens hard tectonic edges and blends abrupt elevation transitions.",
			value: smoothing,
			display: smoothing.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setSmoothing,
		},
		{
			label: "Hydraulic Erosion",
			help: "Cuts river valleys and drainage networks into the terrain.",
			value: hydraulicErosion,
			display: hydraulicErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setHydraulicErosion,
		},
		{
			label: "Thermal Erosion",
			help: "Moves loose material downhill, softening ridges and steep slopes.",
			value: thermalErosion,
			display: thermalErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setThermalErosion,
		},
		{
			label: "Ridge Sharpening",
			help: "Pushes ridgelines above their surroundings for a stronger mountain silhouette.",
			value: ridgeSharpening,
			display: ridgeSharpening.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setRidgeSharpening,
		},
		{
			label: "Glacial Erosion",
			help: "Carves fjords, basins, and U-shaped valleys into cold high terrain.",
			value: glacialErosion,
			display: glacialErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setGlacialErosion,
		},
		{
			label: "Craters",
			help: "Stamps impact craters onto the surface. Higher values produce more and larger craters.",
			value: craters,
			display: craters.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setCraters,
		},
	]

	const planetStats = useMemo(() => {
		const activeParams = world?.params
		const obliquityValue = activeParams?.obliquity ?? obliquity
		const eccentricityValue = activeParams?.eccentricity ?? eccentricity
		const sunTempFactorValue = activeParams?.sunTempFactor ?? sunTempFactor
		const daysPerYearValue = activeParams?.daysPerYear ?? daysPerYear
		const hoursPerDayValue = activeParams?.hoursPerDay ?? hoursPerDay
		const radiusKm = activeParams?.planetRadiusKm ?? planetRadiusKm
		const surfaceAreaKm2 = 4 * Math.PI * radiusKm * radiusKm

		let avgCellLengthKm: number | null = null
		if (world) avgCellLengthKm = meanEdgeLengthKm(world.mesh, radiusKm)

		let landAreaKm2: number | null = null
		let landPercent: number | null = null
		if (world?.elevation) {
			let landCells = 0
			for (let i = 0; i < world.elevation.length; i++) {
				if (world.elevation[i] > 0) landCells++
			}
			landPercent = (landCells / Math.max(1, world.elevation.length)) * 100
			landAreaKm2 = surfaceAreaKm2 * (landPercent / 100)
		}

		let avgAnnualTempC: number | null = null
		if (world?.climate?.temperature_avg) {
			let sum = 0
			for (let i = 0; i < world.climate.temperature_avg.length; i++) sum += world.climate.temperature_avg[i]
			avgAnnualTempC = sum / Math.max(1, world.climate.temperature_avg.length)
		}

		let avgAnnualPrecipMm: number | null = null
		if (world?.rainfall?.annual) {
			let sum = 0
			for (let i = 0; i < world.rainfall.annual.length; i++) sum += world.rainfall.annual[i]
			avgAnnualPrecipMm = sum / Math.max(1, world.rainfall.annual.length)
		}

		let avgAnnualWindMs: number | null = null
		if (world?.wind?.wind_speed_monthly) {
			let sum = 0
			for (let i = 0; i < world.wind.wind_speed_monthly.length; i++) sum += world.wind.wind_speed_monthly[i]
			avgAnnualWindMs = sum / Math.max(1, world.wind.wind_speed_monthly.length)
		}

		const isTidal = activeParams?.tidallyLocked ?? tidallyLocked
		return [
			...(isTidal ? [{ label: "Lock", value: "Tidal" }] : []),
			{ label: "Tilt", value: `${obliquityValue.toFixed(1)}°` },
			{ label: "Ecc", value: eccentricityValue.toFixed(3) },
			{ label: "Sun", value: `${sunTempFactorValue.toFixed(2)}x` },
			{ label: "Year", value: `${daysPerYearValue.toFixed(0)} d` },
			{ label: "Day", value: `${hoursPerDayValue.toFixed(1)} h` },
			{ label: "Radius", value: `${(radiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x` },
			{ label: "Continents", value: world?.continentCount != null ? String(world.continentCount) : "—" },
			{ label: "Cell", value: avgCellLengthKm !== null ? `${avgCellLengthKm.toFixed(0)} km` : "—" },
			{ label: "Land Area", value: landAreaKm2 !== null && landPercent !== null ? `${(landAreaKm2 / 1_000_000).toFixed(1)}M km² (${landPercent.toFixed(1)}%)` : "—" },
			{ label: "Avg Temp", value: avgAnnualTempC !== null ? `${avgAnnualTempC.toFixed(1)} °C` : "—" },
			{ label: "Avg Rain", value: avgAnnualPrecipMm !== null ? `${avgAnnualPrecipMm.toFixed(0)} mm` : "—" },
			{ label: "Avg Wind", value: avgAnnualWindMs !== null ? `${avgAnnualWindMs.toFixed(1)} m/s` : "—" },
		]
	}, [daysPerYear, eccentricity, hoursPerDay, obliquity, planetRadiusKm, sunTempFactor, tidallyLocked, world])

	const renderSliderGroup = (
		items: typeof planetSliders,
		columns: "single" | "double" = "double",
	) => (
		<div className={columns === "double" ? "grid grid-cols-1 xl:grid-cols-2 gap-1.5" : "space-y-1.5"}>
			{items.map((p) => (
				<div key={p.label} className={`rounded-lg border border-slate-200/80 bg-white/85 px-2.5 py-2 shadow-sm shadow-slate-200/20${"disabled" in p && p.disabled ? " opacity-40 pointer-events-none" : ""}`}>
					<div className="flex justify-between items-baseline gap-3">
						<div className="group relative flex items-center min-w-0">
							<label className="cursor-help border-b border-dotted border-slate-300 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								{p.label}
							</label>
							<div className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-44 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] normal-case leading-[1.35] text-slate-500 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
								{p.help}
							</div>
						</div>
						<span className="font-mono text-[10px] text-slate-400">
							{p.display}
						</span>
					</div>
					<input
						type="range"
						min={p.min}
						max={p.max}
						step={p.step}
						value={p.value}
						onChange={(e) => p.set(parseFloat(e.target.value))}
						disabled={"disabled" in p && !!p.disabled}
						className="mt-1.5 w-full accent-slate-900 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
					/>
				</div>
			))}
		</div>
	)

	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{/* Sidebar */}
			<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col px-4 py-4 lg:px-5 lg:py-5 border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
				{/* Header */}
				<div className="flex items-center gap-3 mb-5">
					<div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							className="text-white"
						>
							<circle
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="2"
							/>
							<path
								d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
								stroke="currentColor"
								strokeWidth="1.5"
							/>
						</svg>
					</div>
					<span className="font-bold text-sm tracking-tight">
						TECTONIC LAB
					</span>
					<span className="font-mono text-[10px] text-slate-300 ml-auto">
						V.1.0
					</span>
				</div>

				{/* Title */}
				<div className="mb-5">
					<div className="flex items-center gap-3 mb-2">
						<div className="h-px w-8 bg-slate-300" />
						<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.3em]">
							Planet Forge
						</span>
					</div>
					<h1 className="text-3xl font-black tracking-tighter leading-[0.88] mb-2">
						<span className="text-slate-900">TECTONIC</span>
						<br />
						<span className="text-slate-300">LAB</span>
					</h1>
					<p className="text-slate-400 text-xs leading-relaxed">
						Tectonic plate simulation with collision-driven
						mountains, hydraulic erosion, and 3D globe rendering.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-2 mb-4">
					{([
						["world", "World"],
						["view", "View"],
					] as const).map(([tab, label]) => (
						<button
							key={tab}
							onClick={() => setControlTab(tab)}
							className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all ${
								controlTab === tab
									? "bg-slate-900 text-white"
									: "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				{controlTab === "world" && (
					<div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
						<div className="flex items-center justify-between gap-2">
							<div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
								{([
									["planet", "Planet"],
									["terrain", "Terrain"],
								] as const).map(([tab, label]) => (
									<button
										key={tab}
										onClick={() => setWorldTab(tab)}
										className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all ${
											worldTab === tab
												? "bg-white text-slate-900 shadow-sm"
												: "text-slate-500 hover:text-slate-700"
										}`}
									>
										{label}
									</button>
								))}
							</div>
							<button
								type="button"
								onClick={resetWorldDefaults}
								className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
							>
								Reset
							</button>
						</div>

						{worldTab === "planet" && (
							<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
								<label className="flex items-center gap-2 mb-2 px-1 cursor-pointer select-none">
									<input
										type="checkbox"
										checked={tidallyLocked}
										onChange={(e) => {
											setTidallyLocked(e.target.checked)
											if (e.target.checked) setObliquity(0)
										}}
										className="accent-slate-900 h-3.5 w-3.5"
									/>
									<span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tidally Locked</span>
									<span className="text-[9px] text-slate-400 ml-auto">One side always faces the star</span>
								</label>
								{renderSliderGroup(planetSliders)}
							</div>
						)}

						{worldTab === "terrain" && (
							<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
								{renderSliderGroup(terrainSliders)}
							</div>
						)}

						<div className="space-y-2.5 pt-4 mt-1 border-t border-slate-100">
							<div className="space-y-1.5">
								<div className={`flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 focus-within:ring-2 transition-all ${codeError ? "ring-2 ring-red-400" : "focus-within:ring-slate-900/10"}`}>
									<input
										type="text"
										value={planetCodeInput}
										onChange={(e) => {
											setPlanetCodeInput(e.target.value)
											setCodeError(false)
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												if (planetCodeInput && planetCodeInput !== planetCode) handleLoadCode()
												else handleRegenerate()
											}
										}}
										placeholder="Planet code"
										className="flex-1 bg-transparent border-none font-mono text-sm text-slate-900 focus:ring-0 focus:outline-none placeholder:text-slate-300"
									/>
									{planetCode && (
										<button
											onClick={() => {
												navigator.clipboard.writeText(planetCode)
											}}
											className="p-1 text-slate-300 hover:text-slate-900 transition-colors"
											title="Copy planet code"
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
												<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
											</svg>
										</button>
									)}
									<button
										onClick={handleLoadCode}
										disabled={!planetCodeInput || generating}
										className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
											planetCodeInput && !generating
												? "bg-blue-500 text-white hover:bg-blue-600"
												: "bg-slate-200 text-slate-400 cursor-not-allowed"
										}`}
									>
										Load
									</button>
								</div>
								{codeError && (
									<p className="text-[11px] text-red-500 font-medium">Invalid planet code</p>
								)}
							</div>

							<div className="flex items-center gap-2">
								<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">Seed</span>
								<span className="font-mono text-[11px] text-slate-500 flex-1">{seed}</span>
								<button
									onClick={() => setSeed(Math.floor(Math.random() * 16777216))}
									disabled={generating}
									className="p-1 text-slate-300 hover:text-slate-900 transition-colors disabled:opacity-50"
									title="Randomize seed"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M1 4v6h6M23 20v-6h-6" />
										<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
									</svg>
								</button>
							</div>

							<div className="flex gap-2">
								<button
									onClick={handleGenerate}
									disabled={generating}
									className="flex-1 bg-slate-900 text-white py-3 px-4 rounded-lg hover:bg-black transition-all flex justify-between items-center group text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<span className="flex items-center gap-2">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<polygon
												points="5 3 19 12 5 21 5 3"
												fill="currentColor"
											/>
										</svg>
										{generating ? "Generating..." : "New World"}
									</span>
								</button>
								<button
									onClick={handleRegenerate}
									disabled={generating}
									className="py-3 px-4 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
									title="Regenerate with current seed &amp; settings"
								>
									Rebuild
								</button>
							</div>

							<div className="flex gap-2">
								<input
									ref={fileInputRef}
									type="file"
									accept="image/png,image/jpeg,image/webp"
									className="hidden"
									onChange={(e) => {
										const file = e.target.files?.[0]
										if (file) handleFileImport(file)
										e.target.value = ""
									}}
								/>
								<button
									onClick={() => fileInputRef.current?.click()}
									disabled={generating}
									className="flex-1 py-2.5 px-4 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
									title="Import an equirectangular B&W heightmap (PNG, JPEG, WebP)"
								>
									Import Heightmap
								</button>
								<button
									onClick={handleEarthImport}
									disabled={generating}
									className="py-2.5 px-4 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-all text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
									title="Load Earth's heightmap"
								>
									Earth
								</button>
							</div>

							<div className="space-y-1">
								<div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">
									<span>{generating ? generationLabel : "Generation"}</span>
									<span>{Math.round(generationProgress)}%</span>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
									<div
										className="h-full rounded-full bg-slate-900 transition-all duration-200"
										style={{ width: `${Math.max(0, Math.min(100, generationProgress))}%` }}
									/>
								</div>
							</div>
						</div>
					</div>
				)}

				{controlTab === "view" && (
					<div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
				{/* Map Mode */}
				<div className="space-y-2 pt-4 border-t border-slate-100">
					<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
						View
					</span>
					<div className="flex gap-1">
						{([
							["globe", "Globe"],
							["map", "Map"],
						] as const).map(([mode, label]) => (
							<button
								key={mode}
								onClick={() => setViewMode(mode)}
								className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
									viewMode === mode
										? "bg-slate-900 text-white"
										: "bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
								}`}
							>
								{label}
							</button>
						))}
					</div>
				</div>

				{viewMode === "map" && (
					<div className="space-y-2 pt-4 border-t border-slate-100">
						<div className="flex justify-between items-baseline">
							<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
								Center Longitude
							</span>
							<span className="font-mono text-[11px] text-slate-400">
								<span ref={mapCenterLongitudeValueRef}>
									{formatLongitude(mapCenterLongitude)}
								</span>
							</span>
						</div>
						<input
							type="range"
							min={-180}
							max={180}
							step={1}
							defaultValue={mapCenterLongitude}
							onChange={(e) => handleMapCenterLongitudeInput(parseFloat(e.target.value))}
							onMouseUp={(e) => commitMapCenterLongitude(parseFloat((e.currentTarget as HTMLInputElement).value))}
							onTouchEnd={(e) => commitMapCenterLongitude(parseFloat((e.currentTarget as HTMLInputElement).value))}
							onKeyUp={(e) => commitMapCenterLongitude(parseFloat((e.currentTarget as HTMLInputElement).value))}
							className="w-full accent-slate-900 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
						/>
					</div>
				)}

				<div className="space-y-2 pt-4 border-t border-slate-100">
					<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
						Map Mode
					</span>
					<div className="flex gap-1">
						{([
							["terrain", "Terrain"],
							["landHeightmap", "Height"],
							["temperature", "Temp"],
						] as const).map(([mode, label]) => (
							<button
								key={mode}
								onClick={() => setColorMode(mode)}
								className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
									(mode === "temperature" ? isTemperatureMode : colorMode === mode)
										? "bg-slate-900 text-white"
										: "bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
								}`}
							>
								{label}
							</button>
						))}
					</div>
					<div className="flex gap-1">
						{([
							["precipitation", "Rain"],
							["vegetation", "Veg"],
							["climate", "Climate"],
							["oceanCurrents", "Currents"],
						] as const).map(([mode, label]) => (
							<button
								key={mode}
								onClick={() => setColorMode(mode)}
								className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
									(mode === "climate" ? isClimateMode : colorMode === mode)
										? "bg-slate-900 text-white"
										: "bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
								}`}
							>
								{label}
							</button>
						))}
					</div>
					<div className="flex gap-1">
						{([
							["windSpeed", "Wind"],
						] as const).map(([mode, label]) => (
							<button
								key={mode}
								onClick={() => setColorMode(mode)}
								className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
									colorMode === mode
										? "bg-slate-900 text-white"
										: "bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
								}`}
							>
								{label}
							</button>
						))}
					</div>
				</div>

				{/* {isTemperatureMode && (
					<div className="space-y-2 pt-4 border-t border-slate-100">
						<div className="flex justify-between items-baseline">
							<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
								Temperature Type
							</span>
							<span className="font-mono text-[11px] text-slate-400">
								{colorMode === "biotemperature" ? "Biotemp" : "Classic"}
							</span>
						</div>
						<select
							value={colorMode}
							onChange={(e) => setColorMode(e.target.value as ColorMode)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-900"
						>
							<option value="temperature">Classic</option>
							<option value="biotemperature">Biotemp</option>
						</select>
					</div>
				)} */}

				{isClimateMode && (
					<div className="space-y-2 pt-4 border-t border-slate-100">
						<div className="flex justify-between items-baseline">
							<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
								Climate Type
							</span>
							<span className="font-mono text-[11px] text-slate-400">
								{colorMode === "climate" ? "Basic" : colorMode === "koppenClimate" ? "Koppen" : "Basic"}
							</span>
						</div>
						<select
							value={colorMode}
							onChange={(e) => setColorMode(e.target.value as ColorMode)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-900"
						>
							<option value="climate">Basic</option>
							{ENABLE_PASTA_CLASSIFICATION && <option value="pastaClimate">Pasta</option>}
							<option value="koppenClimate">Koppen</option>
						</select>
					</div>
				)}

				{colorMode === "temperature" && (
					<div className="space-y-2 pt-4 border-t border-slate-100">
						<div className="flex justify-between items-baseline">
							<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
								Temperature Period
							</span>
							<span className="font-mono text-[11px] text-slate-400">
								{monthLabels[temperatureMonth]}
							</span>
						</div>
						<select
							value={temperatureMonth}
							onChange={(e) => setTemperatureMonth(Number(e.target.value))}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-900"
						>
							{monthLabels.map((label, index) => (
								<option key={label} value={index}>
									{label}
								</option>
							))}
						</select>
					</div>
				)}

				{colorMode === "precipitation" && (
					<div className="space-y-2 pt-4 border-t border-slate-100">
						<div className="flex justify-between items-baseline">
							<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
								Rainfall Period
							</span>
							<span className="font-mono text-[11px] text-slate-400">
								{monthLabels[rainfallMonth]}
							</span>
						</div>
						<select
							value={rainfallMonth}
							onChange={(e) => setRainfallMonth(Number(e.target.value))}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-900"
						>
							{monthLabels.map((label, index) => (
								<option key={label} value={index}>
									{label}
								</option>
							))}
						</select>
					</div>
				)}

				{isWindMode && (
					<div className="space-y-2 pt-4 border-t border-slate-100">
						<div className="flex justify-between items-baseline">
							<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
								Wind Period
							</span>
							<span className="font-mono text-[11px] text-slate-400">
								{monthLabels[windMonth]}
							</span>
						</div>
						<select
							value={windMonth}
							onChange={(e) => setWindMonth(Number(e.target.value))}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-900"
						>
							{monthLabels.map((label, index) => (
								<option key={label} value={index}>
									{label}
								</option>
							))}
						</select>
					</div>
				)}

					<div className="space-y-3 pt-4 border-t border-slate-100">
					<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
						Overlays
					</span>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500">
						<span>Wireframe</span>
						<input
							type="checkbox"
							checked={showWireframe}
							onChange={(e) => setShowWireframe(e.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500">
						<span>Rivers</span>
						<input
							type="checkbox"
							checked={showRivers}
							onChange={(e) => setShowRivers(e.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500">
						<span>Thermal Equator</span>
						<input
							type="checkbox"
							checked={showThermalEquator}
							onChange={(e) => setShowThermalEquator(e.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500">
						<span>Grid Lines</span>
						<input
							type="checkbox"
							checked={showGrid}
							onChange={(e) => setShowGrid(e.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
						/>
					</label>
					<div className={showGrid ? "space-y-1.5" : "space-y-1.5 opacity-50"}>
						<div className="flex justify-between items-baseline">
							<label className="text-[11px] font-medium text-slate-500">
								Grid Spacing
							</label>
							<span className="font-mono text-[11px] text-slate-400">
								{gridSpacing}°
							</span>
						</div>
						<select
							value={gridSpacing}
							onChange={(e) => setGridSpacing(Number(e.target.value))}
							disabled={!showGrid}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-900 disabled:cursor-not-allowed"
						>
							{[30, 15, 10, 5, 2.5].map((value) => (
								<option key={value} value={value}>
									{value}°
								</option>
							))}
						</select>
					</div>
				</div>

					<div className="pt-4 mt-1 border-t border-slate-100">
						<div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
							<div className="mb-2 flex items-center justify-between gap-3">
								<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
									Planet Stats
								</span>
								<span className="text-[10px] text-slate-400">
									{world ? "Current world" : "No world loaded"}
								</span>
							</div>
							<div className="grid grid-cols-2 gap-x-3 gap-y-2">
								{planetStats.map((stat) => (
									<div key={stat.label} className="min-w-0">
										<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
											{stat.label}
										</div>
										<div className="truncate font-mono text-[11px] text-slate-700">
											{stat.value}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
					</div>
				)}

				<div className="pt-4 mt-3 border-t border-slate-100">
					<button
						onClick={onBack}
						className="w-full py-2 px-4 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
					>
						Back to Genesis
					</button>
				</div>
			</div>

			{/* Canvas */}
			<div ref={viewportRef} className="flex-1 h-[56vh] xl:h-full relative bg-[#050510]">
				<canvas
					ref={canvasRef}
					className="w-full h-full block"
				/>
				{hoverInfo && hoverElevationKm !== null && (
					<div
						className="pointer-events-none absolute z-10 min-w-32 rounded-xl border border-white/10 bg-slate-950/85 px-3 py-2 text-white shadow-2xl backdrop-blur-sm"
						style={{
							left: hoverCardLeft,
							top: hoverCardTop,
						}}
					>
						<div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
							Elevation
						</div>
						<div className="mt-1 font-mono text-sm text-slate-100">
							{hoverElevationKm.toFixed(2)} km{hoverTopography ? ` (${hoverTopography})` : ""}
						</div>
						{hoverIsLand !== null && (
							<div className="mt-1 font-mono text-[10px] text-slate-400">
								isLand={hoverIsLand} riverLand={hoverRiverLand ?? '?'} lake={hoverInfo && world?.rivers?.lakes ? world.rivers.lakes[hoverInfo.region] : '?'}
							</div>
						)}
						{hoverCoordinates && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Coordinates
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverCoordinates}
								</div>
							</>
						)}
						{colorMode === "biotemperature" && hoverBiotemperature !== null ? (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Biotemperature
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverBiotemperature.toFixed(1)} °C
								</div>
							</>
						) : hoverTemperature !== null && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Temperature {temperatureMonth === 0 ? "Annual" : monthLabels[temperatureMonth]}
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverTemperature.toFixed(1)} °C
								</div>
							</>
						)}
						{hoverRainfall !== null && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Rainfall {rainfallMonth === 0 ? "Annual" : monthLabels[rainfallMonth]}
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverRainfall.toFixed(0)} mm
								</div>
							</>
						)}
						{colorMode === "climate" && hoverClimateZone && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Climate
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100 capitalize">
									{hoverClimateZone}
								</div>
							</>
						)}
						{colorMode === "pastaClimate" && hoverPastaClimate && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Pasta
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverPastaClimate.name}{hoverPastaClimate.code ? ` (${hoverPastaClimate.code})` : ""}
								</div>
							</>
						)}
						{colorMode === "koppenClimate" && hoverKoppenClimate && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Koppen
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverKoppenClimate}
								</div>
							</>
						)}
						{hoverBiome && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Biome
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100 capitalize">
									{hoverBiome}
								</div>
							</>
						)}
						{hoverOceanDist !== null && hoverOceanDist > 0 && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Ocean Distance
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{hoverOceanDist < 100 ? hoverOceanDist.toFixed(0) : Math.round(hoverOceanDist).toLocaleString()} km
								</div>
							</>
						)}
						{hoverDistCoast !== null && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Dist Coast
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
                                    {hoverDistCoastKm === Infinity
                                        ? '∞'
                                        : hoverDistCoastKm !== null && hoverDistCoastKm < 100
                                            ? hoverDistCoastKm.toFixed(0)
                                            : hoverDistCoastKm !== null
                                                ? Math.round(hoverDistCoastKm).toLocaleString()
                                                : '—'} km
								</div>
							</>
						)}
						{isWindMode && hoverWind && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Wind {windMonth === 0 ? "Annual" : monthLabels[windMonth]}
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100">
									{(() => {
										const { east: we, north: wn, speed: ws } = hoverWind
										const deg = Math.atan2(-we, -wn) * 180 / Math.PI
										const from = ((deg % 360) + 360) % 360
										const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
										const dir = dirs[Math.round(from / 45) % 8]
										return `${dir} (${from.toFixed(0)}°) · ${ws.toFixed(2)}`
									})()}
								</div>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
