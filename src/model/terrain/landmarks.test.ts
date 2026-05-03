import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import { assignLandmarkIdentity, computeLandmarks } from "./landmarks"

function makeMesh(adjOffset: number[], adjList: number[]): SphereMesh {
	const numRegions = adjOffset.length - 1
	return {
		numRegions,
		numTriangles: 0,
		numSides: 0,
		r_xyz: new Float32Array(numRegions * 3),
		t_xyz: new Float32Array(0),
		triangles: new Int32Array(0),
		halfedges: new Int32Array(0),
		adjOffset: new Int32Array(adjOffset),
		adjList: new Int32Array(adjList),
		neighborDist: new Float32Array(adjList.length),
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

describe("computeLandmarks", () => {
	it("groups connected components and classifies continent, island, ocean, and sea", () => {
		const mesh = makeGraphMesh(200, [
			...chainEdges(0, 99),
			...chainEdges(101, 198),
		])
		const isLand = new Uint8Array(200)
		isLand.fill(1, 0, 101)

		const landmarks = computeLandmarks(mesh, isLand)

		expect(landmarks.count).toBe(4)
		expect(Array.from(landmarks.regionLandmark.slice(0, 102))).toEqual([
			...new Array(100).fill(0),
			1,
			...new Array(1).fill(2),
		])
		expect(Array.from(landmarks.type)).toEqual([0, 1, 3, 4])
		expect(Array.from(landmarks.size)).toEqual([100, 1, 98, 1])
	})

	it("classifies tiny disconnected components as isles and lakes", () => {
		const mesh = makeGraphMesh(2000, [
			...chainEdges(1, 999),
			...chainEdges(1001, 1999),
		])
		const isLand = new Uint8Array(2000)
		isLand[0] = 1
		isLand.fill(1, 1, 1000)

		const landmarks = computeLandmarks(mesh, isLand)

		expect(Array.from(landmarks.type)).toEqual([2, 0, 5, 3])
		expect(Array.from(landmarks.size)).toEqual([1, 999, 1, 999])
	})
})

describe("assignLandmarkIdentity", () => {
	it("uses the dominant culture inside a land landmark", () => {
		const mesh = makeMesh([0, 1, 3, 4], [1, 0, 2, 1])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 0, 1]),
				type: new Uint8Array([0, 4]),
				size: new Int32Array([2, 1]),
				count: 2,
			},
			provinces: {
				regionProvince: new Int32Array([1, 1, -1]),
			},
			cultures: {
				assignment: new Int32Array([7, 2]),
			},
			isLand: new Uint8Array([1, 1, 0]),
			seed: 9,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([2, 2]))
		expect(landmarks.nameSeeds).toHaveLength(2)
	})

	it("falls back to bordering cultures for water landmarks", () => {
		const mesh = makeMesh([0, 2, 3, 4, 4], [1, 2, 0, 0])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 1, 1, 2]),
				type: new Uint8Array([0, 4, 0]),
				size: new Int32Array([1, 2, 1]),
				count: 3,
			},
			provinces: {
				regionProvince: new Int32Array([4, -1, -1, -1]),
			},
			cultures: {
				assignment: new Int32Array([8, 8, 8, 8, 3]),
			},
			isLand: new Uint8Array([1, 0, 0, 0]),
			seed: 9,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([3, 3, -1]))
	})

	it("returns empty dominant cultures when no culture assignment exists", () => {
		const mesh = makeMesh([0, 1, 2], [1, 0])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 1]),
				type: new Uint8Array([0, 5]),
				size: new Int32Array([1, 1]),
				count: 2,
			},
			isLand: new Uint8Array([1, 0]),
			seed: 17,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([-1, -1]))
		expect(Array.from(landmarks.nameSeeds ?? [])).toEqual(
			Array.from(
				assignLandmarkIdentity({
					mesh,
					landmarks: {
						regionLandmark: new Int32Array([0, 1]),
						type: new Uint8Array([0, 5]),
						size: new Int32Array([1, 1]),
						count: 2,
					},
					isLand: new Uint8Array([1, 0]),
					seed: 17,
				}).nameSeeds ?? [],
			),
		)
	})

	it("returns empty dominant cultures when province mapping is missing", () => {
		const mesh = makeMesh([0, 1, 2], [1, 0])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 1]),
				type: new Uint8Array([0, 5]),
				size: new Int32Array([1, 1]),
				count: 2,
			},
			cultures: {
				assignment: new Int32Array([3]),
			},
			isLand: new Uint8Array([1, 0]),
			seed: 23,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([-1, -1]))
	})

	it("breaks ties toward the lower culture id and ignores invalid regions", () => {
		const mesh = makeMesh([0, 1, 2, 2, 2], [1, 0])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 0, -1, 1]),
				type: new Uint8Array([0, 5]),
				size: new Int32Array([2, 1]),
				count: 2,
			},
			provinces: {
				regionProvince: new Int32Array([0, 1, 2, -1]),
			},
			cultures: {
				assignment: new Int32Array([5, 2, 9]),
			},
			isLand: new Uint8Array([1, 1, 1, 0]),
			seed: 21,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([2, -1]))
	})

	it("skips border counting when a water landmark already has internal counts or only water neighbors", () => {
		const mesh = makeMesh([0, 1, 3, 4], [1, 0, 2, 1])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 0, 1]),
				type: new Uint8Array([0, 4]),
				size: new Int32Array([2, 1]),
				count: 2,
			},
			provinces: {
				regionProvince: new Int32Array([0, -1, -1]),
			},
			cultures: {
				assignment: new Int32Array([7]),
			},
			isLand: new Uint8Array([1, 0, 0]),
			seed: 29,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([7, -1]))
	})

	it("ignores invalid province mappings while still counting valid land and border cultures", () => {
		const mesh = makeMesh([0, 2, 4, 6], [1, 2, 0, 2, 0, 1])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 0, 1]),
				type: new Uint8Array([0, 4]),
				size: new Int32Array([2, 1]),
				count: 2,
			},
			provinces: {
				regionProvince: new Int32Array([-1, 0, -1]),
			},
			cultures: {
				assignment: new Int32Array([4]),
			},
			isLand: new Uint8Array([1, 1, 0]),
			seed: 31,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([4, 4]))
	})

	it("treats missing regionProvince entries and out-of-range culture assignments as unassigned on land", () => {
		const mesh = makeMesh([0, 1, 2], [1, 0])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 0]),
				type: new Uint8Array([0]),
				size: new Int32Array([2]),
				count: 1,
			},
			provinces: {
				regionProvince: new Int32Array([2]),
			},
			cultures: {
				assignment: new Int32Array([5]),
			},
			isLand: new Uint8Array([1, 1]),
			seed: 37,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([-1]))
	})

	it("treats missing neighbor province entries and out-of-range culture assignments as unassigned on water borders", () => {
		const mesh = makeMesh([0, 2, 3, 4], [2, 2, 2, 0])
		const landmarks = assignLandmarkIdentity({
			mesh,
			landmarks: {
				regionLandmark: new Int32Array([0, 0, 1]),
				type: new Uint8Array([0, 4]),
				size: new Int32Array([2, 1]),
				count: 2,
			},
			provinces: {
				regionProvince: new Int32Array([2]),
			},
			cultures: {
				assignment: new Int32Array([5]),
			},
			isLand: new Uint8Array([1, 1, 0]),
			seed: 41,
		})

		expect(landmarks.dominantCulture).toEqual(new Int32Array([-1, -1]))
	})
})
