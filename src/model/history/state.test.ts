import { describe, expect, it } from "vitest"
import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import type { ProvincePopulation } from "../society/population"
import { EVT } from "./event-heap"
import { initDiplomacy } from "./events/diplomacy"
import { initSuccession, runSuccession } from "./events/succession"
import { PROV } from "./fields"
import { createHistoryRng } from "./history-rng"
import {
	createHistoryState,
	deltaMonth,
	deltaYear,
	diffYears,
	ensureHierarchyClean,
	fixConnections,
	getChildren,
	getNationNeighbors,
	getNationProvinces,
	getProvinceNeighbors,
	getRelation,
	getRulerRelation,
	getSovereign,
	type HistoryState,
	isSovereign,
	provinceDistanceSq,
	REL,
	releaseProvince,
	resolveWar,
	setRelation,
	spawnLeader,
	startWar,
	validateLiveHierarchy,
	warThreat,
	YEAR_MS,
} from "./state"

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
		new Uint8Array([1, 1, 0, 0]),
		new Uint8Array([0, 0, 1, 0]),
		new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0]),
		{ assignment: new Int32Array([0, 0, 1, 1]), count: 2 },
		10,
		createHistoryRng(11),
	)
}

function createDesolateState(): HistoryState {
	const provinces = {
		regionProvince: new Int32Array([0, 1, 2]),
		seeds: new Int32Array([0, 1, 2]),
		count: 3,
		desolate: new Uint8Array([0, 0, 1]),
		landmassId: new Int32Array([0, 0, 0]),
		adjOffset: new Int32Array([0, 1, 3, 4]),
		adjList: new Int32Array([1, 0, 2, 1]),
		size: new Int32Array([1, 1, 1]),
		colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
	} as OrogenProvinces
	const nations = {
		assignment: new Int32Array([0, 1, -1]),
		seeds: new Int32Array([0, 1, 2]),
		count: 3,
		adjOffset: new Int32Array([0, 0, 0, 0]),
		adjList: new Int32Array(0),
		size: new Int32Array([1, 1, 0]),
		colors: provinces.colors.slice(),
		parent: new Int32Array([-1, -1, -1]),
		depth: new Int32Array([0, 0, 0]),
		childOffset: new Int32Array([0, 0, 0, 0]),
		childList: new Int32Array(0),
		sovereign: new Int32Array([0, 1, -1]),
		gravity: new Float32Array([5, 3, 0]),
	} as OrogenNationHierarchy
	const population: ProvincePopulation = {
		habitability: new Float32Array([10, 8, 0]),
		population: new Float32Array([120, 80, 0]),
		habitabilityScore: 18,
		totalPopulation: 200,
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		new Uint8Array([1, 0, 0]),
		new Uint8Array([0, 1, 0]),
		new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0]),
		{ assignment: new Int32Array([0, 1, 1]), count: 2 },
		120,
		createHistoryRng(17),
	)
}

function createIndirectConnectionState(): HistoryState {
	const provinces = {
		regionProvince: new Int32Array([0, 1, 2]),
		seeds: new Int32Array([0, 1, 2]),
		count: 3,
		desolate: new Uint8Array([0, 0, 0]),
		landmassId: new Int32Array([0, 0, 0]),
		adjOffset: new Int32Array([0, 1, 2, 4]),
		adjList: new Int32Array([2, 2, 0, 1]),
		size: new Int32Array([1, 1, 1]),
		colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
	} as OrogenProvinces
	const nations = {
		assignment: new Int32Array([0, 0, 0]),
		seeds: new Int32Array([0, 1, 2]),
		count: 3,
		adjOffset: new Int32Array([0, 0, 0, 0]),
		adjList: new Int32Array(0),
		size: new Int32Array([3, 0, 0]),
		colors: provinces.colors.slice(),
		parent: new Int32Array([-1, 0, 0]),
		depth: new Int32Array([0, 1, 1]),
		childOffset: new Int32Array([0, 2, 2, 2]),
		childList: new Int32Array([1, 2]),
		sovereign: new Int32Array([0, 0, 0]),
		gravity: new Float32Array([12, 7, 9]),
	} as OrogenNationHierarchy
	const population: ProvincePopulation = {
		habitability: new Float32Array([10, 8, 9]),
		population: new Float32Array([120, 70, 90]),
		habitabilityScore: 27,
		totalPopulation: 280,
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		new Uint8Array([1, 0, 0]),
		new Uint8Array([0, 0, 1]),
		new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0]),
		{ assignment: new Int32Array([0, 0, 0]), count: 1 },
		75,
		createHistoryRng(53),
	)
}

