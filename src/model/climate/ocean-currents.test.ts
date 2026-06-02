import { describe, expect, it } from "vitest"
import type { OrogenClimate, SphereMesh } from ".."
import type { OrogenLandmarks } from "../terrain/landmarks"
import {
	applyCurrentTemperatureEffect,
	buildOceanCurrentGrid,
	computeOceanCurrents,
} from "./ocean-currents"
import { getClimateGeometry } from "./rain"

const TEQ_BINS = 120

function buildMesh(
	points: Array<{ latDeg: number; lonDeg: number }>,
	adjacency?: number[][],
): SphereMesh {
	const r_xyz = new Float32Array(points.length * 3)
	for (let i = 0; i < points.length; i++) {
		const lat = (points[i].latDeg * Math.PI) / 180
		const lon = (points[i].lonDeg * Math.PI) / 180
		r_xyz[3 * i] = Math.cos(lat) * Math.cos(lon)
		r_xyz[3 * i + 1] = Math.cos(lat) * Math.sin(lon)
		r_xyz[3 * i + 2] = Math.sin(lat)
	}
	const resolvedAdjacency = adjacency ?? points.map((): number[] => [])
	const adjOffset = new Int32Array(points.length + 1)
	const adjList: number[] = []
	for (let i = 0; i < resolvedAdjacency.length; i++) {
		adjOffset[i] = adjList.length
		adjList.push(...resolvedAdjacency[i])
	}
	adjOffset[points.length] = adjList.length
	return {
		numRegions: points.length,
		numTriangles: 0,
		numSides: adjList.length,
		r_xyz,
		t_xyz: new Float32Array(),
		triangles: new Int32Array(),
		halfedges: new Int32Array(),
		adjList: new Int32Array(adjList),
		adjOffset,
		neighborDist: new Float32Array(),
		s_begin_r: new Int32Array(),
		s_end_r: new Int32Array(),
		s_inner_t: new Int32Array(),
		s_outer_t: new Int32Array(),
	} as SphereMesh
}

function buildClimate(temperatureAvg: number[]): OrogenClimate {
	const monthly = Array.from({ length: 12 }, () => temperatureAvg).flat()
	return {
		temperature_avg: new Float32Array(temperatureAvg),
		temperature_min: new Float32Array(temperatureAvg.map((value) => value - 5)),
		temperature_max: new Float32Array(temperatureAvg.map((value) => value + 5)),
		temperature_monthly: new Float32Array(monthly),
		temperature_monthly_nolapse: new Float32Array(monthly),
		temperature_monthly_range: new Float32Array(monthly.length),
		insolation_monthly: new Float32Array(monthly.length).fill(250),
		pet_monthly: new Float32Array(monthly.length),
		daylight_hours_monthly: new Float32Array(monthly.length).fill(12),
		landFraction: new Array(36).fill(0),
	}
}

function buildEmptyLandmarks(numRegions: number): OrogenLandmarks {
	return {
		regionLandmark: new Int32Array(numRegions).fill(-1),
		type: new Uint8Array(),
		size: new Int32Array(),
		count: 0,
	}
}

function buildLandmarks(
	numRegions: number,
	regions: Array<{ region: number; type: number }>,
): OrogenLandmarks {
	const regionLandmark = new Int32Array(numRegions).fill(-1)
	const type = new Uint8Array(regions.length)
	const size = new Int32Array(regions.length).fill(1)
	for (let i = 0; i < regions.length; i++) {
		regionLandmark[regions[i].region] = i
		type[i] = regions[i].type
	}
	return {
		regionLandmark,
		type,
		size,
		count: regions.length,
	}
}

function buildMonthlyTEQ(
	overrides: Array<Record<number, number>> = [],
): Float32Array[] {
	return Array.from({ length: 12 }, (_, month) => {
		const teq = new Float32Array(TEQ_BINS)
		const monthOverrides = overrides[month]
		if (monthOverrides) {
			for (const [bin, value] of Object.entries(monthOverrides)) {
				teq[Number(bin)] = value
			}
		}
		return teq
	})
}

