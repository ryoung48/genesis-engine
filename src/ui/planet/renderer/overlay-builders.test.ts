import * as THREE from "three"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	buildGlobeHierarchyOverlay,
	buildMapHierarchyOverlay,
	collectHierarchyNodes,
} from "./overlay-builders"

function makeMockCanvas(): HTMLCanvasElement {
	return { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
}

function makeHierarchyWorld(): SerializedOrogenWorld {
	// 3 provinces in nation 0 with depth 0, 1, 2
	// province 0: depth 0, root (parent=-1), seed=region 0
	// province 1: depth 1, parent=province 0, seed=region 1
	// province 2: depth 2, parent=province 1, seed=region 2
	// province 3: belongs to nation 1 (different), seed=region 3
	return {
		mesh: {
			numRegions: 4,
			numSides: 0,
			halfedges: new Int32Array(0),
			s_begin_r: new Int32Array(0),
			s_inner_t: new Int32Array(0),
			s_outer_t: new Int32Array(0),
			t_xyz: new Float32Array(0),
			r_xyz: new Float32Array([
				1,
				0,
				0, // region 0 — already unit length
				0,
				1,
				0, // region 1
				0,
				0,
				1, // region 2
				-1,
				0,
				0, // region 3
			]),
		},
		elevation: new Float32Array([0, 0, 0, 0]),
		elevation_km: new Float32Array([0, 0, 0, 0]),
		isLand: new Uint8Array([1, 1, 1, 1]),
		provinces: {
			regionProvince: new Int32Array([0, 1, 2, 3]),
			seeds: new Int32Array([0, 1, 2, 3]), // province p → seed region p
			count: 4,
			desolate: new Uint8Array([0, 0, 0, 0]),
			adjOffset: new Int32Array([0, 0, 0, 0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([1, 1, 1, 1]),
			colors: new Float32Array(12),
		},
		nations: {
			assignment: new Int32Array([0, 0, 0, 1]), // provinces 0-2 → nation 0, province 3 → nation 1
			seeds: new Int32Array([0, 3]),
			count: 2,
			adjOffset: new Int32Array([0, 0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([3, 1]),
			colors: new Float32Array(6),
			parent: new Int32Array([-1, 0, 1, -1]),
			depth: new Int32Array([0, 1, 2, 0]),
			childOffset: new Int32Array([0, 1, 2, 2, 2]),
			childList: new Int32Array([1, 2]),
			sovereign: new Int32Array([0, 0, 0, 1]),
			gravity: new Float32Array([1, 1, 1, 1]),
		},
	} as unknown as SerializedOrogenWorld
}

describe("collectHierarchyNodes", () => {
	it("returns null when world has no nations", () => {
		const world = makeHierarchyWorld()
		;(world as unknown as Record<string, unknown>).nations = undefined
		expect(collectHierarchyNodes(world, 0)).toBeNull()
	})

	it("returns null when world has no provinces", () => {
		const world = makeHierarchyWorld()
		;(world as unknown as Record<string, unknown>).provinces = undefined
		expect(collectHierarchyNodes(world, 0)).toBeNull()
	})

	it("returns correct nodes for a small nation hierarchy", () => {
		const world = makeHierarchyWorld()
		const nodes = collectHierarchyNodes(world, 0)
		expect(nodes).not.toBeNull()
		expect(nodes!).toHaveLength(3) // provinces 0, 1, 2

		const root = nodes!.find((n) => n.provinceId === 0)!
		expect(root.depth).toBe(0)
		expect(root.parentProvinceId).toBe(-1)
		expect(root.seedRegion).toBe(0)
		expect(root.xyz[0]).toBeCloseTo(1)
		expect(root.xyz[1]).toBeCloseTo(0)
		expect(root.xyz[2]).toBeCloseTo(0)

		const child = nodes!.find((n) => n.provinceId === 1)!
		expect(child.depth).toBe(1)
		expect(child.parentProvinceId).toBe(0)
		expect(child.seedRegion).toBe(1)

		const grandchild = nodes!.find((n) => n.provinceId === 2)!
		expect(grandchild.depth).toBe(2)
		expect(grandchild.parentProvinceId).toBe(1)
	})

	it("excludes provinces from other nations", () => {
		const world = makeHierarchyWorld()
		const nodes = collectHierarchyNodes(world, 0)!
		const provinceIds = nodes.map((n) => n.provinceId)
		expect(provinceIds).not.toContain(3) // province 3 is in nation 1
	})

	it("normalizes xyz to unit length", () => {
		const world = makeHierarchyWorld()
		// Set a non-unit-length position
		world.mesh.r_xyz[0] = 2
		world.mesh.r_xyz[1] = 0
		world.mesh.r_xyz[2] = 0
		const nodes = collectHierarchyNodes(world, 0)!
		const root = nodes.find((n) => n.provinceId === 0)!
		expect(root.xyz[0]).toBeCloseTo(1)
		expect(root.xyz[1]).toBeCloseTo(0)
		expect(root.xyz[2]).toBeCloseTo(0)
	})
})

describe("buildGlobeHierarchyOverlay", () => {
	it("returns null when world has no nations", () => {
		const world = makeHierarchyWorld()
		;(world as unknown as Record<string, unknown>).nations = undefined
		expect(
			buildGlobeHierarchyOverlay(world, 0, "globe", makeMockCanvas()),
		).toBeNull()
	})

	it("returns a Group with children when valid data provided", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(
			world,
			0,
			"globe",
			makeMockCanvas(),
		)
		expect(group).toBeInstanceOf(THREE.Group)
		expect(group!.children.length).toBeGreaterThan(0)
	})

	it("sets group visible=true when viewMode is globe", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(
			world,
			0,
			"globe",
			makeMockCanvas(),
		)!
		expect(group.visible).toBe(true)
	})

	it("sets group visible=false when viewMode is map", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(world, 0, "map", makeMockCanvas())!
		expect(group.visible).toBe(false)
	})

	it("includes Points for dots and LineSegments2 for edges", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(
			world,
			0,
			"globe",
			makeMockCanvas(),
		)!
		const hasPoints = group.children.some((c) => c instanceof THREE.Points)
		const hasLines = group.children.some((c) => c instanceof LineSegments2)
		expect(hasPoints).toBe(true)
		expect(hasLines).toBe(true)
	})
})

describe("buildMapHierarchyOverlay", () => {
	it("returns null when world has no nations", () => {
		const world = makeHierarchyWorld()
		;(world as unknown as Record<string, unknown>).nations = undefined
		expect(
			buildMapHierarchyOverlay(world, 0, 0, 0, "map", makeMockCanvas()),
		).toBeNull()
	})

	it("returns a Group with children when valid data provided", () => {
		const world = makeHierarchyWorld()
		const group = buildMapHierarchyOverlay(
			world,
			0,
			0,
			0,
			"map",
			makeMockCanvas(),
		)
		expect(group).toBeInstanceOf(THREE.Group)
		expect(group!.children.length).toBeGreaterThan(0)
	})

	it("sets group visible=true when viewMode is map", () => {
		const world = makeHierarchyWorld()
		const group = buildMapHierarchyOverlay(
			world,
			0,
			0,
			0,
			"map",
			makeMockCanvas(),
		)!
		expect(group.visible).toBe(true)
	})

	it("sets group visible=false when viewMode is globe", () => {
		const world = makeHierarchyWorld()
		const group = buildMapHierarchyOverlay(
			world,
			0,
			0,
			0,
			"globe",
			makeMockCanvas(),
		)!
		expect(group.visible).toBe(false)
	})

	it("includes circle meshes for provinces", () => {
		const world = makeHierarchyWorld()
		const group = buildMapHierarchyOverlay(
			world,
			0,
			0,
			0,
			"map",
			makeMockCanvas(),
		)!
		const hasMeshes = group.children.some((c) => c instanceof THREE.Mesh)
		expect(hasMeshes).toBe(true)
	})
})
