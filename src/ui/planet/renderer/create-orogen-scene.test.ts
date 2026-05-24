import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	applyMapExportVisibility,
	buildMapExportTiles,
	normalizeMapCenterLongitudeDeg,
	reapplyMeshOverlayState,
	renderMapExportPng,
} from "./create-orogen-scene"
import { buildMapMesh, buildTerrainMesh } from "./mesh-builders"

function getMaskArray(
	mesh: { geometry: { getAttribute: (name: string) => unknown } },
	name: string,
): number[] {
	const attribute = mesh.geometry.getAttribute(name) as {
		array: ArrayLike<number>
	}
	return Array.from(attribute.array)
}

function buildWorld(): SerializedOrogenWorld {
	return {
		mesh: {
			numRegions: 4,
			numTriangles: 2,
			numSides: 6,
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0]),
			t_xyz: new Float32Array([0.6, 0.5, 0.6, -0.6, 0.5, 0.6]),
			halfedges: new Int32Array([1, 0, -1, 4, 3, -1]),
			s_begin_r: new Int32Array([0, 1, 2, 0, 2, 3]),
			s_inner_t: new Int32Array([0, 0, 0, 1, 1, 1]),
			s_outer_t: new Int32Array([1, 1, 1, 0, 0, 0]),
		},
		elevation: new Float32Array([1, 3, 5, 9]),
		elevation_km: new Float32Array([1, 3, 5, 9]),
		isLand: new Uint8Array([1, 1, 1, 1]),
	} as unknown as SerializedOrogenWorld
}

describe("reapplyMeshOverlayState", () => {
	it("restores occupation hatching after rebuilt meshes replace the originals", () => {
		const world = buildWorld()
		const regionColors = new Float32Array([
			0.1, 0.2, 0.3, 0.7, 0.6, 0.5, 0.2, 0.4, 0.6, 0.9, 0.8, 0.7,
		])
		const overlay = new Float32Array(world.mesh.numRegions * 4)
		overlay[4] = 1
		overlay[5] = 0
		overlay[6] = 0
		overlay[7] = 1

		const terrainBuild = buildTerrainMesh(world, "terrain", regionColors, true)
		const mapBuild = buildMapMesh(world, "terrain", regionColors, 0, 0)

		expect(
			getMaskArray(terrainBuild.mesh, "occMask").every((value) => value === 0),
		).toBe(true)
		expect(
			getMaskArray(mapBuild.mesh, "occMask").every((value) => value === 0),
		).toBe(true)

		reapplyMeshOverlayState({
			world,
			colorMode: "terrain",
			regionColors,
			occupationOverlay: overlay,
			terrainMesh: terrainBuild.mesh,
			terrainFaceToRegion: terrainBuild.faceToRegion,
			mapMesh: mapBuild.mesh,
			mapFaceToRegion: mapBuild.faceToRegion,
			mapCenterLongitudeDeg: 0,
			mapProjectionLatitudeDeg: 0,
		})

		expect(getMaskArray(terrainBuild.mesh, "occMask").includes(1)).toBe(true)
		expect(getMaskArray(mapBuild.mesh, "occMask").includes(1)).toBe(true)
	})
})

describe("buildMapExportTiles", () => {
	it("covers the full output size with multiple tiles", () => {
		expect(buildMapExportTiles(4096, 2048, 2048)).toEqual([
			{ x: 0, y: 0, width: 2048, height: 2048 },
			{ x: 2048, y: 0, width: 2048, height: 2048 },
		])
		expect(buildMapExportTiles(5000, 2500, 2048)).toEqual([
			{ x: 0, y: 0, width: 2048, height: 2048 },
			{ x: 2048, y: 0, width: 2048, height: 2048 },
			{ x: 4096, y: 0, width: 904, height: 2048 },
			{ x: 0, y: 2048, width: 2048, height: 452 },
			{ x: 2048, y: 2048, width: 2048, height: 452 },
			{ x: 4096, y: 2048, width: 904, height: 452 },
		])
	})
})

describe("normalizeMapCenterLongitudeDeg", () => {
	it("wraps longitudes into the export preview range", () => {
		expect(normalizeMapCenterLongitudeDeg(0)).toBe(0)
		expect(normalizeMapCenterLongitudeDeg(180)).toBe(-180)
		expect(normalizeMapCenterLongitudeDeg(270)).toBe(-90)
		expect(normalizeMapCenterLongitudeDeg(-540)).toBe(-180)
	})
})