describe("computeOceanCurrents", () => {
	it("reuses longitude bins for monthly ocean belt seeding", () => {
		const mesh = buildMesh([
			{ latDeg: 15, lonDeg: -90 },
			{ latDeg: 15, lonDeg: 90 },
			{ latDeg: 80, lonDeg: 0 },
		])
		const monthlyTEQ = buildMonthlyTEQ([
			{ 30: 20, 90: -40 },
			{ 30: -40, 90: 20 },
		])

		const currents = computeOceanCurrents(
			mesh,
			new Uint8Array([0, 0, 0]),
			new Float32Array(3),
			buildEmptyLandmarks(3),
			undefined,
			monthlyTEQ,
		)

		expect(Array.from(currents.oceanWarmth)).toEqual([0, 0, -1])
		expect(Array.from(currents.coastalWarmth)).toEqual([0, 0, 0])
		expect(Array.from(currents.oceanWarmthMonthly!.subarray(0, 3))).toEqual([
			1, 0, -1,
		])
		expect(Array.from(currents.oceanWarmthMonthly!.subarray(3, 6))).toEqual([
			0, 1, -1,
		])
	})

	it("classifies warm and cold coastal currents, diffuses inland, and skips blocked coasts", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 20, lonDeg: 0 },
				{ latDeg: 20, lonDeg: 20 },
				{ latDeg: 20, lonDeg: 40 },
				{ latDeg: 40, lonDeg: 0 },
				{ latDeg: 40, lonDeg: 20 },
				{ latDeg: 40, lonDeg: 40 },
				{ latDeg: 40, lonDeg: 0 },
				{ latDeg: 40, lonDeg: -20 },
				{ latDeg: 40, lonDeg: -40 },
				{ latDeg: 40, lonDeg: 0 },
				{ latDeg: 40, lonDeg: 20 },
				{ latDeg: 40, lonDeg: 40 },
				{ latDeg: 20, lonDeg: -20 },
				{ latDeg: 15, lonDeg: 120 },
			],
			[
				[1, 12],
				[0, 2],
				[1],
				[4],
				[3, 5],
				[4],
				[7],
				[6, 8],
				[7],
				[10],
				[9, 11],
				[10],
				[0],
				[],
			],
		)
		const isLand = new Uint8Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0])
		const distCoast = new Float32Array([
			0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 1, 0,
		])
		const landmarks = buildLandmarks(mesh.numRegions, [
			{ region: 0, type: 0 },
			{ region: 3, type: 0 },
			{ region: 6, type: 0 },
			{ region: 9, type: 0 },
			{ region: 11, type: 0 },
			{ region: 13, type: 5 },
		])

		const currents = computeOceanCurrents(mesh, isLand, distCoast, landmarks)

		expect(currents.oceanWarmth[1]).toBeGreaterThan(0)
		expect(currents.oceanWarmth[2]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[0]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[12]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[12]).toBeLessThan(currents.coastalWarmth[0])

		expect(currents.oceanWarmth[4]).toBeLessThan(0)
		expect(currents.oceanWarmth[5]).toBeLessThan(0)
		expect(currents.oceanWarmth[7]).toBeGreaterThan(0)
		expect(currents.oceanWarmth[8]).toBeGreaterThan(0)

		expect(currents.oceanWarmth[10]).toBe(0)
		expect(currents.coastalWarmth[9]).toBe(0)
		expect(currents.oceanWarmth[13]).toBe(0)
		expect(currents.coastalWarmth[13]).toBe(0)
		expect(currents.oceanWarmthMonthly).toBeUndefined()
		expect(currents.coastalWarmthMonthly).toBeUndefined()
	})

	it("seeds warm equatorial water and cold polar water while ignoring lakes", () => {
		const mesh = buildMesh([
			{ latDeg: 5, lonDeg: -45 },
			{ latDeg: 35, lonDeg: 0 },
			{ latDeg: 80, lonDeg: 45 },
			{ latDeg: 80, lonDeg: 90 },
		])
		const currents = computeOceanCurrents(
			mesh,
			new Uint8Array([0, 0, 0, 0]),
			new Float32Array(4),
			buildLandmarks(mesh.numRegions, [{ region: 3, type: 5 }]),
			undefined,
			buildMonthlyTEQ([{ 0: 0 }]).slice(0, 2),
		)

		expect(currents.oceanWarmth[0]).toBe(1)
		expect(currents.oceanWarmth[1]).toBe(0)
		expect(currents.oceanWarmth[2]).toBeLessThan(0)
		expect(currents.oceanWarmth[3]).toBe(0)
		expect(Array.from(currents.coastalWarmth)).toEqual([0, 0, 0, 0])
		expect(currents.oceanWarmthMonthly).toBeUndefined()
		expect(currents.coastalWarmthMonthly).toBeUndefined()
	})

	it("covers wrapped coasts, blocked coastlines, seasonal reversals, and inland fade limits", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 40, lonDeg: 0 },
				{ latDeg: 40, lonDeg: 40 },
				{ latDeg: 40, lonDeg: -10 },
				{ latDeg: 41, lonDeg: 50 },
				{ latDeg: 40, lonDeg: 20 },
				{ latDeg: 40, lonDeg: 80 },
				{ latDeg: 8, lonDeg: 70 },
				{ latDeg: 0, lonDeg: 100 },
				{ latDeg: 0, lonDeg: 110 },
				{ latDeg: 20, lonDeg: -170 },
				{ latDeg: 20, lonDeg: 170 },
				{ latDeg: 20, lonDeg: 140 },
				{ latDeg: 20, lonDeg: 170 },
				{ latDeg: 20, lonDeg: -170 },
				{ latDeg: 20, lonDeg: -140 },
				{ latDeg: 0, lonDeg: -60 },
				{ latDeg: 0, lonDeg: -40 },
				{ latDeg: 0, lonDeg: -60 },
				{ latDeg: 0, lonDeg: -80 },
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 20, lonDeg: 0 },
				{ latDeg: -20, lonDeg: 0 },
				{ latDeg: 5, lonDeg: 60 },
				{ latDeg: 5, lonDeg: 70 },
				{ latDeg: 5, lonDeg: 80 },
				{ latDeg: 5, lonDeg: 90 },
				{ latDeg: 5, lonDeg: 100 },
				{ latDeg: 5, lonDeg: 110 },
				{ latDeg: 5, lonDeg: 120 },
				{ latDeg: 5, lonDeg: 140 },
				{ latDeg: 70, lonDeg: 0 },
				{ latDeg: 70, lonDeg: -20 },
				{ latDeg: 70, lonDeg: -50 },
			],
			[
				[2, 1],
				[0, 3, 4, 5, 6],
				[0],
				[1],
				[1],
				[1, 3, 4],
				[1],
				[8],
				[7],
				[10],
				[9, 11],
				[10],
				[13],
				[12, 14],
				[13],
				[16, 17, 18],
				[15],
				[15],
				[15],
				[20, 21],
				[19],
				[19],
				[23, 29],
				[22, 24],
				[23, 25],
				[24, 26],
				[25, 27],
				[26, 28],
				[27],
				[22],
				[31],
				[30, 32],
				[31],
			],
		)
		mesh.neighborDist = new Float32Array(mesh.numSides).fill(1)
		const isLand = new Uint8Array([
			1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1,
			1, 1, 1, 1, 0, 1, 0, 0,
		])
		const distCoast = new Float32Array(33)
		distCoast[5] = 4
		distCoast[11] = 4
		distCoast[14] = 4
		distCoast[29] = 4
		distCoast[32] = 4
		const landmarks = buildLandmarks(mesh.numRegions, [
			{ region: 0, type: 0 },
			{ region: 3, type: 5 },
			{ region: 7, type: 0 },
			{ region: 8, type: 5 },
			{ region: 9, type: 0 },
			{ region: 12, type: 0 },
			{ region: 15, type: 0 },
			{ region: 19, type: 0 },
			{ region: 22, type: 0 },
			{ region: 23, type: 0 },
			{ region: 24, type: 0 },
			{ region: 25, type: 0 },
			{ region: 26, type: 0 },
			{ region: 27, type: 0 },
			{ region: 28, type: 0 },
			{ region: 30, type: 0 },
		])
		const monthlyTEQ = Array.from({ length: 12 }, (_, month) =>
			new Float32Array(TEQ_BINS).fill(month === 0 ? 20 : 0),
		)

		const currents = computeOceanCurrents(
			mesh,
			isLand,
			distCoast,
			landmarks,
			{ planetRadiusKm: 100 },
			monthlyTEQ,
		)

		expect(currents.oceanWarmth[1]).toBeLessThan(0)
		expect(currents.oceanWarmth[10]).toBeLessThan(0)
		expect(currents.oceanWarmth[13]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[22]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[23]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[27]).toBeGreaterThan(0)
		expect(currents.coastalWarmth[28]).toBe(0)
		expect(currents.oceanWarmthMonthly![1]).toBeGreaterThan(0)
		expect(currents.oceanWarmthMonthly![mesh.numRegions + 1]).toBeLessThan(0)
	})
})

