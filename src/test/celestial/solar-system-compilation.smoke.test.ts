import * as THREE from "three"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { createSolarSystemController } from "@/ui/genesis/renderer/genesis-scene/solar-system-controller"
import { buildSolarSystemOverlay } from "@/ui/genesis/solar-system/overlay/overlay"
import type {
	SolarSystemOverlayParams,
	SolarSystemOverlayState,
} from "@/ui/genesis/solar-system/overlay/types"

vi.mock("@/ui/genesis/solar-system/overlay/overlay", () => ({
	buildSolarSystemOverlay: vi.fn(),
}))
vi.mock("@/ui/genesis/renderer/nebula-background", () => ({
	frameNebulaBackground: vi.fn(),
	setNebulaBackgroundSeed: vi.fn(),
}))

function createOverlay(): SolarSystemOverlayState {
	return {
		group: new THREE.Group(),
		suggestedCameraDistance: 6,
		setDay: vi.fn(),
		updateBodies: vi.fn(() => true),
		updateLevelOfDetail: vi.fn(),
		updateLabelOrientations: vi.fn(),
		dispose: vi.fn(),
		getBodyFocus: vi.fn(() => null),
		setSpinHours: vi.fn(),
		resolveHitBodyIndex: vi.fn(() => null),
		listAddresses: vi.fn(() => []),
	}
}

function createHarness() {
	let complete: () => void = () => undefined
	const ready = new Promise<void>((resolve) => {
		complete = resolve
	})
	const compileAsync = vi.fn(() => ready)
	const render = vi.fn()
	const requestRender = vi.fn()
	const context = {
		solarSystemGroup: new THREE.Group(),
		scene: new THREE.Scene(),
		camera: new THREE.PerspectiveCamera(),
		controls: { maxDistance: 24 },
		renderer: { compileAsync, render },
		solarSystemActive: true,
		solarSystemOverlayState: null,
		solarSystemTrackedFocus: null,
		currentSolarSystemSpinHours: 0,
		currentSolarSystemDay: 0,
	} as unknown as GenesisContext
	const controller = createSolarSystemController(context, {
		requestRender,
		syncAnimationState: vi.fn(),
		updateOverlayVisibility: vi.fn(),
	})
	const params = { bodies: [] } as unknown as SolarSystemOverlayParams
	return {
		controller,
		context,
		params,
		compileAsync,
		render,
		requestRender,
		complete,
	}
}

describe("solar system shader compilation", () => {
	beforeEach(() => {
		vi.mocked(buildSolarSystemOverlay).mockReset()
		vi.mocked(buildSolarSystemOverlay).mockImplementation(createOverlay)
	})

	it("waits for shaders without drawing or counting the scene's lights twice", async () => {
		const harness = createHarness()
		harness.controller.setSolarSystemOverlay(harness.params)
		harness.controller.renderSolarSystemView()
		harness.controller.renderSolarSystemView()
		expect(harness.compileAsync).toHaveBeenCalledExactlyOnceWith(
			harness.context.solarSystemGroup,
			harness.context.camera,
		)
		expect(harness.render).not.toHaveBeenCalled()
		harness.requestRender.mockClear()
		harness.complete()
		await vi.waitFor(() => expect(harness.requestRender).toHaveBeenCalledOnce())
		harness.controller.renderSolarSystemView()
		expect(harness.render).toHaveBeenCalledOnce()
	})

	it("keeps previous programs alive until the replacement has compiled", async () => {
		const harness = createHarness()
		harness.controller.setSolarSystemOverlay(harness.params)
		const previous = harness.context.solarSystemOverlayState!
		harness.controller.renderSolarSystemView()
		harness.controller.updateSolarSystemOverlay(harness.params)
		expect(previous.updateBodies).not.toHaveBeenCalled()
		expect(previous.dispose).not.toHaveBeenCalled()
		harness.requestRender.mockClear()
		harness.complete()
		await vi.waitFor(() => expect(harness.requestRender).toHaveBeenCalledOnce())
		expect(previous.dispose).not.toHaveBeenCalled()
		harness.controller.renderSolarSystemView()
		await vi.waitFor(() => expect(previous.dispose).toHaveBeenCalledOnce())
		expect(harness.compileAsync).toHaveBeenCalledTimes(2)
	})

	it("finishes pending work before cleanup and never requests another frame", async () => {
		const harness = createHarness()
		harness.controller.setSolarSystemOverlay(harness.params)
		const previous = harness.context.solarSystemOverlayState!
		harness.controller.renderSolarSystemView()
		harness.controller.setSolarSystemOverlay(null)
		harness.requestRender.mockClear()
		const cleanup = harness.controller.finishCompilation()
		expect(previous.dispose).not.toHaveBeenCalled()
		harness.complete()
		await cleanup
		expect(previous.dispose).toHaveBeenCalledOnce()
		expect(harness.requestRender).not.toHaveBeenCalled()
		harness.controller.renderSolarSystemView()
		expect(harness.render).not.toHaveBeenCalled()
	})
})
