import { afterEach, describe, expect, it, vi } from "vitest"
import {
	type GenerationCallbacks,
	generateWorld,
	importHeightmap,
	loadImageAsGrayscale,
	pauseSimulation,
	startSimulation,
} from "./generation"

const baseParams = {
	tidallyLocked: false,
	tectonicMode: "active",
	numPoints: 10_000,
	numPlates: 12,
	landDistribution: 0.5,
	continentSizeVariety: 0.5,
	landCoverage: 0.4,
	planetRadiusKm: 6371,
	obliquity: 23.5,
	eccentricity: 0.0167,
	perihelion: 102.9,
	sunTempFactor: 1,
	insolationFactor: 1,
	daysPerYear: 365,
	hoursPerDay: 24,
	pressure: 1,
	antistellarLon: 180,
	jitter: 0.2,
	roughness: 0.5,
	terrainWarp: 0.2,
	smoothing: 1,
	hydraulicErosion: 0,
	thermalErosion: 0,
	ridgeSharpening: 0,
	glacialErosion: 0,
	volcanism: 0,
	craters: 0,
} as const

function makeCallbacks(): GenerationCallbacks {
	return {
		setGenerating: vi.fn(),
		setGenerationProgress: vi.fn(),
		setGenerationLabel: vi.fn(),
		setSeed: vi.fn(),
		pushRecentCode: vi.fn(),
		setPlanetCode: vi.fn(),
		setPlanetCodeInput: vi.fn(),
		setWorld: vi.fn(),
		workerRef: { current: null },
	}
}

function makeStatefulCallbacks() {
	let progress = 0
	const callbacks: GenerationCallbacks = {
		setGenerating: vi.fn(),
		setGenerationProgress: vi.fn(
			(next: number | ((current: number) => number)) => {
				progress = typeof next === "function" ? next(progress) : next
			},
		),
		setGenerationLabel: vi.fn(),
		setSeed: vi.fn(),
		pushRecentCode: vi.fn(),
		setPlanetCode: vi.fn(),
		setPlanetCodeInput: vi.fn(),
		setWorld: vi.fn(),
		workerRef: { current: null },
	}
	return {
		callbacks,
		getProgress: () => progress,
	}
}

function stubAnimationFrame() {
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		cb(0)
		return 1
	})
}

function stubWorker() {
	const instances: Array<{
		postMessage: ReturnType<typeof vi.fn>
		terminate: ReturnType<typeof vi.fn>
		onmessage: ((event: MessageEvent) => void) | null
		onerror: ((event: Event) => void) | null
	}> = []

	class WorkerMock {
		postMessage = vi.fn()
		terminate = vi.fn()
		onmessage: ((event: MessageEvent) => void) | null = null
		onerror: ((event: Event) => void) | null = null

		constructor(_url: string | URL) {
			instances.push(this)
		}
	}

	vi.stubGlobal("Worker", WorkerMock)
	return instances
}

