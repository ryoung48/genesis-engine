import { describe, expect, it } from "vitest"
import { EVT } from "../event-heap"
import { PROV } from "../fields"
import {
	createActiveWar,
	deltaMonth,
	deltaYear,
	getRelation,
	isSovereign,
	REL,
	setRelation,
} from "../state"
import { createHistoryTestState, createStubRng } from "./event-test-utils"
import { initWar, runWar } from "./war"

function createRangeRng(values: number[] = []) {
	let randomIndex = 0
	return {
		...createStubRng(values, 1),
		random: () => {
			const value = values[Math.min(randomIndex, values.length - 1)] ?? 0.5
			randomIndex++
			return value
		},
		uniform: (min: number, max?: number) =>
			max === undefined ? min : (min + max) / 2,
	}
}

function drainEventTypes(
	state: ReturnType<typeof createHistoryTestState>,
): number[] {
	const types: number[] = []
	const data = new Int32Array(4)
	while (!state.heap.isEmpty()) {
		types.push(state.heap.peekType())
		state.heap.peekData(data)
		state.heap.dequeue()
	}
	return types
}

describe("war events — rebellion", () => {
	it("creates a backdated active war with occupied territory and a queued battle", () => {
		const state = createHistoryTestState({
			parent: [-1, 0, -1, 2],
			habitability: [10, 7, 9, 6],
			neighbors: [
				[1, 2],
				[0, 2, 3],
				[0, 1, 3],
				[1, 2],
			],
		})
		const startTime = state.time - deltaYear(2)
		const nextBattleTime = state.time + deltaMonth(2)

		const war = createActiveWar(state, 0, 2, createRangeRng(), {
			startTime,
			nextBattleTime,
			occupied: [3],
		})

		expect(war.startTime).toBe(startTime)
		expect(war.occupied).toEqual([3])
		expect(PROV.occupation.get(state, 3)).toBe(war.idx)
		expect(getRelation(state, 0, 2)).toBe(REL.WAR)
		expect(
			state.events.find(
				(event) => event.tag === "war started" && event.data.war === war.idx,
			),
		).toMatchObject({
			time: startTime,
			data: { attacker: 0, defender: 2, war: war.idx },
		})
		expect(drainEventTypes(state)).toContain(EVT.BATTLE)
	})

	it("direct subject rebels when strong enough relative to the sovereign", () => {
		// Province 0: weak sovereign (habitability 1)
		// Province 1: strong direct vassal of 0 (habitability 10)
		// warThreat(0 vs 1) ≈ 0.98 > 0.4, rng returns 0.5 < 0.98 → rebellion fires
		const state = createHistoryTestState({
			parent: [-1, 0],
			habitability: [1, 10],
			neighbors: [[1], [0]],
		})

		runWar(state, 1, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(1)
		expect(rebellions[0]!.data).toMatchObject({ overlord: 0, subject: 1 })
	})

	it("sub-vassal does not rebel against the top sovereign", () => {
		// Province 0: weak sovereign (habitability 1)
		// Province 1: direct vassal of 0 (habitability 10)
		// Province 2: vassal of 1 — grandchild of sovereign 0 (habitability 10)
		// Province 2's immediate parent (1) ≠ sovereign (0) → no rebellion
		const state = createHistoryTestState({
			parent: [-1, 0, 1],
			habitability: [1, 10, 10],
			neighbors: [
				[1, 2],
				[0, 2],
				[1, 0],
			],
		})

		runWar(state, 2, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(0)
	})

	it("sovereign nation does not enter the rebellion branch", () => {
		const state = createHistoryTestState({
			parent: [-1, -1],
			habitability: [10, 10],
			neighbors: [[1], [0]],
		})

		runWar(state, 0, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(0)
	})

	it("rebellion does not fire when threat is too low", () => {
		// Province 0: very strong sovereign (habitability 100)
		// Province 1: weak direct vassal (habitability 1)
		// warThreat(0 vs 1) will be well below 0.4 → no rebellion
		const state = createHistoryTestState({
			parent: [-1, 0],
			habitability: [100, 1],
			neighbors: [[1], [0]],
		})

		runWar(state, 1, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(0)
	})

	it("initWar seeds an active interstate conflict for sovereign neighbors", () => {
		const size = 20
		const state = createHistoryTestState({
			parent: new Array(size).fill(-1),
			habitability: new Array(size).fill(10),
			neighbors: Array.from({ length: size }, (_, index) => {
				const neighbors: number[] = []
				if (index > 0) neighbors.push(index - 1)
				if (index < size - 1) neighbors.push(index + 1)
				return neighbors
			}),
		})
		for (let nation = 0; nation < size - 1; nation++) {
			if (state.desolate[nation] || state.desolate[nation + 1]) continue
			setRelation(state, nation, nation + 1, REL.NEUTRAL)
		}

		initWar(state, createRangeRng([0.9, 0.9]))

		expect(state.wars.length).toBeGreaterThan(0)
		expect(state.wars.some((war) => !war.rebel)).toBe(true)
		expect(state.heap.size).toBeGreaterThan(size)
		expect(drainEventTypes(state)).toContain(EVT.BATTLE)
	})

	it("initWar prefers occupiable interstate wars when larger neighbors exist", () => {
		const pairCount = 10
		const size = pairCount * 4
		const parent = Array.from({ length: size }, (_, index) =>
			index % 4 === 0
				? -1
				: index % 4 === 1
					? index - 1
					: index % 4 === 2
						? -1
						: index - 1,
		)
		const neighbors = Array.from({ length: size }, () => [] as number[])
		for (let pair = 0; pair < pairCount; pair++) {
			const leftCapital = pair * 4
			const leftSubject = leftCapital + 1
			const rightCapital = leftCapital + 2
			const rightSubject = leftCapital + 3

			neighbors[leftCapital] = [leftSubject, rightCapital, rightSubject]
			neighbors[leftSubject] = [leftCapital, rightCapital]
			neighbors[rightCapital] = [rightSubject, leftCapital, leftSubject]
			neighbors[rightSubject] = [rightCapital, leftCapital]
		}
		const state = createHistoryTestState({
			parent,
			habitability: new Array(size).fill(10),
			neighbors,
		})

		initWar(state, createRangeRng([0.9, 0.9]))

		const interstateWar = state.wars.find(
			(war) => !war.rebel && war.occupied.length > 0,
		)
		expect(interstateWar).toBeDefined()
		expect(interstateWar?.occupied.length).toBeGreaterThan(0)
	})

	it("initWar seeds deeper occupation progress for large interstate wars", () => {
		const pairCount = 20
		const size = pairCount * 6
		const parent = Array.from({ length: size }, (_, index) => {
			const slot = index % 6
			if (slot === 0 || slot === 3) return -1
			return slot < 3 ? index - slot : index - (slot - 3)
		})
		const neighbors = Array.from({ length: size }, () => [] as number[])
		for (let pair = 0; pair < pairCount; pair++) {
			const base = pair * 6
			const leftCapital = base
			const leftA = base + 1
			const leftB = base + 2
			const rightCapital = base + 3
			const rightA = base + 4
			const rightB = base + 5

			neighbors[leftCapital] = [leftA, leftB, rightCapital, rightA, rightB]
			neighbors[leftA] = [leftCapital, rightCapital, rightA]
			neighbors[leftB] = [leftCapital, rightCapital, rightB]
			neighbors[rightCapital] = [rightA, rightB, leftCapital, leftA, leftB]
			neighbors[rightA] = [rightCapital, leftCapital, leftA]
			neighbors[rightB] = [rightCapital, leftCapital, leftB]
		}
		const state = createHistoryTestState({
			parent,
			habitability: new Array(size).fill(10),
			neighbors,
		})

		initWar(state, createRangeRng([0.9, 0.2, 0.9]))

		const largeWar = state.wars.find(
			(war) => !war.rebel && war.occupied.length >= 2,
		)
		expect(largeWar).toBeDefined()
		expect(largeWar?.occupied.length).toBeGreaterThanOrEqual(2)
	})

	it("initWar biases interstate wars toward larger sovereign opponents", () => {
		const state = createHistoryTestState({
			parent: [
				-1, 0, 0, -1, 3, 3, -1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
				-1, -1, -1, -1, -1, -1,
			],
			habitability: [12, 8, 8, 11, 7, 7, 10, 6, ...new Array(17).fill(6)],
			neighbors: [
				[1, 2, 3, 4, 5, 6, 7],
				[0, 3],
				[0, 3, 4],
				[0, 5, 6],
				[0, 1, 4, 6],
				[0, 1, 3, 7],
				[0, 2, 6],
				[0, 2, 3, 5, 7],
				[0, 4, 6],
				[9],
				[8, 10],
				[9, 11],
				[10, 12],
				[11, 13],
				[12, 14],
				[13, 15],
				[14, 16],
				[15, 17],
				[16, 18],
				[17, 19],
				[18, 20],
				[19, 21],
				[20, 22],
				[21, 23],
				[22, 24],
				[23],
			],
		})
		setRelation(state, 0, 3, REL.NEUTRAL)
		setRelation(state, 0, 6, REL.NEUTRAL)
		setRelation(state, 3, 6, REL.NEUTRAL)

		initWar(state, createRangeRng([0.9, 0.9]))

		const interstateWar = state.wars.find((war) => !war.rebel)
		expect(interstateWar).toBeDefined()
		expect([interstateWar?.attacker, interstateWar?.defender]).toContain(0)
		expect([interstateWar?.attacker, interstateWar?.defender]).toContain(3)
	})

	it("initWar seeds a direct-subject rebellion with an active war", () => {
		const pairs = 40
		const size = pairs * 2
		const parent = Array.from({ length: size }, (_, index) =>
			index % 2 === 0 ? -1 : index - 1,
		)
		const habitability = Array.from({ length: size }, (_, index) =>
			index % 2 === 0 ? 1 : 10,
		)
		const state = createHistoryTestState({
			parent,
			habitability,
			neighbors: Array.from({ length: size }, (_, index) => {
				return index % 2 === 0 ? [index + 1] : [index - 1]
			}),
		})

		initWar(state, createRangeRng([0.9, 0.9]))

		const rebelWar = state.wars.find((war) => war.rebel)
		expect(rebelWar).toBeDefined()
		expect(rebelWar?.attacker).toBeGreaterThanOrEqual(0)
		expect(rebelWar?.defender).toBeGreaterThan(0)
		expect(isSovereign(state, rebelWar!.defender)).toBe(true)
		expect(state.events.some((event) => event.tag === "rebellion")).toBe(true)
		expect(drainEventTypes(state)).toContain(EVT.BATTLE)
	})

	it("initWar reduces rebellion seeding to roughly half the prior rate", () => {
		const pairs = 40
		const size = pairs * 2
		const parent = Array.from({ length: size }, (_, index) =>
			index % 2 === 0 ? -1 : index - 1,
		)
		const habitability = Array.from({ length: size }, (_, index) =>
			index % 2 === 0 ? 1 : 10,
		)
		const state = createHistoryTestState({
			parent,
			habitability,
			neighbors: Array.from({ length: size }, (_, index) =>
				index % 2 === 0 ? [index + 1] : [index - 1],
			),
		})

		initWar(state, createRangeRng([0.9, 0.9]))

		expect(state.wars.filter((war) => war.rebel)).toHaveLength(1)
	})
})
