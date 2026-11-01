import * as THREE from "three"
import { expect, it, vi } from "vitest"
import { SCRIPT } from "@/model/society/script"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { createLabelsController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/labels"
import { updateGlobeLabelOrientations } from "@/ui/genesis/renderer/nation-label-overlay/orientation"
import {
	buildGlobeNationScripts,
	createNationScriptPools,
	createPendingNationScriptTextureQueue,
	processPendingNationScriptTextures,
} from "@/ui/genesis/renderer/nation-script-overlay"

vi.mock("@/ui/genesis/renderer/script-texture", () => ({
	DEFAULT_SCRIPT_RENDER_SCALE: 7,
	renderScriptTexture: () => ({
		canvas: { width: 100, height: 20 },
		aspect: 5,
	}),
}))

function createWorld(): SerializedGenesisWorld {
	return {
		mesh: { r_xyz: new Float32Array([0, 0, 1]) },
		elevation: new Float32Array([0]),
		provinces: { count: 1, seeds: new Int32Array([0]) },
		nations: { seeds: new Int32Array([0]), size: new Int32Array([1]) },
		cultures: { assignment: new Int32Array([0]) },
		heritages: { assignment: new Int32Array([0]) },
	} as unknown as SerializedGenesisWorld
}

it("positions scripts loaded after the first frame without moving the camera", () => {
	const world = createWorld()
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(0, 0, 3)
	camera.updateMatrixWorld()
	const queue = createPendingNationScriptTextureQueue()
	const cache = new Map()
	const group = buildGlobeNationScripts(
		world,
		["Example"],
		new Map([[0, SCRIPT.spawn("overlay-regression")]]),
		cache,
		queue,
		camera,
		createNationScriptPools().globe,
		true,
	)
	updateGlobeLabelOrientations(group, camera, true)
	expect(group.children).toHaveLength(0)
	expect(processPendingNationScriptTextures(queue, cache).processed).toBe(1)
	updateGlobeLabelOrientations(group, camera, true)
	expect(group.children).toHaveLength(1)
	expect(group.children[0].visible).toBe(true)
	expect(group.children[0].position.length()).toBeGreaterThan(1)
	expect(group.children[0].quaternion.angleTo(camera.quaternion)).toBeLessThan(
		1e-8,
	)
})

vi.mock("@/ui/genesis/renderer/nation-label-overlay/nation-labels", () => ({
	buildGlobeNationLabels: () => new THREE.Group(),
	buildMapNationLabels: () => new THREE.Group(),
}))

it.each([
	false,
	true,
])("builds scripts with a history override: %s", (withHistoryOverride) => {
	const ctx = {
		currentWorld: createWorld(),
		labelMode: { nations: true, dynasty: false, script: true },
		nationNames: ["Example"],
		heritageScripts: new Map([[0, SCRIPT.spawn("overlay-regression")]]),
		nationScriptTextureCache: new Map(),
		camera: new THREE.PerspectiveCamera(),
		scene: new THREE.Scene(),
		globeGroup: new THREE.Group(),
		currentMapCenterLongitudeDeg: 0,
		currentMapProjectionLatitudeDeg: 0,
	} as unknown as GenesisContext
	if (withHistoryOverride) {
		ctx.currentWorld!.nations!.seeds[0] = -1
		ctx.earthHistoryNationOverride = {
			assignment: new Int32Array([0]),
			seeds: new Int32Array([0]),
			names: ["Historical Name"],
			colors: new Float32Array([0.5, 0.5, 0.5]),
		}
	}
	createLabelsController(ctx, {
		updateOverlayVisibility: vi.fn(),
	}).rebuildNationLabels()
	expect(ctx.globeNationScripts?.parent).toBe(ctx.globeGroup)
	expect(ctx.mapNationScripts?.parent).toBe(ctx.scene)
	expect(ctx.pendingNationScriptTextureQueue?.tasks).toHaveLength(1)
})
