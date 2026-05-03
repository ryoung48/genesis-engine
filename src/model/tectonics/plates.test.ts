import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import {
	assignOceanLand,
	generatePlates,
	smoothAndReconnectPlates,
} from "./plates"

function buildMesh(
	coordinates: Array<[number, number, number]>,
	adjacency: number[][],
): SphereMesh {
	const adjOffset = new Int32Array(adjacency.length + 1)
	const adjEntries: number[] = []
	for (let region = 0; region < adjacency.length; region++) {
		adjOffset[region] = adjEntries.length
		adjEntries.push(...adjacency[region]!)
	}
	adjOffset[adjacency.length] = adjEntries.length

	return {
		numRegions: adjacency.length,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: Float32Array.from(coordinates.flat()),
	} as SphereMesh
}

function buildLineMesh(numRegions: number): SphereMesh {
	const coords: Array<[number, number, number]> = []
	const adjacency: number[][] = []
	for (let index = 0; index < numRegions; index++) {
		const angle = (Math.PI * index) / Math.max(1, numRegions - 1)
		coords.push([Math.cos(angle), 0, Math.sin(angle)])
		adjacency.push(
			[index - 1, index + 1].filter(
				(candidate) => candidate >= 0 && candidate < numRegions,
			),
		)
	}
	return buildMesh(coords, adjacency)
}

function buildSparseAssignmentScenario() {
	return {
		mesh: buildMesh(
			[
				[1, 0, 0],
				[0.8, 0.2, 0],
				[0, 1, 0],
				[-0.6, 0.8, 0],
				[-1, 0, 0],
				[-0.8, -0.2, 0],
			],
			[[1], [0, 2], [1, 3], [2], [5], [4]],
		),
		r_plate: new Int32Array([0, 0, 2, 3, 4, 5]),
		plateSeeds: new Set([0, 2, 3, 4, 5]),
	}
}

describe("generatePlates", () => {
	it("handles degenerate seed coordinates when only one farthest candidate remains", () => {
		const mesh = buildMesh(
			[
				[0, 0, 0],
				[0, 0, 0],
			],
			[[1], [0]],
		)

		const result = generatePlates(mesh, 2, 3)

		expect(Array.from(result.plateSeeds).sort((a, b) => a - b)).toEqual([0, 1])
		expect(Array.from(result.r_plate).sort((a, b) => a - b)).toEqual([0, 1])
		expect(result.plateVec.size).toBe(2)
	})

	it("caps requested plates to the number of available regions", () => {
		const mesh = buildLineMesh(1)

		const result = generatePlates(mesh, 4, 12)

		expect(Array.from(result.r_plate)).toEqual([0])
		expect(Array.from(result.plateSeeds)).toEqual([0])
		expect(result.plateVec.get(0)).toEqual(
			expect.objectContaining({
				pole: expect.any(Array),
				omega: expect.any(Number),
			}),
		)
	})

	it("assigns every region to one of the discovered plate seeds", () => {
		const mesh = buildLineMesh(6)

		const result = generatePlates(mesh, 3, 7)
		const seedIds = new Set(result.plateSeeds)

		expect(result.plateSeeds.size).toBe(3)
		expect(
			Array.from(result.r_plate).every((plate) => seedIds.has(plate)),
		).toBe(true)
		expect(result.plateVec.size).toBe(result.plateSeeds.size)
	})

	it("uses every region as a seed when the requested count matches the mesh size", () => {
		const mesh = buildLineMesh(3)

		const result = generatePlates(mesh, 3, 4)

		expect(Array.from(result.plateSeeds).sort((a, b) => a - b)).toEqual([
			0, 1, 2,
		])
		expect(Array.from(result.r_plate)).toEqual([0, 1, 2])
		expect(result.plateVec.size).toBe(3)
	})

	it("claims orphaned regions during cleanup when frontier growth stalls", () => {
		const mesh = buildMesh(
			[
				[1, 0, 0],
				[0, 1, 0],
				[-1, 0, 0],
			],
			[[1], [0], [1]],
		)

		const result = generatePlates(mesh, 1, 9)

		expect(Array.from(result.r_plate)).toEqual([0, 0, 0])
		expect(Array.from(result.plateSeeds)).toEqual([0])
	})

	it("covers wide frontier growth without losing deterministic assignments", () => {
		const mesh = buildLineMesh(12)

		const result = generatePlates(mesh, 6, 71)
		const repeat = generatePlates(mesh, 6, 71)
		const counts = new Map<number, number>()
		const seedIds = new Set(result.plateSeeds)
		for (const plate of result.r_plate) {
			counts.set(plate, (counts.get(plate) ?? 0) + 1)
		}

		expect(Array.from(repeat.r_plate)).toEqual(Array.from(result.r_plate))
		expect(Array.from(repeat.plateSeeds)).toEqual(Array.from(result.plateSeeds))
		expect(result.plateSeeds.size).toBe(6)
		expect(
			Array.from(result.r_plate).every((plate) => seedIds.has(plate)),
		).toBe(true)
		expect(
			Array.from(counts.values()).filter((count) => count > 1).length,
		).toBeGreaterThanOrEqual(1)
	})

	it("maintains assignment invariants across varied seeds and plate counts", () => {
		const mesh = buildLineMesh(8)
		for (const numPlates of [2, 3, 4, 5]) {
			for (const seed of [1, 2, 3, 4, 5, 11, 17, 23, 29, 31]) {
				const result = generatePlates(mesh, numPlates, seed)
				const seedIds = new Set(result.plateSeeds)
				expect(result.plateSeeds.size).toBe(numPlates)
				expect(
					Array.from(result.r_plate).every((plate) => seedIds.has(plate)),
				).toBe(true)
				expect(result.plateVec.size).toBe(result.plateSeeds.size)
			}
		}
	})
})

