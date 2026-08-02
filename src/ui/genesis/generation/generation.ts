import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { HistoryNote } from "@/model/history/generated/state/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type {
	GenesisWorkerRequest,
	GenesisWorkerResponse,
	SerializedGenesisWorld,
	SerializedHistoryFrame,
} from "@/model/worker-protocol/types"

export type GenerationParams = GenesisParams

interface ImportHeightmapParams {
	seed: number
	numPoints: number
	jitter: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	seaLevel: number
	volcanism: number
	maxElevation: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	daysPerYear: number
	hoursPerDay: number
	tideLock: TideLock | null
	substellarLon: number
	perihelion: number
	pressure: number
	albedo?: number
	greenhouseFactor?: number
	craters: number
}

interface RealClimateRaster {
	monthly: Int16Array
	width: number
	height: number
	months: number
	scale: number
	nodata: number
}

interface RealElevationRaster {
	raster: Int16Array
	width: number
	height: number
	scale: number
	nodata: number
}

interface Eu5CategoricalRaster {
	raster: Int16Array
	width: number
	height: number
	nodata: number
	categories: string[]
}

interface IdRaster {
	raster: Int16Array
	width: number
	height: number
	nodata: number
}

export function loadImageAsGrayscale(
	src: string | File,
): Promise<{ grayscale: Uint8Array; width: number; height: number }> {
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
					0.299 * data[i * 4] +
						0.587 * data[i * 4 + 1] +
						0.114 * data[i * 4 + 2],
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
}

export interface GenerationCallbacks {
	setGenerating: (v: boolean) => void
	setGenerationProgress: (v: number | ((current: number) => number)) => void
	setGenerationLabel: (v: string) => void
	setSeed: (v: number) => void
	setWorld: (v: SerializedGenesisWorld | null) => void
	workerRef: React.MutableRefObject<Worker | null>
	onGenerationComplete?: () => void
	onPathfindResult?: (result: {
		pathRegions: Int32Array
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
		reachable: boolean
	}) => void
	/** The seed history frame attached to "done", if the generated world has
	 * nations/provinces/population wired up for the live-play sim. */
	onHistoryFrame?: (frame: SerializedHistoryFrame) => void
	/** Fired for each "sim-progress" tick emitted while a "simulate" request
	 * is running in the worker. */
	onSimProgress?: (
		timeMs: number,
		frame: SerializedHistoryFrame,
		newEvents: HistoryNote[],
	) => void
}

function createWorker(
	callbacks: GenerationCallbacks,
	onDone: (
		message: GenesisWorkerResponse & { type: "done" },
		worker: Worker,
	) => void,
	failLabel: string,
): Worker {
	callbacks.workerRef.current?.terminate()
	const worker = new Worker(
		new URL("../../../model/genesis.worker.ts", import.meta.url),
		{ type: "module" },
	)
	callbacks.workerRef.current = worker

	worker.onmessage = (event: MessageEvent<GenesisWorkerResponse>) => {
		const message = event.data
		if (message.type === "progress") {
			callbacks.setGenerationLabel(message.label)
			callbacks.setGenerationProgress((current: number) =>
				message.pct == null
					? current
					: Math.max(current, Math.min(100, message.pct)),
			)
			return
		}
		if (message.type === "done") {
			onDone(message, worker)
			return
		}
		if (message.type === "error") {
			console.error("Genesis worker failed", message.message, message.stack)
			callbacks.setGenerationLabel(failLabel)
			callbacks.setGenerating(false)
			return
		}
		if (message.type === "pathfind-result") {
			callbacks.onPathfindResult?.({
				pathRegions: message.pathRegions,
				distanceKm: message.distanceKm,
				landKm: message.landKm,
				seaKm: message.seaKm,
				travelDays: message.travelDays,
				reachable: message.reachable,
			})
			return
		}
		if (message.type === "sim-progress") {
			callbacks.onSimProgress?.(
				message.timeMs,
				message.frame,
				message.newEvents,
			)
			return
		}
	}

	worker.onerror = (event: ErrorEvent) => {
		const detail =
			event.message ||
			(event.error instanceof Error ? event.error.message : undefined) ||
			[event.filename, event.lineno, event.colno]
				.filter((value) => value !== undefined && value !== 0 && value !== "")
				.join(":") ||
			"Unknown worker error"
		console.error("Genesis worker crashed", detail, event.error)
		callbacks.setGenerationLabel(failLabel)
		callbacks.setGenerating(false)
		worker.terminate()
		if (callbacks.workerRef.current === worker)
			callbacks.workerRef.current = null
	}

	return worker
}

