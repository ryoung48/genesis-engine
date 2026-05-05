import { describe, expect, it } from "vitest"
import type { OrogenNationHierarchy, OrogenProvinces } from "../.."
import type { WeightedValue } from "../../shared/rng"
import type { ProvincePopulation } from "../../society/population"
import { EVT } from "../event-heap"
import { createHistoryRng, type HistoryRng } from "../history-rng"
import {
	createHistoryState,
	getRelation,
	getRulerRelation,
	REL,
	setRelation,
} from "../state"
import { initDiplomacy, runDiplomacy } from "./diplomacy"

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

function createDiplomacyState(options?: {
	parent?: number[]
	habitability?: number[]
	cultures?: number[]
	coastal?: number[]
	neighbors?: number[][]
	r_xyz?: number[]
	desolate?: number[]
}): ReturnType<typeof createHistoryState> {
	const parent = options?.parent ?? [-1, -1, -1]
	const habitability = options?.habitability ?? [12, 8, 6]
	const cultures = options?.cultures ?? [0, 1, 2]
	const coastal = options?.coastal ?? new Array(parent.length).fill(0)
	const neighbors =
		options?.neighbors ??
		parent.map((_, index) => {
			if (index === 0) return [1]
			if (index === parent.length - 1) return [index - 1]
			return [index - 1, index + 1]
		})
	const provinceXyz =
		options?.r_xyz ??
		parent.flatMap((_, index) => [1 - index * 0.3, index * 0.2, 0])
	const desolate = options?.desolate ?? new Array(parent.length).fill(0)
	const { adjOffset, adjList } = buildAdjacency(neighbors)
	const sovereign = buildSovereign(parent)
	const depth = buildDepth(parent)
	const colors = new Float32Array(parent.length * 3)
	for (let p = 0; p < parent.length; p++) colors[p * 3] = 1

	const provinces = {
		regionProvince: Int32Array.from(parent.map((_, index) => index)),
		seeds: Int32Array.from(parent.map((_, index) => index)),
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
		seeds: Int32Array.from(parent.map((_, index) => index)),
		count: parent.length,
		adjOffset: new Int32Array(parent.length + 1),
		adjList: new Int32Array(0),
		size: Int32Array.from(
			parent.map(
				(_, province) => sovereign.filter((value) => value === province).length,
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
		population: Float32Array.from(habitability.map((value) => value * 10)),
		habitabilityScore: habitability.reduce((sum, value) => sum + value, 0),
		totalPopulation: habitability.reduce((sum, value) => sum + value * 10, 0),
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		Uint8Array.from(coastal),
		new Uint8Array(parent.length),
		Float32Array.from(provinceXyz),
		{ assignment: Int32Array.from(cultures) },
		10,
		createHistoryRng(11),
	)
}

function createStubRng(values: number[], uniformValue = 1): HistoryRng {
	let index = 0
	const nextRandom = () => {
		const value = values[Math.min(index, values.length - 1)]
		index++
		return value ?? 0.5
	}
	return {
		random: nextRandom,
		uniform: () => uniformValue,
		randint: () => 0,
		choice: <T>(items: T[]) => items[0],
		weightedChoice: <T>(items: readonly WeightedValue<T>[]) => items[0]?.v,
		shuffle: <T>(items: T[]) => items,
	}
}

describe("diplomacy events", () => {
	it("seeds startup relations and queues diplomacy events", () => {
		const state = createDiplomacyState({
			parent: [-1, 0, -1],
			habitability: [14, 4, 10],
			cultures: [0, 0, 0],
			coastal: [1, 1, 1],
			neighbors: [[1, 2], [0], [0]],
			r_xyz: [1, 0, 0, 0.98, 0.05, 0, 0.95, 0.08, 0],
		})

		initDiplomacy(state, createHistoryRng(7))

		expect(getRelation(state, 1, 0)).toBe(REL.OVERLORD)
		expect(getRelation(state, 0, 1)).toBe(REL.VASSAL)
		expect([REL.FRIENDLY, REL.ALLY]).toContain(getRelation(state, 0, 2))
		expect(state.heap.size).toBe(3)
		expect(state.heap.peekType()).toBe(EVT.DIPLOMACY)
	})

	it("skips desolate provinces when scheduling startup diplomacy", () => {
		const state = createDiplomacyState({
			desolate: [0, 0, 1],
			neighbors: [[1], [0], []],
		})

		initDiplomacy(state, createHistoryRng(5))

		expect(state.heap.size).toBe(2)
	})

	it("reschedules non-sovereign nations without running transitions", () => {
		const state = createDiplomacyState({ parent: [-1, 0, -1] })

		runDiplomacy(state, 1, createStubRng([0.5]))

		expect(state.heap.size).toBe(1)
		expect(state.heap.peekType()).toBe(EVT.DIPLOMACY)
	})

	it("drops stale non-neighbor relations back to neutral", () => {
		const state = createDiplomacyState({
			neighbors: [[1], [0, 2], [1]],
		})
		setRelation(state, 0, 2, REL.FRIENDLY)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 2)).toBe(REL.NEUTRAL)
	})

	it("retains non-neighbor hierarchy relations during cleanup", () => {
		const state = createDiplomacyState({
			neighbors: [[1], [0, 2], [1]],
		})
		setRelation(state, 2, 0, REL.PU_SENIOR)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 2)).toBe(REL.PU_SENIOR)
	})

	it("drops non-sovereign ad-hoc relations during cleanup", () => {
		const state = createDiplomacyState({
			parent: [-1, 0, -1],
			neighbors: [[1, 2], [0], [0]],
		})
		setRelation(state, 0, 1, REL.FRIENDLY)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 1)).toBe(REL.NEUTRAL)
	})

	it("decays impossible rivalries and preserves skipped relation types", () => {
		const state = createDiplomacyState({
			habitability: [20, 4, 8],
			neighbors: [[1, 2], [0], [0]],
		})
		setRelation(state, 0, 1, REL.RIVAL)
		setRelation(state, 0, 2, REL.WAR)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 1)).toBe(REL.SUSPICIOUS)
		expect(getRelation(state, 0, 2)).toBe(REL.WAR)
	})

	it("syncs dependent hostility and can break unstable vassalage", () => {
		const state = createDiplomacyState({
			habitability: [20, 4, 10],
			neighbors: [
				[1, 2],
				[0, 2],
				[0, 1],
			],
		})
		setRelation(state, 1, 0, REL.VASSAL)
		setRelation(state, 1, 2, REL.SUSPICIOUS)

		runDiplomacy(state, 0, createStubRng([0.99, 0.3]))

		expect(getRelation(state, 0, 2)).toBe(REL.SUSPICIOUS)
		expect(getRelation(state, 0, 1)).toBe(REL.SUSPICIOUS)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalage ended",
				data: { vassal: 0, overlord: 1 },
			}),
		)
	})

	it("skips syncing hierarchy-marked neighbors for dependent realms", () => {
		const state = createDiplomacyState({
			habitability: [4, 20, 20],
			neighbors: [
				[1, 2],
				[0, 2],
				[0, 1],
			],
		})
		setRelation(state, 1, 0, REL.VASSAL)
		setRelation(state, 2, 0, REL.VASSAL)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 1)).toBe(REL.VASSAL)
		expect(getRelation(state, 0, 2)).toBe(REL.VASSAL)
	})

	it("leaves low-threat dependent ties in place", () => {
		const state = createDiplomacyState({
			habitability: [4, 20, 8],
			neighbors: [[1], [0], []],
		})
		setRelation(state, 1, 0, REL.VASSAL)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 1)).toBe(REL.VASSAL)
		expect(state.events).toHaveLength(0)
	})

	it("can break personal unions when the junior becomes threatening", () => {
		const state = createDiplomacyState({
			habitability: [20, 4],
			cultures: [0, 1],
			neighbors: [[1], [0]],
			r_xyz: [1, 0, 0, 0.9, 0.1, 0],
		})
		setRelation(state, 1, 0, REL.PU_JUNIOR)

		runDiplomacy(state, 0, createStubRng([0.99]))

		expect(getRelation(state, 0, 1)).toBe(REL.SUSPICIOUS)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union ended",
				data: { junior: 0, senior: 1 },
			}),
		)
	})

	it("can launch counter-wars after unstable dependent ties collapse", () => {
		const vassalState = createDiplomacyState({
			habitability: [20, 4],
			neighbors: [[1], [0]],
		})
		setRelation(vassalState, 1, 0, REL.VASSAL)

		runDiplomacy(vassalState, 0, createStubRng([0.01]))

		expect(getRelation(vassalState, 0, 1)).toBe(REL.WAR)
		expect(vassalState.events).toContainEqual(
			expect.objectContaining({ tag: "war started" }),
		)

		const unionState = createDiplomacyState({
			habitability: [20, 4],
			neighbors: [[1], [0]],
		})
		setRelation(unionState, 1, 0, REL.PU_JUNIOR)

		runDiplomacy(unionState, 0, createStubRng([0.01]))

		expect(getRelation(unionState, 0, 1)).toBe(REL.WAR)
		expect(unionState.events).toContainEqual(
			expect.objectContaining({ tag: "war started" }),
		)
	})

	it("leaves stable personal unions untouched", () => {
		const state = createDiplomacyState({
			habitability: [4, 20],
			cultures: [0, 1],
			neighbors: [[1], [0]],
			r_xyz: [1, 0, 0, 0.9, 0.1, 0],
		})
		setRelation(state, 1, 0, REL.PU_JUNIOR)

		runDiplomacy(state, 0, createStubRng([0.5]))

		expect(getRelation(state, 0, 1)).toBe(REL.PU_JUNIOR)
		expect(state.events).toHaveLength(0)
	})

	it("vassalizes weaker neighbors on an alliance upgrade when they lack another ruler", () => {
		const state = createDiplomacyState({
			habitability: [20, 4],
			cultures: [0, 0],
			coastal: [1, 1],
			neighbors: [[1], [0]],
			r_xyz: [1, 0, 0, 0.97, 0.03, 0],
		})
		setRelation(state, 0, 1, REL.FRIENDLY)

		runDiplomacy(state, 0, createStubRng([0.99]))

		expect(getRelation(state, 0, 1)).toBe(REL.VASSAL)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalized",
				data: { vassal: 1, overlord: 0 },
			}),
		)
	})

	it("can make the acting nation a vassal on an alliance upgrade", () => {
		const state = createDiplomacyState({
			habitability: [4, 20],
			cultures: [0, 0],
			coastal: [1, 1],
			neighbors: [[1], [0]],
			r_xyz: [1, 0, 0, 0.97, 0.03, 0],
		})
		setRelation(state, 0, 1, REL.FRIENDLY)

		runDiplomacy(state, 0, createStubRng([0.99]))

		expect(getRelation(state, 0, 1)).toBe(REL.OVERLORD)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalized",
				data: { vassal: 0, overlord: 1 },
			}),
		)
	})

	it("keeps alliance upgrades diplomatic when the target already has a ruler", () => {
		const state = createDiplomacyState({
			parent: [-1, -1, -1],
			habitability: [20, 4, 12],
			cultures: [0, 0, 1],
			neighbors: [[1], [0, 2], [1]],
		})
		setRelation(state, 0, 1, REL.FRIENDLY)
		setRelation(state, 2, 1, REL.PU_SENIOR)

		runDiplomacy(state, 0, createStubRng([0.99]))

		expect(getRulerRelation(state, 1)).toEqual({
			relation: REL.PU_SENIOR,
			ruler: 2,
		})
		expect(getRelation(state, 0, 1)).toBe(REL.ALLY)
		expect(state.events).not.toContainEqual(
			expect.objectContaining({ tag: "vassalized" }),
		)
	})

	it("skips standard transitions for overlords and senior-union rulers", () => {
		const state = createDiplomacyState({
			habitability: [10, 10, 10],
			neighbors: [[1, 2], [0], [0]],
		})
		setRelation(state, 0, 1, REL.VASSAL)
		setRelation(state, 2, 0, REL.PU_SENIOR)

		runDiplomacy(state, 0, createStubRng([0.8]))

		expect(getRelation(state, 0, 1)).toBe(REL.OVERLORD)
		expect(getRelation(state, 0, 2)).toBe(REL.PU_SENIOR)
	})

	it("gates impossible rival transitions and applies ordinary ladder moves", () => {
		const unequal = createDiplomacyState({
			habitability: [20, 4],
			neighbors: [[1], [0]],
		})
		runDiplomacy(unequal, 0, createStubRng([0.01]))
		expect(getRelation(unequal, 0, 1)).toBe(REL.SUSPICIOUS)

		const balanced = createDiplomacyState({
			habitability: [10, 10],
			cultures: [0, 0],
			neighbors: [[1], [0]],
			coastal: [1, 1],
			r_xyz: [1, 0, 0, 0.96, 0.04, 0],
		})
		runDiplomacy(balanced, 0, createStubRng([0.8]))
		expect(getRelation(balanced, 0, 1)).toBe(REL.FRIENDLY)
	})

	it("preserves unchanged rolls, avoids forced vassalization, and allows valid rivals", () => {
		const stable = createDiplomacyState({
			habitability: [10, 10],
			neighbors: [[1], [0]],
		})
		setRelation(stable, 0, 1, REL.FRIENDLY)
		runDiplomacy(stable, 0, createStubRng([0.5]))
		expect(getRelation(stable, 0, 1)).toBe(REL.FRIENDLY)

		const allied = createDiplomacyState({
			habitability: [12, 10],
			cultures: [0, 0],
			coastal: [1, 1],
			neighbors: [[1], [0]],
			r_xyz: [1, 0, 0, 0.97, 0.03, 0],
		})
		setRelation(allied, 0, 1, REL.FRIENDLY)
		runDiplomacy(allied, 0, createStubRng([0.99]))
		expect(getRelation(allied, 0, 1)).toBe(REL.ALLY)
		expect(allied.events).not.toContainEqual(
			expect.objectContaining({ tag: "vassalized" }),
		)

		const rivals = createDiplomacyState({
			habitability: [12, 11],
			neighbors: [[1], [0]],
		})
		runDiplomacy(rivals, 0, createStubRng([0.01]))
		expect(getRelation(rivals, 0, 1)).toBe(REL.RIVAL)
	})

	it("keeps impossible rival rolls suspicious when they are already suspicious", () => {
		const state = createDiplomacyState({
			habitability: [20, 4],
			neighbors: [[1], [0]],
		})
		setRelation(state, 0, 1, REL.SUSPICIOUS)

		runDiplomacy(state, 0, createStubRng([0.01]))

		expect(getRelation(state, 0, 1)).toBe(REL.SUSPICIOUS)
	})
})
