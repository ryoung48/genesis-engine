import { afterEach, describe, expect, it, vi } from "vitest"
import { type GenerationCallbacks, generateWorld } from "./generation"

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

describe("generateWorld", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("loads the worker module from src/model/orogen", () => {
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

		expect(String(capturedUrl)).toContain("/src/model/orogen/orogen.worker.ts")
		expect(String(capturedUrl)).not.toContain("/src/components/model/orogen")
	})
})
