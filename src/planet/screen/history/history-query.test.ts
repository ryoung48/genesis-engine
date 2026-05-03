import { describe, expect, it } from "vitest"
import type {
	SerializedOrogenWorld,
	SerializedTimelines,
} from "@/model/transport/worker-types"
import { createHistoryQuery, type TimelineBundle } from "./history-query"

function makeProvinceTimelineInt(
	valuesByProvince: number[][],
): SerializedTimelines["assignment"] {
	const offsets = new Int32Array(valuesByProvince.length + 1)
	const times: number[] = []
	const values: number[] = []
	let cursor = 0
	for (let province = 0; province < valuesByProvince.length; province++) {
		offsets[province] = cursor
		for (let step = 0; step < valuesByProvince[province].length; step++) {
			times.push(step * 10)
			values.push(valuesByProvince[province][step])
			cursor++
		}
	}
	offsets[valuesByProvince.length] = cursor
	return {
		times: new Float64Array(times),
		values: new Int32Array(values),
		offsets,
	}
}

function makeProvinceTimelineFloat(
	valuesByProvince: number[][],
): SerializedTimelines["populationRural"] {
	const offsets = new Int32Array(valuesByProvince.length + 1)
	const times: number[] = []
	const values: number[] = []
	let cursor = 0
	for (let province = 0; province < valuesByProvince.length; province++) {
		offsets[province] = cursor
		for (let step = 0; step < valuesByProvince[province].length; step++) {
			times.push(step * 10)
			values.push(valuesByProvince[province][step])
			cursor++
		}
	}
	offsets[valuesByProvince.length] = cursor
	return {
		times: new Float64Array(times),
		values: new Float32Array(values),
		offsets,
	}
}

