import * as THREE from "three"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { describe, expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import {
	buildGlobeHierarchyOverlay,
	buildMapHierarchyOverlay,
	buildMapThermalEquator,
	buildNationBordersGlobe,
	buildNationBordersMap,
	collectAllNationBorderGlobePositions,
	collectAllNationBorderMapPositions,
	collectHierarchyNodes,
	collectNationBorderGlobePositions,
	collectNationBorderMapPositions,
} from "./overlay-builders"

function makeMockCanvas(): HTMLCanvasElement {
	return { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
}

function makeHierarchyWorld(): SerializedGenesisWorld {
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
	} as unknown as SerializedGenesisWorld
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

describe("nation border batching", () => {
	function makeNationBorderWorld(): SerializedGenesisWorld {
		return {
			mesh: {
				numRegions: 3,
				numSides: 4,
				halfedges: new Int32Array([1, 0, 3, 2]),
				s_begin_r: new Int32Array([0, 1, 1, 2]),
				s_inner_t: new Int32Array([0, 1, 2, 3]),
				s_outer_t: new Int32Array([1, 0, 3, 2]),
				t_xyz: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0]),
				r_xyz: new Float32Array(9),
			},
			elevation: new Float32Array([0, 0, 0]),
			elevation_km: new Float32Array([0, 0, 0]),
			isLand: new Uint8Array([1, 1, 1]),
			provinces: {
				regionProvince: new Int32Array([0, 1, 2]),
				seeds: new Int32Array([0, 1, 2]),
				count: 3,
				desolate: new Uint8Array([0, 0, 0]),
				adjOffset: new Int32Array([0, 0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1, 1]),
				colors: new Float32Array(9),
			},
			nations: {
				assignment: new Int32Array([0, 1, 0]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([2, 1]),
				colors: new Float32Array(6),
				parent: new Int32Array([-1, -1, -1]),
				depth: new Int32Array([0, 0, 0]),
				childOffset: new Int32Array([0, 0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1, 0]),
				gravity: new Float32Array([1, 1, 1]),
			},
		} as unknown as SerializedGenesisWorld
	}

	function makeWrappedNationBorderWorld(): SerializedGenesisWorld {
		const lonA = (179 * Math.PI) / 180
		const lonB = (-179 * Math.PI) / 180
		return {
			mesh: {
				numRegions: 2,
				numSides: 2,
				halfedges: new Int32Array([1, 0]),
				s_begin_r: new Int32Array([0, 1]),
				s_inner_t: new Int32Array([0, 1]),
				s_outer_t: new Int32Array([1, 0]),
				t_xyz: new Float32Array([
					Math.cos(lonA),
					Math.sin(lonA),
					0,
					Math.cos(lonB),
					Math.sin(lonB),
					0,
				]),
				r_xyz: new Float32Array(6),
			},
			elevation: new Float32Array([0, 0]),
			elevation_km: new Float32Array([0, 0]),
			isLand: new Uint8Array([1, 1]),
			provinces: {
				regionProvince: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([0, 0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array(6),
			},
			nations: {
				assignment: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array(6),
				parent: new Int32Array([-1, -1]),
				depth: new Int32Array([0, 0]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1]),
				gravity: new Float32Array([1, 1]),
			},
		} as unknown as SerializedGenesisWorld
	}

	it("collects each nation boundary once for the batched globe overlay", () => {
		const world = makeNationBorderWorld()

		expect(collectNationBorderGlobePositions(world, 0, 0, false)).toHaveLength(
			12,
		)
		expect(collectNationBorderGlobePositions(world, 1, 0, false)).toHaveLength(
			12,
		)
		expect(collectAllNationBorderGlobePositions(world, 0, false)).toHaveLength(
			12,
		)
	})

	it("collects wrapped map segments once for the batched map overlay", () => {
		const world = makeNationBorderWorld()

		expect(collectNationBorderMapPositions(world, 0, 0, 0, 0)).toHaveLength(12)
		expect(collectNationBorderMapPositions(world, 1, 0, 0, 0)).toHaveLength(12)
		expect(collectAllNationBorderMapPositions(world, 0, 0, 0)).toHaveLength(12)
	})

	it("duplicates seam-crossing nation borders onto both map edges", () => {
		const world = makeWrappedNationBorderWorld()

		expect(collectAllNationBorderMapPositions(world, 0, 0, 0)).toHaveLength(12)
	})

	it("builds visible batched nation border overlays for the active view only", () => {
		const world = makeNationBorderWorld()

		const globe = buildNationBordersGlobe(world, "globe", true, false)
		const map = buildNationBordersMap(world, 0, 0, "map", true)

		expect(globe).not.toBeNull()
		expect(globe?.visible).toBe(true)
		expect(map).not.toBeNull()
		expect(map?.visible).toBe(true)
		expect(buildNationBordersGlobe(world, "map", true, false)?.visible).toBe(
			false,
		)
		expect(buildNationBordersMap(world, 0, 0, "globe", true)?.visible).toBe(
			false,
		)
	})

	it("repeats flat-map nation borders onto both neighboring map copies", () => {
		const world = makeNationBorderWorld()
		const map = buildNationBordersMap(world, 0, 0, "map", true)
		const positions = Array.from(
			map?.geometry.getAttribute("position").array as ArrayLike<number>,
		)
		const expected = [
			0, 0, 0.003, 1, 0, 0.003, 0, 1, 0.003, 2, 0, 0.003, -4, 0, 0.003, -3, 0,
			0.003, -4, 1, 0.003, -2, 0, 0.003, 4, 0, 0.003, 5, 0, 0.003, 4, 1, 0.003,
			6, 0, 0.003,
		]

		expect(positions).toHaveLength(36)
		for (const [index, value] of positions.entries()) {
			expect(value).toBeCloseTo(expected[index]!, 6)
		}
	})
})

describe("buildMapThermalEquator", () => {
	it("splits seam-crossing curves instead of drawing across the full map width", () => {
		const line = buildMapThermalEquator(
			[
				[170, 0],
				[179, 2],
				[-179, 2],
				[-170, 0],
			],
			0,
			"map",
		)
		const positions = Array.from(
			line.geometry.getAttribute("position").array as ArrayLike<number>,
		)
		let longestSegment = 0
		for (let index = 0; index < positions.length; index += 6) {
			const dx = Math.abs(positions[index + 3] - positions[index])
			longestSegment = Math.max(longestSegment, dx)
		}
		expect(longestSegment).toBeLessThan(0.5)
		expect(line.visible).toBe(true)
	})
})

describe("buildGlobeHierarchyOverlay", () => {
	it("returns null when world has no nations", () => {
		const world = makeHierarchyWorld()
		;(world as unknown as Record<string, unknown>).nations = undefined
		expect(
			buildGlobeHierarchyOverlay(world, 0, "globe", makeMockCanvas(), true),
		).toBeNull()
	})

	it("returns a Group with children when valid data provided", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(
			world,
			0,
			"globe",
			makeMockCanvas(),
			true,
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
			true,
		)!
		expect(group.visible).toBe(true)
	})

	it("sets group visible=false when viewMode is map", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(
			world,
			0,
			"map",
			makeMockCanvas(),
			true,
		)!
		expect(group.visible).toBe(false)
	})

	it("includes Points for dots and LineSegments2 for edges", () => {
		const world = makeHierarchyWorld()
		const group = buildGlobeHierarchyOverlay(
			world,
			0,
			"globe",
			makeMockCanvas(),
			true,
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
