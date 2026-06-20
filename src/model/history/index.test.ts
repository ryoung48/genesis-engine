import { describe, expect, it } from "vitest"
import type { GenesisNationHierarchy, GenesisProvinces } from ".."
import type { SocietyEra } from "../society/eras"
import type { ProvincePopulation } from "../society/population"
import { initHistory } from "."
import { PROV } from "./fields"
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
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
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
	} as GenesisProvinces

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
	} as GenesisNationHierarchy

	const population: ProvincePopulation = {
		habitability: Float32Array.from([20, 16, 4]),
		population: Float32Array.from([200, 160, 40]),
		habitabilityScore: 40,
		totalPopulation: 400,
	}

	return { nations, provinces, population }
}

function createUrbanizationFixture(): {
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
	population: ProvincePopulation
} {
	const parent = [-1, 0, 0]
	const sovereign = buildSovereign(parent)
	const depth = buildDepth(parent)
	const { adjOffset, adjList } = buildAdjacency([[1, 2], [0], [0]])
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
	} as GenesisProvinces

	const nations = {
		assignment: sovereign.slice(),
		seeds: Int32Array.from(parent.map((_, index) => index)),
		count: parent.length,
		adjOffset: new Int32Array(parent.length + 1),
		adjList: new Int32Array(0),
		size: Int32Array.from([3, 1, 1]),
		colors: colors.slice(),
		parent: Int32Array.from(parent),
		depth,
		childOffset: new Int32Array(parent.length + 1),
		childList: new Int32Array(0),
		sovereign,
		gravity: Float32Array.from([200_000, 140_000, 100_000]),
	} as GenesisNationHierarchy

	const population: ProvincePopulation = {
		habitability: Float32Array.from([200_000, 140_000, 100_000]),
		population: Float32Array.from([1_200_000, 900_000, 700_000]),
		habitabilityScore: 440_000,
		totalPopulation: 2_800_000,
	}

	return { nations, provinces, population }
}

function initUrbanizationState(era: SocietyEra) {
	const { nations, provinces, population } = createUrbanizationFixture()
	return initHistory({
		nations,
		provinces,
		population,
		coastal: new Uint8Array(provinces.count),
		riverVisible: new Uint8Array(provinces.count),
		r_xyz: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
		cultures: { assignment: Int32Array.from([0, 0, 0]), count: 1 },
		era,
		seed: 7,
	})
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

	it("uses a lower information-era urbanization floor while remaining above late medieval", () => {
		const medieval = initUrbanizationState("lateMedieval")
		const industrial = initUrbanizationState("industrial")
		const information = initUrbanizationState("information")

		const medievalUrban = PROV.population.urban.get(medieval, 0)
		const industrialUrban = PROV.population.urban.get(industrial, 0)
		const informationUrban = PROV.population.urban.get(information, 0)

		expect(information.developmentCurrent[0]).toBeGreaterThan(
			medieval.developmentCurrent[0],
		)
		expect(medievalUrban).toBeCloseTo(22_166.6667)
		expect(industrialUrban).toBeCloseTo(46_260.8696)
		expect(informationUrban).toBeCloseTo(46_260.8696)
		expect(informationUrban).toBeGreaterThan(medievalUrban)
		expect(informationUrban).toBeCloseTo(industrialUrban)
		expect(informationUrban).toBeLessThan(60_000)
	})
})