describe("assignOceanLand", () => {
	it("returns an empty ocean set for an empty mesh with no seed plates", () => {
		expect(
			assignOceanLand(
				buildMesh([], []),
				new Int32Array(),
				new Set<number>(),
				5,
				0.5,
				0.5,
				0.4,
			),
		).toEqual(new Set<number>())
	})

	it("treats zero land coverage as a fully oceanic world", () => {
		const mesh = buildLineMesh(4)
		const r_plate = new Int32Array([0, 0, 2, 2])
		const plateSeeds = new Set([0, 2])

		expect(assignOceanLand(mesh, r_plate, plateSeeds, 5, 0.5, 0.5, 0)).toEqual(
			new Set([0, 2]),
		)
	})

	it("treats full land coverage as a world with no ocean plates", () => {
		const mesh = buildLineMesh(4)
		const r_plate = new Int32Array([0, 0, 2, 2])
		const plateSeeds = new Set([0, 2])

		expect(assignOceanLand(mesh, r_plate, plateSeeds, 5, 0.5, 0.5, 1)).toEqual(
			new Set<number>(),
		)
	})

	it("produces deterministic mixed land and ocean assignments", () => {
		const mesh = buildLineMesh(6)
		const r_plate = new Int32Array([0, 0, 0, 3, 3, 3])
		const plateSeeds = new Set([0, 3])

		const first = assignOceanLand(mesh, r_plate, plateSeeds, 9, 0.35, 0.8, 0.4)
		const second = assignOceanLand(mesh, r_plate, plateSeeds, 9, 0.35, 0.8, 0.4)

		expect(first).toEqual(second)
		expect(first.size).toBeGreaterThanOrEqual(0)
		expect(first.size).toBeLessThanOrEqual(plateSeeds.size)
	})

	it("absorbs enclosed inland seas when land is the sparse phase", () => {
		const { mesh, r_plate, plateSeeds } = buildSparseAssignmentScenario()

		expect(assignOceanLand(mesh, r_plate, plateSeeds, 9, 0, 0, 0.4)).toEqual(
			new Set([4, 5]),
		)
	})

	it("returns a mixed world when oceans are the sparse phase", () => {
		const { mesh, r_plate, plateSeeds } = buildSparseAssignmentScenario()

		expect(assignOceanLand(mesh, r_plate, plateSeeds, 9, 0, 0, 0.7)).toEqual(
			new Set([0]),
		)
	})

	it("ignores projected non-seed plate ids when classifying seed plates", () => {
		const mesh = buildLineMesh(4)
		const r_plate = new Int32Array([0, 99, 2, 99])
		const plateSeeds = new Set([0, 2])

		const plateIsOcean = assignOceanLand(
			mesh,
			r_plate,
			plateSeeds,
			13,
			0.6,
			0.4,
			0.5,
		)

		expect(Array.from(plateIsOcean).every((pid) => plateSeeds.has(pid))).toBe(
			true,
		)
		expect(plateIsOcean.has(99)).toBe(false)
	})

	it("handles zero-area seed plates without overflowing compactness scoring", () => {
		const mesh = buildLineMesh(3)
		const plateIsOcean = assignOceanLand(
			mesh,
			new Int32Array([0, 0, 0]),
			new Set([0, 2]),
			17,
			0.4,
			0.8,
			0.45,
		)

		expect(
			Array.from(plateIsOcean).every((pid) => pid === 0 || pid === 2),
		).toBe(true)
	})

	it("keeps ocean assignments bounded across sparse and dense parameter sweeps", () => {
		const { mesh, r_plate, plateSeeds } = buildSparseAssignmentScenario()
		for (const landCoverage of [0.2, 0.35, 0.5, 0.65, 0.8]) {
			for (const landDistribution of [0, 0.5, 1]) {
				for (const continentSizeVariety of [0, 1]) {
					for (const seed of [1, 7, 13]) {
						const plateIsOcean = assignOceanLand(
							mesh,
							r_plate,
							plateSeeds,
							seed,
							landDistribution,
							continentSizeVariety,
							landCoverage,
						)
						expect(
							Array.from(plateIsOcean).every((pid) => plateSeeds.has(pid)),
						).toBe(true)
						expect(plateIsOcean.size).toBeGreaterThanOrEqual(0)
						expect(plateIsOcean.size).toBeLessThanOrEqual(plateSeeds.size)
					}
				}
			}
		}
	})
})

