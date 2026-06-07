import { describe, expect, it } from "vitest"
import type { OrogenClimate, OrogenParams, SphereMesh } from ".."
import { LANDMARK_TYPE_LAKE, LANDMARK_TYPE_OCEAN } from "../terrain/landmarks"
import { elevToHeightKm } from "./climate"
import {
	computeAdvection,
	computeMonthlyRain,
	computeThermalEquator,
	computeThermalEquatorLine,
} from "./rain"

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
		r_xyz,
		adjList: new Int32Array(adjList),
		adjOffset,
	} as SphereMesh
}

function buildClimate(
	temperatureAvg: number[],
	temperatureMonthly?: number[],
): OrogenClimate {
	const monthly =
		temperatureMonthly ??
		Array.from({ length: 12 }, () => temperatureAvg).flat()
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

function buildParams(overrides: Partial<OrogenParams> = {}): OrogenParams {
	return {
		seed: 11,
		numPoints: 3,
		numPlates: 1,
		landDistribution: 0.5,
		continentSizeVariety: 0.5,
		landCoverage: 0.5,
		jitter: 0,
		roughness: 0,
		terrainWarp: 0,
		smoothing: 0,
		hydraulicErosion: 0,
		thermalErosion: 0,
		ridgeSharpening: 0,
		glacialErosion: 0,
		seaLevel: 1,
		planetRadiusKm: 6371,
		obliquity: 23.5,
		eccentricity: 0.0167,
		sunTempFactor: 1,
		insolationFactor: 1,
		daysPerYear: 365,
		hoursPerDay: 24,
		tidallyLocked: false,
		antistellarLon: 180,
		perihelion: 102,
		...overrides,
	}
}

describe("computeThermalEquator", () => {
	it("uses the hottest latitude in each populated default longitude bin", () => {
		const mesh = buildMesh([
			{ latDeg: 25, lonDeg: 0 },
			{ latDeg: -10, lonDeg: 90 },
			{ latDeg: 5, lonDeg: 0 },
		])
		const teq = computeThermalEquator(mesh, new Float32Array([10, 8, 3]))

		expect(teq[60]).toBeCloseTo(25, 5)
		expect(teq[90]).toBeCloseTo(-10, 5)
	})

	it("returns a closed line for custom longitude bins", () => {
		const meshPointLats = [15, -20, 30, 5]
		const mesh = buildMesh([
			{ latDeg: 15, lonDeg: -135 },
			{ latDeg: -20, lonDeg: -45 },
			{ latDeg: 30, lonDeg: 45 },
			{ latDeg: 5, lonDeg: 135 },
		])
		const line = computeThermalEquatorLine(
			mesh,
			new Float32Array([1, 2, 3, 4]),
			4,
		)

		expect(line).toHaveLength(5)
		expect(line?.map(([lon]) => lon)).toEqual([-135, -45, 45, 135, 225])
		expect(line?.[4]).toEqual([line![0][0] + 360, line![0][1]])
		for (const [, lat] of line!.slice(0, 4)) {
			expect(lat).toBeGreaterThanOrEqual(-20)
			expect(lat).toBeLessThanOrEqual(30)
		}
		expect(line?.some(([, lat], index) => lat !== meshPointLats[index])).toBe(
			true,
		)
	})

	it("returns null when too few longitude bins contain data", () => {
		const mesh = buildMesh([{ latDeg: 10, lonDeg: -135 }])

		expect(computeThermalEquatorLine(mesh, new Float32Array([5]), 4)).toBeNull()
	})

	it("returns null for an empty mesh without attempting to close the line", () => {
		const mesh = buildMesh([])

		expect(computeThermalEquatorLine(mesh, new Float32Array(0), 4)).toBeNull()
	})
})

describe("computeAdvection", () => {
	it("routes east and west moisture into opposite downwind land regions", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: -30 },
				{ latDeg: 0, lonDeg: 30 },
			],
			[[1, 2], [0], [0]],
		)

		const advection = computeAdvection(
			mesh,
			new Float32Array([-1, 0.2, 0.2]),
			new Float32Array([20, 20, 20]),
			undefined,
			buildParams(),
			new Uint8Array([0, 1, 1]),
			new Float32Array([-1, 0.2, 0.2]),
		)

		expect(advection.east[1]).toBeGreaterThan(0)
		expect(advection.west[1]).toBe(0)
		expect(advection.west[2]).toBeGreaterThan(0)
		expect(advection.east[2]).toBe(0)
	})

	it("matches derived terrain heights when elevation_km is omitted", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: -30 },
				{ latDeg: 0, lonDeg: -60 },
			],
			[[1], [0, 2], [1]],
		)
		const elevation = new Float32Array([-1, 0.8, 0.2])
		const climate = buildClimate([20, 18, 16])
		const isLand = new Uint8Array([0, 1, 1])
		const explicit = computeAdvection(
			mesh,
			elevation,
			new Float32Array([20, 20, 20]),
			climate,
			buildParams(),
			isLand,
			new Float32Array([
				elevToHeightKm(-1),
				elevToHeightKm(0.8),
				elevToHeightKm(0.2),
			]),
		)
		const derived = computeAdvection(
			mesh,
			elevation,
			new Float32Array([20, 20, 20]),
			climate,
			6371,
			isLand,
		)

		for (const field of ["east", "west"] as const) {
			for (let region = 0; region < mesh.numRegions; region++) {
				expect(derived[field][region]).toBeCloseTo(explicit[field][region], 6)
			}
		}
	})

	it("uses the polar east-flow fallback when circulation collapses at the thermal equator", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 60, lonDeg: 0 },
				{ latDeg: 60, lonDeg: -30 },
				{ latDeg: 60, lonDeg: 30 },
			],
			[[1, 2], [0], [0]],
		)
		const advection = computeAdvection(
			mesh,
			new Float32Array([-1, 0.2, 0.2]),
			new Float32Array([20, 20, 20]),
			buildClimate([10, 5, 5]),
			buildParams(),
			new Uint8Array([0, 1, 1]),
			new Float32Array([-1, 0.2, 0.2]),
		)

		expect(advection.east[1]).toBeGreaterThan(0)
		expect(advection.west[1]).toBe(0)
		expect(advection.east[2]).toBe(0)
	})

	it("handles duplicated ocean coordinates in a shared basin without invalid vectors", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: -30 },
				{ latDeg: 0, lonDeg: 30 },
			],
			[
				[1, 2, 3],
				[0, 2, 3],
				[0, 1],
				[0, 1],
			],
		)

		const advection = computeAdvection(
			mesh,
			new Float32Array([-1, -0.6, 0.2, 0.2]),
			new Float32Array([20, 20, 20, 20]),
			undefined,
			buildParams(),
			new Uint8Array([0, 0, 1, 1]),
		)

		expect(Array.from(advection.east)).toSatisfy((values) =>
			values.every(Number.isFinite),
		)
		expect(Array.from(advection.west)).toSatisfy((values) =>
			values.every(Number.isFinite),
		)
		expect(
			Math.max(
				advection.east[2],
				advection.east[3],
				advection.west[2],
				advection.west[3],
			),
		).toBeGreaterThan(0)
	})

	it("steers moisture both toward and away from a warmer off-equator thermal equator", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 20, lonDeg: 0 },
				{ latDeg: 0, lonDeg: -30 },
				{ latDeg: 40, lonDeg: 30 },
			],
			[[1, 2], [0], [0]],
		)

		const advection = computeAdvection(
			mesh,
			new Float32Array([-1, 0.2, 0.2]),
			new Float32Array([20, 20, 20]),
			buildClimate([30, 10, 10]),
			buildParams(),
			new Uint8Array([0, 1, 1]),
			new Float32Array([-1, 0.2, 0.2]),
		)

		expect(advection.east[1]).toBeGreaterThan(0)
		expect(advection.west[2]).toBeGreaterThan(0)
	})
})

