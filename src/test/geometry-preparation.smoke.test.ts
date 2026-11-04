import { DirectionalLight, Mesh, MeshPhongMaterial } from "three"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import type { TerrainControllerDeps } from "@/ui/genesis/renderer/genesis-scene/terrain-controller"
import { createTerrainController } from "@/ui/genesis/renderer/genesis-scene/terrain-controller"
import { GEOMETRY_PREPARATION } from "@/ui/genesis/renderer/geometry-preparation"
import { GEOMETRY_DATA } from "@/ui/genesis/renderer/geometry-preparation/data"
import { TERRAIN_PREVIEW } from "@/ui/genesis/renderer/terrain-preview"

const mesh = MESH.buildSphereMesh({
	n: 100,
	jitter: 0.5,
	rng: RNG.createRng({ seed: 7 }),
})
const terrain = {
	mesh,
	elevation: new Float32Array(mesh.numRegions).fill(0.1),
	elevation_km: new Float32Array(mesh.numRegions).fill(1),
}

afterEach(() => vi.unstubAllGlobals())

describe("parallel geometry preparation", () => {
	it("accepts display color updates while the scene still has preview materials", () => {
		const preview = TERRAIN_PREVIEW.create(GEOMETRY_DATA.compute(terrain))
		const ctx = {
			currentWorld: null,
			currentViewMode: "globe",
			terrainMesh: preview.globe,
			mapMesh: preview.map,
			waterMat: new MeshPhongMaterial(),
			waterMesh: new Mesh(),
			atmosMesh: new Mesh(),
			sun: new DirectionalLight(),
		} as unknown as GenesisContext
		const controller = createTerrainController(ctx, {
			requestRender: vi.fn(),
		} as unknown as TerrainControllerDeps)
		expect(() => controller.setDisplayColors("terrain", null)).not.toThrow()
		expect(() => controller.setDisplayColors("vegetation", null)).not.toThrow()
		for (const mesh of [preview.globe, preview.map]) {
			mesh.geometry.dispose()
			mesh.material.dispose()
		}
		ctx.waterMat.dispose()
	})
	it("warms the worker, submits only render inputs once, and delivers a preview before completion is awaited", async () => {
		const worker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			onmessage: null,
		} as unknown as Worker
		vi.stubGlobal(
			"Worker",
			vi.fn(function () {
				return worker
			}),
		)
		const onReady = vi.fn()
		const onError = vi.fn()
		const preparation = GEOMETRY_PREPARATION.create({ onReady, onError })
		expect(worker.postMessage).not.toHaveBeenCalled()
		preparation.start(terrain)
		preparation.start(terrain)
		expect(worker.postMessage).toHaveBeenCalledTimes(1)
		const snapshot = vi.mocked(worker.postMessage).mock.calls[0][0]
		expect(snapshot.mesh).not.toHaveProperty("adjList")
		expect(snapshot.mesh.r_xyz).toBe(mesh.r_xyz)
		expect(vi.mocked(worker.postMessage).mock.calls[0]).toHaveLength(1)
		const geometry = GEOMETRY_DATA.compute(terrain)
		worker.onmessage?.call(worker, {
			data: { type: "ready", geometry },
		} as MessageEvent)
		expect(onReady).toHaveBeenCalledWith(geometry)
		expect(await preparation.result).toBe(geometry)
		expect(worker.terminate).toHaveBeenCalledTimes(1)
		expect(onError).not.toHaveBeenCalled()
	})

	it("ignores results after cancellation and settles worker failures", async () => {
		const workers: Worker[] = []
		vi.stubGlobal(
			"Worker",
			vi.fn(function () {
				const worker = {
					postMessage: vi.fn(),
					terminate: vi.fn(),
					onmessage: null,
					onerror: null,
				} as unknown as Worker
				workers.push(worker)
				return worker
			}),
		)
		const onReady = vi.fn(),
			onError = vi.fn()
		const cancelled = GEOMETRY_PREPARATION.create({ onReady, onError })
		cancelled.start(terrain)
		cancelled.cancel()
		workers[0].onmessage?.call(workers[0], {
			data: { type: "ready", geometry: GEOMETRY_DATA.compute(terrain) },
		} as MessageEvent)
		expect(await cancelled.result).toBeNull()
		expect(onReady).not.toHaveBeenCalled()
		const failed = GEOMETRY_PREPARATION.create({ onReady, onError })
		workers[1].onerror?.call(workers[1], {
			message: "Worker failed",
		} as ErrorEvent)
		expect(await failed.result).toBeNull()
		expect(onError).toHaveBeenCalledWith(new Error("Worker failed"))
		expect(workers[1].terminate).toHaveBeenCalledTimes(1)
	})

	it("produces outward unit normals and tightly sized seam geometry", () => {
		const geometry = GEOMETRY_DATA.compute(terrain)
		let invalidNormals = 0
		for (let i = 0; i < geometry.terrain.normals.length; i += 3) {
			const normal = geometry.terrain.normals.subarray(i, i + 3)
			if (
				Math.abs(Math.hypot(...normal) - 1) > 1e-5 ||
				normal.some((value) => !Number.isFinite(value))
			)
				invalidNormals++
			if (
				normal[0] * geometry.terrain.positions[i] +
					normal[1] * geometry.terrain.positions[i + 1] +
					normal[2] * geometry.terrain.positions[i + 2] <=
				0
			)
				invalidNormals++
		}
		expect(invalidNormals).toBe(0)
		for (const array of Object.values(geometry.map))
			expect(array.byteLength).toBe(array.buffer.byteLength)
		const originalElevation = terrain.elevation.slice()
		const cloned = structuredClone(geometry, {
			transfer: GEOMETRY_DATA.transferList(geometry),
		})
		expect(cloned.map.positions.length).toBeGreaterThan(0)
		expect(terrain.elevation).toEqual(originalElevation)
	})
})
