import * as THREE from "three"
import { describe, expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import {
	applyFaceRegionColors,
	applyMapColorModeColors,
	applyTerrainColorModeColors,
	buildMapMesh,
	buildMapOccupationOverlay,
	buildMapWireframe,
	buildTerrainMesh,
	buildTerrainWireframe,
	usesSmoothedHeightmapColors,
} from "./mesh-builders"

describe("mesh-builders", () => {
	it("only smooths the grayscale heightmap mode", () => {
		expect(usesSmoothedHeightmapColors("landHeightmap")).toBe(true)
		expect(usesSmoothedHeightmapColors("terrain")).toBe(false)
	})

	it("builds terrain meshes from flat region colors", () => {
		const world = buildWorld()
		const regionColors = new Float32Array([
			0.1, 0.2, 0.3, 0.7, 0.6, 0.5, 0.2, 0.4, 0.6, 0.9, 0.8, 0.7,
		])

		const { mesh, faceToRegion } = buildTerrainMesh(
			world,
			"terrain",
			regionColors,
			true,
		)

		expect(faceToRegion).toEqual(new Int32Array([0, 1, 2, 0, 2, 3]))
		const colorArray = getColorArray(mesh)
		expectArrayClose(
			Array.from(colorArray.subarray(0, 9)),
			[0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0.1, 0.2, 0.3],
		)
		expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial)
	})

	it("skips terrain faces whose outer triangle is missing", () => {
		const { faceToRegion } = buildTerrainMesh(
			buildSparseWorld(),
			"terrain",
			null,
			true,
		)

		expect(faceToRegion).toEqual(new Int32Array([0]))
	})

	it("recolors terrain meshes in place for grayscale mode", () => {
		const world = buildWorld()
		const regionColors = new Float32Array(world.mesh.numRegions * 3).fill(0.25)
		const { mesh, faceToRegion } = buildTerrainMesh(
			world,
			"terrain",
			regionColors,
			true,
		)

		const updated = applyTerrainColorModeColors(
			mesh,
			world,
			"landHeightmap",
			faceToRegion,
			null,
		)

		expect(updated).toBe(true)
		const colorArray = getColorArray(mesh)
		expect(colorArray[0]).not.toBeCloseTo(colorArray[3], 6)
		expect(colorArray[3]).not.toBeCloseTo(colorArray[6], 6)
	})

	it("builds terrain meshes directly from smoothed grayscale colors", () => {
		const { mesh } = buildTerrainMesh(buildWorld(), "landHeightmap", null, true)

		const colorArray = getColorArray(mesh)
		expect(colorArray[0]).not.toBeCloseTo(colorArray[3], 6)
		expect(colorArray[3]).not.toBeCloseTo(colorArray[6], 6)
	})

	it("configures terrain shader overlays during material compilation", () => {
		const { mesh } = buildTerrainMesh(buildWorld(), "terrain", null, true)
		const material = mesh.material as THREE.MeshLambertMaterial
		const shader = {
			vertexShader: "#include <beginnormal_vertex>\nvoid main() {",
			fragmentShader: "void main() {\n#include <color_fragment>",
		}

		material.onBeforeCompile?.(shader as never, {} as never)

		expect(shader.vertexShader).toContain("attribute vec3 occColor;")
		expect(shader.vertexShader).toContain("vWorldPos = position;")
		expect(shader.fragmentShader).toContain("varying vec3 vOccColor;")
		expect(shader.fragmentShader).toContain("diffuseColor.rgb = vOccColor;")
	})

	it("builds a terrain wireframe for unique edges in globe view", () => {
		const world = buildWorld()

		const wireframe = buildTerrainWireframe(world, true, "globe", true)

		expect(wireframe.visible).toBe(true)
		const position = wireframe.geometry.getAttribute("position")
		expect(position).toBeInstanceOf(THREE.BufferAttribute)
		expect((position as THREE.BufferAttribute).count).toBe(8)
	})

	it("hides terrain wireframes outside globe view", () => {
		const wireframe = buildTerrainWireframe(buildWorld(), true, "map", true)

		expect(wireframe.visible).toBe(false)
	})

	it("skips terrain wireframe edges with missing triangle endpoints", () => {
		const wireframe = buildTerrainWireframe(
			buildInvalidWireframeWorld(),
			true,
			"globe",
			true,
		)
		const position = wireframe.geometry.getAttribute(
			"position",
		) as THREE.BufferAttribute

		expect(position.count).toBe(0)
	})

	it("builds map meshes with repeated clones and region face colors", () => {
		const world = buildWorld()
		const regionColors = new Float32Array([
			0.1, 0.2, 0.3, 0.7, 0.6, 0.5, 0.2, 0.4, 0.6, 0.9, 0.8, 0.7,
		])

		const { mesh, faceToRegion } = buildMapMesh(
			world,
			"terrain",
			regionColors,
			0,
			0,
		)

		expect(faceToRegion).toEqual(new Int32Array([0, 1, 2, 0, 2, 3]))
		expect(mesh.children).toHaveLength(2)
		expect(mesh.userData.builtCenterLonDeg).toBe(0)
		const colorArray = getColorArray(mesh)
		expectArrayClose(
			Array.from(colorArray.subarray(0, 9)),
			[0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0.1, 0.2, 0.3],
		)
	})

	it("recolors map meshes in place for grayscale mode", () => {
		const world = buildWorld()
		const regionColors = new Float32Array(world.mesh.numRegions * 3).fill(0.25)
		const { mesh, faceToRegion } = buildMapMesh(
			world,
			"terrain",
			regionColors,
			0,
			0,
		)

		const updated = applyMapColorModeColors(
			mesh,
			world,
			"landHeightmap",
			faceToRegion,
			0,
			0,
			null,
		)

		expect(updated).toBe(true)
		const colorArray = getColorArray(mesh)
		expect(colorArray[0]).not.toBeCloseTo(colorArray[3], 6)
		expect(colorArray[3]).not.toBeCloseTo(colorArray[6], 6)
	})

	it("builds map meshes directly from smoothed grayscale colors", () => {
		const { mesh, faceToRegion } = buildMapMesh(
			buildWorld(),
			"landHeightmap",
			null,
			0,
			0,
		)

		expect(faceToRegion).toEqual(new Int32Array([0, 1, 2, 0, 2, 3]))
		const colorArray = getColorArray(mesh)
		expect(colorArray[0]).not.toBeCloseTo(colorArray[3], 6)
		expect(colorArray[3]).not.toBeCloseTo(colorArray[6], 6)
	})

	it("duplicates wrapped map triangles across the seam", () => {
		const world = buildWrappedWorld()

		const { mesh, faceToRegion } = buildMapMesh(world, "terrain", null, 0, 0)

		expect(faceToRegion).toEqual(new Int32Array([0, 0]))
		const position = mesh.geometry.getAttribute("position")
		expect(position).toBeInstanceOf(THREE.BufferAttribute)
		expect((position as THREE.BufferAttribute).count).toBe(6)
	})

	it("wraps map triangles when the first and region longitudes are negative", () => {
		const { mesh, faceToRegion } = buildMapMesh(
			buildWrappedWorldNegativeStart(),
			"terrain",
			null,
			0,
			0,
		)

		expect(faceToRegion).toEqual(new Int32Array([0, 0]))
		expect(
			(mesh.geometry.getAttribute("position") as THREE.BufferAttribute).count,
		).toBe(6)
	})

	it("builds occupation overlays and returns null for invalid inputs", () => {
		const world = buildWorld()
		const { mesh, faceToRegion } = buildMapMesh(world, "terrain", null, 0, 0)
		const overlay = buildOccupationOverlay(world.mesh.numRegions, 2)

		expect(
			buildMapOccupationOverlay(null, overlay, faceToRegion, 0, 0),
		).toBeNull()
		expect(buildMapOccupationOverlay(mesh, null, faceToRegion, 0, 0)).toBeNull()
		expect(
			buildMapOccupationOverlay(
				new THREE.Mesh(
					new THREE.BufferGeometry(),
					new THREE.MeshBasicMaterial(),
				),
				overlay,
				faceToRegion,
				0,
				0,
			),
		).toBeNull()

		const overlayMesh = buildMapOccupationOverlay(
			mesh,
			overlay,
			faceToRegion,
			0,
			0,
		)

		expect(overlayMesh).not.toBeNull()
		expect(overlayMesh?.renderOrder).toBe(1000)
		expect(overlayMesh?.children).toHaveLength(2)
		expect(overlayMesh?.userData.builtCenterLonDeg).toBe(0)
		const overlayMask = overlayMesh?.geometry.getAttribute("overlayMask")
		expect(overlayMask).toBeInstanceOf(THREE.BufferAttribute)
		expect(
			Array.from(
				(overlayMask as THREE.BufferAttribute).array as Float32Array,
			).some((value) => value === 1),
		).toBe(true)
		const overlayMaterial = overlayMesh?.material
		expect(overlayMaterial).toBeInstanceOf(THREE.ShaderMaterial)
		expect((overlayMaterial as THREE.ShaderMaterial).fragmentShader).toContain(
			"gl_FragColor = vec4(vOverlayColor, 0.9);",
		)
		expect((overlayMaterial as THREE.ShaderMaterial).fragmentShader).toContain(
			"if (stripe <= 0.25 || stripe >= 0.75) discard;",
		)
	})

	it("builds wrapped map wireframes in map view", () => {
		const wireframe = buildMapWireframe(buildWrappedWorld(), 0, 0, true, "map")

		expect(wireframe.visible).toBe(true)
		const position = wireframe.geometry.getAttribute("position")
		expect(position).toBeInstanceOf(THREE.BufferAttribute)
		expect((position as THREE.BufferAttribute).count).toBe(4)
	})

	it("builds non-wrapped map wireframes and hides them outside map view", () => {
		const visibleWireframe = buildMapWireframe(buildWorld(), 0, 0, true, "map")
		const hiddenWireframe = buildMapWireframe(buildWorld(), 0, 0, true, "globe")

		expect(
			(
				visibleWireframe.geometry.getAttribute(
					"position",
				) as THREE.BufferAttribute
			).count,
		).toBe(8)
		expect(hiddenWireframe.visible).toBe(false)
	})

	it("wraps map wireframes when the first longitude is smaller than the second", () => {
		const wireframe = buildMapWireframe(
			buildWrappedWorldNegativeStart(),
			0,
			0,
			true,
			"map",
		)

		expect(
			(wireframe.geometry.getAttribute("position") as THREE.BufferAttribute)
				.count,
		).toBe(4)
	})

	it("applies face region colors and occupation overlays in place", () => {
		const world = buildWorld()
		const { mesh, faceToRegion } = buildTerrainMesh(
			world,
			"terrain",
			null,
			true,
		)
		const regionColors = new Float32Array([
			0.1, 0.2, 0.3, 0.7, 0.6, 0.5, 0.2, 0.4, 0.6, 0.9, 0.8, 0.7,
		])
		const overlay = buildOccupationOverlay(world.mesh.numRegions, 1)

		expect(
			applyFaceRegionColors(null, faceToRegion, regionColors, overlay),
		).toBe(false)
		expect(applyFaceRegionColors(mesh, faceToRegion, null, overlay)).toBe(false)
		expect(
			applyFaceRegionColors(mesh, faceToRegion, regionColors, overlay),
		).toBe(true)

		const colorArray = getColorArray(mesh)
		expectArrayClose(
			Array.from(colorArray.subarray(9, 18)),
			[0.7, 0.6, 0.5, 0.7, 0.6, 0.5, 0.7, 0.6, 0.5],
		)
		expect(getMaskArray(mesh, "occMask").includes(1)).toBe(true)
		expect(getColorBuffer(mesh, "occColor").some((value) => value > 0)).toBe(
			true,
		)

		expect(applyFaceRegionColors(mesh, faceToRegion, regionColors, null)).toBe(
			true,
		)
		expect(getMaskArray(mesh, "occMask").every((value) => value === 0)).toBe(
			true,
		)
	})

	it("returns false when face recolors cannot use float color buffers", () => {
		const mesh = new THREE.Mesh(
			new THREE.BufferGeometry(),
			new THREE.MeshBasicMaterial(),
		)
		mesh.geometry.setAttribute(
			"color",
			new THREE.Int16BufferAttribute(new Int16Array(9), 3),
		)

		expect(
			applyFaceRegionColors(
				mesh,
				new Int32Array([0]),
				new Float32Array([1, 1, 1]),
				null,
			),
		).toBe(false)
	})

	it("returns false when recolor helpers cannot find a color attribute", () => {
		const mesh = new THREE.Mesh(
			new THREE.BufferGeometry(),
			new THREE.MeshBasicMaterial(),
		)
		const world = buildWorld()

		expect(
			applyFaceRegionColors(
				mesh,
				new Int32Array([0]),
				new Float32Array([1, 1, 1]),
				null,
			),
		).toBe(false)
		expect(
			applyTerrainColorModeColors(
				mesh,
				world,
				"terrain",
				new Int32Array([0]),
				null,
			),
		).toBe(false)
		expect(
			applyMapColorModeColors(
				mesh,
				world,
				"terrain",
				new Int32Array([0]),
				0,
				0,
				null,
			),
		).toBe(false)
	})

	it("returns false when in-place recolors cannot access usable color buffers", () => {
		const world = buildWorld()
		const invalidTerrainMesh = new THREE.Mesh(
			new THREE.BufferGeometry(),
			new THREE.MeshBasicMaterial(),
		)
		invalidTerrainMesh.geometry.setAttribute(
			"color",
			new THREE.Int16BufferAttribute(new Int16Array(9), 3),
		)
		const invalidMapMesh = new THREE.Mesh(
			new THREE.BufferGeometry(),
			new THREE.MeshBasicMaterial(),
		)
		invalidMapMesh.geometry.setAttribute(
			"color",
			new THREE.Int16BufferAttribute(new Int16Array(9), 3),
		)

		expect(
			applyTerrainColorModeColors(
				null,
				world,
				"terrain",
				new Int32Array(),
				null,
			),
		).toBe(false)
		expect(
			applyTerrainColorModeColors(
				invalidTerrainMesh,
				world,
				"terrain",
				new Int32Array([0]),
				null,
			),
		).toBe(false)
		expect(
			applyMapColorModeColors(
				null,
				world,
				"terrain",
				new Int32Array(),
				0,
				0,
				null,
			),
		).toBe(false)
		expect(
			applyMapColorModeColors(
				invalidMapMesh,
				world,
				"terrain",
				new Int32Array([0]),
				0,
				0,
				null,
			),
		).toBe(false)
	})

	it("skips occupation overlay writes when overlay attributes are missing", () => {
		const world = buildWorld()
		const { mesh, faceToRegion } = buildTerrainMesh(
			world,
			"terrain",
			null,
			true,
		)
		mesh.geometry.deleteAttribute("occColor")
		mesh.geometry.deleteAttribute("occMask")

		expect(
			applyFaceRegionColors(
				mesh,
				faceToRegion,
				new Float32Array([
					0.1, 0.2, 0.3, 0.7, 0.6, 0.5, 0.2, 0.4, 0.6, 0.9, 0.8, 0.7,
				]),
				buildOccupationOverlay(world.mesh.numRegions, 0),
			),
		).toBe(true)
	})

	it("skips missing outer triangles during in-place recolors", () => {
		const sparseWorld = buildSparseWorld()
		const terrainBuild = buildTerrainMesh(sparseWorld, "terrain", null, true)
		const mapBuild = buildMapMesh(sparseWorld, "terrain", null, 0, 0)

		expect(
			applyTerrainColorModeColors(
				terrainBuild.mesh,
				sparseWorld,
				"terrain",
				terrainBuild.faceToRegion,
				null,
			),
		).toBe(true)
		expect(
			applyMapColorModeColors(
				mapBuild.mesh,
				sparseWorld,
				"terrain",
				mapBuild.faceToRegion,
				0,
				0,
				null,
			),
		).toBe(true)
	})
})

