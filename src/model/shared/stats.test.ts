import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import {
	computeCoastDistances,
	computeOceanDistanceBFS,
	countContinents,
} from "./stats"

function buildLineMesh(numRegions: number): SphereMesh {
	const adjOffset = new Int32Array(numRegions + 1)
	const adjEntries: number[] = []
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r] = adjEntries.length
		if (r > 0) adjEntries.push(r - 1)
		if (r < numRegions - 1) adjEntries.push(r + 1)
	}
	adjOffset[numRegions] = adjEntries.length
	return {
		numRegions,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
	} as unknown as SphereMesh
}

describe("computeOceanDistanceBFS", () => {
	it("ocean cells stay at distance zero", () => {
		const mesh = buildLineMesh(5)
		// cells 0-1 = ocean, cells 2-4 = land
		const isLand = new Uint8Array([0, 0, 1, 1, 1])
		const result = computeOceanDistanceBFS(mesh, isLand, 10)
		expect(result[0]).toBe(0)
		expect(result[1]).toBe(0)
	})

	it("land cells get correct hop × avgEdgeKm distance", () => {
		const mesh = buildLineMesh(5)
		// cells 0-1 = ocean, cells 2-4 = land
		const isLand = new Uint8Array([0, 0, 1, 1, 1])
		const result = computeOceanDistanceBFS(mesh, isLand, 10)
		// cell 2 is 1 hop from cell 1 (ocean) → 10 km
		expect(result[2]).toBe(10)
		// cell 3 is 2 hops from ocean → 20 km
		expect(result[3]).toBe(20)
		// cell 4 is 3 hops from ocean → 30 km
		expect(result[4]).toBe(30)
	})

	it("all-ocean world returns all zeros", () => {
		const mesh = buildLineMesh(4)
		const isLand = new Uint8Array(4)
		const result = computeOceanDistanceBFS(mesh, isLand, 5)
		for (let r = 0; r < 4; r++) expect(result[r]).toBe(0)
	})

	it("all-land world with no ocean leaves land cells at zero", () => {
		const mesh = buildLineMesh(4)
		const isLand = new Uint8Array([1, 1, 1, 1])
		const result = computeOceanDistanceBFS(mesh, isLand, 5)
		// No ocean seed cells, so BFS never runs — all stay 0
		for (let r = 0; r < 4; r++) expect(result[r]).toBe(0)
	})
})

describe("computeCoastDistances", () => {
	it("coast cells get distCoast zero", () => {
		// 0=ocean, 1=land, 2=land — cell 1 is coast (adjacent to 0)
		const mesh = buildLineMesh(3)
		const isLand = new Uint8Array([0, 1, 1])
		const { distCoast } = computeCoastDistances(mesh, isLand)
		expect(distCoast[0]).toBe(0) // ocean coast cell
		expect(distCoast[1]).toBe(0) // land coast cell
	})

	it("interior land cell gets distCoast 1 hop from coast", () => {
		const mesh = buildLineMesh(4)
		const isLand = new Uint8Array([0, 1, 1, 1])
		const { distCoast } = computeCoastDistances(mesh, isLand)
		expect(distCoast[2]).toBe(1)
		expect(distCoast[3]).toBe(2)
	})

	it("distCoastLand is Infinity for ocean cells", () => {
		const mesh = buildLineMesh(4)
		const isLand = new Uint8Array([0, 0, 1, 1])
		const { distCoastLand } = computeCoastDistances(mesh, isLand)
		expect(distCoastLand[0]).toBe(Infinity)
		expect(distCoastLand[1]).toBe(Infinity)
	})

	it("distCoastLand measures hops from coast along land only", () => {
		const mesh = buildLineMesh(5)
		const isLand = new Uint8Array([0, 1, 1, 1, 1])
		const { distCoastLand } = computeCoastDistances(mesh, isLand)
		expect(distCoastLand[1]).toBe(0) // coast land cell
		expect(distCoastLand[2]).toBe(1)
		expect(distCoastLand[3]).toBe(2)
	})
})

describe("countContinents", () => {
	it("returnsZeroWhenNoLand", () => {
		const mesh = buildLineMesh(100)
		const isLand = new Uint8Array(100)
		expect(countContinents(mesh, isLand)).toBe(0)
	})

	it("returnsOneForSingleConnectedLandmass", () => {
		const mesh = buildLineMesh(100)
		const isLand = new Uint8Array(100)
		for (let r = 0; r < 50; r++) isLand[r] = 1
		expect(countContinents(mesh, isLand)).toBe(1)
	})

	it("countsTwoLandmassesWhenSeparatedByOcean", () => {
		const mesh = buildLineMesh(100)
		const isLand = new Uint8Array(100)
		for (let r = 0; r < 40; r++) isLand[r] = 1
		for (let r = 60; r < 100; r++) isLand[r] = 1
		expect(countContinents(mesh, isLand)).toBe(2)
	})

	it("ignoresLandmassesSmallerThanSizeThreshold", () => {
		const mesh = buildLineMesh(200)
		const isLand = new Uint8Array(200)
		for (let r = 0; r < 100; r++) isLand[r] = 1
		isLand[150] = 1
		expect(countContinents(mesh, isLand)).toBe(1)
	})
})