describe("smoothAndReconnectPlates", () => {
	it("leaves plate boundaries unchanged when no neighbor has a majority", () => {
		const mesh = buildMesh(
			[
				[1, 0, 0],
				[0, 1, 0],
				[-1, 0, 0],
				[0, -1, 0],
			],
			[
				[1, 2, 3],
				[0, 2, 3],
				[0, 1, 3],
				[0, 1, 2],
			],
		)
		const r_plate = new Int32Array([0, 1, 2, 3])

		smoothAndReconnectPlates(mesh, r_plate, [0], 1)

		expect(Array.from(r_plate)).toEqual([0, 1, 2, 3])
	})

	it("reassigns non-seed regions when a neighboring plate has a clear majority", () => {
		const mesh = buildLineMesh(3)
		const r_plate = new Int32Array([0, 1, 0])

		smoothAndReconnectPlates(mesh, r_plate, [0], 1)

		expect(Array.from(r_plate)).toEqual([0, 0, 0])
	})

	it("preserves protected seed cells during smoothing", () => {
		const mesh = buildLineMesh(3)
		const r_plate = new Int32Array([0, 1, 0])

		smoothAndReconnectPlates(mesh, r_plate, [1], 1)

		expect(r_plate[1]).toBe(1)
	})

	it("only protects plate ids that still point to their own seed region", () => {
		const mesh = buildLineMesh(3)
		const r_plate = new Int32Array([1, 0, 0])

		smoothAndReconnectPlates(mesh, r_plate, [0], 1)

		expect(Array.from(r_plate)).toEqual([0, 0, 0])
	})

	it("reconnects disconnected plate fragments through neighboring main components", () => {
		const mesh = buildLineMesh(5)
		const r_plate = new Int32Array([0, 0, 1, 0, 0])

		smoothAndReconnectPlates(mesh, r_plate, [0, 2], 0)

		expect(Array.from(r_plate)).toEqual([0, 0, 1, 1, 1])
	})

	it("keeps seed cells on exact-threshold votes until a strict majority appears", () => {
		const mesh = buildMesh(
			[
				[1, 0, 0],
				[0, 1, 0],
				[-1, 0, 0],
				[0, -1, 0],
				[0, 0, 1],
			],
			[
				[1, 2, 3, 4],
				[0, 2],
				[0, 1],
				[0, 4],
				[0, 3],
			],
		)
		const r_plate = new Int32Array([0, 1, 1, 2, 2])

		smoothAndReconnectPlates(mesh, r_plate, [0, 1, 3], 1)

		expect(r_plate[0]).toBe(0)
	})

	it("reassigns chained orphan fragments after multi-pass smoothing", () => {
		const mesh = buildLineMesh(6)
		const r_plate = new Int32Array([0, 0, 1, 2, 2, 2])

		smoothAndReconnectPlates(mesh, r_plate, [0, 2, 3], 2)

		expect(Array.from(r_plate)).toEqual([0, 0, 0, 0, 0, 0])
	})

	it("propagates reconnection through orphan chains that start away from the main plate", () => {
		const mesh = buildLineMesh(6)
		const r_plate = new Int32Array([0, 0, 1, 1, 0, 0])

		smoothAndReconnectPlates(mesh, r_plate, [0, 2], 0)

		expect(Array.from(r_plate)).toEqual([0, 0, 1, 1, 1, 1])
	})

	it("reassigns earlier orphan links through the reconnect queue", () => {
		const mesh = buildLineMesh(6)
		const r_plate = new Int32Array([0, 0, 1, 0, 0, 0])

		smoothAndReconnectPlates(mesh, r_plate, [0, 2, 3], 0)

		expect(Array.from(r_plate)).toEqual([1, 1, 1, 0, 0, 0])
	})
})