describe("applyMapExportVisibility", () => {
	it("forces export visibility and restores the original state", () => {
		const included = new THREE.Object3D()
		const excluded = new THREE.Object3D()
		included.visible = false
		excluded.visible = true

		const restore = applyMapExportVisibility([
			{ object: included, visible: true },
			{ object: excluded, visible: false },
		])

		expect(included.visible).toBe(true)
		expect(excluded.visible).toBe(false)

		restore()

		expect(included.visible).toBe(false)
		expect(excluded.visible).toBe(true)
	})
})

describe("renderMapExportPng", () => {
	it("renders a PNG blob with full-map orthographic extents and progress updates", async () => {
		const scene = new THREE.Scene()
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
		const renderCalls: Array<{
			left: number
			right: number
			top: number
			bottom: number
		}> = []
		const readWidths: number[] = []
		const progress: string[] = []
		const disposedTargets: number[] = []
		const previousTarget = { dispose: vi.fn() }
		const renderer = {
			capabilities: { maxTextureSize: 4096 },
			getRenderTarget: vi.fn(() => previousTarget),
			setRenderTarget: vi.fn(),
			render: vi.fn((_scene: THREE.Scene, exportCamera: THREE.Camera) => {
				const ortho = exportCamera as THREE.OrthographicCamera
				renderCalls.push({
					left: ortho.left,
					right: ortho.right,
					top: ortho.top,
					bottom: ortho.bottom,
				})
			}),
			readRenderTargetPixels: vi.fn(
				(
					_target: unknown,
					_x: number,
					_y: number,
					width: number,
					height: number,
					buffer: Uint8Array,
				) => {
					readWidths.push(width)
					for (let i = 0; i < width * height; i++) {
						buffer[i * 4] = 255
						buffer[i * 4 + 1] = 128
						buffer[i * 4 + 2] = 64
						buffer[i * 4 + 3] = 255
					}
				},
			),
		}

		const blob = await renderMapExportPng({
			scene,
			renderer: renderer as Parameters<
				typeof renderMapExportPng
			>[0]["renderer"],
			camera,
			width: 4096,
			height: 2048,
			onProgress: (percent, label) => {
				progress.push(`${percent}:${label}`)
			},
			createRenderTarget: (width, height) => ({
				width,
				height,
				texture: {},
				dispose: () => disposedTargets.push(width * height),
			}),
			yieldToMainThread: () => Promise.resolve(),
		})

		expect(blob.type).toBe("image/png")
		const bands = Math.ceil(2048 / 256)
		const tilesPerBand = 2
		expect(readWidths).toEqual(Array(bands * tilesPerBand).fill(2048))
		expect(progress[0]).toBe("0:Preparing export")
		expect(disposedTargets).toEqual(Array(bands * tilesPerBand).fill(2048 * 256))
		expect(camera.left).toBe(-1)
		expect(camera.right).toBe(1)
		expect(camera.top).toBe(1)
		expect(camera.bottom).toBe(-1)
		expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget)
	}, 10000)

	it("assembles horizontal tiles correctly using coordinate-pattern verification", async () => {
		const scene = new THREE.Scene()
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
		const previousTarget = { dispose: vi.fn() }
		const renderer = {
			capabilities: { maxTextureSize: 4 },
			getRenderTarget: vi.fn(() => previousTarget),
			setRenderTarget: vi.fn(),
			render: vi.fn(),
			readRenderTargetPixels: vi.fn(
				(
					_target: unknown,
					x: number,
					y: number,
					width: number,
					height: number,
					buffer: Uint8Array,
				) => {
					for (let row = 0; row < height; row++) {
						for (let col = 0; col < width; col++) {
							const globalX = x + col
							const globalY = y + row
							const offset = (row * width + col) * 4
							buffer[offset] = globalX % 256
							buffer[offset + 1] = globalY % 256
							buffer[offset + 2] = (globalX + globalY) % 256
							buffer[offset + 3] = 255
						}
					}
				},
			),
		}

		const blob = await renderMapExportPng({
			scene,
			renderer: renderer as Parameters<
				typeof renderMapExportPng
			>[0]["renderer"],
			camera,
			width: 8,
			height: 4,
			createRenderTarget: (width, height) => ({
				width,
				height,
				texture: {},
				dispose: () => undefined,
			}),
			yieldToMainThread: () => Promise.resolve(),
		})

		expect(blob.type).toBe("image/png")
		const buffer = new Uint8Array(await blob.arrayBuffer())
		expect(buffer[0]).toBe(0x89)
		expect(buffer[1]).toBe(0x50)
		expect(buffer[2]).toBe(0x4e)
		expect(buffer[3]).toBe(0x47)
	}, 10000)
})
