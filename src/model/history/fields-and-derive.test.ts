import { describe, expect, it } from "vitest"
import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import type { ProvincePopulation } from "../society/population"
import {
	children,
	nationAdjacency,
	provinceWars,
	sovereign,
	wealthCurrent,
	wealthOptimal,
} from "./derive"
import { PROV, REL as REL_FIELD } from "./fields"
import { createHistoryRng } from "./history-rng"
import { createHistoryState, type HistoryState, REL, YEAR_MS } from "./state"

function createTestState(): HistoryState {
	const provinces = {
		regionProvince: new Int32Array([0, 1, 2, 3]),
		seeds: new Int32Array([0, 1, 2, 3]),
		count: 4,
		desolate: new Uint8Array([0, 0, 0, 0]),
		landmassId: new Int32Array([0, 0, 0, 0]),
		adjOffset: new Int32Array([0, 1, 2, 5, 6]),
		adjList: new Int32Array([2, 2, 0, 1, 3, 2]),
		size: new Int32Array([1, 1, 1, 1]),
		colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0]),
	} as OrogenProvinces
	const nations = {
		assignment: new Int32Array([0, 0, 2, 3]),
		seeds: new Int32Array([0, 1, 2, 3]),
		count: 4,
		adjOffset: new Int32Array([0, 0, 0, 0, 0]),
		adjList: new Int32Array(0),
		size: new Int32Array([2, 0, 1, 1]),
		colors: provinces.colors.slice(),
		parent: new Int32Array([-1, 0, -1, -1]),
		depth: new Int32Array([0, 1, 0, 0]),
		childOffset: new Int32Array([0, 1, 1, 1, 1]),
		childList: new Int32Array([1]),
		sovereign: new Int32Array([0, 0, 2, 3]),
		gravity: new Float32Array([10, 6, 8, 4]),
	} as OrogenNationHierarchy
	const population: ProvincePopulation = {
		habitability: new Float32Array([10, 6, 8, 4]),
		population: new Float32Array([100, 50, 80, 40]),
		habitabilityScore: 28,
		totalPopulation: 270,
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		new Uint8Array([1, 1, 1, 1]),
		new Uint8Array([0, 0, 0, 0]),
		new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0]),
		{ assignment: new Int32Array([0, 0, 1, 1]), count: 2 },
		10,
		createHistoryRng(7),
	)
}