describe("buildOceanCurrentGrid", () => {
	it("derives along-coast flow from warmth gradients and keeps land cells empty", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 20, lonDeg: 0 },
				{ latDeg: 10, lonDeg: 0 },
				{ latDeg: 10, lonDeg: 10 },
			],
			[
				[1, 2],
				[0, 2],
				[0, 1],
			],
		)
		const isLand = new Uint8Array([0, 0, 1])
		const oceanWarmth = new Float32Array([1, 0.25, 0])
		const { latDeg, lonDeg, regionBin } = getClimateGeometry(mesh)

		const grid = buildOceanCurrentGrid(
			mesh,
			oceanWarmth,
			isLand,
			latDeg,
			lonDeg,
			undefined,
			regionBin,
		)

		const warmIdx =
			Math.round(latDeg[0] + 90) * grid.width + Math.round(lonDeg[0] + 180)
		const landIdx =
			Math.round(latDeg[2] + 90) * grid.width + Math.round(lonDeg[2] + 180)

		expect(Math.abs(grid.u[warmIdx])).toBeGreaterThan(Math.abs(grid.v[warmIdx]))
		expect(grid.speed[warmIdx]).toBeGreaterThan(0)
		expect(grid.scalar?.[warmIdx]).toBeGreaterThan(0)
		expect(grid.mask?.[warmIdx]).toBe(1)
		expect(grid.u[landIdx]).toBe(0)
		expect(grid.v[landIdx]).toBe(0)
		expect(grid.speed[landIdx]).toBe(0)
		expect(grid.scalar?.[landIdx]).toBe(0)
		expect(grid.mask?.[landIdx]).toBe(0)
	})
})

