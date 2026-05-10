import type { OrogenNationHierarchy, OrogenProvinces } from "../.."
import type { WeightedValue } from "../../shared/rng"
import type { ProvincePopulation } from "../../society/population"
import { createHistoryRng, type HistoryRng } from "../history-rng"
import { createHistoryState } from "../state"

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
		for (const nb of list) adjList[cursor++] = nb
	}
	return { adjOffset, adjList }
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

function buildDepth(parent: readonly number[]): Int32Array {
	const depth = new Int32Array(parent.length)
	for (let p = 0; p < parent.length; p++) {
		let current = parent[p]
		while (current !== undefined && current >= 0) {
			depth[p]++
			current = parent[current] ?? -1
		}
	}
	return depth
}

export function createHistoryTestState(options?: {
	parent?: number[]
	habitability?: number[]
	cultures?: number[]
	neighbors?: number[][]
	desolate?: number[]
}): ReturnType<typeof createHistoryState> {
	const parent = options?.parent ?? [-1, -1]
	const habitability = options?.habitability ?? parent.map(() => 10)
	const cultures = options?.cultures ?? parent.map((_, i) => i)
	const cultureCount =
		cultures.length > 0 ? Math.max(...cultures.filter((c) => c >= 0)) + 1 : 0
	const neighbors =
		options?.neighbors ??
		parent.map((_, index) => {
			if (index === 0) return [1]
			if (index === parent.length - 1) return [index - 1]
			return [index - 1, index + 1]
		})
	const desolate = options?.desolate ?? new Array(parent.length).fill(0)
	const { adjOffset, adjList } = buildAdjacency(neighbors)
	const sovereign = buildSovereign(parent)
	const depth = buildDepth(parent)
	const colors = new Float32Array(parent.length * 3)
	for (let p = 0; p < parent.length; p++) colors[p * 3] = 1

	const provinces = {
		regionProvince: Int32Array.from(parent.map((_, i) => i)),
		seeds: Int32Array.from(parent.map((_, i) => i)),
		count: parent.length,
		desolate: Uint8Array.from(desolate),
		landmassId: new Int32Array(parent.length),
		adjOffset,
		adjList,
		size: new Int32Array(parent.length).fill(1),
		colors,
	} as OrogenProvinces

	const nations = {
		assignment: sovereign.slice(),
		seeds: Int32Array.from(parent.map((_, i) => i)),
		count: parent.length,
		adjOffset: new Int32Array(parent.length + 1),
		adjList: new Int32Array(0),
		size: Int32Array.from(
			parent.map(
				(_, province) => sovereign.filter((v) => v === province).length,
			),
		),
		colors: colors.slice(),
		parent: Int32Array.from(parent),
		depth,
		childOffset: new Int32Array(parent.length + 1),
		childList: new Int32Array(0),
		sovereign,
		gravity: Float32Array.from(habitability),
	} as OrogenNationHierarchy

	const population: ProvincePopulation = {
		habitability: Float32Array.from(habitability),
		population: Float32Array.from(habitability.map((v) => v * 10)),
		habitabilityScore: habitability.reduce((s, v) => s + v, 0),
		totalPopulation: habitability.reduce((s, v) => s + v * 10, 0),
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		new Uint8Array(parent.length),
		Uint8Array.from(desolate),
		Float32Array.from(parent.flatMap((_, i) => [1 - i * 0.3, i * 0.2, 0])),
		{ assignment: Int32Array.from(cultures), count: cultureCount },
		10,
		createHistoryRng(11),
	)
}

export function createStubRng(
	values: number[] = [],
	uniformValue = 25,
): HistoryRng {
	let randomIndex = 0
	return {
		random: () => {
			const v = values[Math.min(randomIndex, values.length - 1)] ?? 0.5
			randomIndex++
			return v
		},
		uniform: () => uniformValue,
		randint: () => 0,
		choice: <T>(items: T[]) => items[0],
		weightedChoice: <T>(items: readonly WeightedValue<T>[]) => items[0]?.v,
		shuffle: <T>(items: T[]) => items,
	}
}