function createWideState(): HistoryState {
	// 10-province star: province 0 is sovereign with 9 direct children.
	// Nation size = 10 → kingdom tier → max fanout = 6 → 9 > 6 → overextended.
	const P = 10
	const childOffset = new Int32Array(P + 1)
	childOffset[1] = 9
	for (let i = 2; i <= P; i++) childOffset[i] = 9

	const provinces = {
		regionProvince: Int32Array.from({ length: P }, (_, i) => i),
		seeds: Int32Array.from({ length: P }, (_, i) => i),
		count: P,
		desolate: new Uint8Array(P),
		landmassId: new Int32Array(P),
		adjOffset: new Int32Array([0, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
		adjList: new Int32Array([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		]),
		size: new Int32Array(P).fill(1),
		colors: new Float32Array(P * 3),
	} as OrogenProvinces
	const nations = {
		assignment: new Int32Array(P).fill(0),
		seeds: Int32Array.from({ length: P }, (_, i) => i),
		count: P,
		adjOffset: new Int32Array(P + 1),
		adjList: new Int32Array(0),
		size: Int32Array.from({ length: P }, (_, i) => (i === 0 ? P : 0)),
		colors: new Float32Array(P * 3),
		parent: Int32Array.from({ length: P }, (_, i) => (i === 0 ? -1 : 0)),
		depth: Int32Array.from({ length: P }, (_, i) => (i === 0 ? 0 : 1)),
		childOffset,
		childList: Int32Array.from({ length: P - 1 }, (_, i) => i + 1),
		sovereign: new Int32Array(P).fill(0),
		gravity: new Float32Array(P).fill(4),
	} as OrogenNationHierarchy
	const population: ProvincePopulation = {
		habitability: Float32Array.from({ length: P }, (_, i) =>
			i === 0 ? 10 : 4,
		),
		population: Float32Array.from({ length: P }, (_, i) =>
			i === 0 ? 100 : 40,
		),
		habitabilityScore: 30,
		totalPopulation: 300,
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		new Uint8Array(P).fill(1),
		new Uint8Array(P),
		new Float32Array(P * 3),
		{ assignment: new Int32Array(P).fill(0), count: 1 },
		10,
		createHistoryRng(13),
	)
}

describe("history fields", () => {
	it("rejects self-parent and cycle-forming parent assignments", () => {
		const state = createTestState()

		expect(() => PROV.parent.set(state, 0, state.time, 0)).toThrow(
			"cannot parent itself",
		)
		expect(() => PROV.parent.set(state, 0, state.time, 1)).toThrow(
			"would create cycle",
		)
	})

	it("updates current values for live writes and flips asymmetric relations", () => {
		const state = createTestState()

		PROV.consumption.delta(state, 2, state.time, 1.5)
		REL_FIELD.set(state, 0, 2, REL.OVERLORD, state.time)

		expect(PROV.consumption.get(state, 2, state.time)).toBe(1.5)
		expect(REL_FIELD.get(state, 0, 2, state.time)).toBe(REL.VASSAL)
		expect(REL_FIELD.get(state, 2, 0, state.time)).toBe(REL.OVERLORD)
	})

	it("keeps historical parent writes out of live caches and flips personal unions", () => {
		const state = createTestState()
		const pastTime = 2 * YEAR_MS

		PROV.parent.set(state, 3, pastTime, 2)
		REL_FIELD.set(state, 0, 2, REL.PU_SENIOR, pastTime)

		expect(PROV.parent.get(state, 3)).toBe(-1)
		expect(PROV.parent.get(state, 3, pastTime)).toBe(2)
		expect(state.hierarchyDirty).toBe(false)
		expect(REL_FIELD.get(state, 0, 2, pastTime)).toBe(REL.PU_JUNIOR)
		expect(REL_FIELD.get(state, 2, 0, pastTime)).toBe(REL.PU_SENIOR)
		expect(REL_FIELD.get(state, 1, 3, pastTime)).toBe(REL.NEUTRAL)
	})

	it("detects deeper parent cycles beyond immediate ancestors", () => {
		const state = createTestState()

		PROV.parent.set(state, 2, state.time, 1)
		PROV.parent.set(state, 3, state.time, 2)

		expect(() => PROV.parent.set(state, 0, state.time, 3)).toThrow(
			"would create cycle",
		)
	})

	it("detects corrupt live parent loops during cycle validation", () => {
		const state = createTestState()
		state.parentCurrent[0] = 1
		state.parentCurrent[1] = 0

		expect(() => PROV.parent.set(state, 2, state.time, 0)).toThrow(
			"Parent cycle detected while validating assignment",
		)
	})

	it("updates live and historical field mirrors only when writes reach the present", () => {
		const state = createTestState()
		const pastTime = state.time - YEAR_MS
		const futureTime = state.time + YEAR_MS
		const ruralCurrent = PROV.population.rural.get(state, 2)
		const occupationCurrent = PROV.occupation.get(state, 2)

		state.hierarchyDirty = false
		PROV.parent.set(state, 1, state.time, 0)
		PROV.assignment.set(state, 2, futureTime, 1)
		PROV.population.rural.set(state, 2, pastTime, 12)
		PROV.population.urban.set(state, 2, futureTime, 7)
		PROV.development.set(state, 2, futureTime, 3)
		PROV.leader.dynasty.set(state, 2, futureTime, 5)
		PROV.leader.nameSeed.set(state, 2, futureTime, 42)
		PROV.leader.claim.set(state, 2, futureTime, 4)
		PROV.leader.birthYear.set(state, 2, futureTime, 12)
		PROV.occupation.set(state, 2, pastTime, 9)

		expect(state.hierarchyDirty).toBe(false)
		expect(PROV.assignment.get(state, 2)).toBe(1)
		expect(PROV.assignment.get(state, 2, pastTime)).toBe(-1)
		expect(PROV.population.rural.get(state, 2)).toBe(ruralCurrent)
		expect(PROV.population.rural.get(state, 2, pastTime)).toBe(12)
		expect(PROV.population.urban.get(state, 2)).toBe(7)
		expect(PROV.development.get(state, 2)).toBe(3)
		expect(PROV.leader.dynasty.get(state, 2)).toBe(5)
		expect(PROV.leader.nameSeed.get(state, 2)).toBe(42)
		expect(PROV.leader.nameSeed.get(state, 2, pastTime)).toBe(-1)
		expect(state.leaderRuntime.nameSeed[2]).toBe(42)
		expect(PROV.leader.claim.get(state, 2)).toBe(4)
		expect(PROV.leader.birthYear.get(state, 2)).toBe(12)
		expect(state.leaderBirthYearCurrent[2]).toBe(12)
		expect(PROV.occupation.get(state, 2)).toBe(occupationCurrent)
		expect(PROV.occupation.get(state, 2, pastTime)).toBe(9)
	})

	it("returns neutral defaults and preserves symmetric relations for unflipped values", () => {
		const state = createTestState()
		const pastTime = state.time - YEAR_MS

		expect(REL_FIELD.get(state, 1, 2, pastTime)).toBe(REL.NEUTRAL)

		REL_FIELD.set(state, 1, 2, REL.FRIENDLY, pastTime)
		REL_FIELD.set(state, 1, 2, REL.NEUTRAL, state.time)

		expect(REL_FIELD.get(state, 1, 2, pastTime)).toBe(REL.FRIENDLY)
		expect(REL_FIELD.get(state, 2, 1, pastTime)).toBe(REL.FRIENDLY)
		expect(REL_FIELD.get(state, 1, 2)).toBe(REL.NEUTRAL)
		expect(REL_FIELD.get(state, 2, 1)).toBe(REL.NEUTRAL)
	})

	it("flips inverse asymmetric relations when writes start from the junior side", () => {
		const state = createTestState()
		const pastTime = state.time - YEAR_MS

		REL_FIELD.set(state, 0, 2, REL.VASSAL, pastTime)
		REL_FIELD.set(state, 1, 3, REL.PU_JUNIOR, state.time)

		expect(REL_FIELD.get(state, 0, 2, pastTime)).toBe(REL.OVERLORD)
		expect(REL_FIELD.get(state, 2, 0, pastTime)).toBe(REL.VASSAL)
		expect(REL_FIELD.get(state, 1, 3)).toBe(REL.PU_SENIOR)
		expect(REL_FIELD.get(state, 3, 1)).toBe(REL.PU_JUNIOR)
	})

	it("keeps historical mirrors separate for the remaining mirrored province fields", () => {
		const state = createTestState()
		const pastTime = state.time - YEAR_MS
		const assignmentCurrent = PROV.assignment.get(state, 1)
		const urbanCurrent = PROV.population.urban.get(state, 2)
		const developmentCurrent = PROV.development.get(state, 2)
		const consumptionCurrent = PROV.consumption.get(state, 2)
		const dynastyCurrent = PROV.leader.dynasty.get(state, 2)
		const nameSeedCurrent = PROV.leader.nameSeed.get(state, 2)
		const claimCurrent = PROV.leader.claim.get(state, 2)

		PROV.assignment.set(state, 1, pastTime, 3)
		PROV.population.urban.set(state, 2, pastTime, 8)
		PROV.development.set(state, 2, pastTime, 6)
		PROV.consumption.delta(state, 2, pastTime, 2.5)
		PROV.leader.dynasty.set(state, 2, pastTime, 9)
		PROV.leader.nameSeed.set(state, 2, pastTime, 77)
		PROV.leader.claim.set(state, 2, pastTime, 7)

		expect(PROV.assignment.get(state, 1)).toBe(assignmentCurrent)
		expect(PROV.assignment.get(state, 1, pastTime)).toBe(3)
		expect(PROV.population.urban.get(state, 2)).toBe(urbanCurrent)
		expect(PROV.population.urban.get(state, 2, pastTime)).toBe(8)
		expect(PROV.development.get(state, 2)).toBe(developmentCurrent)
		expect(PROV.development.get(state, 2, pastTime)).toBe(6)
		expect(PROV.consumption.get(state, 2)).toBe(consumptionCurrent)
		expect(PROV.consumption.get(state, 2, pastTime)).toBe(2.5)
		expect(PROV.leader.dynasty.get(state, 2)).toBe(dynastyCurrent)
		expect(PROV.leader.dynasty.get(state, 2, pastTime)).toBe(9)
		expect(PROV.leader.nameSeed.get(state, 2)).toBe(nameSeedCurrent)
		expect(PROV.leader.nameSeed.get(state, 2, pastTime)).toBe(77)
		expect(state.leaderRuntime.nameSeed[2]).toBe(nameSeedCurrent)
		expect(PROV.leader.claim.get(state, 2)).toBe(claimCurrent)
		expect(PROV.leader.claim.get(state, 2, pastTime)).toBe(7)
	})
})

describe("history derive helpers", () => {
	it("resolves sovereigns, children, and wealth from the live hierarchy", () => {
		const state = createTestState()

		expect(sovereign(state, 1)).toBe(0)
		expect(children(state, 0)).toEqual([1])
		expect(wealthOptimal(state, 0)).toBeCloseTo(11.5, 6)
		expect(wealthCurrent(state, 1)).toBeCloseTo(4.5, 6)
	})

	it("supports historical lookups and caches nation adjacency", () => {
		const state = createTestState()
		const cache = {
			children: new Map<string, number[]>(),
			sovereign: new Map<string, number>(),
			gravity: new Map<string, number>(),
			wealthCurrent: new Map<string, number>(),
			wealthOptimal: new Map<string, number>(),
			nationAdjacency: new Map<
				number,
				{ offset: Int32Array; list: Int32Array }
			>(),
			provinceWars: new Map<string, number[]>(),
		}
		const pastTime = 5 * YEAR_MS
		PROV.parent.set(state, 3, pastTime, 2)

		expect(sovereign(state, 3, pastTime, cache)).toBe(2)
		expect(children(state, 2, pastTime, cache)).toEqual([3])

		const adjacencyA = nationAdjacency(state)
		const adjacencyB = nationAdjacency(state)
		expect(adjacencyB).toBe(adjacencyA)
		expect(Array.from(adjacencyA.offset)).toEqual([0, 1, 1, 3, 4])
		expect(Array.from(adjacencyA.list)).toEqual([2, 0, 3, 2])
	})

	it("filters active historical wars by province and time", () => {
		const state = createTestState()
		state.provinceWars[0] = [99]
		state.wars = [
			{
				idx: 5,
				attacker: 0,
				defender: 2,
				startTime: 0,
				endTime: 8 * YEAR_MS,
				rebel: false,
				occupied: [],
			},
			{
				idx: 6,
				attacker: 3,
				defender: 1,
				startTime: 9 * YEAR_MS,
				rebel: false,
				occupied: [],
			},
		]

		expect(provinceWars(state, 0)).toEqual([99])
		expect(provinceWars(state, 0, 7 * YEAR_MS)).toEqual([5])
		expect(provinceWars(state, 3, 7 * YEAR_MS)).toEqual([])
	})

	it("supports wealth exclusions and freedom without reusing the tributary penalty", () => {
		const state = createTestState()
		PROV.consumption.set(state, 0, state.time, 1)
		PROV.consumption.set(state, 1, state.time, 2)

		expect(wealthCurrent(state, 0)).toBeCloseTo(9.75, 6)
		expect(wealthCurrent(state, 0, state.time, undefined, 1)).toBeCloseTo(9, 6)
		expect(
			wealthCurrent(state, 1, state.time, undefined, undefined, true),
		).toBeCloseTo(4, 6)
	})

	it("applies overextension in current and historical wealth calculations", () => {
		const state = createWideState()
		const futureTime = state.time + YEAR_MS
		const cache = {
			children: new Map<string, number[]>(),
			sovereign: new Map<string, number>(),
			gravity: new Map<string, number>(),
			wealthCurrent: new Map<string, number>(),
			wealthOptimal: new Map<string, number>(),
			nationAdjacency: new Map<
				number,
				{ offset: Int32Array; list: Int32Array }
			>(),
			provinceWars: new Map<string, number[]>(),
		}

		expect(wealthOptimal(state, 0)).toBeCloseTo(17.1, 6)
		expect(wealthCurrent(state, 0)).toBeCloseTo(15.075, 6)
		expect(wealthOptimal(state, 0, futureTime, cache)).toBeCloseTo(17.1, 6)
		expect(wealthCurrent(state, 0, futureTime, cache)).toBeCloseTo(15.075, 6)
	})

	it("throws for corrupted historical sovereign cycles", () => {
		const state = createTestState()
		const futureTime = state.time + YEAR_MS

		state._parent[0].push({ time: futureTime, value: 1 })
		state._parent[1].push({ time: futureTime, value: 0 })

		expect(() =>
			sovereign(state, 0, futureTime, { sovereign: new Map<string, number>() }),
		).toThrow("Parent cycle detected while resolving sovereign")
	})

	it("uses caller caches for historical sovereigns, adjacencies, and province wars", () => {
		const state = createTestState()
		const pastTime = 6 * YEAR_MS
		const cache = {
			children: new Map<string, number[]>(),
			sovereign: new Map<string, number>(),
			gravity: new Map<string, number>(),
			wealthCurrent: new Map<string, number>(),
			wealthOptimal: new Map<string, number>(),
			nationAdjacency: new Map<
				number,
				{ offset: Int32Array; list: Int32Array }
			>(),
			provinceWars: new Map<string, number[]>(),
		}
		PROV.parent.set(state, 3, pastTime, 2)
		state.wars = [
			{
				idx: 7,
				attacker: 2,
				defender: 3,
				startTime: 0,
				endTime: 8 * YEAR_MS,
				rebel: false,
				occupied: [],
			},
		]

		const wars = provinceWars(state, 3, pastTime, cache)
		const adjacency = nationAdjacency(state, pastTime, cache)

		state.wars = []
		PROV.parent.set(state, 3, pastTime, -1)

		expect(sovereign(state, 3, pastTime, cache)).toBe(2)
		expect(provinceWars(state, 3, pastTime, cache)).toBe(wars)
		expect(nationAdjacency(state, pastTime, cache)).toBe(adjacency)
	})
})