export function generateWorld(
	overrideSeed: number,
	overrides: Partial<GenerationParams> | undefined,
	currentParams: GenerationParams,
	callbacks: GenerationCallbacks,
): void {
	callbacks.setGenerating(true)
	callbacks.setGenerationProgress(0)
	callbacks.setGenerationLabel("Starting generation...")
	callbacks.setSeed(overrideSeed)
	callbacks.setWorld(null)

	const tideLock =
		overrides?.tideLock !== undefined
			? overrides.tideLock
			: currentParams.tideLock
	const params = {
		seed: overrideSeed,
		numPoints: overrides?.numPoints ?? currentParams.numPoints,
		numPlates: overrides?.numPlates ?? currentParams.numPlates,
		landDistribution:
			overrides?.landDistribution ?? currentParams.landDistribution,
		continentSizeVariety:
			overrides?.continentSizeVariety ?? currentParams.continentSizeVariety,
		landCoverage: overrides?.landCoverage ?? currentParams.landCoverage,
		planetRadiusKm: overrides?.planetRadiusKm ?? currentParams.planetRadiusKm,
		obliquity: overrides?.obliquity ?? currentParams.obliquity,
		eccentricity: overrides?.eccentricity ?? currentParams.eccentricity,
		perihelion: overrides?.perihelion ?? currentParams.perihelion,
		spectralClass: overrides?.spectralClass ?? currentParams.spectralClass,
		starSubtype: overrides?.starSubtype ?? currentParams.starSubtype,
		orbitalDistanceAU:
			overrides?.orbitalDistanceAU ?? currentParams.orbitalDistanceAU,
		daysPerYear: overrides?.daysPerYear ?? currentParams.daysPerYear,
		hoursPerDay: overrides?.hoursPerDay ?? currentParams.hoursPerDay,
		pastaGintThreshold:
			overrides?.pastaGintThreshold ?? currentParams.pastaGintThreshold,
		pressure: overrides?.pressure ?? currentParams.pressure,
		albedo: overrides?.albedo ?? currentParams.albedo,
		greenhouseFactor:
			overrides?.greenhouseFactor ?? currentParams.greenhouseFactor,
		tideLock,
		substellarLon: overrides?.substellarLon ?? currentParams.substellarLon,
		jitter: overrides?.jitter ?? currentParams.jitter,
		roughness: overrides?.roughness ?? currentParams.roughness,
		terrainWarp: overrides?.terrainWarp ?? currentParams.terrainWarp,
		smoothing: overrides?.smoothing ?? currentParams.smoothing,
		hydraulicErosion:
			overrides?.hydraulicErosion ?? currentParams.hydraulicErosion,
		thermalErosion: overrides?.thermalErosion ?? currentParams.thermalErosion,
		ridgeSharpening:
			overrides?.ridgeSharpening ?? currentParams.ridgeSharpening,
		glacialErosion: overrides?.glacialErosion ?? currentParams.glacialErosion,
		seaLevel: overrides?.seaLevel ?? currentParams.seaLevel,
		volcanism: overrides?.volcanism ?? currentParams.volcanism,
		maxElevation: overrides?.maxElevation ?? currentParams.maxElevation,
		craters: overrides?.craters ?? currentParams.craters,
		era: overrides?.era ?? currentParams.era,
	} as GenesisParams

	const request: GenesisWorkerRequest = { type: "generate", params }
	requestAnimationFrame(() => {
		const worker = createWorker(
			callbacks,
			(message, _w) => {
				callbacks.setWorld(message.world)
				callbacks.setGenerationLabel("Done")
				callbacks.setGenerationProgress(100)
				callbacks.setGenerating(false)
				if (message.frame) callbacks.onHistoryFrame?.(message.frame)
				callbacks.onGenerationComplete?.()
				// Keep the worker alive to serve pathfind requests.
			},
			"Generation failed",
		)
		worker.postMessage(request)
	})
}