describe("computeMonthlyRain", () => {
	it("uses the tidal rainfall model to keep dayside regions wetter than the nightside", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 180 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[[2], [2], [0, 1]],
		)
		const climate = buildClimate([35, -10, 10])

		const rain = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			new Uint8Array([1, 1, 0]),
			buildParams({ tidallyLocked: true, pressure: 3, seed: 0 }),
		)

		expect(rain.annual[0]).toBeGreaterThan(rain.annual[1])
		expect(rain.annual[2]).toBe(0)
		expect(rain.monthly[0]).toBeGreaterThan(0)
		expect(rain.monthly[1]).toBeGreaterThanOrEqual(0)
		expect(rain.annual[0]).toBeCloseTo(
			Array.from({ length: 12 }, (_, month) => rain.monthly[month * 3]).reduce(
				(sum, value) => sum + value,
				0,
			),
			3,
		)
	})

	it("falls back to default regular-rain optionals when only day length is provided", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 15, lonDeg: -30 },
				{ latDeg: 12, lonDeg: 0 },
				{ latDeg: 10, lonDeg: 30 },
			],
			[[1], [0, 2], [1]],
		)
		const climate = buildClimate([24, 22, 20])

		const rain = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array([0.7, 0.6, 0]),
			new Float32Array([0.1, 0.2, 0]),
			new Uint8Array([1, 1, 0]),
			{ hoursPerDay: 24 } as OrogenParams,
		)

		expect(rain.annual[0]).toBeGreaterThan(0)
		expect(rain.annual[1]).toBeGreaterThan(0)
		expect(rain.annual[2]).toBe(0)
	})

	it("falls back to default tidally locked rain parameters when optional fields are omitted", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 180 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[[2], [2], [0, 1]],
		)
		const climate = buildClimate([35, -10, 10])

		const rain = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			new Uint8Array([1, 1, 0]),
			{ tidallyLocked: true } as OrogenParams,
		)

		expect(rain.annual[0]).toBeGreaterThan(rain.annual[1])
		expect(rain.annual[0]).toBeGreaterThan(0)
		expect(rain.annual[2]).toBe(0)
	})

	it("reverses zonal moisture preference for retrograde obliquity", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 60, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 0 },
			],
			[[1], [0]],
		)
		const climate = buildClimate([15, 15])
		const monthlyTeq = Array.from({ length: 12 }, () => new Float32Array(120))

		const prograde = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array([1, 0]),
			new Float32Array([0, 0]),
			new Uint8Array([1, 0]),
			buildParams({ obliquity: 30, seed: 0 }),
			monthlyTeq,
		)
		const retrograde = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array([1, 0]),
			new Float32Array([0, 0]),
			new Uint8Array([1, 0]),
			buildParams({ obliquity: 120, seed: 0 }),
			monthlyTeq,
		)

		expect(retrograde.annual[0]).toBeGreaterThan(prograde.annual[0])
		expect(prograde.annual[1]).toBe(0)
	})

	it("suppresses regular rainfall as atmospheric pressure rises", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 10, lonDeg: -30 },
				{ latDeg: 12, lonDeg: 0 },
				{ latDeg: 8, lonDeg: 30 },
			],
			[[1], [0, 2], [1]],
		)
		const climate = buildClimate([24, 22, 20])
		const east = new Float32Array([0.8, 0.5, 0])
		const west = new Float32Array([0.2, 0.1, 0])
		const isLand = new Uint8Array([1, 1, 0])

		const thinAir = computeMonthlyRain(
			mesh,
			climate,
			east,
			west,
			isLand,
			buildParams({ pressure: 0.5, seed: 4 }),
		)
		const denseAir = computeMonthlyRain(
			mesh,
			climate,
			east,
			west,
			isLand,
			buildParams({ pressure: 4, seed: 4 }),
		)

		expect(thinAir.annual[0]).toBeGreaterThan(denseAir.annual[0])
		expect(thinAir.annual[1]).toBeGreaterThan(denseAir.annual[1])
		expect(thinAir.annual[2]).toBe(0)
		expect(denseAir.annual[2]).toBe(0)
	})

	it("adds more tidally locked nightside rain at higher pressure", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 180 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[[2], [2], [0, 1]],
		)
		const climate = buildClimate([35, -10, 10])

		const thinAir = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			new Uint8Array([1, 1, 0]),
			buildParams({ tidallyLocked: true, pressure: 1, seed: 0 }),
		)
		const denseAir = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			new Uint8Array([1, 1, 0]),
			buildParams({ tidallyLocked: true, pressure: 10, seed: 0 }),
		)

		expect(denseAir.annual[1]).toBeGreaterThan(thinAir.annual[1])
		expect(denseAir.annual[0]).toBeGreaterThan(0)
		expect(denseAir.annual[2]).toBe(0)
	})

	it("suppresses tidally locked rainfall as atmospheric pressure rises", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 180 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[[2], [2], [0, 1]],
		)
		const climate = buildClimate([35, -10, 10])
		const isLand = new Uint8Array([1, 1, 0])

		const thinAir = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			isLand,
			buildParams({ tidallyLocked: true, pressure: 0.5, seed: 0 }),
		)
		const denseAir = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			isLand,
			buildParams({ tidallyLocked: true, pressure: 4, seed: 0 }),
		)

		const thinLandTotal = thinAir.annual[0] + thinAir.annual[1]
		const denseLandTotal = denseAir.annual[0] + denseAir.annual[1]

		expect(thinAir.annual[0]).toBeGreaterThan(denseAir.annual[0])
		expect(thinLandTotal).toBeGreaterThan(denseLandTotal)
		expect(thinAir.annual[2]).toBe(0)
		expect(denseAir.annual[2]).toBe(0)
	})

	it("scales tidally locked coastal moisture by physical coast distance", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 180 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[[2], [2], [0, 1]],
		)
		;(mesh as SphereMesh & { neighborDist: Float32Array }).neighborDist =
			new Float32Array([0.01, 0.01, 0.01, 0.01])
		const climate = buildClimate([35, -10, 10])
		const isLand = new Uint8Array([1, 1, 0])
		const distCoast = new Float32Array([1, 1, 0])

		const smallPlanet = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			isLand,
			buildParams({ tidallyLocked: true, planetRadiusKm: 1000, seed: 0 }),
			undefined,
			distCoast,
		)
		const largePlanet = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			isLand,
			buildParams({ tidallyLocked: true, planetRadiusKm: 10000, seed: 0 }),
			undefined,
			distCoast,
		)

		expect(smallPlanet.annual[0]).toBeGreaterThan(largePlanet.annual[0])
		expect(smallPlanet.annual[1]).toBeGreaterThan(largePlanet.annual[1])
		expect(smallPlanet.annual[2]).toBe(0)
		expect(largePlanet.annual[2]).toBe(0)
	})

	it("smooths tidally locked rain across adjacent land neighbors", () => {
		const connectedMesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 150 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[
				[1, 2],
				[0, 2],
				[0, 1],
			],
		)
		const isolatedMesh = buildMesh(
			[
				{ latDeg: 0, lonDeg: 0 },
				{ latDeg: 0, lonDeg: 150 },
				{ latDeg: 0, lonDeg: 90 },
			],
			[[2], [2], [0, 1]],
		)
		const climate = buildClimate([35, -10, 10])
		const isLand = new Uint8Array([1, 1, 0])
		const params = buildParams({ tidallyLocked: true, pressure: 3, seed: 0 })

		const connected = computeMonthlyRain(
			connectedMesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			isLand,
			params,
		)
		const isolated = computeMonthlyRain(
			isolatedMesh,
			climate,
			new Float32Array(3),
			new Float32Array(3),
			isLand,
			params,
		)

		expect(connected.annual[1]).toBeGreaterThan(isolated.annual[1])
		expect(connected.annual[0]).toBeLessThan(isolated.annual[0])
		expect(connected.monthly[1]).toBeGreaterThan(0)
	})

	it("keeps ocean cells dry and annual rain equal to monthly totals", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 10, lonDeg: -30 },
				{ latDeg: 12, lonDeg: 0 },
				{ latDeg: 8, lonDeg: 30 },
			],
			[[1], [0, 2], [1]],
		)
		const climate = buildClimate(
			[24, 22, 20],
			Array.from({ length: 12 }, () => [24, 22, 20]).flat(),
		)
		const rain = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array([0.7, 0.6, 0.2]),
			new Float32Array([0.1, 0.15, 0]),
			new Uint8Array([1, 1, 0]),
			buildParams({ seed: 3 }),
			Array.from({ length: 12 }, () => new Float32Array(120).fill(10)),
		)

		expect(rain.annual[2]).toBe(0)
		expect(rain.monthly[2]).toBe(0)
		expect(rain.annual[0]).toBeCloseTo(
			Array.from({ length: 12 }, (_, month) => rain.monthly[month * 3]).reduce(
				(sum, value) => sum + value,
				0,
			),
			3,
		)
		expect(rain.annual[1]).toBeGreaterThan(0)
	})

	it("rains on non-ocean water landmarks while keeping ocean landmarks dry", () => {
		const mesh = buildMesh(
			[
				{ latDeg: 10, lonDeg: -30 },
				{ latDeg: 12, lonDeg: 0 },
				{ latDeg: 8, lonDeg: 30 },
			],
			[[1], [0, 2], [1]],
		)
		const climate = buildClimate([24, 22, 20])
		const rain = computeMonthlyRain(
			mesh,
			climate,
			new Float32Array([0.7, 0.6, 0.2]),
			new Float32Array([0.1, 0.15, 0]),
			new Uint8Array([1, 0, 0]),
			buildParams({ seed: 3 }),
			Array.from({ length: 12 }, () => new Float32Array(120).fill(10)),
			undefined,
			{
				regionLandmark: new Int32Array([0, 1, 2]),
				type: new Uint8Array([0, LANDMARK_TYPE_LAKE, LANDMARK_TYPE_OCEAN]),
			},
		)

		expect(rain.annual[0]).toBeGreaterThan(0)
		expect(rain.annual[1]).toBeGreaterThan(0)
		expect(rain.monthly[1]).toBeGreaterThan(0)
		expect(rain.annual[2]).toBe(0)
		expect(rain.monthly[2]).toBe(0)
	})
})
