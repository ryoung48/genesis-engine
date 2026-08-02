import { useCallback, useEffect, useMemo, useState } from "react"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { STATE } from "@/model/history/generated/state"
import { SEED_LABEL } from "@/model/shared/random/seed-label"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthRealClimate,
	loadEarthRealCloudCover,
	loadEarthRealCurrentU,
	loadEarthRealCurrentV,
	loadEarthRealDtr,
	loadEarthRealElevation,
	loadEarthRealPrecip,
	loadEarthRealSstAnomaly,
	loadEarthRealVaporPressure,
	loadEarthRealWindU,
	loadEarthRealWindV,
	loadEu4Provinces,
	loadEu5Categorical,
	loadOptionalJson,
	MonthlyRasterAsset,
} from "@/ui/genesis/generation/earth-assets"
import {
	type GenerationCallbacks,
	type GenerationParams,
	generateWorld,
	importHeightmap,
	loadImageAsGrayscale,
} from "@/ui/genesis/generation/generation"
import { resetWorldDefaults } from "@/ui/genesis/generation/sliders"
import type { WorldGenerationInput } from "@/ui/genesis/view/types"
/**
 * Owns world generation: the worker callbacks, the assembled generation
 * parameter set, the seed input field's own dirty/error state, and the two
 * entry points that kick a build off -- procedural generation and the
 * Earth heightmap import (which loads every real-Earth raster before handing
 * them to the same worker pipeline).
 */
