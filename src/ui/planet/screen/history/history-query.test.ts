import { describe, expect, it } from "vitest"
import { REL } from "@/model/history/state"
import type {
	SerializedGenesisWorld,
	SerializedProvinceTimelineFloat,
	SerializedProvinceTimelineInt,
	SerializedTimelines,
} from "@/model/transport/worker-types"
import {
	buildDisplayNationModel,
	buildDisplayWorld,
	buildHistoryChildrenIndex,
} from "../display/display-model"
import {
	createHistoryQuery,
	readHistoryQueryBenchmark,
	type TimelineBundle,
} from "./history-query"

const BENCH_ENV =
	(globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env ?? {}

function makeProvinceTimelineInt(
	valuesByProvince: number[][],
	stepMs = 10,
): SerializedProvinceTimelineInt {
	const offsets = new Int32Array(valuesByProvince.length + 1)
	const times: number[] = []
	const values: number[] = []
	let cursor = 0
	for (let province = 0; province < valuesByProvince.length; province++) {
		offsets[province] = cursor
		for (let step = 0; step < valuesByProvince[province].length; step++) {
			times.push(step * stepMs)
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
	stepMs = 10,
): SerializedProvinceTimelineFloat {
	const offsets = new Int32Array(valuesByProvince.length + 1)
	const times: number[] = []
	const values: number[] = []
	let cursor = 0
	for (let province = 0; province < valuesByProvince.length; province++) {
		offsets[province] = cursor
		for (let step = 0; step < valuesByProvince[province].length; step++) {
			times.push(step * stepMs)
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

function makeBenchmarkTimelineInt(params: {
	provinceCount: number
	sampleCount: number
	getValue: (province: number, sample: number) => number
	stepMs?: number
}): SerializedProvinceTimelineInt {
	const { provinceCount, sampleCount, getValue, stepMs = 10 } = params
	const offsets = new Int32Array(provinceCount + 1)
	const total = provinceCount * sampleCount
	const times = new Float64Array(total)
	const values = new Int32Array(total)
	let cursor = 0
	for (let province = 0; province < provinceCount; province++) {
		offsets[province] = cursor
		for (let sample = 0; sample < sampleCount; sample++) {
			times[cursor] = sample * stepMs
			values[cursor] = getValue(province, sample)
			cursor++
		}
	}
	offsets[provinceCount] = cursor
	return { times, values, offsets }
}

function makeBenchmarkTimelineFloat(params: {
	provinceCount: number
	sampleCount: number
	getValue: (province: number, sample: number) => number
	stepMs?: number
}): SerializedProvinceTimelineFloat {
	const { provinceCount, sampleCount, getValue, stepMs = 10 } = params
	const offsets = new Int32Array(provinceCount + 1)
	const total = provinceCount * sampleCount
	const times = new Float64Array(total)
	const values = new Float32Array(total)
	let cursor = 0
	for (let province = 0; province < provinceCount; province++) {
		offsets[province] = cursor
		for (let sample = 0; sample < sampleCount; sample++) {
			times[cursor] = sample * stepMs
			values[cursor] = getValue(province, sample)
			cursor++
		}
	}
	offsets[provinceCount] = cursor
	return { times, values, offsets }
}

function makeBenchmarkFixture(params: {
	provinceCount: number
	sampleCount: number
}): {
	bundle: TimelineBundle
	world: SerializedGenesisWorld
	sampleTimes: number[]
	trackedNationIds: number[]
} {
	const { provinceCount, sampleCount } = params
	const groupSize = 4
	const rootCount = Math.ceil(provinceCount / groupSize)
	const rootIdAt = (province: number) =>
		Math.floor(province / groupSize) * groupSize
	const sampleTimes = Array.from(
		{ length: sampleCount },
		(_, index) => index * 10,
	)

	const timelines: SerializedTimelines = {
		P: provinceCount,
		startTimeMs: sampleTimes[0] ?? 0,
		endTimeMs: sampleTimes[sampleTimes.length - 1] ?? 0,
		parent: makeBenchmarkTimelineInt({
			provinceCount,
			sampleCount,
			getValue: (province, sample) => {
				const root = rootIdAt(province)
				if (province === root) {
					return root > 0 &&
						sample >= Math.floor(sampleCount / 2) &&
						root % 28 === 0
						? root - groupSize
						: -1
				}
				return root
			},
		}),
		assignment: makeBenchmarkTimelineInt({
			provinceCount,
			sampleCount,
			getValue: (province, sample) => {
				const root = rootIdAt(province)
				return (province + sample) % 17 === 0
					? Math.max(0, root - groupSize)
					: root
			},
		}),
		populationRural: makeBenchmarkTimelineFloat({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				20 + ((province % 19) * 0.5 + sample * 0.75),
		}),
		populationUrban: makeBenchmarkTimelineFloat({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				4 + ((province % 7) * 0.2 + sample * 0.25),
		}),
		development: makeBenchmarkTimelineFloat({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				0.1 + (province % 11) * 0.01 + sample * 0.005,
		}),
		consumption: makeBenchmarkTimelineFloat({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				0.25 + (province % 5) * 0.03 + sample * 0.01,
		}),
		leaderDynasty: makeBenchmarkTimelineInt({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				province % groupSize === 0 ? (province / groupSize + sample) % 97 : -1,
		}),
		leaderNameSeed: makeBenchmarkTimelineInt({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				province % groupSize === 0 ? province * 3 + sample : -1,
		}),
		leaderClaim: makeBenchmarkTimelineInt({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				province % groupSize === 0 ? sample % 4 : 0,
		}),
		leaderBirthYear: makeBenchmarkTimelineFloat({
			provinceCount,
			sampleCount,
			getValue: (province, sample) =>
				province % groupSize === 0 ? 100 + province * 0.01 + sample : -1,
		}),
		occupation: makeBenchmarkTimelineInt({
			provinceCount,
			sampleCount,
			getValue: (province, sample) => {
				if (sample < 5 || sample > 12) return -1
				const root = rootIdAt(province)
				return root % 64 === 0 ? 5000 + (root % 3) : -1
			},
		}),
		relations: {
			aIdx: new Int32Array([0, groupSize * 8]),
			bIdx: new Int32Array([groupSize * 8, groupSize * 16]),
			offsets: new Int32Array([0, 2, 4]),
			times: new Float64Array([0, 60, 0, 90]),
			values: new Int32Array([REL.FRIENDLY, REL.ALLY, REL.NEUTRAL, REL.RIVAL]),
		},
		nationColorKeys: Int32Array.from(
			{ length: provinceCount },
			(_, province) => province,
		),
		nationColorValues: Float32Array.from(
			Array.from({ length: provinceCount * 3 }, (_, index) => {
				const province = Math.floor(index / 3)
				const channel = index % 3
				return ((province * (channel + 3)) % 255) / 255
			}),
		),
		wars: [
			{
				idx: 5000,
				attacker: 0,
				defender: groupSize * 8,
				rebel: false,
				startTime: 50,
				endTime: 130,
			},
			{
				idx: 5001,
				attacker: groupSize * 16,
				defender: groupSize * 24,
				rebel: true,
				startTime: 50,
				endTime: 130,
			},
			{
				idx: 5002,
				attacker: groupSize * 32,
				defender: groupSize * 40,
				rebel: false,
				startTime: 50,
				endTime: 130,
			},
		],
		cultureBlendSecondary: makeProvinceTimelineInt([]),
		cultureBlendWeight: makeProvinceTimelineFloat([]),
	}

	const adjOffset = new Int32Array(provinceCount + 1)
	const adjacency: number[] = []
	for (let province = 0; province < provinceCount; province++) {
		adjOffset[province] = adjacency.length
		if (province > 0) adjacency.push(province - 1)
		if (province + 1 < provinceCount) adjacency.push(province + 1)
		if (province + groupSize < provinceCount)
			adjacency.push(province + groupSize)
	}
	adjOffset[provinceCount] = adjacency.length

	const world = {
		provinces: {
			count: provinceCount,
			adjOffset,
			adjList: Int32Array.from(adjacency),
		},
		population: {
			habitability: Float32Array.from(
				{ length: provinceCount },
				(_, province) => 1 + (province % 13) * 0.2,
			),
			population: new Float32Array(provinceCount),
			habitabilityScore: 0,
			totalPopulation: 0,
		},
		nations: {
			assignment: Int32Array.from(
				{ length: provinceCount },
				(_, province) => province,
			),
			seeds: Int32Array.from(
				{ length: rootCount },
				(_, index) => index * groupSize,
			),
			sovereign: Int32Array.from(
				{ length: provinceCount },
				(_, province) => province,
			),
			parent: new Int32Array(provinceCount).fill(-1),
			childOffset: new Int32Array(provinceCount + 1),
			childList: new Int32Array(0),
			colors: timelines.nationColorValues,
			size: new Int32Array(provinceCount),
			adjOffset: new Int32Array(provinceCount + 1),
			adjList: new Int32Array(0),
		},
	} as unknown as SerializedGenesisWorld

	return {
		bundle: { timelines, events: [] },
		world,
		sampleTimes,
		trackedNationIds: Array.from(
			{ length: Math.min(rootCount, 128) },
			(_, index) => index * groupSize,
		),
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
			leaderDynasty: makeProvinceTimelineInt([[4], [5]]),
			leaderNameSeed: makeProvinceTimelineInt([[40], [50]]),
			leaderClaim: makeProvinceTimelineInt([[1], [2]]),
			leaderBirthYear: makeProvinceTimelineFloat([[100], [120]]),
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
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
		}
		const bundle: TimelineBundle = { timelines, events: [] }
		const world = {
			provinces: {
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
			},
			population: {
				habitability: new Float32Array([0.5, 0.6]),
			},
		} as unknown as SerializedGenesisWorld

		const query = createHistoryQuery(bundle, world)
		const before = query.getView(0)
		const beforeAssignment = Array.from(before.assignment)
		const beforePopulation = Array.from(before.populationTotal)
		const beforeWealth = before.getNationWealth(0)

		const after = query.getView(10)

		expect(Array.from(before.assignment)).toEqual(beforeAssignment)
		expect(Array.from(before.populationTotal)).toEqual(beforePopulation)
		expect(before.getNationWealth(0)).toBe(beforeWealth)
		expect(Array.from(after.assignment)).toEqual([1, 0])
		expect(Array.from(before.leaderNameSeed)).toEqual([40, 50])
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
			leaderDynasty: makeProvinceTimelineInt([[7], [-1], [8]]),
			leaderNameSeed: makeProvinceTimelineInt([[70], [-1], [80]]),
			leaderClaim: makeProvinceTimelineInt([[2], [0], [1]]),
			leaderBirthYear: makeProvinceTimelineFloat([[100], [-1], [120]]),
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
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
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
				count: 3,
				adjOffset: new Int32Array([0, 2, 3, 4]),
				adjList: new Int32Array([1, 2, 0, 0]),
			},
			population: {
				habitability: new Float32Array([1, 0.8, 1.2]),
			},
		} as unknown as SerializedGenesisWorld

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
		expect(atTen.relationAt(2, 0)).toBe(REL.NEUTRAL)
		expect(Array.from(atTen.sovereign)).toEqual([0, 0, 2])
		expect(query.getEventsInRange(10, 20).map((event) => event.time)).toEqual([
			10, 20,
		])
		expect(query.getEventsUntil(20).map((event) => event.time)).toEqual([
			10, 20,
		])
	})

	it("handles missing adjacency, colors, habitability, and optional leader timelines", () => {
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
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
		}

		const query = createHistoryQuery({ timelines, events: [] }, {
			provinces: undefined,
			population: undefined,
		} as unknown as SerializedGenesisWorld)
		const view = query.getView(0)

		expect(Array.from(view.colors)).toEqual([0, 0, 0, 0, 0, 0])
		expect(Array.from(view.leaderNameSeed)).toEqual([-1, -1])
		expect(Array.from(view.leaderBirthYear)).toEqual([-1, -1])
		expect(Array.from(view.nationWealth)).toEqual([0, 0])
		expect(Array.from(view.nationOptimalWealth)).toEqual([0, 0])
		expect(view.getNationWealth(0)).toBe(0)
		expect(view.totalPopulation).toBe(0)
	})

	it("applies hierarchy scaling to lazy wealth and keeps open-ended wars active", () => {
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
			leaderNameSeed: makeProvinceTimelineInt([[1], [-1], [-1], [-1], [-1]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0], [0], [0], [0]]),
			leaderBirthYear: makeProvinceTimelineFloat([
				[100],
				[-1],
				[-1],
				[-1],
				[-1],
			]),
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
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
		}
		const world = {
			provinces: {
				count: 5,
				adjOffset: new Int32Array([0, 1, 2, 3, 4, 4]),
				adjList: new Int32Array([1, 0, 0, 0]),
			},
			population: {
				habitability: new Float32Array([10, 4, 4, 4, 4]),
			},
		} as unknown as SerializedGenesisWorld

		const view = createHistoryQuery({ timelines, events: [] }, world).getView(0)

		expect(view.sovereignCount).toBe(1)
		expect(view.getNationOptimalWealth(0)).toBeCloseTo(14, 5)
		expect(view.getNationWealth(0)).toBeCloseTo(13, 5)
		expect(view.activeWars).toEqual([
			{
				idx: 11,
				attacker: 0,
				defender: 1,
				rebel: false,
				occupied: [1],
			},
		])
		expect(view.nationOptimalWealth[0]).toBeCloseTo(14, 5)
		expect(view.nationWealth[0]).toBeCloseTo(13, 5)
	})

	it("replays from keyframes across forward and backward queries without mutating old snapshots", () => {
		const timelines: SerializedTimelines = {
			P: 4,
			startTimeMs: 0,
			endTimeMs: 40,
			parent: makeProvinceTimelineInt([
				[-1, -1, -1, -1, -1],
				[0, 0, 0, 0, 0],
				[-1, 0, -1, 0, -1],
				[-1, -1, 2, 2, 2],
			]),
			assignment: makeProvinceTimelineInt([
				[0, 0, 0, 0, 0],
				[1, 1, 1, 1, 1],
				[2, 2, 0, 0, 2],
				[3, 3, 3, 2, 2],
			]),
			populationRural: makeProvinceTimelineFloat([
				[10, 11, 12, 13, 14],
				[20, 21, 22, 23, 24],
				[30, 31, 32, 33, 34],
				[40, 41, 42, 43, 44],
			]),
			populationUrban: makeProvinceTimelineFloat([
				[1, 1, 2, 2, 3],
				[2, 2, 3, 3, 4],
				[3, 3, 4, 4, 5],
				[4, 4, 5, 5, 6],
			]),
			development: makeProvinceTimelineFloat([
				[0.1, 0.2, 0.3, 0.4, 0.5],
				[0.2, 0.3, 0.4, 0.5, 0.6],
				[0.3, 0.4, 0.5, 0.6, 0.7],
				[0.4, 0.5, 0.6, 0.7, 0.8],
			]),
			consumption: makeProvinceTimelineFloat([
				[0.1, 0.2, 0.3, 0.4, 0.5],
				[0.2, 0.3, 0.4, 0.5, 0.6],
				[0.3, 0.4, 0.5, 0.6, 0.7],
				[0.4, 0.5, 0.6, 0.7, 0.8],
			]),
			leaderDynasty: makeProvinceTimelineInt([
				[1, 1, 2, 2, 3],
				[-1, -1, -1, -1, -1],
				[4, 4, 5, 5, 6],
				[-1, -1, 7, 7, 7],
			]),
			leaderNameSeed: makeProvinceTimelineInt([
				[10, 11, 12, 13, 14],
				[-1, -1, -1, -1, -1],
				[20, 21, 22, 23, 24],
				[-1, -1, 30, 31, 32],
			]),
			leaderClaim: makeProvinceTimelineInt([
				[0, 1, 2, 3, 0],
				[0, 0, 0, 0, 0],
				[1, 2, 3, 0, 1],
				[0, 0, 1, 2, 3],
			]),
			leaderBirthYear: makeProvinceTimelineFloat([
				[100, 101, 102, 103, 104],
				[-1, -1, -1, -1, -1],
				[120, 121, 122, 123, 124],
				[-1, -1, 140, 141, 142],
			]),
			occupation: makeProvinceTimelineInt([
				[-1, -1, -1, -1, -1],
				[-1, 9, 9, -1, -1],
				[-1, -1, -1, 9, -1],
				[-1, -1, -1, -1, -1],
			]),
			relations: {
				aIdx: new Int32Array([0]),
				bIdx: new Int32Array([2]),
				offsets: new Int32Array([0, 3]),
				times: new Float64Array([0, 20, 40]),
				values: new Int32Array([REL.NEUTRAL, REL.ALLY, REL.RIVAL]),
			},
			nationColorKeys: new Int32Array([0, 1, 2, 3]),
			nationColorValues: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0]),
			wars: [
				{
					idx: 9,
					attacker: 0,
					defender: 2,
					rebel: false,
					startTime: 10,
					endTime: 40,
				},
			],
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
		}
		const world = {
			provinces: {
				count: 4,
				adjOffset: new Int32Array([0, 2, 4, 6, 8]),
				adjList: new Int32Array([1, 2, 0, 2, 0, 3, 2, 1]),
			},
			population: {
				habitability: new Float32Array([5, 1, 4, 2]),
			},
		} as unknown as SerializedGenesisWorld

		const query = createHistoryQuery({ timelines, events: [] }, world)
		const atTen = query.getView(10)
		const atThirty = query.getView(30)
		const atTwenty = query.getView(20)

		expect(Array.from(atTen.assignment)).toEqual([0, 1, 2, 3])
		expect(Array.from(atThirty.assignment)).toEqual([0, 1, 0, 2])
		expect(Array.from(atTwenty.parent)).toEqual([-1, 0, -1, 2])
		expect(atThirty.activeWars).toEqual([
			{
				idx: 9,
				attacker: 0,
				defender: 2,
				rebel: false,
				occupied: [2],
			},
		])
		expect(atTen.getNationWealth(0)).toBeCloseTo(5.60625, 5)
		expect(atTen.getNationOptimalWealth(0)).toBeCloseTo(6.25, 5)
		expect(atTwenty.relationAt(0, 2)).toBe(REL.ALLY)
		expect(atThirty.relationAt(0, 2)).toBe(REL.ALLY)
		expect(atTen.getNationWealth(0)).toBeCloseTo(5.60625, 5)
	})

	it("preserves sparse sentinel hot fields when replaying packed keyframes", () => {
		const timelines: SerializedTimelines = {
			P: 2,
			startTimeMs: 0,
			endTimeMs: 20,
			parent: makeProvinceTimelineInt([
				[-1, -1, -1],
				[-1, -1, -1],
			]),
			assignment: makeProvinceTimelineInt([
				[0, 0, 0],
				[1, 1, 1],
			]),
			populationRural: makeProvinceTimelineFloat([
				[1, 1, 1],
				[2, 2, 2],
			]),
			populationUrban: makeProvinceTimelineFloat([
				[0, 0, 0],
				[0, 0, 0],
			]),
			development: makeProvinceTimelineFloat([
				[0, 0, 0],
				[0, 0, 0],
			]),
			consumption: makeProvinceTimelineFloat([
				[0.1, 0.1, 0.1],
				[0.2, 0.2, 0.2],
			]),
			leaderDynasty: makeProvinceTimelineInt([
				[-1, 3, 3],
				[-1, -1, -1],
			]),
			leaderNameSeed: makeProvinceTimelineInt([
				[-1, 11, 11],
				[-1, -1, -1],
			]),
			leaderClaim: makeProvinceTimelineInt([
				[0, 2, 2],
				[0, 0, 0],
			]),
			leaderBirthYear: makeProvinceTimelineFloat([
				[-1, 120, 120],
				[-1, -1, -1],
			]),
			occupation: makeProvinceTimelineInt([
				[-1, -1, -1],
				[-1, 9, -1],
			]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0, 1]),
			nationColorValues: new Float32Array([1, 0, 0, 0, 0, 1]),
			wars: [
				{
					idx: 9,
					attacker: 0,
					defender: 1,
					rebel: false,
					startTime: 10,
					endTime: 20,
				},
			],
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
		}
		const world = {
			provinces: {
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
			},
			population: {
				habitability: new Float32Array([2, 1]),
			},
		} as unknown as SerializedGenesisWorld

		const query = createHistoryQuery({ timelines, events: [] }, world)
		const atTwenty = query.getView(20)
		const atZero = query.getView(0)
		const atTen = query.getView(10)

		expect(Array.from(atZero.leaderDynasty)).toEqual([-1, -1])
		expect(Array.from(atZero.leaderNameSeed)).toEqual([-1, -1])
		expect(Array.from(atZero.leaderBirthYear)).toEqual([-1, -1])
		expect(atZero.activeWars).toEqual([])
		expect(Array.from(atTen.leaderDynasty)).toEqual([3, -1])
		expect(Array.from(atTen.leaderNameSeed)).toEqual([11, -1])
		expect(Array.from(atTen.leaderBirthYear)).toEqual([120, -1])
		expect(atTen.activeWars).toEqual([
			{
				idx: 9,
				attacker: 0,
				defender: 1,
				rebel: false,
				occupied: [1],
			},
		])
		expect(Array.from(atTwenty.leaderNameSeed)).toEqual([11, -1])
		expect(atTwenty.activeWars).toEqual([])
	})

	it("derives forest child indexes once for sovereign and lazy wealth snapshots", () => {
		const timelines: SerializedTimelines = {
			P: 6,
			startTimeMs: 0,
			endTimeMs: 0,
			parent: makeProvinceTimelineInt([[-1], [0], [1], [-1], [3], [4]]),
			assignment: makeProvinceTimelineInt([[0], [1], [2], [3], [4], [5]]),
			populationRural: makeProvinceTimelineFloat([
				[1],
				[1],
				[1],
				[1],
				[1],
				[1],
			]),
			populationUrban: makeProvinceTimelineFloat([
				[0],
				[0],
				[0],
				[0],
				[0],
				[0],
			]),
			development: makeProvinceTimelineFloat([[0], [0], [0], [0], [0], [0]]),
			consumption: makeProvinceTimelineFloat([[0], [0], [0], [0], [0], [0]]),
			leaderDynasty: makeProvinceTimelineInt([[0], [0], [0], [0], [0], [0]]),
			leaderNameSeed: makeProvinceTimelineInt([
				[10],
				[-1],
				[-1],
				[30],
				[-1],
				[-1],
			]),
			leaderClaim: makeProvinceTimelineInt([[1], [0], [0], [2], [0], [0]]),
			leaderBirthYear: makeProvinceTimelineFloat([
				[100],
				[-1],
				[-1],
				[120],
				[-1],
				[-1],
			]),
			occupation: makeProvinceTimelineInt([[-1], [-1], [-1], [-1], [-1], [-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0, 1, 2, 3, 4, 5]),
			nationColorValues: new Float32Array([
				1, 0, 0, 0.8, 0, 0, 0.6, 0, 0, 0, 1, 0, 0, 0.8, 0, 0, 0.6, 0,
			]),
			wars: [],
			cultureBlendSecondary: makeProvinceTimelineInt([]),
			cultureBlendWeight: makeProvinceTimelineFloat([]),
		}
		const world = {
			provinces: {
				count: 6,
				adjOffset: new Int32Array([0, 1, 2, 2, 3, 4, 4]),
				adjList: new Int32Array([1, 2, 4, 5]),
			},
			population: {
				habitability: new Float32Array([10, 4, 1, 8, 2, 1]),
			},
		} as unknown as SerializedGenesisWorld

		const view = createHistoryQuery({ timelines, events: [] }, world).getView(0)
		const historyChildren = buildHistoryChildrenIndex(view)

		expect(view.sovereignCount).toBe(2)
		expect(Array.from(view.sovereign)).toEqual([0, 0, 0, 3, 3, 3])
		expect(Array.from(view.childOffset ?? [])).toEqual([0, 1, 2, 2, 3, 4, 4])
		expect(Array.from(view.childList ?? [])).toEqual([1, 2, 4, 5])
		expect(historyChildren?.childOffset).toBe(view.childOffset)
		expect(historyChildren?.childList).toBe(view.childList)
		expect(view.getNationOptimalWealth(0)).toBeCloseTo(11.0625, 5)
		expect(view.getNationWealth(0)).toBeCloseTo(10.78515625, 5)
		expect(view.getNationOptimalWealth(3)).toBeCloseTo(8.5625, 5)
		expect(view.getNationWealth(3)).toBeCloseTo(8.41015625, 5)
	})

	it.skipIf(BENCH_ENV.HISTORY_QUERY_BENCH !== "1")(
		"prints reusable 10k snapshot benchmarks",
		() => {
			const provinceCount = Number(
				BENCH_ENV.HISTORY_QUERY_BENCH_PROVINCES ?? 10_000,
			)
			const sampleCount = Number(BENCH_ENV.HISTORY_QUERY_BENCH_SAMPLES ?? 18)
			const fixture = makeBenchmarkFixture({ provinceCount, sampleCount })
			const query = createHistoryQuery(fixture.bundle, fixture.world)

			query.getView(fixture.sampleTimes[0] ?? 0)

			let getViewTotal = 0
			let projectionTotal = 0
			let readsTotal = 0
			let hierarchyTotal = 0
			let warsTotal = 0
			let summaryTotal = 0
			let cloneTotal = 0
			let lazyWealthTotal = 0

			for (const timeMs of fixture.sampleTimes) {
				const getViewStart = performance.now()
				const view = query.getView(timeMs)
				getViewTotal += performance.now() - getViewStart

				const profile = readHistoryQueryBenchmark(query)
				readsTotal += profile?.readsMs ?? 0
				hierarchyTotal += profile?.hierarchyMs ?? 0
				warsTotal += profile?.warsMs ?? 0
				summaryTotal += profile?.summaryMs ?? 0
				cloneTotal += profile?.cloneMs ?? 0

				const projectionStart = performance.now()
				const historyChildren = buildHistoryChildrenIndex(view)
				const displayWorld = buildDisplayWorld({
					world: fixture.world,
					selectedHistoryView: view,
					selectedHistoryChildren: historyChildren,
				})
				buildDisplayNationModel(displayWorld)
				projectionTotal += performance.now() - projectionStart

				const lazyWealthStart = performance.now()
				for (const nationId of fixture.trackedNationIds) {
					view.getNationWealth(nationId)
					view.getNationOptimalWealth(nationId)
				}
				lazyWealthTotal += performance.now() - lazyWealthStart
			}

			const getViewAvg = getViewTotal / fixture.sampleTimes.length
			const projectionAvg = projectionTotal / fixture.sampleTimes.length
			console.info(
				`[snapshot smoke] provinces=${provinceCount} samples=${fixture.sampleTimes.length} getView=${getViewAvg.toFixed(1)}ms projection=${projectionAvg.toFixed(1)}ms ratio=${(getViewAvg / Math.max(projectionAvg, 0.0001)).toFixed(2)}x`,
			)
			console.info(
				`[snapshot attribution] provinces=${provinceCount} getView=${getViewAvg.toFixed(1)}ms reads=${(readsTotal / fixture.sampleTimes.length).toFixed(1)}ms hierarchy=${(hierarchyTotal / fixture.sampleTimes.length).toFixed(1)}ms wars=${(warsTotal / fixture.sampleTimes.length).toFixed(1)}ms summary=${(summaryTotal / fixture.sampleTimes.length).toFixed(1)}ms clone=${(cloneTotal / fixture.sampleTimes.length).toFixed(1)}ms lazyWealthAccess=${(lazyWealthTotal / fixture.sampleTimes.length).toFixed(1)}ms`,
			)
		},
	)
})
