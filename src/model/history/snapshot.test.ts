import { describe, expect, it, vi } from "vitest"
import type { HistoryState, Relation } from "./state"

const mocked = vi.hoisted(() => {
	const YEAR_MS = 31_536_000_000
	const REL = {
		FRIENDLY: 6,
		NEUTRAL: 7,
		RIVAL: 9,
	} as const
	const ensureHierarchyClean = vi.fn(
		(state: {
			P: number
			parentCurrent: Int32Array
			sovereignCurrent: Int32Array
			hierarchyDirty: boolean
		}) => {
			if (!state.hierarchyDirty) return
			for (let province = 0; province < state.P; province++) {
				let current = province
				while (state.parentCurrent[current] >= 0) {
					current = state.parentCurrent[current]
				}
				state.sovereignCurrent[province] = current
			}
			state.hierarchyDirty = false
		},
	)
	return { YEAR_MS, REL, ensureHierarchyClean }
})

vi.mock(".", () => ({
	YEAR_MS: mocked.YEAR_MS,
}))

vi.mock("./state", () => ({
	REL: mocked.REL,
	ensureHierarchyClean: mocked.ensureHierarchyClean,
}))

vi.mock("./fields", () => ({
	PROV: {
		parent: {
			get: (state: FixtureState, province: number) =>
				state.parentCurrent[province],
		},
		assignment: {
			get: (state: FixtureState, province: number) =>
				state.assignmentCurrent[province],
		},
		population: {
			rural: {
				get: (state: FixtureState, province: number) =>
					state.popRuralCurrent[province],
			},
			urban: {
				get: (state: FixtureState, province: number) =>
					state.popUrbanCurrent[province],
			},
		},
		development: {
			get: (state: FixtureState, province: number) =>
				state.developmentCurrent[province],
		},
		consumption: {
			get: (state: FixtureState, province: number) =>
				state.consumptionCurrent[province],
		},
		leader: {
			dynasty: {
				get: (state: FixtureState, province: number) =>
					state.leaderDynCurrent[province],
			},
			nameSeed: {
				get: (state: FixtureState, province: number) =>
					state.leaderNameSeedCurrent[province],
			},
			claim: {
				get: (state: FixtureState, province: number) =>
					state.leaderClaimCurrent[province],
			},
			birthYear: {
				get: (state: FixtureState, province: number) =>
					state.leaderBirthYearCurrent[province],
			},
		},
		occupation: {
			get: (state: FixtureState, province: number) =>
				state.occupationCurrent[province],
		},
	},
}))

import { buildHistoryFrame, serializeHistoryTimelines } from "./snapshot"

type FixtureState = Pick<
	HistoryState,
	| "P"
	| "time"
	| "_parent"
	| "_assignment"
	| "_pop_rural"
	| "_pop_urban"
	| "_development"
	| "_consumption"
	| "_leader_dyn"
	| "_leader_name_seed"
	| "_leader_claim"
	| "_leader_birth_year"
	| "_occupation"
	| "_relations"
	| "parentCurrent"
	| "sovereignCurrent"
	| "assignmentCurrent"
	| "popRuralCurrent"
	| "popUrbanCurrent"
	| "developmentCurrent"
	| "consumptionCurrent"
	| "leaderDynCurrent"
	| "leaderNameSeedCurrent"
	| "leaderClaimCurrent"
	| "leaderBirthYearCurrent"
	| "occupationCurrent"
	| "provinceAdjOffset"
	| "provinceAdjList"
	| "habitability"
	| "nationColors"
	| "wars"
	| "hierarchyDirty"
>

function numberTimeline(...values: Array<[number, number]>) {
	return values.map(([time, value]) => ({ time, value }))
}

function relationTimeline(...values: Array<[number, Relation]>) {
	return values.map(([time, value]) => ({ time, value }))
}

function roundFloat32(values: Float32Array): number[] {
	return Array.from(values, (value) => Number(value.toFixed(3)))
}