describe("createHistoryQuery", () => {
	it("returns immutable snapshots across time queries", () => {
		const timelines: SerializedTimelines = {
			P: 2,
			startTimeMs: 0,
			endTimeMs: 10,
			parent: makeProvinceTimelineInt([[-1], [-1]]),
			assignment: makeProvinceTimelineInt([
				[0, 1],
				[1, 0],
			]),
			populationRural: makeProvinceTimelineFloat([[9], [19]]),
			populationUrban: makeProvinceTimelineFloat([[1], [2]]),
			development: makeProvinceTimelineFloat([[0.5], [0.75]]),
			consumption: makeProvinceTimelineFloat([[0.2], [0.3]]),
			leaderDynasty: makeProvinceTimelineInt([[0], [0]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0]]),
			occupation: makeProvinceTimelineInt([[-1], [-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0, 1]),
			nationColorValues: new Float32Array([1, 0, 0, 0, 1, 0]),
			wars: [],
		}
		const bundle: TimelineBundle = { timelines, events: [] }
		const world = {
			provinces: {
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
			},
			population: {
				habitability: new Float32Array([0.5, 0.6]),
			},
		} as unknown as SerializedOrogenWorld

		const query = createHistoryQuery(bundle, world)
		const before = query.getView(0)
		const beforeAssignment = Array.from(before.assignment)
		const beforePopulation = Array.from(before.populationTotal)

		const after = query.getView(10)

		expect(Array.from(before.assignment)).toEqual(beforeAssignment)
		expect(Array.from(before.populationTotal)).toEqual(beforePopulation)
		expect(Array.from(after.assignment)).toEqual([1, 0])
		expect(before.assignment).not.toBe(after.assignment)
		expect(before.activeWars).not.toBe(after.activeWars)
	})

	it("caches identical views and filters relations, wars, and events at timeline boundaries", () => {
		const timelines: SerializedTimelines = {
			P: 3,
			startTimeMs: 0,
			endTimeMs: 30,
			parent: makeProvinceTimelineInt([[-1], [0], [-1]]),
			assignment: makeProvinceTimelineInt([[0], [0], [2]]),
			populationRural: makeProvinceTimelineFloat([[5], [4], [6]]),
			populationUrban: makeProvinceTimelineFloat([[1], [2], [3]]),
			development: makeProvinceTimelineFloat([[0.5], [0.25], [0.75]]),
			consumption: makeProvinceTimelineFloat([[0.1], [0.2], [0.4]]),
			leaderDynasty: makeProvinceTimelineInt([[0], [0], [0]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0], [0]]),
			occupation: makeProvinceTimelineInt([[-1], [7], [-1]]),
			relations: {
				aIdx: new Int32Array([0]),
				bIdx: new Int32Array([2]),
				offsets: new Int32Array([0, 2]),
				times: new Float64Array([0, 20]),
				values: new Int32Array([3, 9]),
			},
			nationColorKeys: new Int32Array([0, 2]),
			nationColorValues: new Float32Array([1, 0, 0, 0, 0, 1]),
			wars: [
				{
					idx: 7,
					attacker: 0,
					defender: 2,
					rebel: false,
					startTime: 10,
					endTime: 20,
				},
				{
					idx: 8,
					attacker: 2,
					defender: 0,
					rebel: true,
					startTime: 0,
					endTime: 10,
				},
			],
		}
		const bundle: TimelineBundle = {
			timelines,
			events: [
				{ time: 30, kind: "war" } as never,
				{ time: 10, kind: "peace" } as never,
				{ time: 20, kind: "trade" } as never,
			],
		}
		const world = {
			provinces: {
				adjOffset: new Int32Array([0, 2, 3, 4]),
				adjList: new Int32Array([1, 2, 0, 0]),
			},
			population: {
				habitability: new Float32Array([1, 0.8, 1.2]),
			},
		} as unknown as SerializedOrogenWorld

		const query = createHistoryQuery(bundle, world)
		const atTen = query.getView(10)
		const atTenCached = query.getView(10)
		const atTwenty = query.getView(20)

		expect(atTenCached).toBe(atTen)
		expect(atTen.activeWars).toEqual([
			{
				idx: 7,
				attacker: 0,
				defender: 2,
				rebel: false,
				occupied: [1],
			},
		])
		expect(atTen.relationAt(0, 2)).toBe(3)
		expect(atTwenty.relationAt(0, 2)).toBe(9)
		expect(atTen.relationAt(2, 0)).toBe(7)
		expect(atTen.adjOffset[3]).toBe(atTen.adjList.length)
		expect(Array.from(atTen.sovereign)).toEqual([0, 0, 2])
		expect(query.getEventsInRange(10, 20).map((event) => event.time)).toEqual([
			10, 20,
		])
		expect(query.getEventsUntil(20).map((event) => event.time)).toEqual([
			10, 20,
		])
	})

	it("handles missing adjacency, colors, and habitability with zeroed fallbacks", () => {
		const timelines: SerializedTimelines = {
			P: 2,
			startTimeMs: 0,
			endTimeMs: 10,
			parent: makeProvinceTimelineInt([[-1], [-1]]),
			assignment: makeProvinceTimelineInt([[0], [-1]]),
			populationRural: makeProvinceTimelineFloat([[0], [0]]),
			populationUrban: makeProvinceTimelineFloat([[0], [0]]),
			development: makeProvinceTimelineFloat([[0], [0]]),
			consumption: makeProvinceTimelineFloat([[0], [0]]),
			leaderDynasty: makeProvinceTimelineInt([[0], [0]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0]]),
			occupation: makeProvinceTimelineInt([[-1], [-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array(),
			nationColorValues: new Float32Array(),
			wars: [],
		}

		const query = createHistoryQuery({ timelines, events: [] }, {
			provinces: undefined,
			population: undefined,
		} as unknown as SerializedOrogenWorld)
		const view = query.getView(0)

		expect(Array.from(view.colors)).toEqual([0, 0, 0, 0, 0, 0])
		expect(Array.from(view.adjOffset)).toEqual([0, 0, 0])
		expect(Array.from(view.adjList)).toEqual([])
		expect(Array.from(view.nationWealth)).toEqual([0, 0])
		expect(Array.from(view.nationOptimalWealth)).toEqual([0, 0])
		expect(view.totalPopulation).toBe(0)
	})

	it("applies hierarchy scaling to nation wealth and keeps open-ended wars active", () => {
		const timelines: SerializedTimelines = {
			P: 5,
			startTimeMs: 0,
			endTimeMs: 10,
			parent: makeProvinceTimelineInt([[-1], [0], [0], [0], [0]]),
			assignment: makeProvinceTimelineInt([[0], [1], [2], [3], [4]]),
			populationRural: makeProvinceTimelineFloat([[1], [1], [1], [1], [1]]),
			populationUrban: makeProvinceTimelineFloat([[0], [0], [0], [0], [0]]),
			development: makeProvinceTimelineFloat([[0], [0], [0], [0], [0]]),
			consumption: makeProvinceTimelineFloat([[0], [0], [0], [0], [0]]),
			leaderDynasty: makeProvinceTimelineInt([[0], [0], [0], [0], [0]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0], [0], [0], [0]]),
			occupation: makeProvinceTimelineInt([[-1], [11], [-1], [-1], [-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0, 1, 2, 3, 4]),
			nationColorValues: new Float32Array([
				1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1,
			]),
			wars: [
				{
					idx: 11,
					attacker: 0,
					defender: 1,
					rebel: false,
					startTime: 0,
				},
			],
		}
		const world = {
			provinces: {
				adjOffset: new Int32Array([0, 1, 2, 3, 4, 4]),
				adjList: new Int32Array([1, 0, 0, 0]),
			},
			population: {
				habitability: new Float32Array([10, 4, 4, 4, 4]),
			},
		} as unknown as SerializedOrogenWorld

		const view = createHistoryQuery({ timelines, events: [] }, world).getView(0)

		expect(view.sovereignCount).toBe(1)
		expect(view.nationOptimalWealth[0]).toBeCloseTo(12.6, 5)
		expect(view.nationWealth[0]).toBeCloseTo(13, 5)
		expect(view.activeWars).toEqual([
			{
				idx: 11,
				attacker: 0,
				defender: 1,
				rebel: false,
				occupied: [1],
			},
		])
	})

	it("skips unassigned adjacency edges and falls back to empty occupation groups", () => {
		const timelines: SerializedTimelines = {
			P: 2,
			startTimeMs: 0,
			endTimeMs: 10,
			parent: makeProvinceTimelineInt([[-1], [-1]]),
			assignment: makeProvinceTimelineInt([[0], [-1]]),
			populationRural: makeProvinceTimelineFloat([[1], [2]]),
			populationUrban: makeProvinceTimelineFloat([[0], [0]]),
			development: makeProvinceTimelineFloat([[0], [0]]),
			consumption: makeProvinceTimelineFloat([[0], [0]]),
			leaderDynasty: makeProvinceTimelineInt([[0], [0]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0]]),
			occupation: makeProvinceTimelineInt([[-1], [-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0]),
			nationColorValues: new Float32Array([1, 0, 0]),
			wars: [
				{
					idx: 99,
					attacker: 0,
					defender: 1,
					rebel: false,
					startTime: 0,
				},
			],
		}
		const world = {
			provinces: {
				adjOffset: new Int32Array([0, 1, 1]),
				adjList: new Int32Array([1]),
			},
			population: {
				habitability: new Float32Array([1, 1]),
			},
		} as unknown as SerializedOrogenWorld

		const view = createHistoryQuery({ timelines, events: [] }, world).getView(0)

		expect(Array.from(view.adjOffset)).toEqual([0, 0, 0])
		expect(Array.from(view.adjList)).toEqual([])
		expect(view.activeWars).toEqual([
			{
				idx: 99,
				attacker: 0,
				defender: 1,
				rebel: false,
				occupied: [],
			},
		])
	})
})
