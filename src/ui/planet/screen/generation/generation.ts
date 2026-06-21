import type { GenesisParams } from "@/model"
import type { HistoryNote } from "@/model/history"
import { MONTH_MS } from "@/model/history/state"
import { decodePlanetCode, encodePlanetCode } from "@/model/shared/planet-code"
import type {
	GenesisWorkerRequest,
	GenesisWorkerResponse,
	SerializedGenesisWorld,
	SerializedHistoryFrame,
	SerializedTimelines,
} from "@/model/transport/worker-types"

export { decodePlanetCode }

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
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	antistellarLon: number
	perihelion: number
	pressure: number
	moonCount: number
	moonSeed: number
	craters: number
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
	pushRecentCode: (code: string) => void
	setPlanetCode: (v: string) => void
	setPlanetCodeInput: (v: string) => void
	setWorld: (v: SerializedGenesisWorld | null) => void
	workerRef: React.MutableRefObject<Worker | null>
	onGenerationFrame?: (frame: SerializedHistoryFrame) => void
	onGenerationComplete?: () => void
	onSimProgress?: (timeMs: number, frame: SerializedHistoryFrame) => void
	onSimComplete?: (
		timeMs: number,
		timelines: SerializedTimelines,
		events: HistoryNote[],
	) => void
	onPathfindResult?: (result: {
		pathRegions: Int32Array
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
		reachable: boolean
	}) => void
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
		new URL("../../../../model/genesis.worker.ts", import.meta.url),
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
		if (message.type === "sim-progress") {
			callbacks.onSimProgress?.(message.timeMs, message.frame)
			return
		}
		if (message.type === "sim-done") {
			callbacks.onSimComplete?.(
				message.timeMs,
				message.timelines,
				message.events,
			)
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

	const tideLock = overrides?.tideLock !== undefined
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
		pressure: overrides?.pressure ?? currentParams.pressure,
		moonCount: overrides?.moonCount ?? currentParams.moonCount,
		moonSeed: overrides?.moonSeed ?? currentParams.moonSeed,
		tideLock,
		antistellarLon: overrides?.antistellarLon ?? currentParams.antistellarLon,
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
				const code = encodePlanetCode(overrideSeed, params)
				callbacks.pushRecentCode(code)
				callbacks.setPlanetCode(code)
				callbacks.setPlanetCodeInput(code)
				callbacks.setWorld(message.world)
				if (message.frame) callbacks.onGenerationFrame?.(message.frame)
				callbacks.setGenerationLabel("Done")
				callbacks.setGenerationProgress(100)
				callbacks.setGenerating(false)
				callbacks.onGenerationComplete?.()
				// Keep worker alive for simulation
			},
			"Generation failed",
		)
		worker.postMessage(request)
	})
}

export function startSimulation(
	workerRef: React.MutableRefObject<Worker | null>,
): void {
	const worker = workerRef.current
	if (!worker) return
	const request: GenesisWorkerRequest = { type: "simulate", tickMs: MONTH_MS }
	worker.postMessage(request)
}

export function pauseSimulation(
	workerRef: React.MutableRefObject<Worker | null>,
): void {
	const worker = workerRef.current
	if (!worker) return
	const request: GenesisWorkerRequest = { type: "pause" }
	worker.postMessage(request)
}

export function importHeightmap(
	grayscale: Uint8Array,
	imageWidth: number,
	imageHeight: number,
	importParams: ImportHeightmapParams,
	callbacks: GenerationCallbacks,
): void {
	callbacks.setGenerating(true)
	callbacks.setGenerationProgress(0)
	callbacks.setGenerationLabel("Importing heightmap...")
	callbacks.setPlanetCode("")
	callbacks.setPlanetCodeInput("")
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
			tidallyLocked: importParams.tidallyLocked as boolean,
			antistellarLon: importParams.antistellarLon as number,
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
				callbacks.onGenerationComplete?.()
				// Keep worker alive for simulation
			},
			"Import failed",
		)
		worker.postMessage(request, [grayscale.buffer])
	})
}