function getColorArray(mesh: THREE.Mesh): Float32Array {
	const colorAttribute = mesh.geometry.getAttribute("color")
	expect(colorAttribute).toBeInstanceOf(THREE.BufferAttribute)
	return (colorAttribute as THREE.BufferAttribute).array as Float32Array
}

function getColorBuffer(mesh: THREE.Mesh, name: string): number[] {
	const attribute = mesh.geometry.getAttribute(name)
	expect(attribute).toBeInstanceOf(THREE.BufferAttribute)
	return Array.from((attribute as THREE.BufferAttribute).array as Float32Array)
}

function getMaskArray(mesh: THREE.Mesh, name: string): number[] {
	const attribute = mesh.geometry.getAttribute(name)
	expect(attribute).toBeInstanceOf(THREE.BufferAttribute)
	return Array.from((attribute as THREE.BufferAttribute).array as Float32Array)
}

function expectArrayClose(actual: number[], expected: number[]) {
	expect(actual).toHaveLength(expected.length)
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]).toBeCloseTo(expected[i], 6)
	}
}

function buildWorld(): SerializedGenesisWorld {
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
	} as unknown as SerializedGenesisWorld
}

function buildWrappedWorld(): SerializedGenesisWorld {
	return {
		mesh: {
			numRegions: 1,
			numTriangles: 2,
			numSides: 1,
			r_xyz: new Float32Array(cartesianFromLonLat(180, 0)),
			t_xyz: new Float32Array([
				...cartesianFromLonLat(179, 10),
				...cartesianFromLonLat(-179, -10),
			]),
			halfedges: new Int32Array([-1]),
			s_begin_r: new Int32Array([0, 0, 0, 0, 0, 0]),
			s_inner_t: new Int32Array([0]),
			s_outer_t: new Int32Array([1]),
		},
		elevation: new Float32Array([1]),
		elevation_km: new Float32Array([1]),
		isLand: new Uint8Array([1]),
	} as unknown as SerializedGenesisWorld
}

