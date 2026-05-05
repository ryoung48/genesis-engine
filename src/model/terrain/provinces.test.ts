import { describe, expect, it } from "vitest"
import type { OrogenRainfall, SphereMesh } from ".."
import { computeProvinces } from "./provinces"

function makeMesh(adjOffset: number[], adjList: number[]): SphereMesh {
	const numRegions = adjOffset.length - 1
	const r_xyz = new Float32Array(numRegions * 3)
	for (let i = 0; i < numRegions; i++) r_xyz[3 * i] = i * 0.01
	const neighborDist = new Float32Array(adjList.length)
	for (let i = 0; i < adjList.length; i++) neighborDist[i] = 0.01
	return {
		numRegions,
		numTriangles: 0,
		numSides: 0,
		r_xyz,
		t_xyz: new Float32Array(0),
		triangles: new Int32Array(0),
		halfedges: new Int32Array(0),
		adjOffset: new Int32Array(adjOffset),
		adjList: new Int32Array(adjList),
		neighborDist,
		s_begin_r: new Int32Array(0),
		s_end_r: new Int32Array(0),
		s_inner_t: new Int32Array(0),
		s_outer_t: new Int32Array(0),
	}
}

function makeGraphMesh(
	numRegions: number,
	edges: Array<[number, number]>,
): SphereMesh {
	const neighbors = Array.from({ length: numRegions }, () => [] as number[])
	for (const [a, b] of edges) {
		neighbors[a].push(b)
		neighbors[b].push(a)
	}

	const adjOffset = new Int32Array(numRegions + 1)
	let total = 0
	for (let i = 0; i < numRegions; i++) {
		total += neighbors[i].length
		adjOffset[i + 1] = total
	}

	const adjList = new Int32Array(total)
	let index = 0
	for (const list of neighbors) {
		for (const neighbor of list) adjList[index++] = neighbor
	}

	return makeMesh(Array.from(adjOffset), Array.from(adjList))
}

function chainEdges(start: number, end: number): Array<[number, number]> {
	const edges: Array<[number, number]> = []
	for (let i = start; i < end; i++) edges.push([i, i + 1])
	return edges
}

describe("computeProvinces", () => {
	it("returns the empty province structure when there is no land", () => {
		const mesh = makeGraphMesh(3, [
			[0, 1],
			[1, 2],
		])
		const provinces = computeProvinces(
			mesh,
			new Uint8Array(3),
			new Uint8Array(3),
			1,
		)

		expect(provinces.count).toBe(0)
		expect(Array.from(provinces.regionProvince)).toEqual([-1, -1, -1])
		expect(provinces.adjOffset).toEqual(new Int32Array([0]))
	})

	it("partitions land without explicit target controls", () => {
		const mesh = makeGraphMesh(12, chainEdges(0, 10))
		const provinces = computeProvinces(
			mesh,
			new Uint8Array(12).fill(1),
			new Uint8Array(12),
			7,
			{ planetRadiusKm: 6371 },
		)

		expect(provinces.count).toBeGreaterThan(0)
		expect(provinces.count).toBeLessThan(12)
		expect(Array.from(provinces.regionProvince)).toSatisfy((assignment) =>
			assignment.every((province: number) => province >= 0),
		)
	})

	it("still honors climate and rainfall options for desolation", () => {
		const mesh = makeGraphMesh(4, chainEdges(0, 2))
		const rainfall = {
			annual: new Float32Array([4, 10, 10, 10]),
		} as OrogenRainfall
		const provinces = computeProvinces(
			mesh,
			new Uint8Array(4).fill(1),
			new Uint8Array(4),
			3,
			{
				climateZones: new Uint8Array([0, 0, 0, 0]),
				rainfall,
				planetRadiusKm: 6371,
			},
		)

		expect(provinces.desolate.some((value) => value === 1)).toBe(true)
	})

	it("links provinces across ocean gaps", () => {
		const mesh = makeGraphMesh(5, chainEdges(0, 4))
		const provinces = computeProvinces(
			mesh,
			new Uint8Array([1, 0, 0, 0, 1]),
			new Uint8Array(5),
			5,
			{ planetRadiusKm: 6371 },
		)

		expect(provinces.count).toBe(2)
		expect(Array.from(provinces.adjOffset)).toEqual([0, 1, 2])
		expect(Array.from(provinces.adjList)).toEqual([1, 0])
	})

	it("marks tiny isolated landmasses as desolate and still assigns colors", () => {
		const mesh = makeGraphMesh(220, [...chainEdges(0, 217)])
		const isLand = new Uint8Array(220)
		isLand.fill(1, 0, 219)
		isLand[219] = 1

		const provinces = computeProvinces(mesh, isLand, new Uint8Array(220), 11, {
			planetRadiusKm: 6371,
		})

		expect(provinces.count).toBeGreaterThan(6)
		expect(provinces.desolate.some((value) => value === 1)).toBe(true)
		expect(provinces.landmassId.some((value) => value >= 0)).toBe(true)
		expect(Array.from(provinces.colors)).toSatisfy((colors) =>
			colors.every((value: number) => Number.isFinite(value) && value >= 0),
		)
	})
})
