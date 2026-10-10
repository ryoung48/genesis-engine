import { useCallback, useMemo, useRef, useState } from "react"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { HistoryPipeline } from "@/model/history/record/procedural/types"
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
	generateWorld,
	importHeightmap,
	loadImageAsGrayscale,
	requestInfrastructure,
} from "@/ui/genesis/generation/generation"
import { resetWorldDefaults } from "@/ui/genesis/generation/sliders"
import type { GenerateOverrideParams } from "@/ui/genesis/generation/types"
import {
	type GenerationCallbacks,
	type GenerationParams,
} from "@/ui/genesis/generation/types"
import type { WorldGenerationInput } from "@/ui/genesis/view/types"

// Fits Earth's own SeismologyProfile.totalHeating to volcanism 1 (the prior
// hardcoded default for every generated world).
const SEISMOLOGY_VOLCANISM_DIVISOR = 25.599

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
		setInfrastructure,
		setSelectedTimeMs,
		simStartTimeMs,
		setShowCoastlines,
		setSolarSystemViewActive,
		setPathfindingResult,
		setProceduralHistoryPlaying,
		startProceduralJournal,
		recordProceduralJournal,
		recordDistributionBatch,
		stopProceduralHistory,
		historyPipeline,
		setHistoryPipeline,
		seed,
		setSeed,
		setDataVariant,
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
	// Tracks whether a "compute-infrastructure" request is already in flight
	// (or done) for the current world, so toggling the Infrastructure overlay
	// on/off doesn't re-request the road/sea network every time.
	const infrastructureRequestedRef = useRef(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleSetWorld = useCallback(
		(w: SerializedGenesisWorld | null) => {
			if (w === null) {
				setProceduralHistoryPlaying(false)
				startProceduralJournal(null)
				infrastructureRequestedRef.current = false
				setInfrastructure(null)
			}
			setWorld(w)
		},
		[startProceduralJournal],
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
			onHistoryStart: startProceduralJournal,
			onHistoryJournal: recordProceduralJournal,
			onDistributionBatch: recordDistributionBatch,
			onHistoryStopped: stopProceduralHistory,
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
			onInfrastructureResult: setInfrastructure,
		}),
		[handleSetWorld, startProceduralJournal, recordProceduralJournal],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const currentParams = useMemo<GenerationParams>(
		() => ({
			historyPipeline,
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
			// volcanism = totalHeating / SEISMOLOGY_VOLCANISM_DIVISOR -- fits Earth's
			// own totalHeating to volcanism 1 (the prior hardcoded default). Falls
			// back to 1 when there's no live seismology score yet (e.g. before the
			// main world's SystemBody has been built).
			volcanism:
				mainWorldSystemBody?.seismology?.totalHeating !== undefined
					? Math.min(
							10,
							mainWorldSystemBody.seismology.totalHeating /
								SEISMOLOGY_VOLCANISM_DIVISOR,
						)
					: 1,
			craters: 0,
			maxElevation,
			pressure,
			albedo: mainWorldSystemBody?.albedo,
			greenhouseFactor: mainWorldSystemBody?.greenhouseFactor,
			seismologyTotalHeatingK: mainWorldSystemBody?.seismology?.totalHeating,
		}),
		[
			historyPipeline,
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
	const handleGenerateWorld = useCallback(
		({ seed: overrideSeed, overrides }: GenerateOverrideParams) => {
			setSelectedTimeMs(simStartTimeMs)
			setShowCoastlines(false)
			generateWorld({
				overrideSeed,
				overrides,
				currentParams,
				callbacks: generationCallbacks,
			})
		},
		[currentParams, generationCallbacks, simStartTimeMs],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleReturnToPlanetView = useCallback(() => {
		setSolarSystemViewActive(false)
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
				volcanism:
					mainWorldSystemBody?.seismology?.totalHeating !== undefined
						? Math.min(
								10,
								mainWorldSystemBody.seismology.totalHeating /
									SEISMOLOGY_VOLCANISM_DIVISOR,
							)
						: 1,
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

	// The single Generate entry point: seed === SOL_DATA.solSeed is what
	// "earth import" means -- rather than a separate button/action, loading
	// the real Earth rasters is just what Generate does once the seed you've
	// staged (via OrbitHeader's seed box/dice/earth-import shortcut) equals
	// Sol's. Every other seed runs the ordinary procedural pipeline.
	const handleGenerate = useCallback(() => {
		if (seed === SOL_DATA.solSeed) {
			void handleEarthImport()
			return
		}
		setDataVariant("generated")
		handleReturnToPlanetView()
		handleGenerateWorld({ seed, overrides: undefined })
	}, [
		handleEarthImport,
		handleGenerateWorld,
		handleReturnToPlanetView,
		seed,
		setDataVariant,
	])

	const handleChangeHistoryPipeline = useCallback(
		(pipeline: HistoryPipeline) => {
			setHistoryPipeline(pipeline)
			handleGenerateWorld({ seed, overrides: { historyPipeline: pipeline } })
		},
		[seed, setHistoryPipeline, handleGenerateWorld],
	)
	const handleResetDefaults = useCallback(
		() => resetWorldDefaults(setters),
		[setters],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleRequestInfrastructure = useCallback(() => {
		if (infrastructureRequestedRef.current) return
		if (!lastWorldRef.current) return
		infrastructureRequestedRef.current = true
		requestInfrastructure(workerRef)
	}, [])

	return {
		generating,
		generationProgress,
		generationLabel,
		handleEarthImport,
		handleGenerate,
		handleGenerateWorld,
		handleChangeHistoryPipeline,
		handleResetDefaults,
		handleReturnToPlanetView,
		handleRequestInfrastructure,
	}
}