export function importHeightmap(
	grayscale: Uint8Array,
	imageWidth: number,
	imageHeight: number,
	importParams: ImportHeightmapParams,
	callbacks: GenerationCallbacks,
	coastlineMask?: { mask: Uint8Array; width: number; height: number },
	lakeMask?: { mask: Uint8Array; width: number; height: number },
	riverLines?: { points: number[]; strokeweig: number; name?: string | null }[],
	realProvinces?: { name: string; lon: number; lat: number; weight: number }[],
	realClimate?: RealClimateRaster,
	realPrecip?: RealClimateRaster,
	realCloudCover?: RealClimateRaster,
	realDtr?: RealClimateRaster,
	realVaporPressure?: RealClimateRaster,
	realWindU?: RealClimateRaster,
	realWindV?: RealClimateRaster,
	realCurrentU?: RealClimateRaster,
	realCurrentV?: RealClimateRaster,
	realSstAnomaly?: RealClimateRaster,
	realElevation?: RealElevationRaster,
	eu5Topography?: Eu5CategoricalRaster,
	eu5Vegetation?: Eu5CategoricalRaster,
	eu5Climate?: Eu5CategoricalRaster,
	eu4Provinces?: IdRaster,
	eu4ProvinceFallbackSeeds?: { id: number; lon: number; lat: number }[],
	lakeNames?: { name: string; ring: [number, number][] }[],
): void {
	callbacks.setGenerating(true)
	callbacks.setGenerationProgress(0)
	callbacks.setGenerationLabel("Importing heightmap...")
	callbacks.setWorld(null)

	const request: GenesisWorkerRequest = {
		type: "import",
		params: {
			seed: importParams.seed as number,
			numPoints: importParams.numPoints as number,
			jitter: importParams.jitter as number,
			grayscale,
			imageWidth,
			imageHeight,
			coastlineMask: coastlineMask?.mask,
			maskWidth: coastlineMask?.width,
			maskHeight: coastlineMask?.height,
			lakeMask: lakeMask?.mask,
			lakeMaskWidth: lakeMask?.width,
			lakeMaskHeight: lakeMask?.height,
			riverLines,
			lakeNames,
			realProvinces,
			realClimateMonthly: realClimate?.monthly,
			realClimateWidth: realClimate?.width,
			realClimateHeight: realClimate?.height,
			realClimateMonths: realClimate?.months,
			realClimateScale: realClimate?.scale,
			realClimateNoData: realClimate?.nodata,
			realPrecipMonthly: realPrecip?.monthly,
			realPrecipWidth: realPrecip?.width,
			realPrecipHeight: realPrecip?.height,
			realPrecipMonths: realPrecip?.months,
			realPrecipScale: realPrecip?.scale,
			realPrecipNoData: realPrecip?.nodata,
			realCloudCoverMonthly: realCloudCover?.monthly,
			realCloudCoverWidth: realCloudCover?.width,
			realCloudCoverHeight: realCloudCover?.height,
			realCloudCoverMonths: realCloudCover?.months,
			realCloudCoverScale: realCloudCover?.scale,
			realCloudCoverNoData: realCloudCover?.nodata,
			realDtrMonthly: realDtr?.monthly,
			realDtrWidth: realDtr?.width,
			realDtrHeight: realDtr?.height,
			realDtrMonths: realDtr?.months,
			realDtrScale: realDtr?.scale,
			realDtrNoData: realDtr?.nodata,
			realVaporPressureMonthly: realVaporPressure?.monthly,
			realVaporPressureWidth: realVaporPressure?.width,
			realVaporPressureHeight: realVaporPressure?.height,
			realVaporPressureMonths: realVaporPressure?.months,
			realVaporPressureScale: realVaporPressure?.scale,
			realVaporPressureNoData: realVaporPressure?.nodata,
			realWindUMonthly: realWindU?.monthly,
			realWindVMonthly: realWindV?.monthly,
			realWindWidth: realWindU?.width,
			realWindHeight: realWindU?.height,
			realWindMonths: realWindU?.months,
			realWindScale: realWindU?.scale,
			realWindNoData: realWindU?.nodata,
			realCurrentUMonthly: realCurrentU?.monthly,
			realCurrentVMonthly: realCurrentV?.monthly,
			realCurrentWidth: realCurrentU?.width,
			realCurrentHeight: realCurrentU?.height,
			realCurrentMonths: realCurrentU?.months,
			realCurrentScale: realCurrentU?.scale,
			realCurrentNoData: realCurrentU?.nodata,
			realSstAnomalyMonthly: realSstAnomaly?.monthly,
			realSstAnomalyWidth: realSstAnomaly?.width,
			realSstAnomalyHeight: realSstAnomaly?.height,
			realSstAnomalyMonths: realSstAnomaly?.months,
			realSstAnomalyScale: realSstAnomaly?.scale,
			realSstAnomalyNoData: realSstAnomaly?.nodata,
			realElevationRaster: realElevation?.raster,
			realElevationWidth: realElevation?.width,
			realElevationHeight: realElevation?.height,
			realElevationScale: realElevation?.scale,
			realElevationNoData: realElevation?.nodata,
			eu5TopographyRaster: eu5Topography?.raster,
			eu5TopographyWidth: eu5Topography?.width,
			eu5TopographyHeight: eu5Topography?.height,
			eu5TopographyNoData: eu5Topography?.nodata,
			eu5VegetationRaster: eu5Vegetation?.raster,
			eu5VegetationWidth: eu5Vegetation?.width,
			eu5VegetationHeight: eu5Vegetation?.height,
			eu5VegetationNoData: eu5Vegetation?.nodata,
			eu5ClimateRaster: eu5Climate?.raster,
			eu5ClimateWidth: eu5Climate?.width,
			eu5ClimateHeight: eu5Climate?.height,
			eu5ClimateNoData: eu5Climate?.nodata,
			eu4ProvincesRaster: eu4Provinces?.raster,
			eu4ProvincesWidth: eu4Provinces?.width,
			eu4ProvincesHeight: eu4Provinces?.height,
			eu4ProvincesNoData: eu4Provinces?.nodata,
			eu4ProvinceFallbackSeeds,
			planetRadiusKm: importParams.planetRadiusKm as number,
			obliquity: importParams.obliquity as number,
			eccentricity: importParams.eccentricity as number,
			perihelion: importParams.perihelion as number,
			spectralClass: importParams.spectralClass,
			starSubtype: importParams.starSubtype,
			orbitalDistanceAU: importParams.orbitalDistanceAU,
			daysPerYear: importParams.daysPerYear as number,
			hoursPerDay: importParams.hoursPerDay as number,
			pressure: importParams.pressure as number,
			albedo: importParams.albedo,
			greenhouseFactor: importParams.greenhouseFactor,
			substellarLon: importParams.substellarLon as number,
			terrainWarp: importParams.terrainWarp as number,
			smoothing: importParams.smoothing as number,
			hydraulicErosion: importParams.hydraulicErosion as number,
			thermalErosion: importParams.thermalErosion as number,
			ridgeSharpening: importParams.ridgeSharpening as number,
			glacialErosion: importParams.glacialErosion as number,
			seaLevel: importParams.seaLevel as number,
			volcanism: importParams.volcanism as number,
			maxElevation: importParams.maxElevation as number,
			craters: importParams.craters as number,
		},
	}
	requestAnimationFrame(() => {
		const worker = createWorker(
			callbacks,
			(message, _w) => {
				callbacks.setWorld(message.world)
				callbacks.setGenerationLabel("Done")
				callbacks.setGenerationProgress(100)
				callbacks.setGenerating(false)
				if (message.frame) callbacks.onHistoryFrame?.(message.frame)
				callbacks.onGenerationComplete?.()
				// Keep worker alive for simulation
			},
			"Import failed",
		)
		const transfer = [grayscale.buffer]
		if (coastlineMask) transfer.push(coastlineMask.mask.buffer)
		if (lakeMask) transfer.push(lakeMask.mask.buffer)
		if (realClimate) transfer.push(realClimate.monthly.buffer)
		if (realPrecip) transfer.push(realPrecip.monthly.buffer)
		if (realCloudCover) transfer.push(realCloudCover.monthly.buffer)
		if (realDtr) transfer.push(realDtr.monthly.buffer)
		if (realVaporPressure) transfer.push(realVaporPressure.monthly.buffer)
		if (realWindU) transfer.push(realWindU.monthly.buffer)
		if (realWindV) transfer.push(realWindV.monthly.buffer)
		if (realCurrentU) transfer.push(realCurrentU.monthly.buffer)
		if (realCurrentV) transfer.push(realCurrentV.monthly.buffer)
		if (realSstAnomaly) transfer.push(realSstAnomaly.monthly.buffer)
		if (realElevation) transfer.push(realElevation.raster.buffer)
		worker.postMessage(request, transfer)
	})
}
