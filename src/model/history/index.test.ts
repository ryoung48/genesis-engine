import { describe, expect, it } from "vitest"
import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import type { ProvincePopulation } from "../society/population"
import { initHistory } from "."
import { getRelation, REL } from "./state"

function buildAdjacency(neighbors: number[][]): {
	adjOffset: Int32Array
	adjList: Int32Array
} {
	const adjOffset = new Int32Array(neighbors.length + 1)
	let total = 0
	for (let i = 0; i < neighbors.length; i++) {
		total += neighbors[i]?.length ?? 0
		adjOffset[i + 1] = total
	}
	const adjList = new Int32Array(total)
	let cursor = 0
	for (const list of neighbors) {
		for (const neighbor of list) adjList[cursor++] = neighbor
	}
	return { adjOffset, adjList }
}

function buildDepth(parent: readonly number[]): Int32Array {
	const depth = new Int32Array(parent.length)
	for (let p = 0; p < parent.length; p++) {
		let current = parent[p]
		while (current >= 0) {
			depth[p]++
			current = parent[current] ?? -1
		}
	}
	return depth
}

function buildSovereign(parent: readonly number[]): Int32Array {
	const sovereign = new Int32Array(parent.length)
	for (let p = 0; p < parent.length; p++) {
		let root = p
		while ((parent[root] ?? -1) >= 0) root = parent[root]!
		sovereign[p] = root
	}
	return sovereign
}

function createInitHistoryFixture(): {
	nations: OrogenNationHierarchy
	provinces: OrogenProvinces
	population: ProvincePopulation
} {
	const parent = [-1, -1, -1]
	const sovereign = buildSovereign(parent)
	const depth = buildDepth(parent)
	const { adjOffset, adjList } = buildAdjacency([[2], [], [0]])
	const colors = new Float32Array(parent.length * 3).fill(1)

	const provinces = {
		regionProvince: Int32Array.from(parent.map((_, index) => index)),
		seeds: Int32Array.from(parent.map((_, index) => index)),
		count: parent.length,
		desolate: new Uint8Array(parent.length),
		landmassId: new Int32Array(parent.length),
		adjOffset,
		adjList,
		size: new Int32Array(parent.length).fill(1),
		colors,
	} as OrogenProvinces

	const nations = {
		assignment: sovereign.slice(),
		seeds: Int32Array.from(parent.map((_, index) => index)),
		count: parent.length,
		adjOffset: new Int32Array(parent.length + 1),
		adjList: new Int32Array(0),
		size: new Int32Array(parent.length).fill(1),
		colors: colors.slice(),
		parent: Int32Array.from(parent),
		depth,
		childOffset: new Int32Array(parent.length + 1),
		childList: new Int32Array(0),
		sovereign,
		gravity: Float32Array.from([20, 16, 4]),
		nationColonizer: Int32Array.from([1, -1, -1]),
	} as OrogenNationHierarchy

	const population: ProvincePopulation = {
		habitability: Float32Array.from([20, 16, 4]),
		population: Float32Array.from([200, 160, 40]),
		habitabilityScore: 40,
		totalPopulation: 400,
	}

	return { nations, provinces, population }
}

describe("history init", () => {
	it("seeds colony relations before diplomacy can assign subjects", () => {
		const { nations, provinces, population } = createInitHistoryFixture()

		const state = initHistory({
			nations,
			provinces,
			population,
			coastal: new Uint8Array(provinces.count),
			riverVisible: new Uint8Array(provinces.count),
			r_xyz: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
			cultures: { assignment: Int32Array.from([0, 0, 0]), count: 1 },
			seed: 4,
		})

		expect(getRelation(state, 0, 1)).toBe(REL.OVERLORD)
		expect(getRelation(state, 2, 0)).not.toBe(REL.OVERLORD)
		expect(getRelation(state, 0, 2)).not.toBe(REL.VASSAL)
	})
})
