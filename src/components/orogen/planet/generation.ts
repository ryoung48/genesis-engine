import type { OrogenParams } from "@/model/orogen/types"
import {
	decodePlanetCode,
	encodePlanetCode,
} from "@/model/orogen/util/planet-code"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedOrogenWorld,
} from "@/model/orogen/worker-types"

export { decodePlanetCode }

export type GenerationParams = OrogenParams

export interface ImportHeightmapParams {
	seed: number
	numPoints: number
	jitter: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	volcanism: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	sunTempFactor: number
	daysPerYear: number
	hoursPerDay: number
	tidallyLocked: boolean
	antistellarLon: number
	perihelion: number
	pressure: number
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
	setWorld: (v: SerializedOrogenWorld | null) => void
	workerRef: React.MutableRefObject<Worker | null>
}

function createWorker(
	callbacks: GenerationCallbacks,
	onDone: (
		message: OrogenWorkerResponse & { type: "done" },
		worker: Worker,
	) => void,
	failLabel: string,
): Worker {
	callbacks.workerRef.current?.terminate()
	const worker = new Worker(
		new URL("../../../model/orogen/orogen.worker.ts", import.meta.url),
		{ type: "module" },
	)
	callbacks.workerRef.current = worker

	worker.onmessage = (event: MessageEvent<OrogenWorkerResponse>) => {
		const message = event.data
		if (message.type === "progress") {
			callbacks.setGenerationLabel(message.label)
			callbacks.setGenerationProgress(
				(current: number) => message.pct ?? current,
			)
			return
		}
		if (message.type === "done") {
			onDone(message, worker)
			return
		}
		console.error("Orogen worker failed", message.message, message.stack)
		callbacks.setGenerationLabel(failLabel)
		callbacks.setGenerating(false)
		worker.terminate()
		if (callbacks.workerRef.current === worker)
			callbacks.workerRef.current = null
	}

	worker.onerror = (event) => {
		console.error("Orogen worker crashed", event.message)
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

	console.log(overrides, currentParams)

	const tidallyLocked = overrides?.tidallyLocked
		? true
		: currentParams.tidallyLocked
	const rawMode = overrides?.tectonicMode ?? currentParams.tectonicMode
	const tectonicMode =
		typeof rawMode === "string"
			? (rawMode as "active" | "stagnant")
			: ((["active", "stagnant"] as const)[rawMode as number] ?? "active")
	const params = {
		seed: overrideSeed,
		tectonicMode,
		numPoints: overrides?.numPoints ?? currentParams.numPoints,
		numPlates: overrides?.numPlates ?? currentParams.numPlates,
		landDistribution:
			overrides?.landDistribution ?? currentParams.landDistribution,
		continentSizeVariety:
			overrides?.continentSizeVariety ?? currentParams.continentSizeVariety,
		landCoverage: overrides?.landCoverage ?? currentParams.landCoverage,
		planetRadiusKm: overrides?.planetRadiusKm ?? currentParams.planetRadiusKm,
		obliquity: tidallyLocked
			? 0
			: (overrides?.obliquity ?? currentParams.obliquity),
		eccentricity: overrides?.eccentricity ?? currentParams.eccentricity,
		perihelion: overrides?.perihelion ?? currentParams.perihelion,
		sunTempFactor: overrides?.sunTempFactor ?? currentParams.sunTempFactor,
		daysPerYear: overrides?.daysPerYear ?? currentParams.daysPerYear,
		hoursPerDay: overrides?.hoursPerDay ?? currentParams.hoursPerDay,
		pressure: overrides?.pressure ?? currentParams.pressure,
		tidallyLocked,
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
		volcanism: overrides?.volcanism ?? currentParams.volcanism,
		craters: overrides?.craters ?? currentParams.craters,
	} as OrogenParams

	const request: OrogenWorkerRequest = { type: "generate", params }
	requestAnimationFrame(() => {
		const worker = createWorker(
			callbacks,
			(message, w) => {
				const code = encodePlanetCode(overrideSeed, params)
				callbacks.pushRecentCode(code)
				callbacks.setPlanetCode(code)
				callbacks.setPlanetCodeInput(code)
				callbacks.setWorld(message.world)
				callbacks.setGenerationLabel("Done")
				callbacks.setGenerationProgress(100)
				callbacks.setGenerating(false)
				w.terminate()
				if (callbacks.workerRef.current === w)
					callbacks.workerRef.current = null
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
): void {
	callbacks.setGenerating(true)
	callbacks.setGenerationProgress(0)
	callbacks.setGenerationLabel("Importing heightmap...")
	callbacks.setPlanetCode("")
	callbacks.setPlanetCodeInput("")
	callbacks.setWorld(null)

	const request: OrogenWorkerRequest = {
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
			sunTempFactor: importParams.sunTempFactor as number,
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
			volcanism: importParams.volcanism as number,
			craters: importParams.craters as number,
		},
	}
	requestAnimationFrame(() => {
		const worker = createWorker(
			callbacks,
			(message, w) => {
				callbacks.setWorld(message.world)
				callbacks.setGenerationLabel("Done")
				callbacks.setGenerationProgress(100)
				callbacks.setGenerating(false)
				w.terminate()
				if (callbacks.workerRef.current === w)
					callbacks.workerRef.current = null
			},
			"Import failed",
		)
		worker.postMessage(request, [grayscale.buffer])
	})
}
