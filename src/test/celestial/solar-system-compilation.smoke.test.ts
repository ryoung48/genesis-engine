import * as THREE from "three"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFERRED_SHADERS } from "@/ui/genesis/renderer/deferred-shaders"
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
	const group = new THREE.Group()
	const material = new THREE.MeshStandardMaterial()
	DEFERRED_SHADERS.mark({
		material,
		deferral: { kind: "stand-in", lit: true, color: 0xffffff },
	})
	group.add(new THREE.Mesh(new THREE.SphereGeometry(), material))
	return {
		group,
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

	it("draws placeholders while compiling staged materials with the scene's lights", async () => {
		const harness = createHarness()
		harness.controller.setSolarSystemOverlay(harness.params)
		const mesh = harness.context.solarSystemOverlayState!.group
			.children[0] as THREE.Mesh
		const material = mesh.material
		harness.controller.renderSolarSystemView()
		harness.controller.renderSolarSystemView()
		expect(harness.compileAsync).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				children: [expect.objectContaining({ material })],
			}),
			harness.context.camera,
			harness.context.scene,
		)
		expect(mesh.material).not.toBe(material)
		expect(harness.render).toHaveBeenCalledTimes(2)
		harness.render.mockClear()
		harness.requestRender.mockClear()
		harness.complete()
		await vi.waitFor(() => expect(harness.requestRender).toHaveBeenCalledOnce())
		expect(mesh.material).toBe(material)
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
		harness.render.mockClear()
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