describe("history state helpers", () => {
	it("creates a live hierarchy view and derives nation/province neighbors", () => {
		const state = createTestState()

		expect(getSovereign(state, 1)).toBe(0)
		expect(isSovereign(state, 0)).toBe(true)
		expect(isSovereign(state, 1)).toBe(false)
		expect(getChildren(state, 0)).toEqual([1])
		expect(getNationProvinces(state, 0)).toEqual([0, 1])
		expect(getNationNeighbors(state, 0)).toEqual([2])
		expect(getProvinceNeighbors(state, 2)).toEqual([0, 1, 3])
		expect(Array.from(state.waterAccess)).toEqual([1, 1, 1, 0])
	})

	it("filters self and non-sovereign entries from cached nation adjacency", () => {
		const state = createTestState()
		ensureHierarchyClean(state)
		state._nationAdjCache = {
			offset: new Int32Array([0, 3, 3, 3, 3]),
			list: new Int32Array([0, 1, 2]),
		}
		state._nationAdjCacheVersion = state.hierarchyVersion

		expect(getNationNeighbors(state, 0)).toEqual([2])
	})

	it("tracks directional ruler relations", () => {
		const state = createTestState()

		setRelation(state, 2, 0, REL.PU_SENIOR)

		expect(getRelation(state, 0, 2)).toBe(REL.PU_SENIOR)
		expect(getRulerRelation(state, 0)).toEqual({
			ruler: 2,
			relation: REL.PU_SENIOR,
		})
	})

	it("returns no ruler relation when a nation has no overlord or union senior", () => {
		const state = createTestState()

		expect(getRulerRelation(state, 2)).toBeUndefined()
	})

	it("seeds startup subject and neighbor relations during diplomacy initialization", () => {
		const state = createTestState()

		initDiplomacy(state, createHistoryRng(23))

		expect(getRelation(state, 1, 0)).toBe(REL.OVERLORD)
		expect(getRelation(state, 0, 1)).toBe(REL.VASSAL)
		expect(getRelation(state, 0, 2)).not.toBe(REL.NONE)
		expect(getRelation(state, 0, 2)).not.toBe(REL.NEUTRAL)
	})

	it("can release provinces and break disconnected subject links into rebellions", () => {
		const state = createTestState()

		releaseProvince(state, 1, createHistoryRng(42))
		expect(getSovereign(state, 1)).toBe(1)
		expect(isSovereign(state, 1)).toBe(true)

		const disconnected = createTestState()
		fixConnections(disconnected, 0, createHistoryRng(42))

		expect(getSovereign(disconnected, 1)).toBe(1)
		expect(disconnected.events).toContainEqual(
			expect.objectContaining({
				tag: "rebellion",
				data: expect.objectContaining({
					overlord: 0,
					subject: 1,
					disconnected: true,
				}),
			}),
		)
	})

	it("provides time helpers and detects hierarchy cycles", () => {
		expect(deltaYear(2)).toBe(2 * YEAR_MS)
		expect(deltaMonth(6)).toBeGreaterThan(0)
		expect(diffYears(deltaYear(3), 0)).toBe(3)

		const state = createTestState()
		state.parentCurrent[0] = 1
		state.parentCurrent[1] = 0

		expect(() => validateLiveHierarchy(state, "cycle-test")).toThrow(
			/Parent cycle detected in cycle-test/,
		)
	})

	it("rebuilds child lists and sovereigns when hierarchy caches are dirty", () => {
		const state = createTestState()
		state.parentCurrent[2] = 1
		state.parentCurrent[3] = 2
		state.hierarchyDirty = true

		expect(getChildren(state, 0)).toEqual([1])
		expect(getChildren(state, 1)).toEqual([2])
		expect(getChildren(state, 2)).toEqual([3])
		expect(getSovereign(state, 3)).toBe(0)
		expect(state.hierarchyDirty).toBe(false)
	})

	it("rebuilds sovereigns through previously assigned parent chains", () => {
		const state = createTestState()
		state.parentCurrent[1] = 2
		state.parentCurrent[2] = 0
		state.hierarchyDirty = true

		expect(getSovereign(state, 2)).toBe(0)
		expect(getChildren(state, 0)).toEqual([2])
		expect(getChildren(state, 2)).toEqual([1])
	})

	it("adjusts war threat when offensive and defensive allies join a conflict", () => {
		const state = createTestState()
		releaseProvince(state, 1, createHistoryRng(42))
		const baseline = warThreat(state, 0, 2)

		setRelation(state, 1, 0, REL.VASSAL)
		const withAttackerAlly = warThreat(state, 0, 2)

		setRelation(state, 3, 2, REL.ALLY)
		const withDefenderAlly = warThreat(state, 0, 2)

		expect(withAttackerAlly).toBeLessThan(baseline)
		expect(withDefenderAlly).toBeGreaterThan(withAttackerAlly)
	})

	it("ignores subject and desolate nations when collecting war allies", () => {
		const subjectState = createTestState()
		const subjectBaseline = warThreat(subjectState, 0, 2)

		setRelation(subjectState, 0, 1, REL.VASSAL)
		expect(warThreat(subjectState, 0, 2)).toBe(subjectBaseline)

		const desolateState = createDesolateState()
		const desolateBaseline = warThreat(desolateState, 0, 1)

		setRelation(desolateState, 0, 2, REL.ALLY)
		expect(warThreat(desolateState, 0, 1)).toBe(desolateBaseline)
	})

	it("starts wars and resolves stalemates by clearing occupations and war bookkeeping", () => {
		const state = createTestState()
		const rng = createHistoryRng(23)

		startWar(state, 0, 2, rng)
		const war = state.wars[0]!

		expect(getRelation(state, 0, 2)).toBe(REL.WAR)
		expect(state.provinceWars[0]).toContain(war.idx)
		expect(state.provinceWars[2]).toContain(war.idx)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "war started",
				data: expect.objectContaining({
					attacker: 0,
					defender: 2,
					war: war.idx,
				}),
			}),
		)

		PROV.occupation.set(state, 2, state.time, war.idx)
		war.occupied.push(2)
		state.time += deltaMonth(2)

		resolveWar(state, war, rng, false, "white peace")

		expect(PROV.occupation.get(state, 2)).toBe(-1)
		expect(war.endTime).toBe(state.time)
		expect(war.occupied).toHaveLength(0)
		expect(state.provinceWars[0]).not.toContain(war.idx)
		expect(state.provinceWars[2]).not.toContain(war.idx)
		expect(getRelation(state, 0, 2)).toBe(REL.SUSPICIOUS)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "war ended",
				data: expect.objectContaining({
					war: war.idx,
					stalemate: "white peace",
					transferred: [2],
					winner: 0,
				}),
			}),
		)
	})

	it("cleans up wars even when a province war list already dropped the conflict", () => {
		const state = createTestState()
		const rng = createHistoryRng(31)

		startWar(state, 0, 2, rng)
		const war = state.wars[0]!
		state.provinceWars[2] = []
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, false)

		expect(state.provinceWars[0]).not.toContain(war.idx)
		expect(state.provinceWars[2]).toEqual([])
		expect(getRelation(state, 0, 2)).toBe(REL.SUSPICIOUS)
	})

	it("skips conflicted allies and lets defenders win empty wars", () => {
		const state = createTestState()
		const rng = createHistoryRng(37)
		releaseProvince(state, 1, rng)

		setRelation(state, 1, 0, REL.VASSAL)
		const threatWithEligibleAlly = warThreat(state, 0, 2)
		setRelation(state, 1, 2, REL.ALLY)

		expect(warThreat(state, 0, 2)).toBeGreaterThan(threatWithEligibleAlly)

		startWar(state, 0, 2, rng, true)
		const war = state.wars[0]!
		war.occupied.push(3)
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, false)

		expect(war.rebel).toBe(true)
		expect(PROV.occupation.get(state, 3)).toBe(-1)
		expect(getRelation(state, 0, 2)).toBe(REL.SUSPICIOUS)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "war ended",
				data: expect.objectContaining({
					war: war.idx,
					winner: 2,
					transferred: [],
				}),
			}),
		)
	})

	it("resolves victorious wars by absorbing territory and ending subject relations", () => {
		const state = createTestState()
		const rng = createHistoryRng(29)

		setRelation(state, 1, 2, REL.VASSAL)
		setRelation(state, 3, 2, REL.PU_JUNIOR)

		startWar(state, 0, 2, rng)
		const war = state.wars[0]!
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, true)

		expect(getSovereign(state, 2)).toBe(0)
		expect(getNationProvinces(state, 0)).toContain(2)
		expect(getRelation(state, 2, 1)).toBe(REL.NEUTRAL)
		expect(getRelation(state, 2, 3)).toBe(REL.NEUTRAL)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalage ended",
				data: expect.objectContaining({ vassal: 2, overlord: 1 }),
			}),
		)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union ended",
				data: expect.objectContaining({ junior: 2, senior: 3 }),
			}),
		)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "war ended",
				data: expect.objectContaining({ winner: 0, transferred: [2] }),
			}),
		)
	})

	it("clears occupied disconnected overlords and skips clean hierarchy rebuilds", () => {
		const state = createTestState()

		ensureHierarchyClean(state)
		const version = state.hierarchyVersion
		ensureHierarchyClean(state)
		expect(state.hierarchyVersion).toBe(version)

		PROV.occupation.set(state, 1, state.time, 7)
		fixConnections(state, 1, createHistoryRng(42))

		expect(PROV.occupation.get(state, 1)).toBe(-1)
		expect(getSovereign(state, 1)).toBe(1)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "rebellion",
				data: expect.objectContaining({
					overlord: 0,
					subject: 1,
					disconnected: true,
				}),
			}),
		)
	})

	it("treats stale child entries with released parents as already connected", () => {
		const state = createTestState()
		ensureHierarchyClean(state)

		PROV.parent.set(state, 1, state.time, -1)
		state.hierarchyDirty = false

		fixConnections(state, 0, createHistoryRng(42))

		expect(PROV.parent.get(state, 1)).toBe(-1)
		expect(state.events).toEqual([])
	})

	it("ends overlord and senior-union ties when a ruler is conquered", () => {
		const state = createTestState()
		const rng = createHistoryRng(41)

		setRelation(state, 1, 0, REL.VASSAL)
		setRelation(state, 3, 0, REL.PU_JUNIOR)

		startWar(state, 2, 0, rng)
		const war = state.wars[0]!
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, true)

		expect(getSovereign(state, 0)).toBe(2)
		expect(getRelation(state, 0, 1)).toBe(REL.NEUTRAL)
		expect(getRelation(state, 0, 3)).toBe(REL.NEUTRAL)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalage ended",
				data: expect.objectContaining({ vassal: 0, overlord: 1 }),
			}),
		)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union ended",
				data: expect.objectContaining({ junior: 0, senior: 3 }),
			}),
		)
	})

	it("ends senior-union ties when a conquered ruler was the union senior", () => {
		const state = createTestState()
		const rng = createHistoryRng(43)

		setRelation(state, 3, 0, REL.PU_SENIOR)

		startWar(state, 2, 0, rng)
		const war = state.wars[0]!
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, true)

		expect(getRelation(state, 0, 3)).toBe(REL.NEUTRAL)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union ended",
				data: expect.objectContaining({ junior: 3, senior: 0 }),
			}),
		)
	})

	it("ends overlord ties when a conquered ruler controlled subjects", () => {
		const state = createTestState()
		const rng = createHistoryRng(47)

		setRelation(state, 2, 1, REL.OVERLORD)
		setRelation(state, 2, 3, REL.PU_SENIOR)

		startWar(state, 0, 2, rng)
		const war = state.wars[0]!
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, true)

		expect(getRelation(state, 2, 1)).toBe(REL.NEUTRAL)
		expect(getRelation(state, 2, 3)).toBe(REL.NEUTRAL)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalage ended",
				data: expect.objectContaining({ vassal: 2, overlord: 1 }),
			}),
		)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union ended",
				data: expect.objectContaining({ junior: 2, senior: 3 }),
			}),
		)
	})

	it("ends outgoing overlord and senior-union ties for conquered rulers", () => {
		const state = createTestState()
		const rng = createHistoryRng(59)

		setRelation(state, 1, 2, REL.OVERLORD)
		setRelation(state, 3, 2, REL.PU_SENIOR)

		startWar(state, 0, 2, rng)
		const war = state.wars[0]!
		state.time += deltaMonth(1)

		resolveWar(state, war, rng, true)

		expect(getRelation(state, 2, 1)).toBe(REL.NEUTRAL)
		expect(getRelation(state, 2, 3)).toBe(REL.NEUTRAL)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "vassalage ended",
				data: expect.objectContaining({ vassal: 1, overlord: 2 }),
			}),
		)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union ended",
				data: expect.objectContaining({ junior: 3, senior: 2 }),
			}),
		)
	})

	it("measures squared distances between province seed coordinates", () => {
		const state = createTestState()

		expect(provinceDistanceSq(state, 0, 1)).toBe(2)
		expect(provinceDistanceSq(state, 0, 2)).toBe(4)
	})

	it("uses a fallback accession age when weighted choice cannot pick a leader age", () => {
		const state = createDesolateState()
		const fixedEnd = state.time + deltaYear(2)
		const rng = {
			random: () => 0.5,
			uniform: (_min: number, _max: number) => 0,
			randint: (_min: number, _max: number) => 0,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(_values: readonly { v: T; w: number }[]) =>
				undefined as T | undefined,
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		spawnLeader(state, 0, rng, fixedEnd)

		expect(state.leaderRuntime.end[0]).toBe(fixedEnd)
		expect(state.leaderRuntime.birth[0]).toBe(state.time - deltaYear(30))
	})

	it("keeps connected subjects and reuses dynasties across duplicate shuffle entries", () => {
		const connected = createIndirectConnectionState()
		connected.events = []

		fixConnections(connected, 0, createHistoryRng(42))

		expect(getSovereign(connected, 1)).toBe(0)
		expect(connected.events).toEqual([])

		const provinces = {
			regionProvince: new Int32Array([-1, 0, 1, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			desolate: new Uint8Array([0, 0, 0]),
			landmassId: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 1, 3, 4]),
			adjList: new Int32Array([1, 0, 2, 1]),
			size: new Int32Array([1, 1, 1]),
			colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
		} as OrogenProvinces
		const nations = {
			assignment: new Int32Array([0, 1, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			adjOffset: new Int32Array([0, 0, 0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([2, 1, 1]),
			colors: provinces.colors.slice(),
			parent: new Int32Array([-1, 0, -1]),
			depth: new Int32Array([0, 1, 0]),
			childOffset: new Int32Array([0, 1, 1, 1]),
			childList: new Int32Array([1]),
			sovereign: new Int32Array([0, 0, 2]),
			gravity: new Float32Array([8, 7, 6]),
		} as OrogenNationHierarchy
		const population: ProvincePopulation = {
			habitability: new Float32Array([9, 8, 7]),
			population: new Float32Array([90, 80, 70]),
			habitabilityScore: 24,
			totalPopulation: 240,
		}
		const randomValues = [0.3, 0.01]
		const rng = {
			random: () => randomValues.shift() ?? 0.99,
			uniform: (min: number, max: number) => (min + max) / 2,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) =>
				values[2]?.v ?? values[0]!.v,
			shuffle: <T>(_values: readonly T[]) => [0, 1, 1, 2] as T[],
		}

		const dynastyState = createHistoryState(
			nations,
			provinces,
			population,
			new Uint8Array([1, 1, 0, 0]),
			new Uint8Array([1, 0, 1, 0]),
			new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0]),
			{ assignment: new Int32Array([0, 0, 1]), count: 2 },
			150,
			rng,
		)

		expect(Array.from(dynastyState.waterAccess)).toEqual([1, 1, 0])
		expect(PROV.leader.dynasty.get(dynastyState, 0)).toBe(
			PROV.leader.dynasty.get(dynastyState, 1),
		)
		expect(PROV.leader.dynasty.get(dynastyState, 2)).toBe(
			PROV.leader.dynasty.get(dynastyState, 1),
		)
		const dynastySpreadEvents = dynastyState.events.filter(
			(event) => event.tag === "dynasty spread",
		)
		expect(dynastySpreadEvents).toHaveLength(1)
		expect(dynastySpreadEvents[0]).toMatchObject({
			tag: "dynasty spread",
			data: { nation: 2, source: 0 },
		})
	})

	it("does not log dynasty spread for subject-level successions", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		PROV.leader.dynasty.set(state, 0, state.time, 7)
		PROV.leader.dynasty.set(state, 1, state.time, 3)
		PROV.leader.claim.set(state, 1, state.time, 0)
		const leaderIdx = state.leaderRuntime.idx[1]
		const rng = {
			random: () => 0,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) =>
				values[1]?.v ?? values[0]!.v,
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 1, leaderIdx, rng)

		expect(PROV.leader.dynasty.get(state, 1)).toBe(3)
		expect(state.events.some((event) => event.tag === "dynasty spread")).toBe(
			false,
		)
	})

	it("does not log dynasty spread when a sovereign inherits from its own realm", () => {
		const provinces = {
			regionProvince: new Int32Array([0, 1, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			desolate: new Uint8Array([0, 0, 0]),
			landmassId: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 1, 2, 3]),
			adjList: new Int32Array([1, 2, 1]),
			size: new Int32Array([1, 1, 1]),
			colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
		} as OrogenProvinces
		const nations = {
			assignment: new Int32Array([0, 2, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			adjOffset: new Int32Array([0, 0, 0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([1, 0, 2]),
			colors: provinces.colors.slice(),
			parent: new Int32Array([-1, 2, -1]),
			depth: new Int32Array([0, 1, 0]),
			childOffset: new Int32Array([0, 0, 0, 1]),
			childList: new Int32Array([1]),
			sovereign: new Int32Array([0, 2, 2]),
			gravity: new Float32Array([9, 7, 8]),
		} as OrogenNationHierarchy
		const population: ProvincePopulation = {
			habitability: new Float32Array([9, 8, 7]),
			population: new Float32Array([90, 80, 70]),
			habitabilityScore: 24,
			totalPopulation: 240,
		}
		const randomValues = [0.3, 0.3]
		const rng = {
			random: () => randomValues.shift() ?? 0.99,
			uniform: (min: number, max: number) => (min + max) / 2,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) =>
				values[2]?.v ?? values[0]!.v,
			shuffle: <T>(_values: readonly T[]) => [0, 1, 2] as T[],
		}

		const dynastyState = createHistoryState(
			nations,
			provinces,
			population,
			new Uint8Array([1, 1, 1, 0]),
			new Uint8Array([1, 1, 1, 0]),
			new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
			{ assignment: new Int32Array([0, 0, 0]), count: 1 },
			150,
			rng,
		)

		const dynastySpreadEvents = dynastyState.events.filter(
			(event) => event.tag === "dynasty spread",
		)
		expect(PROV.leader.dynasty.get(dynastyState, 2)).toBe(
			PROV.leader.dynasty.get(dynastyState, 1),
		)
		expect(dynastySpreadEvents).toHaveLength(0)
	})

	it("logs dynasty spread when a sovereign adopts a foreign dynasty on succession", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		setRelation(state, 2, 0, REL.FRIENDLY)
		PROV.leader.dynasty.set(state, 0, state.time, 7)
		PROV.leader.dynasty.set(state, 2, state.time, 3)
		const leaderIdx = state.leaderRuntime.idx[2]
		let weightedChoiceCalls = 0
		const rng = {
			random: () => 0,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) => {
				weightedChoiceCalls++
				return weightedChoiceCalls === 1
					? (values[2]?.v ?? values[0]!.v)
					: (values[1]?.v ?? values[0]!.v)
			},
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 2, leaderIdx, rng)

		expect(PROV.leader.dynasty.get(state, 2)).toBe(7)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "dynasty spread",
				data: expect.objectContaining({
					nation: 2,
					source: 0,
					dynasty: 7,
					previousDynasty: 3,
				}),
			}),
		)
	})

	it("forms personal unions for sovereign successions that keep a shared dynasty", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		setRelation(state, 2, 3, REL.FRIENDLY)
		setRelation(state, 2, 0, REL.SUSPICIOUS)
		PROV.leader.dynasty.set(state, 2, state.time, 7)
		PROV.leader.dynasty.set(state, 3, state.time, 7)
		const leaderIdx = state.leaderRuntime.idx[2]
		let weightedChoiceCalls = 0
		const rng = {
			random: () => 0,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) => {
				weightedChoiceCalls++
				return weightedChoiceCalls === 1
					? (values[2]?.v ?? values[0]!.v)
					: (values[1]?.v ?? values[0]!.v)
			},
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 2, leaderIdx, rng)

		expect(getRelation(state, 2, 3)).toBe(REL.PU_SENIOR)
		expect(getRulerRelation(state, 2)).toEqual({
			ruler: 3,
			relation: REL.PU_SENIOR,
		})
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "personal union formed",
				data: { junior: 2, senior: 3 },
			}),
		)
	})

	it("starts a regency when a sovereign successor is underage", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		const leaderIdx = state.leaderRuntime.idx[0]
		let weightedChoiceCalls = 0
		const rng = {
			random: () => 1,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) => {
				weightedChoiceCalls++
				return weightedChoiceCalls === 1
					? (values[0]?.v ?? values[0]!.v)
					: (values[3]?.v ?? values[0]!.v)
			},
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 0, leaderIdx, rng)

		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "regency started",
				data: expect.objectContaining({ nation: 0 }),
			}),
		)
	})

	it("starts a new dynasty on succession when no heir candidates exist", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		PROV.leader.dynasty.set(state, 3, state.time, 4)
		// Set all neighbors to SUSPICIOUS so no qualifying candidates exist
		setRelation(state, 3, 2, REL.SUSPICIOUS)
		const leaderIdx = state.leaderRuntime.idx[3]
		const nextDynasty = state.nextDynasty
		let weightedChoiceCalls = 0
		const rng = {
			random: () => 0,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) => {
				weightedChoiceCalls++
				return weightedChoiceCalls === 1
					? (values[2]?.v ?? values[0]!.v)
					: (values[0]?.v ?? values[0]!.v)
			},
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 3, leaderIdx, rng)

		expect(PROV.leader.dynasty.get(state, 3)).toBe(nextDynasty)
		expect(state.nextDynasty).toBe(nextDynasty + 1)
	})

	it("can trigger succession rebellions from sovereign subjects", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		const leaderIdx = state.leaderRuntime.idx[0]
		const randomValues = [0, 1]
		let weightedChoiceCalls = 0
		const rng = {
			random: () => randomValues.shift() ?? 1,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) => {
				weightedChoiceCalls++
				return weightedChoiceCalls === 1
					? (values[2]?.v ?? values[0]!.v)
					: (values[3]?.v ?? values[0]!.v)
			},
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 0, leaderIdx, rng)

		expect(getSovereign(state, 1)).toBe(1)
		expect(state.events).toContainEqual(
			expect.objectContaining({
				tag: "rebellion",
				data: { overlord: 0, subject: 1, succession: true },
			}),
		)
	})

	it("silently skips succession for subject provinces (sovereign-only guard)", () => {
		const state = createTestState()
		state.events = []
		state.time += deltaMonth(1)
		PROV.leader.dynasty.set(state, 0, state.time, 7)
		PROV.leader.dynasty.set(state, 1, state.time, 3)
		const leaderIdx = state.leaderRuntime.idx[1]
		const nextDynasty = state.nextDynasty
		let weightedChoiceCalls = 0
		const rng = {
			random: () => 0.96,
			uniform: (min: number, _max: number) => min,
			randint: (min: number, _max: number) => min,
			choice: <T>(values: readonly T[]) => values[0]!,
			weightedChoice: <T>(values: readonly { v: T; w: number }[]) => {
				weightedChoiceCalls++
				return weightedChoiceCalls === 1
					? (values[2]?.v ?? values[0]!.v)
					: (values[0]?.v ?? values[0]!.v)
			},
			shuffle: <T>(values: readonly T[]) => [...values],
		}

		runSuccession(state, 1, leaderIdx, rng)

		// Vassal succession is now a no-op: dynasty and nextDynasty stay unchanged
		expect(PROV.leader.dynasty.get(state, 1)).toBe(3)
		expect(state.nextDynasty).toBe(nextDynasty)
		expect(state.events.some((event) => event.tag === "dynasty spread")).toBe(
			false,
		)
	})

	it("schedules succession events for living rulers", () => {
		const state = createTestState()

		initSuccession(state, createHistoryRng(23))

		expect(state.heap.size).toBe(3)
		expect(state.heap.peekType()).toBe(EVT.SUCCESSION)
	})

	it("initializes desolate history states and can respawn leaders with a fixed end date", () => {
		const state = createDesolateState()

		expect(Array.from(state.waterAccess)).toEqual([1, 1, 0])
		expect(PROV.parent.get(state, 0)).toBe(-1)
		expect(PROV.assignment.get(state, 0)).toBe(0)
		expect(PROV.assignment.get(state, 1)).toBe(1)
		expect(PROV.assignment.get(state, 2)).toBe(-1)
		expect(PROV.population.rural.get(state, 0)).toBeCloseTo(114)
		expect(PROV.population.urban.get(state, 0)).toBeCloseTo(6)
		expect(PROV.occupation.get(state, 1)).toBe(-1)
		expect(state.leaderDynCurrent[0]).toBeGreaterThanOrEqual(0)
		expect(state.leaderDynCurrent[1]).toBeGreaterThanOrEqual(0)
		expect(state.leaderDynCurrent[2]).toBe(-1)
		expect(state.leaderNameSeedCurrent[0]).toBeGreaterThan(0)
		expect(state.leaderNameSeedCurrent[1]).toBeGreaterThan(0)
		expect(state.leaderNameSeedCurrent[2]).toBe(-1)

		const fixedEnd = state.time + deltaYear(5)
		const initialIndex = state.leaderRuntime.idx[0]
		spawnLeader(state, 0, createHistoryRng(31), fixedEnd)

		expect(state.leaderRuntime.idx[0]).toBe(initialIndex + 1)
		expect(state.leaderRuntime.end[0]).toBe(fixedEnd)
		expect(state.leaderRuntime.birth[0]).toBeLessThan(state.time)
		expect(state.leaderRuntime.nameSeed[0]).toBeGreaterThan(0)
		expect(PROV.leader.nameSeed.get(state, 0)).toBe(
			state.leaderRuntime.nameSeed[0],
		)
		expect(PROV.leader.claim.get(state, 0)).toBe(3)
		expect(PROV.leader.birthYear.get(state, 0)).toBeGreaterThan(0)
	})
})