function createFixtureState(): FixtureState {
	const time = 803 * mocked.YEAR_MS
	return {
		P: 4,
		time,
		_parent: [
			numberTimeline([time, -1]),
			numberTimeline([time, 0]),
			numberTimeline([time, -1]),
			[],
		],
		_assignment: [
			numberTimeline([time, 0]),
			numberTimeline([time, 0]),
			numberTimeline([time, 2]),
			[],
		],
		_pop_rural: [
			numberTimeline([time - mocked.YEAR_MS, 90], [time, 100]),
			numberTimeline([time, 50]),
			numberTimeline([time, 40]),
			[],
		],
		_pop_urban: [
			numberTimeline([time, 10]),
			numberTimeline([time, 5]),
			numberTimeline([time, 7]),
			[],
		],
		_development: [
			numberTimeline([time, 1.5]),
			numberTimeline([time, 0.5]),
			numberTimeline([time, 2.5]),
			[],
		],
		_consumption: [
			numberTimeline([time, 1]),
			numberTimeline([time, 2]),
			numberTimeline([time, 3]),
			[],
		],
		_leader_dyn: [
			numberTimeline([time, 10]),
			numberTimeline([time, 11]),
			numberTimeline([time, 20]),
			[],
		],
		_leader_name_seed: [
			numberTimeline([time, 100]),
			numberTimeline([time, 101]),
			numberTimeline([time, 200]),
			[],
		],
		_leader_claim: [
			numberTimeline([time, 4]),
			numberTimeline([time, 2]),
			numberTimeline([time, 7]),
			[],
		],
		_leader_birth_year: [
			numberTimeline([time, 760]),
			numberTimeline([time, 770]),
			numberTimeline([time, 755]),
			[],
		],
		_occupation: [
			numberTimeline([time, 999]),
			numberTimeline([time, -1]),
			numberTimeline([time, -1]),
			[],
		],
		_relations: new Map([
			[
				2,
				relationTimeline(
					[time - mocked.YEAR_MS, mocked.REL.FRIENDLY],
					[time, mocked.REL.RIVAL],
				),
			],
			[8, relationTimeline([time, mocked.REL.NEUTRAL])],
			[15, []],
		]),
		parentCurrent: new Int32Array([-1, 0, -1, -1]),
		sovereignCurrent: new Int32Array(4).fill(-1),
		assignmentCurrent: new Int32Array([0, 0, 2, -1]),
		popRuralCurrent: new Float32Array([100, 50, 40, 0]),
		popUrbanCurrent: new Float32Array([10, 5, 7, 0]),
		developmentCurrent: new Float32Array([1.5, 0.5, 2.5, 0]),
		consumptionCurrent: new Float32Array([1, 2, 3, 0]),
		leaderDynCurrent: new Int32Array([10, 11, 20, -1]),
		leaderNameSeedCurrent: new Int32Array([100, 101, 200, -1]),
		leaderClaimCurrent: new Uint8Array([4, 2, 7, 0]),
		leaderBirthYearCurrent: new Float32Array([760, 770, 755, -1]),
		occupationCurrent: new Int32Array([999, -1, -1, -1]),
		provinceAdjOffset: new Int32Array([0, 3, 4, 5, 6]),
		provinceAdjList: new Int32Array([1, 2, 3, 0, 0, 0]),
		habitability: new Float32Array([10, 4, 8, 1]),
		nationColors: new Map([[0, [0.1, 0.2, 0.3] as [number, number, number]]]),
		wars: [
			{
				idx: 999,
				attacker: 0,
				defender: 2,
				startTime: time - mocked.YEAR_MS,
				rebel: false,
				occupied: [0],
			},
			{
				idx: 1000,
				attacker: 2,
				defender: 0,
				startTime: time - 2 * mocked.YEAR_MS,
				endTime: time - 1,
				rebel: false,
				occupied: [],
			},
		],
		hierarchyDirty: true,
	}
}

