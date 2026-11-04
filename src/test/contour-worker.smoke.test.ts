import { BufferGeometry, Mesh, MeshBasicMaterial } from "three"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { CONTOURS } from "@/ui/genesis/renderer/contours"
import { CONTOUR_SURFACE } from "@/ui/genesis/renderer/contours/surface"
import { CONTOUR_WORKER } from "@/ui/genesis/renderer/contours/worker"
import {
	computeMapGeometryArrays,
	computeTerrainGeometryArrays,
} from "@/ui/genesis/renderer/terrain-geometry"

const mesh = MESH.buildSphereMesh({
	n: 100,
	jitter: 0.5,
	rng: RNG.createRng({ seed: 7 }),
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("lazy contour generation", () => {
	it("builds globe and seam-expanded map geometry without computing contour surfaces", () => {
		const create = vi.spyOn(CONTOUR_SURFACE, "create")
		const world = {
			mesh,
			elevation: new Float32Array(mesh.numRegions).fill(0.1),
			elevation_km: new Float32Array(mesh.numRegions).fill(1),
		} as SerializedGenesisWorld
		const terrain = computeTerrainGeometryArrays(world, "terrain", null, true)
		const map = computeMapGeometryArrays(world, "terrain", null, 0, 0)
		expect(create).not.toHaveBeenCalled()
		expect(map.contourSides.length).toBeGreaterThan(terrain.contourSides.length)
		for (const arrays of [terrain, map]) {
			expect(arrays).not.toHaveProperty("contourControls")
			expect(
				Array.from(arrays.contourSides, (side) => mesh.s_begin_r[side]),
			).toEqual(Array.from(arrays.faceToRegion))
		}
	})

	it("starts one shared worker on demand and keeps hidden pending results hidden", () => {
		const workers: Worker[] = []
		const WorkerMock = vi.fn(function () {
			const worker = {
				postMessage: vi.fn(),
				terminate: vi.fn(),
				onmessage: null,
				onerror: null,
			} as unknown as Worker
			workers.push(worker)
			return worker
		})
		vi.stubGlobal("Worker", WorkerMock)
		const world = { mesh, elevation_km: new Float32Array(mesh.numRegions) }
		const globe = new Mesh(new BufferGeometry(), new MeshBasicMaterial())
		const map = new Mesh(new BufferGeometry(), new MeshBasicMaterial())
		const requestRender = vi.fn()
		for (const target of [globe, map]) {
			CONTOURS.attach({
				material: target.material,
				visible: false,
				fragmentTarget: "target",
				colorExpression: "color",
			})
			CONTOUR_WORKER.prepare({
				world,
				geometry: target.geometry,
				sides: Int32Array.of(0),
				mapOrder: target === map,
			})
			CONTOUR_WORKER.setVisible({ mesh: target, visible: false, requestRender })
		}
		expect(WorkerMock).not.toHaveBeenCalled()
		expect(globe.geometry.hasAttribute("contourControl0")).toBe(false)
		CONTOUR_WORKER.setVisible({ mesh: globe, visible: true, requestRender })
		CONTOUR_WORKER.setVisible({ mesh: globe, visible: true, requestRender })
		CONTOUR_WORKER.setVisible({ mesh: map, visible: true, requestRender })
		expect(WorkerMock).toHaveBeenCalledTimes(1)
		const worker = workers[0]
		expect(worker.postMessage).toHaveBeenCalledTimes(3)
		CONTOUR_WORKER.setVisible({ mesh: globe, visible: false, requestRender })
		worker.onmessage?.call(worker, {
			data: { id: 0, controls: new Float32Array(30) },
		} as MessageEvent)
		expect(globe.geometry.getAttribute("contourControl0").count).toBe(3)
		expect(globe.material.userData.contourVisibility.value).toBe(0)
		CONTOUR_WORKER.setVisible({ mesh: globe, visible: true, requestRender })
		expect(globe.material.userData.contourVisibility.value).toBe(1)
		expect(worker.postMessage).toHaveBeenCalledTimes(3)
		map.geometry.dispose()
		worker.onmessage?.call(worker, {
			data: { id: 1, controls: new Float32Array(30) },
		} as MessageEvent)
		expect(map.geometry.hasAttribute("contourControl0")).toBe(false)
		expect(worker.terminate).not.toHaveBeenCalled()
		globe.geometry.dispose()
		expect(worker.terminate).toHaveBeenCalledTimes(1)
		expect(requestRender).toHaveBeenCalledTimes(1)
	})
})