describe("generateWorld", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("loads the worker module from the transport layer", () => {
		let capturedUrl: string | URL | undefined
		class WorkerMock {
			postMessage = vi.fn()
			terminate = vi.fn()
			onmessage: ((event: MessageEvent) => void) | null = null
			onerror: ((event: Event) => void) | null = null

			constructor(url: string | URL) {
				capturedUrl = url
			}
		}

		vi.stubGlobal("Worker", WorkerMock)
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
			cb(0)
			return 1
		})

		generateWorld(42, undefined, baseParams as never, makeCallbacks())

		expect(String(capturedUrl)).toContain("/src/model/orogen.worker.ts")
		expect(String(capturedUrl)).not.toContain("/src/components/model/orogen")
	})

	it("keeps generation progress monotonic when worker stages regress", () => {
		let workerInstance: WorkerMock | null = null
		class WorkerMock {
			postMessage = vi.fn()
			terminate = vi.fn()
			onmessage: ((event: MessageEvent) => void) | null = null
			onerror: ((event: Event) => void) | null = null

			constructor(_url: string | URL) {
				workerInstance = this
			}
		}

		vi.stubGlobal("Worker", WorkerMock)
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
			cb(0)
			return 1
		})

		const { callbacks, getProgress } = makeStatefulCallbacks()

		generateWorld(42, undefined, baseParams as never, callbacks)

		workerInstance!.onmessage?.({
			data: { type: "progress", label: "Post-processing terrain...", pct: 82 },
		} as MessageEvent)
		expect(getProgress()).toBe(82)

		workerInstance!.onmessage?.({
			data: { type: "progress", label: "Computing climate...", pct: 65 },
		} as MessageEvent)
		expect(getProgress()).toBe(82)

		workerInstance!.onmessage?.({
			data: { type: "progress", label: "Computing population...", pct: 98 },
		} as MessageEvent)
		expect(getProgress()).toBe(98)
	})

	it("maps overrides into the worker request and completes generation callbacks", () => {
		const workers = stubWorker()
		stubAnimationFrame()
		vi.spyOn(console, "log").mockImplementation(() => undefined)

		const previousWorker = { terminate: vi.fn() } as unknown as Worker
		const callbacks = {
			...makeCallbacks(),
			onGenerationComplete: vi.fn(),
			onGenerationFrame: vi.fn(),
			workerRef: { current: previousWorker },
		}
		const world = { id: "generated-world" } as never
		const frame = { timeMs: 123 } as never

		generateWorld(
			77,
			{
				tidallyLocked: true,
				obliquity: 33,
				numPlates: 24,
			},
			baseParams as never,
			callbacks,
		)

		expect(previousWorker.terminate).toHaveBeenCalledTimes(1)
		expect(callbacks.setGenerating).toHaveBeenCalledWith(true)
		expect(callbacks.setGenerationProgress).toHaveBeenCalledWith(0)
		expect(callbacks.setGenerationLabel).toHaveBeenCalledWith(
			"Starting generation...",
		)
		expect(callbacks.setSeed).toHaveBeenCalledWith(77)
		expect(callbacks.setWorld).toHaveBeenCalledWith(null)

		expect(workers).toHaveLength(1)
		expect(workers[0].postMessage).toHaveBeenCalledWith({
			type: "generate",
			params: expect.objectContaining({
				seed: 77,
				tidallyLocked: true,
				obliquity: 0,
				numPlates: 24,
			}),
		})

		workers[0].onmessage?.({
			data: { type: "done", world, frame },
		} as MessageEvent)

		const pushedCode = vi.mocked(callbacks.pushRecentCode).mock.calls[0]?.[0]
		expect(typeof pushedCode).toBe("string")
		expect(callbacks.pushRecentCode).toHaveBeenCalledWith(pushedCode)
		expect(callbacks.setPlanetCode).toHaveBeenCalledWith(pushedCode)
		expect(callbacks.setPlanetCodeInput).toHaveBeenCalledWith(pushedCode)
		expect(callbacks.setWorld).toHaveBeenLastCalledWith(world)
		expect(callbacks.onGenerationFrame).toHaveBeenCalledWith(frame)
		expect(callbacks.setGenerationLabel).toHaveBeenLastCalledWith("Done")
		expect(callbacks.setGenerationProgress).toHaveBeenLastCalledWith(100)
		expect(callbacks.setGenerating).toHaveBeenLastCalledWith(false)
		expect(callbacks.onGenerationComplete).toHaveBeenCalledTimes(1)
		expect(callbacks.workerRef.current).toBe(workers[0])
	})

	it("routes worker status and failure events to the appropriate callbacks", () => {
		const workers = stubWorker()
		stubAnimationFrame()
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		vi.spyOn(console, "log").mockImplementation(() => undefined)

		const callbacks = {
			...makeStatefulCallbacks().callbacks,
			onSimProgress: vi.fn(),
			onSimComplete: vi.fn(),
		}

		generateWorld(42, undefined, baseParams as never, callbacks)

		workers[0].onmessage?.({
			data: { type: "progress", label: "Computing", pct: null },
		} as MessageEvent)
		expect(callbacks.setGenerationLabel).toHaveBeenLastCalledWith("Computing")

		const frame = { month: 3 } as never
		workers[0].onmessage?.({
			data: { type: "sim-progress", timeMs: 5_000, frame },
		} as MessageEvent)
		expect(callbacks.onSimProgress).toHaveBeenCalledWith(5_000, frame)

		const timelines = { provinces: [] } as never
		const events = [{ text: "event" }] as never
		workers[0].onmessage?.({
			data: { type: "sim-done", timeMs: 9_000, timelines, events },
		} as MessageEvent)
		expect(callbacks.onSimComplete).toHaveBeenCalledWith(
			9_000,
			timelines,
			events,
		)

		workers[0].onmessage?.({
			data: { type: "error", message: "bad news", stack: "stack" },
		} as MessageEvent)
		expect(callbacks.setGenerationLabel).toHaveBeenLastCalledWith(
			"Generation failed",
		)
		expect(callbacks.setGenerating).toHaveBeenLastCalledWith(false)

		workers[0].onerror?.({ message: "crash" } as unknown as Event)
		expect(workers[0].terminate).toHaveBeenCalledTimes(1)
		expect(callbacks.workerRef.current).toBeNull()
	})
})

describe("simulation controls", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("starts and pauses simulation only when a worker is present", () => {
		const workerRef = { current: { postMessage: vi.fn() } as unknown as Worker }

		startSimulation(workerRef)
		pauseSimulation(workerRef)

		expect(workerRef.current?.postMessage).toHaveBeenNthCalledWith(1, {
			type: "simulate",
			tickMs: 2_592_000_000,
		})
		expect(workerRef.current?.postMessage).toHaveBeenNthCalledWith(2, {
			type: "pause",
		})

		workerRef.current = null
		startSimulation(workerRef)
		pauseSimulation(workerRef)
	})
})

