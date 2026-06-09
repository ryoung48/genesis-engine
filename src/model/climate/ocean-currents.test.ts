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
	it("locks currents to the annual mean and emits no monthly warmth arrays", () => {
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

		expect(currents.oceanWarmth[0]).toBe(0)
		expect(currents.oceanWarmth[1]).toBe(0)
		expect(currents.oceanWarmth[2]).toBeLessThan(-0.7)
		expect(Array.from(currents.coastalWarmth)).toEqual([0, 0, 0])
		// Currents no longer migrate month to month — no per-month warmth fields.
		expect(currents.oceanWarmthMonthly).toBeUndefined()
		expect(currents.coastalWarmthMonthly).toBeUndefined()
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
		expect(currents.oceanWarmth[0]).toBeGreaterThan(0.7)
		expect(currents.oceanWarmth[1]).toBe(0)
		expect(currents.oceanWarmth[2]).toBeLessThan(-0.7)
		expect(currents.oceanWarmth[3]).toBe(0)
		expect(Array.from(currents.coastalWarmth)).toEqual([0, 0, 0, 0])
		expect(currents.oceanWarmthMonthly).toBeUndefined()
		expect(currents.coastalWarmthMonthly).toBeUndefined()
	})

	it("fades offshore from a direct coastal assignment instead of staying binary", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 20, lonDeg: 0 },
				{ latDeg: 20, lonDeg: 20 },
				{ latDeg: 20, lonDeg: 40 },
				{ latDeg: 20, lonDeg: 60 },
				{ latDeg: 20, lonDeg: 80 },
			],
			[[1], [0, 2], [1, 3], [2, 4], [3]],
		)
		const currents = computeOceanCurrents(
			mesh,
			new Uint8Array([1, 0, 0, 0, 0]),
			new Float32Array([0, 1, 2, 3, 4]),
			buildLandmarks(mesh.numRegions, [{ region: 0, type: 0 }]),
		)

		expect(currents.oceanWarmth[1]).toBeGreaterThanOrEqual(
			currents.oceanWarmth[2],
		)
		expect(currents.oceanWarmth[2]).toBeGreaterThanOrEqual(
			currents.oceanWarmth[3],
		)
		expect(currents.oceanWarmth[3]).toBeGreaterThanOrEqual(
			currents.oceanWarmth[4],
		)
		expect(currents.oceanWarmth[4]).toBeGreaterThan(0)
	})

	it("reverses coastal current classification on retrograde planets", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 20, lonDeg: 0 },
				{ latDeg: 20, lonDeg: 20 },
				{ latDeg: 20, lonDeg: 40 },
			],
			[[1], [0, 2], [1]],
		)
		const _isLand = new Uint8Array([1, 0, 0])
		const _distCoast = new Float32Array([0, 1, 2])
		const _landmarks = buildLandmarks(mesh.numRegions, [{ region: 0, type: 0 }])

		const _prograde = computeOceanCurrents(
			mesh,
			_isLand,
			_distCoast,
			_landmarks,
			{
				planetRadiusKm: 6371,
				obliquity: 23.5,
			},
		)
		const _retrograde = computeOceanCurrents(
			mesh,
			_isLand,
			_distCoast,
			_landmarks,
			{
				planetRadiusKm: 6371,
				obliquity: 156.5,
			},
		)

		expect(_prograde.oceanWarmth[1]).toBeGreaterThan(0)
		expect(_prograde.oceanWarmth[2]).toBeGreaterThan(0)
		expect(_retrograde.oceanWarmth[1]).toBeLessThan(0)
		expect(_retrograde.oceanWarmth[2]).toBeLessThan(0)
	})

	it("covers wrapped coasts, blocked coastlines, and inland fade limits", () => {
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
		expect(currents.coastalWarmth[22]).toBeGreaterThan(
			currents.coastalWarmth[23],
		)
		expect(currents.coastalWarmth[23]).toBeGreaterThan(
			currents.coastalWarmth[24],
		)
		expect(currents.coastalWarmth[28]).toBe(0)
		expect(currents.oceanWarmthMonthly).toBeUndefined()
		expect(currents.coastalWarmthMonthly).toBeUndefined()
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
			false,
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

	it("reverses displayed current direction for retrograde circulation", () => {
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

		const prograde = buildOceanCurrentGrid(
			mesh,
			oceanWarmth,
			isLand,
			latDeg,
			lonDeg,
			false,
			undefined,
			regionBin,
		)
		const retrograde = buildOceanCurrentGrid(
			mesh,
			oceanWarmth,
			isLand,
			latDeg,
			lonDeg,
			true,
			undefined,
			regionBin,
		)

		const idx =
			Math.round(latDeg[0] + 90) * prograde.width + Math.round(lonDeg[0] + 180)
		expect(prograde.u[idx]).toBeCloseTo(-retrograde.u[idx], 6)
		expect(prograde.v[idx]).toBeCloseTo(-retrograde.v[idx], 6)
	})
})