function buildWrappedWorldNegativeStart(): SerializedGenesisWorld {
	return {
		mesh: {
			numRegions: 1,
			numTriangles: 2,
			numSides: 1,
			r_xyz: new Float32Array(cartesianFromLonLat(-178, 0)),
			t_xyz: new Float32Array([
				...cartesianFromLonLat(-179, 10),
				...cartesianFromLonLat(179, -10),
			]),
			halfedges: new Int32Array([-1]),
			s_begin_r: new Int32Array([0, 0, 0, 0, 0, 0]),
			s_inner_t: new Int32Array([0]),
			s_outer_t: new Int32Array([1]),
		},
		elevation: new Float32Array([1]),
		elevation_km: new Float32Array([1]),
		isLand: new Uint8Array([1]),
	} as unknown as SerializedGenesisWorld
}

function buildSparseWorld(): SerializedGenesisWorld {
	return {
		mesh: {
			numRegions: 3,
			numTriangles: 2,
			numSides: 2,
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
			t_xyz: new Float32Array([0.6, 0.5, 0.6, -0.6, 0.5, 0.6]),
			halfedges: new Int32Array([-1, -1]),
			s_begin_r: new Int32Array([0, 1, 2, 0, 1, 2]),
			s_inner_t: new Int32Array([0, 1]),
			s_outer_t: new Int32Array([1, -1]),
		},
		elevation: new Float32Array([1, 2, 3]),
		elevation_km: new Float32Array([1, 2, 3]),
		isLand: new Uint8Array([1, 1, 1]),
	} as unknown as SerializedGenesisWorld
}

