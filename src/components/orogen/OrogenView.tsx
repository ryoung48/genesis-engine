import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { encodePlanetCode, decodePlanetCode } from "@/model/orogen/planet-code"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedOrogenWorld,
} from "@/model/orogen/worker-types"
import { createOrogenScene, type OrogenScene, type OrogenViewMode } from "./renderer"
import { elevToHeightKm, temperatureColor, precipitationColor, vegetationColor, climateZoneColor, climateTempColor, type ColorMode } from "./colors"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/orogen/vegetation"
import { computeThermalEquatorLine } from "@/model/orogen/rain"
import { DEFAULT_PLANET_RADIUS_KM, meanEdgeLengthKm } from "@/model/orogen/units"

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
	// Shape Your World — orogen defaults
	const [numPoints, setNumPoints] = useState(204000)
	const [jitter, setJitter] = useState(0.75)
	const [numPlates, setNumPlates] = useState(80)
	const [numContinents, setNumContinents] = useState(4)
	const [continentSizeVariety, setContinentSizeVariety] = useState(0.35)
	const [landCoverage, setLandCoverage] = useState(0.3)
	const [roughness, setRoughness] = useState(0.40)
	const [planetRadiusKm, setPlanetRadiusKm] = useState(DEFAULT_PLANET_RADIUS_KM)
	// Terrain Sculpting — orogen defaults
	const [terrainWarp, setTerrainWarp] = useState(0.75)
	const [smoothing, setSmoothing] = useState(0.1)
	const [hydraulicErosion, setHydraulicErosion] = useState(0.5)
	const [thermalErosion, setThermalErosion] = useState(0.1)
	const [ridgeSharpening, setRidgeSharpening] = useState(0.50)
	const [glacialErosion, setGlacialErosion] = useState(0.50)

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

	const hoverRainfall = hoverInfo && world?.rainfall && world.elevation[hoverInfo.region] > 0
		? (rainfallMonth === 0
			? world.rainfall.annual[hoverInfo.region]
			: world.rainfall.monthly[(rainfallMonth - 1) * world.mesh.numRegions + hoverInfo.region])
		: null

	const hoverClimateZone = hoverInfo && world?.climateZones && world.elevation[hoverInfo.region] > 0
		? CLIMATE_LABELS[world.climateZones[hoverInfo.region]] ?? null
		: null

	const hoverBiome = hoverInfo && world?.vegetation && world.elevation[hoverInfo.region] > 0
		? BIOME_LABELS[world.vegetation[hoverInfo.region]] ?? null
		: null

	const hoverOceanDist = hoverInfo && world?.oceanDist
		? world.oceanDist[hoverInfo.region]
		: null

	const hoverDistCoast = hoverInfo && world?.distCoast && world.elevation[hoverInfo.region] <= 0
		? world.distCoast[hoverInfo.region]
		: null

	const hoverCardLeft = (() => {
		if (!hoverInfo) return 0
		const viewportWidth = viewportRef.current?.clientWidth ?? 0
		return Math.max(16, Math.min(hoverInfo.x + 18, viewportWidth - 144))
	})()

	const hoverCardTop = hoverInfo
		? Math.max(16, hoverInfo.y - 18)
		: 0

	// Precompute per-region RGB colors for data-driven modes
	const regionColors = useMemo(() => {
		if (!world) return null
		const N = world.mesh.numRegions
		const rgb = new Float32Array(N * 3)

		if (colorMode === "temperature" && world.climate) {
			const temps = temperatureMonth === 0
				? world.climate.temperature_avg
				: world.climate.temperature_monthly.subarray(
					(temperatureMonth - 1) * N,
					temperatureMonth * N,
				)
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = temperatureColor(temps[r])
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
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = darkenVegetationAtElevation(
					vegetationColor(world.vegetation[r]),
					world.elevation[r],
				)
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

		return null
	}, [colorMode, temperatureMonth, rainfallMonth, world])

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

	const generateWorld = useCallback((overrideSeed: number, overrides?: Record<string, number>) => {
		setGenerating(true)
		setGenerationProgress(0)
		setGenerationLabel("Starting generation...")
		setSeed(overrideSeed)

		const params = {
			seed: overrideSeed,
			numPoints: overrides?.numPoints ?? numPoints,
			numPlates: overrides?.numPlates ?? numPlates,
			numContinents: overrides?.numContinents ?? numContinents,
			continentSizeVariety: overrides?.continentSizeVariety ?? continentSizeVariety,
			landCoverage: overrides?.landCoverage ?? landCoverage,
			planetRadiusKm: overrides?.planetRadiusKm ?? planetRadiusKm,
			jitter: overrides?.jitter ?? jitter,
			roughness: overrides?.roughness ?? roughness,
			terrainWarp: overrides?.terrainWarp ?? terrainWarp,
			smoothing: overrides?.smoothing ?? smoothing,
			hydraulicErosion: overrides?.hydraulicErosion ?? hydraulicErosion,
			thermalErosion: overrides?.thermalErosion ?? thermalErosion,
			ridgeSharpening: overrides?.ridgeSharpening ?? ridgeSharpening,
			glacialErosion: overrides?.glacialErosion ?? glacialErosion,
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
	}, [numPoints, numPlates, numContinents, continentSizeVariety,
		landCoverage, planetRadiusKm, jitter, roughness, terrainWarp, smoothing,
		hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion])

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
		setNumContinents(decoded.numContinents)
		setContinentSizeVariety(decoded.continentSizeVariety)
		setLandCoverage(decoded.landCoverage)
		setPlanetRadiusKm(decoded.planetRadiusKm)
		setRoughness(decoded.roughness)
		setTerrainWarp(decoded.terrainWarp)
		setSmoothing(decoded.smoothing)
		setHydraulicErosion(decoded.hydraulicErosion)
		setThermalErosion(decoded.thermalErosion)
		setRidgeSharpening(decoded.ridgeSharpening)
		setGlacialErosion(decoded.glacialErosion)
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
				terrainWarp,
				smoothing,
				hydraulicErosion,
				thermalErosion,
				ridgeSharpening,
				glacialErosion,
			},
		}
		worker.postMessage(request, [grayscale.buffer])
	}, [seed, numPoints, jitter, planetRadiusKm, terrainWarp, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion])

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

	const worldSliders = [
		{
			label: "Detail",
			value: numPoints,
			display: numPoints.toLocaleString(),
			min: 5000,
			max: 2560000,
			step: 1000,
			set: setNumPoints,
		},
		{
			label: "Radius",
			value: planetRadiusKm,
			display: `${(planetRadiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x Earth`,
			min: DEFAULT_PLANET_RADIUS_KM * 0.5,
			max: DEFAULT_PLANET_RADIUS_KM * 4,
			step: 100,
			set: setPlanetRadiusKm,
		},
		{
			label: "Irregularity",
			value: jitter,
			display: jitter.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setJitter,
		},
		{
			label: "Plates",
			value: numPlates,
			display: String(numPlates),
			min: 4,
			max: 120,
			step: 1,
			set: setNumPlates,
		},
		{
			label: "Continents",
			value: numContinents,
			display: String(numContinents),
			min: 1,
			max: 10,
			step: 1,
			set: setNumContinents,
		},
		{
			label: "Size Variety",
			value: continentSizeVariety,
			display: continentSizeVariety.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setContinentSizeVariety,
		},
		{
			label: "Land Coverage",
			value: landCoverage,
			display: `${(landCoverage * 100).toFixed(0)}%`,
			min: 0,
			max: 1,
			step: 0.01,
			set: setLandCoverage,
		},
		{
			label: "Roughness",
			value: roughness,
			display: roughness.toFixed(2),
			min: 0,
			max: 0.5,
			step: 0.01,
			set: setRoughness,
		},
	]

	const sculptSliders = [
		{
			label: "Terrain Warp",
			value: terrainWarp,
			display: terrainWarp.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setTerrainWarp,
		},
		{
			label: "Smoothing",
			value: smoothing,
			display: smoothing.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setSmoothing,
		},
		{
			label: "Hydraulic Erosion",
			value: hydraulicErosion,
			display: hydraulicErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setHydraulicErosion,
		},
		{
			label: "Thermal Erosion",
			value: thermalErosion,
			display: thermalErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setThermalErosion,
		},
		{
			label: "Ridge Sharpening",
			value: ridgeSharpening,
			display: ridgeSharpening.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setRidgeSharpening,
		},
		{
			label: "Glacial Erosion",
			value: glacialErosion,
			display: glacialErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: setGlacialErosion,
		},
	]

	const planetStats = useMemo(() => {
		const activeParams = world?.params
		const obliquity = activeParams?.obliquity ?? 23.5
		const eccentricity = activeParams?.eccentricity ?? 0
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

		return [
			{ label: "Tilt", value: `${obliquity.toFixed(1)}°` },
			{ label: "Ecc", value: eccentricity.toFixed(3) },
			{ label: "Radius", value: `${(radiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x` },
			{ label: "Cell", value: avgCellLengthKm !== null ? `${avgCellLengthKm.toFixed(0)} km` : "—" },
			{ label: "Land Area", value: landAreaKm2 !== null && landPercent !== null ? `${(landAreaKm2 / 1_000_000).toFixed(1)}M km² (${landPercent.toFixed(1)}%)` : "—" },
			{ label: "Avg Temp", value: avgAnnualTempC !== null ? `${avgAnnualTempC.toFixed(1)} °C` : "—" },
			{ label: "Avg Rain", value: avgAnnualPrecipMm !== null ? `${avgAnnualPrecipMm.toFixed(0)} mm` : "—" },
		]
	}, [planetRadiusKm, world])

	const renderSliderGroup = (
		items: typeof worldSliders,
		columns: "single" | "double" = "double",
	) => (
		<div className={columns === "double" ? "grid grid-cols-1 xl:grid-cols-2 gap-1.5" : "space-y-1.5"}>
			{items.map((p) => (
				<div key={p.label} className="rounded-lg border border-slate-200/80 bg-white/85 px-2.5 py-2 shadow-sm shadow-slate-200/20">
					<div className="flex justify-between items-baseline gap-3">
						<label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
							{p.label}
						</label>
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

						{worldTab === "planet" && (
							<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
								<div className="mb-3">
									<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
										Shape Your World
									</span>
									<p className="mt-1 text-xs text-slate-500">
										Planet scale, tectonic layout, and land distribution.
									</p>
								</div>
								{renderSliderGroup(worldSliders)}
							</div>
						)}

						{worldTab === "terrain" && (
							<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
								<div className="mb-3">
									<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
										Terrain Sculpting
									</span>
									<p className="mt-1 text-xs text-slate-500">
										Post-process elevation with warp, smoothing, and erosion.
									</p>
								</div>
								{renderSliderGroup(sculptSliders)}
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
									colorMode === mode
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
							{hoverElevationKm.toFixed(2)} km
						</div>
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
						{hoverTemperature !== null && (
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
						{hoverClimateZone && (
							<>
								<div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
									Climate
								</div>
								<div className="mt-1 font-mono text-sm text-slate-100 capitalize">
									{hoverClimateZone}
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
									{hoverDistCoast === Infinity ? "∞" : hoverDistCoast.toFixed(0)} hops
								</div>
							</>
						)}
					</div>
				)}
				{!world && !generating && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<p className="text-slate-500 text-sm font-mono">
							Click Generate to build a world
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