describe("applyCurrentTemperatureEffect", () => {
	it("applies locked-sign deltas scaled by the seasonal-mean factor", () => {
		const mesh = buildMesh([
			{ latDeg: 15, lonDeg: -90 },
			{ latDeg: 15, lonDeg: 90 },
			{ latDeg: 15, lonDeg: 0 },
		])
		// Flat climate → seasonal phase is zero, so every month gets the mean delta:
		// warm peak * (1 - WARM_SEASONALITY/2) = peak * 0.65,
		// cold peak * (1 - COLD_SEASONALITY/2) = peak * 0.70.
		const climate = buildClimate([10, 10, 10])
		// Annual-mean TEQ is zero → distFromTEQ = 15.
		// warm curve(15) = 1.75, cold curve(15) = 7.5.
		const monthlyTEQ = buildMonthlyTEQ()
		const currents: Parameters<typeof applyCurrentTemperatureEffect>[3] = {
			oceanWarmth: new Float32Array([1, -1, 0]),
			coastalWarmth: new Float32Array([0, 0, 1]),
			temperatureDelta: new Float32Array(3),
		}

		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0, 0, 1]),
			currents,
			monthlyTEQ,
		)

		// r0 ocean warm: 1.75 * 0.65 = 1.1375
		expect(currents.temperatureDeltaMonthly![0]).toBeCloseTo(1.1375, 4)
		// r1 ocean cold: -1.75 * 0.70 = -1.225
		expect(currents.temperatureDeltaMonthly![1]).toBeCloseTo(-1.225, 4)
		// r2 land warm: 1.75 * 0.68 * 0.65 = 0.7735
		expect(currents.temperatureDeltaMonthly![2]).toBeCloseTo(0.7735, 4)
		// Flat climate → annual mean equals the per-month delta.
		expect(currents.temperatureDelta[0]).toBeCloseTo(1.1375, 4)
		expect(currents.temperatureDelta[1]).toBeCloseTo(-1.225, 4)
		expect(currents.temperatureDelta[2]).toBeCloseTo(0.7735, 4)
		expect(climate.temperature_avg[0]).toBeCloseTo(11.1375, 4)
		expect(climate.temperature_avg[1]).toBeCloseTo(8.775, 4)
		expect(climate.temperature_avg[2]).toBeCloseTo(10.7735, 4)
		// Every month identical under a flat climate.
		expect(currents.temperatureDeltaMonthly![3]).toBeCloseTo(1.1375, 4)
	})

	it("modulates magnitude by season while keeping the current's sign fixed", () => {
		const mesh = buildMesh([{ latDeg: 30, lonDeg: 0 }])
		const climate = buildClimate([10])
		// Cold first half of the year, hot second half. mean = 10, amplitude = 10.
		climate.temperature_monthly = new Float32Array([
			0, 0, 0, 0, 0, 0, 20, 20, 20, 20, 20, 20,
		])
		// Annual-mean TEQ zero → distFromTEQ = 30 → warm curve(30) = 5.
		const monthlyTEQ = buildMonthlyTEQ()
		const currents: Parameters<typeof applyCurrentTemperatureEffect>[3] = {
			oceanWarmth: new Float32Array([1]),
			coastalWarmth: new Float32Array([0]),
			temperatureDelta: new Float32Array(1),
		}

		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0]),
			currents,
			monthlyTEQ,
		)

		// Warm current: full strength in the coldest month, weakest in the hottest.
		expect(currents.temperatureDeltaMonthly![0]).toBeCloseTo(5, 4) // winter peak
		expect(currents.temperatureDeltaMonthly![6]).toBeCloseTo(1.5, 4) // summer trough
		// Sign is locked positive all year.
		for (let m = 0; m < 12; m++) {
			expect(currents.temperatureDeltaMonthly![m]).toBeGreaterThan(0)
		}
		// Annual mean = (6*5 + 6*1.5) / 12 = 3.25.
		expect(currents.temperatureDelta[0]).toBeCloseTo(3.25, 4)
		expect(climate.temperature_avg[0]).toBeCloseTo(13.25, 4)
		// Positive currents keep the cold extreme unchanged and only raise the hot extreme.
		expect(climate.temperature_min[0]).toBeCloseTo(5, 4)
		expect(climate.temperature_max[0]).toBeCloseTo(20, 4)
	})

	it("positions the locked current with the annual mean of the monthly TEQ", () => {
		const mesh = buildMesh([{ latDeg: 20, lonDeg: 0 }])
		const climate = buildClimate([10])
		// Every month's TEQ = 50 → annual-mean TEQ = 50 → distFromTEQ = 30.
		// warm curve(30) = 5, flat climate → delta = 5 * 0.65 = 3.25.
		const monthlyTEQ = Array.from({ length: 12 }, () =>
			new Float32Array(TEQ_BINS).fill(50),
		)
		const currents: Parameters<typeof applyCurrentTemperatureEffect>[3] = {
			oceanWarmth: new Float32Array([1]),
			coastalWarmth: new Float32Array([0]),
			temperatureDelta: new Float32Array(1),
		}

		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0]),
			currents,
			monthlyTEQ,
		)

		expect(currents.temperatureDelta[0]).toBeCloseTo(3.25, 4)
		expect(currents.temperatureDeltaMonthly![0]).toBeCloseTo(3.25, 4)
		expect(currents.temperatureDeltaMonthly![11]).toBeCloseTo(3.25, 4)
		expect(climate.temperature_avg[0]).toBeCloseTo(13.25, 4)
	})

	it("falls back to the computed thermal equator and skips tiny warmth values", () => {
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

		// Incomplete monthly TEQ (length 11) → fall back to computeThermalEquator,
		// which yields TEQ ≈ 0 for a uniform climate. distFromTEQ = 0 →
		// warm curve(0) = 1, cold curve(0) = 3. Flat climate → × 0.65 / 0.70.
		applyCurrentTemperatureEffect(
			mesh,
			climate,
			new Uint8Array([0, 0, 1, 1]),
			currents,
			buildMonthlyTEQ().slice(0, 11),
		)

		expect(currents.temperatureDeltaMonthly).toBeInstanceOf(Float32Array)
		// r0 ocean warm: 0.5 * 1 * 0.65 = 0.325
		expect(currents.temperatureDelta[0]).toBeCloseTo(0.325, 4)
		// r1 ocean cold: -(0.5 * 1) * 0.70 = -0.35
		expect(currents.temperatureDelta[1]).toBeCloseTo(-0.35, 4)
		// r2 land warm: 0.5 * 1 * 0.68 * 0.65 = 0.221
		expect(currents.temperatureDelta[2]).toBeCloseTo(0.221, 4)
		// r3 warmth 0.005 < 0.01 → skipped.
		expect(currents.temperatureDelta[3]).toBe(0)
		expect(climate.temperature_avg[0]).toBeCloseTo(10.325, 4)
		expect(climate.temperature_avg[1]).toBeCloseTo(9.65, 4)
		expect(climate.temperature_avg[2]).toBeCloseTo(10.221, 4)
		expect(climate.temperature_avg[3]).toBe(10)
		expect(currents.temperatureDeltaMonthly![3]).toBe(0)
		// Month 1, region 0 mirrors month 0 under a flat climate.
		expect(currents.temperatureDeltaMonthly![4]).toBeCloseTo(0.325, 4)
	})
})