describe("applyCurrentTemperatureEffect", () => {
	it("applies monthly deltas from shared TEQ bins without changing annual math", () => {
		const mesh = buildMesh([
			{ latDeg: 15, lonDeg: -90 },
			{ latDeg: 15, lonDeg: 90 },
			{ latDeg: 15, lonDeg: 0 },
		])
		const climate = buildClimate([10, 10, 10])
		const monthlyTEQ = buildMonthlyTEQ([{ 30: 20, 90: -40, 60: 20 }])
		const currents = {
			oceanWarmth: new Float32Array(3),
			coastalWarmth: new Float32Array(3),
			oceanWarmthMonthly: new Float32Array(36),
			coastalWarmthMonthly: new Float32Array(36),
			temperatureDeltaMonthly: new Float32Array(36),
			temperatureDelta: new Float32Array(3),
		}
		currents.oceanWarmthMonthly[0] = 1
		currents.oceanWarmthMonthly[1] = -1
		currents.coastalWarmthMonthly[2] = 1

		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0, 0, 1]),
			currents,
			monthlyTEQ,
		)

		expect(currents.temperatureDeltaMonthly[0]).toBeCloseTo(1.25, 6)
		expect(currents.temperatureDeltaMonthly[1]).toBeCloseTo(-8.75, 6)
		expect(currents.temperatureDeltaMonthly[2]).toBeCloseTo(0.75, 6)
		expect(currents.temperatureDelta[0]).toBeCloseTo(1.25 / 12, 6)
		expect(currents.temperatureDelta[1]).toBeCloseTo(-8.75 / 12, 6)
		expect(currents.temperatureDelta[2]).toBeCloseTo(0.75 / 12, 6)
		expect(climate.temperature_monthly[0]).toBeCloseTo(11.25, 6)
		expect(climate.temperature_monthly[1]).toBeCloseTo(1.25, 6)
		expect(climate.temperature_monthly[2]).toBeCloseTo(10.75, 6)
		expect(climate.temperature_avg[0]).toBeCloseTo(10 + 1.25 / 12, 6)
		expect(climate.temperature_avg[1]).toBeCloseTo(10 - 8.75 / 12, 6)
		expect(climate.temperature_avg[2]).toBeCloseTo(10 + 0.75 / 12, 6)
		expect(climate.temperature_monthly[3]).toBe(10)
		expect(climate.temperature_monthly[4]).toBe(10)
		expect(climate.temperature_monthly[5]).toBe(10)
	})

	it("falls back to annual TEQ bins, creates monthly deltas, and skips tiny warmth values", () => {
		const mesh = buildMesh([
			{ latDeg: 0, lonDeg: -120 },
			{ latDeg: 0, lonDeg: 0 },
			{ latDeg: 0, lonDeg: 120 },
			{ latDeg: 0, lonDeg: 150 },
		])
		const climate = buildClimate([10, 10, 10, 10])
		const currents: Parameters<typeof applyCurrentTemperatureEffect>[3] = {
			oceanWarmth: new Float32Array([0.5, -0.5, 0, 0]),
			coastalWarmth: new Float32Array([0, 0, 0.5, 0.005]),
			temperatureDelta: new Float32Array(4),
		}

		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0, 0, 1, 1]),
			currents,
			buildMonthlyTEQ().slice(0, 11),
		)

		expect(currents.temperatureDeltaMonthly).toBeInstanceOf(Float32Array)
		expect(currents.temperatureDelta[0]).toBeCloseTo(0.5, 6)
		expect(currents.temperatureDelta[1]).toBeCloseTo(-0.5, 6)
		expect(currents.temperatureDelta[2]).toBeCloseTo(0.3, 6)
		expect(currents.temperatureDelta[3]).toBe(0)
		expect(climate.temperature_avg[0]).toBeCloseTo(10.5, 6)
		expect(climate.temperature_avg[1]).toBeCloseTo(9.5, 6)
		expect(climate.temperature_avg[2]).toBeCloseTo(10.3, 6)
		expect(climate.temperature_avg[3]).toBe(10)
		expect(climate.temperature_monthly[0]).toBeCloseTo(10.5, 6)
		expect(climate.temperature_monthly[1]).toBeCloseTo(9.5, 6)
		expect(climate.temperature_monthly[2]).toBeCloseTo(10.3, 6)
		expect(climate.temperature_monthly[3]).toBe(10)
		expect(currents.temperatureDeltaMonthly![0]).toBeCloseTo(0.5, 6)
		expect(currents.temperatureDeltaMonthly![1]).toBeCloseTo(-0.5, 6)
		expect(currents.temperatureDeltaMonthly![2]).toBeCloseTo(0.3, 6)
		expect(currents.temperatureDeltaMonthly![3]).toBe(0)
		expect(currents.temperatureDeltaMonthly![4]).toBeCloseTo(0.5, 6)
	})

	it("ignores full monthly TEQ input when monthly current fields are absent", () => {
		const mesh = buildMesh([{ latDeg: 20, lonDeg: 0 }])
		const climate = buildClimate([10])
		const currents: Parameters<typeof applyCurrentTemperatureEffect>[3] = {
			oceanWarmth: new Float32Array([1]),
			coastalWarmth: new Float32Array([0]),
			temperatureDelta: new Float32Array(1),
		}
		const monthlyTEQ = Array.from({ length: 12 }, () =>
			new Float32Array(TEQ_BINS).fill(50),
		)

		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0]),
			currents,
			monthlyTEQ,
		)

		expect(currents.temperatureDelta[0]).toBeCloseTo(2, 6)
		expect(currents.temperatureDeltaMonthly).toBeInstanceOf(Float32Array)
		expect(currents.temperatureDeltaMonthly![0]).toBeCloseTo(2, 6)
		expect(currents.temperatureDeltaMonthly![11]).toBeCloseTo(2, 6)
		expect(climate.temperature_avg[0]).toBeCloseTo(12, 6)
	})
})