function buildInvalidWireframeWorld(): SerializedGenesisWorld {
	return {
		mesh: {
			numRegions: 2,
			numTriangles: 1,
			numSides: 1,
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0]),
			t_xyz: new Float32Array([0.6, 0.5, 0.6]),
			halfedges: new Int32Array([-1]),
			s_begin_r: new Int32Array([0, 1, 0]),
			s_inner_t: new Int32Array([-1]),
			s_outer_t: new Int32Array([0]),
		},
		elevation: new Float32Array([1, -1]),
		elevation_km: new Float32Array([1, -1]),
		isLand: new Uint8Array([1, 0]),
	} as unknown as SerializedGenesisWorld
}

function buildOccupationOverlay(
	regionCount: number,
	region: number,
): Float32Array {
	const overlay = new Float32Array(regionCount * 4)
	const base = region * 4
	overlay[base] = 0.9
	overlay[base + 1] = 0.4
	overlay[base + 2] = 0.2
	overlay[base + 3] = 1
	return overlay
}

function cartesianFromLonLat(
	lonDeg: number,
	latDeg: number,
): [number, number, number] {
	const lon = (lonDeg * Math.PI) / 180
	const lat = (latDeg * Math.PI) / 180
	const cosLat = Math.cos(lat)
	return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)]
}