export function useWorldGeneration(input: WorldGenerationInput) {
	const {
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
	} = input

	const [generating, setGenerating] = useState(false)
	const [generationProgress, setGenerationProgress] = useState(0)
	const [generationLabel, setGenerationLabel] = useState("Idle")

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleSetWorld = useCallback(
		(w: SerializedGenesisWorld | null) => {
			if (w === null) {
				setProceduralHistoryFrame(null)
				setProceduralHistoryPlaying(false)
				setProceduralHistoryTimeMs(800 * STATE.yearMs)
				resetProceduralHistoryAccumulation()
			}
			setWorld(w)
		},
		[resetProceduralHistoryAccumulation],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const generationCallbacks: GenerationCallbacks = useMemo(
		() => ({
			setGenerating,
			setGenerationProgress,
			setGenerationLabel,
			setSeed,
			setWorld: handleSetWorld,
			workerRef,
			onHistoryFrame: (frame) => {
				resetProceduralHistoryAccumulation()
				recordProceduralFrame(frame.timeMs, frame, [])
			},
			onSimProgress: (timeMs, frame, newEvents) => {
				recordProceduralFrame(timeMs, frame, newEvents)
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
		[handleSetWorld, resetProceduralHistoryAccumulation, recordProceduralFrame],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
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
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			daysPerYear,
			hoursPerDay,
			pastaGintThreshold: DEFAULT_WORLD_PARAMS.pastaGintThreshold,
			tideLock,
			substellarLon,
			jitter,
			roughness,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			volcanism: 1,
			craters: 0,
			maxElevation,
			pressure,
			albedo: mainWorldSystemBody?.albedo,
			greenhouseFactor: mainWorldSystemBody?.greenhouseFactor,
			seismologyTotalHeatingK: mainWorldSystemBody?.seismology?.totalHeating,
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
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			daysPerYear,
			hoursPerDay,
			tideLock,
			substellarLon,
			jitter,
			roughness,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			pressure,
			mainWorldSystemBody?.albedo,
			mainWorldSystemBody?.greenhouseFactor,
			mainWorldSystemBody?.seismology?.totalHeating,
		],
	)
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (!seedInputDirty) {
			setSeedInput(SEED_LABEL.formatSeedLabel(seed))
			setSeedError(false)
		}
	}, [seed, seedInputDirty])

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleGenerateWorld = useCallback(
		(overrideSeed: number, overrides?: Partial<GenerationParams>) => {
			setSelectedTimeMs(simStartTimeMs)
			setShowCoastlines(false)
			generateWorld(overrideSeed, overrides, currentParams, generationCallbacks)
		},
		[currentParams, generationCallbacks, simStartTimeMs],
	)

	const resolveSeedInput = useCallback(() => {
		return SEED_LABEL.resolveSeedLabel(seedInput)
	}, [seedInput])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleReturnToPlanetView = useCallback(() => {
		setSolarSystemViewActive(false)
	}, [])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleGenerate = useCallback(() => {
		if (seedInput.trim()) {
			const nextSeed = resolveSeedInput()
			if (nextSeed === null) {
				setSeedError(true)
				window.setTimeout(() => setSeedError(false), 1500)
				return
			}
			setSeedError(false)
			handleReturnToPlanetView()
			handleGenerateWorld(nextSeed)
			return
		}
		handleReturnToPlanetView()
		handleGenerateWorld(seed)
	}, [
		handleGenerateWorld,
		handleReturnToPlanetView,
		resolveSeedInput,
		seed,
		seedInput,
	])

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleApplySeed = useCallback(() => {
		const trimmed = seedInput.trim()
		if (!trimmed) {
			setSeedInputDirty(false)
			setSeedError(false)
			setSeedInput(SEED_LABEL.formatSeedLabel(seed))
			return
		}
		const parsed = SEED_LABEL.resolveSeedLabel(trimmed)
		if (parsed === null) {
			setSeedError(true)
			return
		}
		setSeedError(false)
		setSeedInputDirty(false)
		setSeed(parsed)
		setSeedInput(SEED_LABEL.formatSeedLabel(parsed))
	}, [seed, seedInput])

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleSeedInputChange = useCallback((nextSeed: string) => {
		setSeedInput(nextSeed)
		setSeedInputDirty(true)
		setSeedError(false)
	}, [])

	const handleImportHeightmap = useCallback(
		(
			grayscale: Uint8Array,
			imageWidth: number,
			imageHeight: number,
			coastlineMask?: { mask: Uint8Array; width: number; height: number },
			lakeMask?: { mask: Uint8Array; width: number; height: number },
			riverLines?: {
				points: number[]
				strokeweig: number
				name?: string | null
			}[],
			realProvinces?: {
				name: string
				lon: number
				lat: number
				weight: number
			}[],
			realClimate?: {
				monthly: Int16Array
				width: number
				height: number
				months: number
				scale: number
				nodata: number
			},
			realPrecip?: {
				monthly: Int16Array
				width: number
				height: number
				months: number
				scale: number
				nodata: number
			},
			realCloudCover?: MonthlyRasterAsset,
			realDtr?: {
				monthly: Int16Array
				width: number
				height: number
				months: number
				scale: number
				nodata: number
			},
			realVaporPressure?: MonthlyRasterAsset,
			realWindU?: MonthlyRasterAsset,
			realWindV?: MonthlyRasterAsset,
			realCurrentU?: MonthlyRasterAsset,
			realCurrentV?: MonthlyRasterAsset,
			realSstAnomaly?: MonthlyRasterAsset,
			realElevation?: {
				raster: Int16Array
				width: number
				height: number
				scale: number
				nodata: number
			},
			eu5Topography?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
				categories: string[]
			},
			eu5Vegetation?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
				categories: string[]
			},
			eu5Climate?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
				categories: string[]
			},
			eu4Provinces?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
			},
			eu4ProvinceFallbackSeeds?: { id: number; lon: number; lat: number }[],
			lakeNames?: { name: string; ring: [number, number][] }[],
		) => {
			const importParams = {
				seed,
				numPoints,
				jitter,
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
				// Real Earth values, not the live sliders -- this path is
				// Earth-only (see callers). Prefer the live mainWorldSystemBody
				// (matches whatever GenerationPanel's own preview is showing,
				// including any live edits) and fall back to the static defaults
				// only if it isn't available yet.
				albedo:
					mainWorldSystemBody?.albedo ?? SOL_SYSTEM.solMainWorldDefaults.albedo,
				greenhouseFactor:
					mainWorldSystemBody?.greenhouseFactor ??
					SOL_SYSTEM.solMainWorldDefaults.greenhouseFactor,
				seismologyTotalHeatingK: mainWorldSystemBody?.seismology?.totalHeating,
				tideLock,
				substellarLon,
				// Zeroed, not the live sliders -- this path is Earth-only (see
				// callers), and a real heightmap is already realistic terrain.
				// Warping/smoothing/eroding it distorts real elevation instead of
				// preserving it (see earth-real-temperature-compare.smoke.test.ts).
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
				seaLevel,
				maxElevation,
				volcanism: 1,
				craters: 0,
			}
			importHeightmap(
				grayscale,
				imageWidth,
				imageHeight,
				importParams,
				generationCallbacks,
				coastlineMask,
				lakeMask,
				riverLines,
				realProvinces,
				realClimate,
				realPrecip,
				realCloudCover,
				realDtr,
				realVaporPressure,
				realWindU,
				realWindV,
				realCurrentU,
				realCurrentV,
				realSstAnomaly,
				realElevation,
				eu5Topography,
				eu5Vegetation,
				eu5Climate,
				eu4Provinces,
				eu4ProvinceFallbackSeeds,
				lakeNames,
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
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			daysPerYear,
			hoursPerDay,
			tideLock,
			substellarLon,
			seaLevel,
			pressure,
			mainWorldSystemBody?.albedo,
			mainWorldSystemBody?.greenhouseFactor,
			mainWorldSystemBody?.seismology?.totalHeating,
			generationCallbacks,
			maxElevation,
		],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleEarthImport = useCallback(async () => {
		try {
			const [
				{ grayscale, width, height },
				{ grayscale: maskPixels, width: maskWidth, height: maskHeight },
				{ grayscale: lakePixels, width: lakeWidth, height: lakeHeight },
				riverLines,
				realProvinces,
				realClimate,
				realPrecip,
				realCloudCover,
				realDtr,
				realVaporPressure,
				realWindU,
				realWindV,
				realCurrentU,
				realCurrentV,
				realSstAnomaly,
				realElevation,
				eu5Topography,
				eu5Vegetation,
				eu5Climate,
				eu4Provinces,
				eu4ProvinceFallbackSeeds,
				lakeNames,
			] = await Promise.all([
				loadImageAsGrayscale("/earth-data/earth.png"),
				loadImageAsGrayscale("/earth-data/coastline-mask.png"),
				loadImageAsGrayscale("/earth-data/lake-mask.png"),
				fetch("/earth-data/river-lines.json").then((res) => {
					if (!res.ok)
						throw new Error(`Failed to load river lines: ${res.status}`)
					return res.json() as Promise<{
						lines: {
							points: number[]
							strokeweig: number
							name?: string | null
						}[]
					}>
				}),
				loadOptionalJson<
					{ name: string; lon: number; lat: number; weight: number }[]
				>("/earth-data/earth-provinces-weighted.json"),
				loadEarthRealClimate(),
				loadEarthRealPrecip(),
				loadEarthRealCloudCover(),
				loadEarthRealDtr(),
				loadEarthRealVaporPressure(),
				loadEarthRealWindU(),
				loadEarthRealWindV(),
				loadEarthRealCurrentU(),
				loadEarthRealCurrentV(),
				loadEarthRealSstAnomaly(),
				loadEarthRealElevation(),
				loadEu5Categorical("eu5-topography"),
				loadEu5Categorical("eu5-vegetation"),
				loadEu5Categorical("eu5-climate"),
				loadEu4Provinces(),
				loadOptionalJson<{ id: number; lon: number; lat: number }[]>(
					"/earth-data/eu4-provinces-seeds.json",
				),
				fetch("/earth-data/lake-names.json").then((res) => {
					if (!res.ok)
						throw new Error(`Failed to load lake names: ${res.status}`)
					return res.json() as Promise<{
						lakes: { name: string; ring: [number, number][] }[]
					}>
				}),
			])
			handleReturnToPlanetView()
			handleImportHeightmap(
				grayscale,
				width,
				height,
				{ mask: maskPixels, width: maskWidth, height: maskHeight },
				{ mask: lakePixels, width: lakeWidth, height: lakeHeight },
				riverLines.lines,
				realProvinces,
				realClimate,
				realPrecip,
				realCloudCover,
				realDtr,
				realVaporPressure,
				realWindU,
				realWindV,
				realCurrentU,
				realCurrentV,
				realSstAnomaly,
				realElevation,
				eu5Topography,
				eu5Vegetation,
				eu5Climate,
				eu4Provinces,
				eu4ProvinceFallbackSeeds,
				lakeNames.lakes,
			)
			setShowCoastlines(true)
		} catch (err) {
			console.error("Failed to load Earth heightmap:", err)
			setGenerationLabel("Failed to load Earth heightmap")
		}
	}, [handleImportHeightmap, handleReturnToPlanetView])

	const handleResetDefaults = useCallback(
		() => resetWorldDefaults(setters),
		[setters],
	)
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleRandomizeCode = useCallback(() => {
		const nextLabel = SEED_LABEL.makeRandomSeedLabel()
		const nextSeed = SEED_LABEL.resolveSeedLabel(nextLabel)
		if (nextSeed === null) return
		setSeed(nextSeed)
		setSeedInput(nextLabel)
		setSeedInputDirty(false)
		setSeedError(false)
	}, [])

	return {
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
	}
}