describe("history snapshot helpers", () => {
	it("serializes timelines and records profiling data", () => {
		const state = createFixtureState()
		const profile = {
			intFieldsMs: 0,
			floatFieldsMs: 0,
			relationsMs: 0,
			colorsMs: 0,
			totalMs: 0,
		}

		const timelines = serializeHistoryTimelines(
			state as HistoryState,
			state.time + mocked.YEAR_MS,
			profile,
		)

		expect(timelines.startTimeMs).toBe(800 * mocked.YEAR_MS)
		expect(timelines.endTimeMs).toBe(state.time + mocked.YEAR_MS)
		expect(Array.from(timelines.parent.offsets)).toEqual([0, 1, 2, 3, 3])
		expect(Array.from(timelines.assignment.values)).toEqual([0, 0, 2])
		expect(Array.from(timelines.populationRural.values)).toEqual([
			90, 100, 50, 40,
		])
		expect(Array.from(timelines.relations.aIdx)).toEqual([0, 2, 3])
		expect(Array.from(timelines.relations.bIdx)).toEqual([2, 0, 3])
		expect(Array.from(timelines.relations.values)).toEqual([
			mocked.REL.FRIENDLY,
			mocked.REL.RIVAL,
			mocked.REL.NEUTRAL,
		])
		expect(Array.from(timelines.nationColorKeys)).toEqual([0])
		expect(roundFloat32(timelines.nationColorValues)).toEqual([0.1, 0.2, 0.3])
		expect(timelines.wars).toEqual(state.wars)
		expect(profile.totalMs).toBeGreaterThanOrEqual(0)
		expect(
			profile.intFieldsMs +
				profile.floatFieldsMs +
				profile.relationsMs +
				profile.colorsMs,
		).toBeLessThanOrEqual(profile.totalMs + 5)
	})

	it("builds filtered live frames and supports no-profile calls", () => {
		const state = createFixtureState()
		const profile = {
			hierarchyMs: 0,
			provinceFieldsMs: 0,
			adjacencyMs: 0,
			warsMs: 0,
			summaryMs: 0,
			relationsMs: 0,
			totalMs: 0,
		}

		const frame = buildHistoryFrame(state as HistoryState, profile)
		const timelines = serializeHistoryTimelines(state as HistoryState)
		const frameWithoutProfile = buildHistoryFrame(state as HistoryState)

		expect(mocked.ensureHierarchyClean).toHaveBeenCalled()
		expect(state.hierarchyDirty).toBe(false)
		expect(timelines.endTimeMs).toBe(state.time)
		expect(frameWithoutProfile.totalPopulation).toBe(frame.totalPopulation)
		expect(Array.from(frame.parent)).toEqual([-1, 0, -1, -1])
		expect(Array.from(frame.assignment)).toEqual([0, 0, 2, -1])
		expect(Array.from(frame.sovereign)).toEqual([0, 0, 2, 3])
		expect(roundFloat32(frame.colors)).toEqual([
			0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0, 0, 0, 0, 0, 0,
		])
		expect(Array.from(frame.adjOffset)).toEqual([0, 1, 1, 2, 2])
		expect(Array.from(frame.adjList)).toEqual([2, 0])
		expect(frame.activeWars).toEqual([
			{
				idx: 999,
				attacker: 0,
				defender: 2,
				rebel: false,
				occupied: [0],
			},
		])
		expect(frame.sovereignCount).toBe(2)
		expect(frame.totalPopulation).toBe(212)
		expect(roundFloat32(frame.nationWealth)).toEqual([9, 0, 5, 0])
		expect(roundFloat32(frame.nationOptimalWealth)).toEqual([10, 0, 8, 0])
		expect(Array.from(frame.relationA)).toEqual([0])
		expect(Array.from(frame.relationB)).toEqual([2])
		expect(Array.from(frame.relationValues)).toEqual([mocked.REL.RIVAL])
		expect(profile.totalMs).toBeGreaterThanOrEqual(0)
		expect(
			profile.hierarchyMs +
				profile.provinceFieldsMs +
				profile.adjacencyMs +
				profile.warsMs +
				profile.summaryMs +
				profile.relationsMs,
		).toBeLessThanOrEqual(profile.totalMs + 5)
	})
})
