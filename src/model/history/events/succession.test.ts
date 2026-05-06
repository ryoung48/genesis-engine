import { describe, expect, it } from "vitest"
import type { OrogenNationHierarchy, OrogenProvinces } from "../.."
import type { WeightedValue } from "../../shared/rng"
import type { ProvincePopulation } from "../../society/population"
import { EVT } from "../event-heap"
import { PROV } from "../fields"
import { createHistoryRng, type HistoryRng } from "../history-rng"
import {
	createHistoryState,
	getRelation,
	isSovereign,
	REL,
	resolveWar,
	setRelation,
	spawnLeader,
	startWar,
} from "../state"
import { initSuccession, runSuccession } from "./succession"

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

function createSuccessionState(options?: {
	parent?: number[]
	habitability?: number[]
	cultures?: number[]
	neighbors?: number[][]
	desolate?: number[]
}): ReturnType<typeof createHistoryState> {
	const parent = options?.parent ?? [-1, -1]
	const habitability = options?.habitability ?? parent.map(() => 10)
	const cultures = options?.cultures ?? parent.map((_, i) => i)
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
		{ assignment: Int32Array.from(cultures) },
		10,
		createHistoryRng(11),
	)
}

function createStubRng(values: number[] = [], uniformValue = 25): HistoryRng {
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

describe("succession events", () => {
	describe("initSuccession", () => {
		it("only enqueues succession events for sovereign provinces", () => {
			// parent=[-1, 0, -1]: province 1 is a vassal of province 0
			const state = createSuccessionState({
				parent: [-1, 0, -1],
				neighbors: [[1, 2], [0], [0]],
				habitability: [14, 4, 10],
			})

			expect(isSovereign(state, 0)).toBe(true)
			expect(isSovereign(state, 1)).toBe(false)
			expect(isSovereign(state, 2)).toBe(true)

			initSuccession(state, createHistoryRng(7))

			// Only provinces 0 and 2 should have succession events
			expect(state.heap.size).toBe(2)
			const types: number[] = []
			while (state.heap.size > 0) {
				types.push(state.heap.peekType())
				state.heap.dequeue()
			}
			expect(types.every((t) => t === EVT.SUCCESSION)).toBe(true)
		})

		it("skips desolate provinces when scheduling succession", () => {
			const state = createSuccessionState({
				parent: [-1, -1, -1],
				desolate: [0, 1, 0],
				neighbors: [[1], [0, 2], [1]],
			})

			initSuccession(state, createHistoryRng(5))

			// Only provinces 0 and 2 should have succession events
			expect(state.heap.size).toBe(2)
		})
	})

	describe("runSuccession", () => {
		it("silently returns when the leader idx is stale", () => {
			const state = createSuccessionState({ parent: [-1] })
			const currentIdx = state.leaderRuntime.idx[0]
			const beforeEvents = state.events.length

			runSuccession(state, 0, currentIdx + 99, createHistoryRng(1))

			expect(state.events.length).toBe(beforeEvents)
			expect(state.leaderRuntime.idx[0]).toBe(currentIdx)
		})

		it("silently returns for non-sovereign provinces", () => {
			const state = createSuccessionState({
				parent: [-1, 0],
				neighbors: [[1], [0]],
			})
			// Province 1 is a vassal — manually give it a leader to test the guard
			spawnLeader(state, 1, createHistoryRng(42))
			const vassalIdx = state.leaderRuntime.idx[1]
			const beforeEvents = state.events.length

			runSuccession(state, 1, vassalIdx, createHistoryRng(1))

			expect(state.events.length).toBe(beforeEvents)
		})

		it("increments leader idx and re-enqueues a succession event", () => {
			const state = createSuccessionState({ parent: [-1] })
			const prevIdx = state.leaderRuntime.idx[0]

			runSuccession(state, 0, prevIdx, createStubRng())

			expect(state.leaderRuntime.idx[0]).toBe(prevIdx + 1)
			// One succession event enqueued for the new leader
			expect(state.heap.size).toBe(1)
			expect(state.heap.peekType()).toBe(EVT.SUCCESSION)
		})

		it("pushes a succession history event", () => {
			const state = createSuccessionState({ parent: [-1] })
			const prevIdx = state.leaderRuntime.idx[0]

			runSuccession(state, 0, prevIdx, createStubRng())

			const successionEvents = state.events.filter(
				(e) => e.tag === "succession",
			)
			expect(successionEvents).toHaveLength(1)
			expect(successionEvents[0]!.data).toMatchObject({
				nation: 0,
				leader: prevIdx,
			})
		})

		it("spreads dynasty to a sovereign neighbor via FRIENDLY relation", () => {
			const state = createSuccessionState({
				parent: [-1, -1],
				neighbors: [[1], [0]],
				habitability: [12, 8],
			})

			// Set distinct dynasties: province 0 gets dynasty 50, province 1 gets dynasty 99
			PROV.leader.dynasty.set(state, 0, state.time, 50)
			PROV.leader.dynasty.set(state, 1, state.time, 99)
			setRelation(state, 0, 1, REL.FRIENDLY)

			const prevIdx = state.leaderRuntime.idx[0]
			// Stub: claimRoll = 0 (first weightedChoice item) → dynasty spread branch
			runSuccession(state, 0, prevIdx, createStubRng())

			// Province 0 is less wealthy (hab 12 < ... wait, 0 has hab 12 which is more than 8)
			// Actually claim(state, 0): candidates = [1] (FRIENDLY neighbor)
			// senior = 1 (only candidate), seniorDynasty = 99 !== 50
			// → dynasty of province 0 becomes 99
			const newDynasty = PROV.leader.dynasty.get(state, 0)
			expect(newDynasty).toBe(99)
			const spreadEvents = state.events.filter(
				(e) => e.tag === "dynasty spread",
			)
			expect(spreadEvents.length).toBeGreaterThan(0)
		})

		it("assigns a new dynasty when no qualifying neighbor exists", () => {
			const state = createSuccessionState({
				parent: [-1, -1],
				neighbors: [[1], [0]],
			})
			// NEUTRAL relation (default) → no qualifying candidates
			const prevNextDynasty = state.nextDynasty
			const prevIdx = state.leaderRuntime.idx[0]

			runSuccession(state, 0, prevIdx, createStubRng())

			// Province 0 should have gotten a fresh dynasty
			expect(state.nextDynasty).toBeGreaterThan(prevNextDynasty)
		})

		it("forms a personal union when successor shares dynasty with wealthy neighbor", () => {
			const state = createSuccessionState({
				parent: [-1, -1],
				neighbors: [[1], [0]],
			})

			// Give both provinces the same dynasty so personal-union branch fires
			const sharedDynasty = 77
			PROV.leader.dynasty.set(state, 0, state.time, sharedDynasty)
			PROV.leader.dynasty.set(state, 1, state.time, sharedDynasty)
			setRelation(state, 0, 1, REL.FRIENDLY)

			const prevIdx = state.leaderRuntime.idx[0]
			runSuccession(state, 0, prevIdx, createStubRng())

			// Province 0 is the junior: it sees province 1 as PU_SENIOR
			expect(getRelation(state, 0, 1)).toBe(REL.PU_SENIOR)
			const puEvents = state.events.filter(
				(e) => e.tag === "personal union formed",
			)
			expect(puEvents).toHaveLength(1)
		})

		it("fires a regency event for a leader under 16 years old", () => {
			const state = createSuccessionState({ parent: [-1] })
			const prevIdx = state.leaderRuntime.idx[0]

			// uniformValue=1 → spawnLeader picks ageAtAccession=1 (< 16) → regency fires
			runSuccession(state, 0, prevIdx, createStubRng([], 1))

			const regencyEvents = state.events.filter(
				(e) => e.tag === "regency started",
			)
			expect(regencyEvents).toHaveLength(1)
			expect(regencyEvents[0]!.data).toMatchObject({ nation: 0 })
		})

		it("schedules a REGENCY end event when the leader will reach adulthood before dying", () => {
			const state = createSuccessionState({ parent: [-1] })
			const prevIdx = state.leaderRuntime.idx[0]

			// Use a rng where:
			// - uniform() first call (reign duration) returns 40 → 40-year reign
			// - uniform() subsequent calls (age buckets) return 5 → age=5 at accession
			let uniformCallCount = 0
			const rng: HistoryRng = {
				random: () => 0.5,
				uniform: () => {
					uniformCallCount++
					return uniformCallCount === 1 ? 40 : 5
				},
				randint: () => 1,
				choice: <T>(items: T[]) => items[0]!,
				weightedChoice: <T>(items: readonly WeightedValue<T>[]) => items[0]?.v,
				shuffle: <T>(items: T[]) => [...items],
			}

			runSuccession(state, 0, prevIdx, rng)

			// regency should fire (age 5 < 16) and a REGENCY end event enqueued
			const regencyEvents = state.events.filter(
				(e) => e.tag === "regency started",
			)
			expect(regencyEvents).toHaveLength(1)

			// The heap should contain: succession for next leader + REGENCY end event
			const types: number[] = []
			while (state.heap.size > 0) {
				types.push(state.heap.peekType())
				state.heap.dequeue()
			}
			expect(types).toContain(EVT.REGENCY)
		})

		it("triggers a vassal rebellion on succession", () => {
			const state = createSuccessionState({
				parent: [-1, 0],
				neighbors: [[1], [0]],
			})
			const prevIdx = state.leaderRuntime.idx[0]

			// random() = 0.1 < 0.5 → rebellion fires for subject province 1
			runSuccession(state, 0, prevIdx, createStubRng([0.1]))

			const rebellions = state.events.filter((e) => e.tag === "rebellion")
			expect(rebellions).toHaveLength(1)
			expect(rebellions[0]!.data).toMatchObject({ overlord: 0, subject: 1 })
		})
	})

	describe("addTerritory depose on conquest", () => {
		it("deposes the sovereign ruler when a province is absorbed", () => {
			const state = createSuccessionState({
				parent: [-1, -1],
				neighbors: [[1], [0]],
			})
			const rng = createHistoryRng(42)
			// Province 1 is sovereign; record its leader idx before war
			const defenderLeaderIdx = state.leaderRuntime.idx[1]

			startWar(state, 0, 1, rng)
			const war = state.wars[0]!
			resolveWar(state, war, rng, true)

			// Province 1 should no longer be sovereign (absorbed by 0)
			expect(isSovereign(state, 1)).toBe(false)

			// A "ruler deposed" event should have been pushed for the absorbed province
			const deposedEvents = state.events.filter(
				(e) => e.tag === "ruler deposed",
			)
			expect(deposedEvents.length).toBeGreaterThan(0)
			expect(deposedEvents[0]!.data).toMatchObject({
				nation: 1,
				leader: defenderLeaderIdx,
			})

			// The leader idx should have been incremented to invalidate stale events
			expect(state.leaderRuntime.idx[1]).toBeGreaterThan(defenderLeaderIdx)
		})
	})
})