describe("importHeightmap", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("posts an import request and finishes with the imported world", () => {
		const workers = stubWorker()
		stubAnimationFrame()
		const callbacks = {
			...makeCallbacks(),
			onGenerationComplete: vi.fn(),
			onGenerationFrame: vi.fn(),
		}
		const grayscale = new Uint8Array([10, 20, 30, 40])
		const world = { id: "imported-world" } as never

		importHeightmap(
			grayscale,
			2,
			2,
			{
				seed: 9,
				numPoints: 400,
				jitter: 0.1,
				terrainWarp: 0.2,
				smoothing: 0.3,
				hydraulicErosion: 0.4,
				thermalErosion: 0.5,
				ridgeSharpening: 0.6,
				glacialErosion: 0.7,
				volcanism: 0.8,
				planetRadiusKm: 7_000,
				obliquity: 22,
				eccentricity: 0.03,
				sunTempFactor: 1.1,
				insolationFactor: 1,
				daysPerYear: 400,
				hoursPerDay: 26,
				tidallyLocked: false,
				antistellarLon: 170,
				perihelion: 30,
				pressure: 1.2,
				craters: 0.9,
			},
			callbacks,
		)

		expect(callbacks.setPlanetCode).toHaveBeenCalledWith("")
		expect(callbacks.setPlanetCodeInput).toHaveBeenCalledWith("")
		expect(callbacks.setGenerationLabel).toHaveBeenCalledWith(
			"Importing heightmap...",
		)
		expect(workers[0].postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "import",
				params: expect.objectContaining({
					grayscale,
					imageWidth: 2,
					imageHeight: 2,
					seed: 9,
				}),
			}),
			[grayscale.buffer],
		)

		workers[0].onmessage?.({
			data: { type: "done", world, frame: { timeMs: 0 } },
		} as MessageEvent)

		expect(callbacks.setWorld).toHaveBeenLastCalledWith(world)
		expect(callbacks.setGenerationLabel).toHaveBeenLastCalledWith("Done")
		expect(callbacks.setGenerationProgress).toHaveBeenLastCalledWith(100)
		expect(callbacks.setGenerating).toHaveBeenLastCalledWith(false)
		expect(callbacks.onGenerationComplete).toHaveBeenCalledTimes(1)
	})
})

describe("loadImageAsGrayscale", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("converts loaded image pixels into grayscale values", async () => {
		const drawImage = vi.fn()
		const getImageData = vi.fn(() => ({
			data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
		}))
		vi.stubGlobal("document", {
			createElement: vi.fn(() => ({
				width: 0,
				height: 0,
				getContext: () => ({ drawImage, getImageData }),
			})),
		})

		class ImageMock {
			width = 2
			height = 1
			onload: (() => void) | null = null
			onerror: (() => void) | null = null

			set src(_value: string) {
				this.onload?.()
			}
		}

		vi.stubGlobal("Image", ImageMock)

		const result = await loadImageAsGrayscale("planet.png")

		expect(drawImage).toHaveBeenCalledTimes(1)
		expect(result.width).toBe(2)
		expect(result.height).toBe(1)
		expect(Array.from(result.grayscale)).toEqual([76, 150])
	})

	it("uses object URLs for File inputs and rejects failed image loads", async () => {
		const file = new File(["abc"], "heightmap.png", { type: "image/png" })
		const createObjectURL = vi.fn(() => "blob:heightmap")
		vi.stubGlobal("URL", { createObjectURL })

		class SuccessImageMock {
			width = 1
			height = 1
			onload: (() => void) | null = null
			onerror: (() => void) | null = null

			set src(_value: string) {
				this.onload?.()
			}
		}

		vi.stubGlobal("document", {
			createElement: vi.fn(() => ({
				width: 0,
				height: 0,
				getContext: () => ({
					drawImage: vi.fn(),
					getImageData: () => ({
						data: new Uint8ClampedArray([0, 0, 255, 255]),
					}),
				}),
			})),
		})
		vi.stubGlobal("Image", SuccessImageMock)

		await loadImageAsGrayscale(file)
		expect(createObjectURL).toHaveBeenCalledWith(file)

		class FailingImageMock {
			width = 1
			height = 1
			onload: (() => void) | null = null
			onerror: (() => void) | null = null

			set src(_value: string) {
				this.onerror?.()
			}
		}

		vi.stubGlobal("Image", FailingImageMock)

		await expect(loadImageAsGrayscale("broken.png")).rejects.toThrow(
			"Failed to load image",
		)
	})
})
