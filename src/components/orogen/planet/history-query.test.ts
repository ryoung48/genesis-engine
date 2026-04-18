import { describe, expect, it } from "vitest"
import type {
	SerializedOrogenWorld,
	SerializedTimelines,
} from "@/model/orogen/worker-types"
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
})
