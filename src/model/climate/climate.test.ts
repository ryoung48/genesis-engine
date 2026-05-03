import { describe, expect, it } from "vitest"
import type { OrogenClimate, OrogenParams, SphereMesh } from ".."
import { OROGEN_TERRAIN_FEATURE } from "../types/tectonics"
import {
	applyDtrToClimateMinMax,
	computeLandFraction,
	computeTemperature,
	elevToHeightKm,
} from "./climate"

function buildMesh(
	zValues: number[],
	xValues?: number[],
	yValues?: number[],
	adjacency?: number[][],
): SphereMesh {
	const r_xyz = new Float32Array(zValues.length * 3)
	for (let i = 0; i < zValues.length; i++) {
		r_xyz[i * 3] = xValues?.[i] ?? 0
		r_xyz[i * 3 + 1] = yValues?.[i] ?? 0
		r_xyz[i * 3 + 2] = zValues[i]
	}
	const adjListValues = adjacency?.flat() ?? []
	const adjOffset = new Int32Array(zValues.length + 1)
	if (adjacency) {
		let offset = 0
		for (let i = 0; i < adjacency.length; i++) {
			adjOffset[i] = offset
			offset += adjacency[i].length
		}
		adjOffset[zValues.length] = adjListValues.length
	}
	return {
		numRegions: zValues.length,
		r_xyz,
		adjList: new Int32Array(adjListValues),
		adjOffset,
	} as SphereMesh
}

function buildParams(overrides: Partial<OrogenParams> = {}): OrogenParams {
	return {
		seed: 7,
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
		planetRadiusKm: 6371,
		obliquity: 23.5,
		eccentricity: 0.0167,
		sunTempFactor: 1,
		daysPerYear: 365,
		hoursPerDay: 24,
		tidallyLocked: false,
		antistellarLon: 180,
		perihelion: 102,
		...overrides,
	}
}

describe("elevToHeightKm", () => {
	it("maps ocean depth linearly and caps mountain height at the configured peak", () => {
		expect(elevToHeightKm(-0.5)).toBe(-5)
		expect(elevToHeightKm(0.5, 8, 12)).toBeCloseTo(1.5, 6)
		expect(elevToHeightKm(2, 8, 12)).toBe(8)
	})
})

describe("computeLandFraction", () => {
	it("bins regions by latitude and caps occupied bands at eighty percent", () => {
		const mesh = buildMesh([0, 0, 0, 0, 0, 1])
		const landFraction = computeLandFraction(
			mesh,
			new Uint8Array([1, 1, 1, 1, 1, 0]),
		)

		expect(landFraction[18]).toBe(0.8)
		expect(landFraction[35]).toBe(0)
		expect(landFraction[0]).toBe(0)
	})

	it("recomputes land occupancy when the same mesh is reused", () => {
		const mesh = buildMesh([0, 0, 1])

		const first = computeLandFraction(mesh, new Uint8Array([1, 0, 1]))
		const second = computeLandFraction(mesh, new Uint8Array([0, 1, 0]))

		expect(first[18]).toBe(0.5)
		expect(first[35]).toBe(0.8)
		expect(second[18]).toBe(0.5)
		expect(second[35]).toBe(0)
	})
})

describe("applyDtrToClimateMinMax", () => {
	it("derives annual extrema from monthly means plus and minus half the dtr", () => {
		const climate = {
			temperature_avg: new Float32Array(2),
			temperature_min: new Float32Array(2),
			temperature_max: new Float32Array(2),
			temperature_monthly: new Float32Array([
				0,
				10,
				8,
				5,
				...new Array(20).fill(4),
			]),
			temperature_monthly_nolapse: new Float32Array(24),
			temperature_monthly_range: new Float32Array(24),
			insolation_monthly: new Float32Array(24),
			pet_monthly: new Float32Array(24),
			daylight_hours_monthly: new Float32Array(24),
			landFraction: [] as number[],
		} satisfies OrogenClimate
		const dtrMonthly = new Float32Array([6, 2, 4, 8, ...new Array(20).fill(0)])

		applyDtrToClimateMinMax(climate, dtrMonthly, 2)

		expect(Array.from(climate.temperature_max)).toEqual([10, 11])
		expect(Array.from(climate.temperature_min)).toEqual([-3, 1])
	})
})

describe("computeTemperature", () => {
	it("uses tidal-lock daylight geometry and ocean distance to shape temperatures", () => {
		const mesh = buildMesh([0, 0, 0, 0, 0], [1, -1, 0, 1, -1], [0, 0, 1, 0, 0])

		const climate = computeTemperature(
			mesh,
			new Float32Array(5),
			new Array(36).fill(0),
			buildParams({ tidallyLocked: true, antistellarLon: 180, seed: 0 }),
			new Float32Array([0, 0, 0, 2000, 2000]),
		)

		expect(climate.daylight_hours_monthly[0]).toBe(24)
		expect(climate.daylight_hours_monthly[1]).toBe(0)
		expect(climate.daylight_hours_monthly[2]).toBe(12)
		expect(climate.temperature_avg[0]).toBeGreaterThan(
			climate.temperature_avg[1],
		)
		expect(climate.temperature_avg[3]).toBeGreaterThan(
			climate.temperature_avg[0],
		)
		expect(climate.temperature_avg[4]).toBeLessThan(climate.temperature_avg[1])
		expect(climate.temperature_monthly_range[0]).toBeGreaterThan(0)
		expect(climate.insolation_monthly[1]).toBe(0)
	})

	it("supports perihelion inputs that start beyond pi in the tidal orbital flux", () => {
		const mesh = buildMesh([0, 0, 0], [1, -1, 0], [0, 0, 1])

		const climate = computeTemperature(
			mesh,
			new Float32Array(3),
			new Array(36).fill(0),
			buildParams({
				tidallyLocked: true,
				antistellarLon: 180,
				eccentricity: 0.2,
				perihelion: -90,
				seed: 0,
			}),
			new Float32Array([0, 0, 2000]),
		)

		expect(climate.insolation_monthly[0]).toBeLessThan(
			climate.insolation_monthly[6],
		)
		expect(climate.temperature_monthly[0]).not.toBeCloseTo(
			climate.temperature_monthly[6],
		)
		expect(climate.temperature_avg[2]).toBeGreaterThan(
			climate.temperature_avg[1],
		)
	})

	it("amplifies inland seasons and cools elevated terrain in the orbital model", () => {
		const lat = Math.sin((45 * Math.PI) / 180)
		const mesh = buildMesh([lat, lat, lat], [0, 0, 0], [0, 0, 0])

		const climate = computeTemperature(
			mesh,
			new Float32Array([0, 0.6, 0]),
			new Array(36).fill(0.4),
			buildParams({ seed: 0 }),
			new Float32Array([0, 2000, 0]),
			undefined,
			new Float32Array([0, 0, 2]),
		)

		const coastalJanuary = climate.temperature_monthly[0]
		const inlandJanuary = climate.temperature_monthly[1]
		const coastalJuly = climate.temperature_monthly[6]
		const inlandJuly = climate.temperature_monthly[7]
		const coastalRange = Math.abs(coastalJuly - coastalJanuary)
		const inlandRange = Math.abs(inlandJuly - inlandJanuary)

		expect(inlandRange).toBeGreaterThan(coastalRange)
		expect(climate.temperature_avg[2]).toBeLessThan(climate.temperature_avg[0])
		expect(climate.temperature_monthly_nolapse[2]).toBeGreaterThan(
			climate.temperature_monthly[2],
		)
		expect(climate.daylight_hours_monthly[0]).not.toBe(
			climate.daylight_hours_monthly[6],
		)
	})

	it("applies ocean-only temperature noise when a land mask is provided", () => {
		const lat = Math.sin((60 * Math.PI) / 180)
		const mesh = buildMesh([lat, lat], [0, 0], [0, 1])
		const params = buildParams({ seed: 3 })
		const landFraction = new Array(36).fill(0.25)
		const elevation = new Float32Array([0, 0])

		const baseline = computeTemperature(mesh, elevation, landFraction, params)
		const withMask = computeTemperature(
			mesh,
			elevation,
			landFraction,
			params,
			undefined,
			new Uint8Array([0, 1]),
		)

		expect(withMask.temperature_avg[0]).not.toBeCloseTo(
			baseline.temperature_avg[0],
			6,
		)
		expect(withMask.temperature_avg[1]).toBeCloseTo(
			baseline.temperature_avg[1],
			6,
		)
		expect(withMask.temperature_monthly[0]).not.toBeCloseTo(
			baseline.temperature_monthly[0],
			6,
		)
	})

	it("keeps volcanism neutral at the default dial of one", () => {
		const mesh = buildMesh([0, 0, 0], [0, 0, 0], [0, 1, -1], [[1], [0, 2], [1]])
		const hotspot = new Float32Array([0, 1, 0])
		const control = computeTemperature(
			mesh,
			new Float32Array(3),
			new Array(36).fill(0.3),
			buildParams({ seed: 0, volcanism: 1 }),
		)
		const neutral = computeTemperature(
			mesh,
			new Float32Array(3),
			new Array(36).fill(0.3),
			buildParams({ seed: 0, volcanism: 1 }),
			undefined,
			undefined,
			undefined,
			hotspot,
			new Float32Array([0, 1, 0]),
		)

		expect(Array.from(neutral.temperature_avg)).toEqual(
			Array.from(control.temperature_avg),
		)
		expect(Array.from(neutral.temperature_monthly)).toEqual(
			Array.from(control.temperature_monthly),
		)
	})

	it("lets thick atmospheres spread and amplify volcanic warming", () => {
		const mesh = buildMesh([0, 0, 0], [0, 0, 0], [0, 1, -1], [[1], [0, 2], [1]])
		const elevation = new Float32Array(3)
		const landFraction = new Array(36).fill(0.3)
		const hotspot = new Float32Array([0, 1, 0])
		const mantle = new Float32Array([0, 0.6, 0])

		const lowPressureBaseline = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 1, pressure: 1 }),
		)
		const lowPressureHeated = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 10, pressure: 1 }),
			undefined,
			undefined,
			undefined,
			hotspot,
			mantle,
		)
		const highPressureBaseline = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 1, pressure: 100 }),
		)
		const highPressureHeated = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 10, pressure: 100 }),
			undefined,
			undefined,
			undefined,
			hotspot,
			mantle,
		)

		const lowCenterDelta =
			lowPressureHeated.temperature_avg[1] -
			lowPressureBaseline.temperature_avg[1]
		const lowNeighborDelta =
			lowPressureHeated.temperature_avg[0] -
			lowPressureBaseline.temperature_avg[0]
		const highCenterDelta =
			highPressureHeated.temperature_avg[1] -
			highPressureBaseline.temperature_avg[1]
		const highNeighborDelta =
			highPressureHeated.temperature_avg[0] -
			highPressureBaseline.temperature_avg[0]

		expect(lowCenterDelta).toBeGreaterThan(0.5)
		expect(lowNeighborDelta).toBeLessThan(lowCenterDelta)
		expect(highNeighborDelta).toBeGreaterThan(lowNeighborDelta)
		expect(highCenterDelta).toBeGreaterThan(lowCenterDelta)
		expect(highPressureHeated.temperature_avg[2]).toBeGreaterThan(
			highPressureBaseline.temperature_avg[2],
		)
	})

	it("adds a stronger global volcanic greenhouse bump in thick atmospheres", () => {
		const mesh = buildMesh([0, 0, 0], [0, 0, 0], [0, 1, -1])
		const elevation = new Float32Array(3)
		const landFraction = new Array(36).fill(0.3)
		const lowPressureBaseline = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 1, pressure: 1 }),
		)
		const lowPressureHeated = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 10, pressure: 1 }),
		)
		const highPressureBaseline = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 1, pressure: 100 }),
		)
		const highPressureHeated = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 10, pressure: 100 }),
		)

		const lowPressureDelta =
			lowPressureHeated.temperature_avg[0] -
			lowPressureBaseline.temperature_avg[0]
		const highPressureDelta =
			highPressureHeated.temperature_avg[0] -
			highPressureBaseline.temperature_avg[0]

		expect(lowPressureDelta).toBeGreaterThan(0)
		expect(highPressureDelta).toBeGreaterThan(lowPressureDelta * 2)
		expect(highPressureDelta).toBeGreaterThan(15)
	})

	it("warms terrain-feature volcanic cells without hotspot fields", () => {
		const mesh = buildMesh([0, 0, 0], [0, 0, 0], [0, 1, -1], [[], [2], [1]])
		const terrainFeatures = {
			featureMask: new Uint32Array([
				1 << (OROGEN_TERRAIN_FEATURE.VOLCANIC_ARC - 1),
				1 << (OROGEN_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE - 1),
				(1 << (OROGEN_TERRAIN_FEATURE.VOLCANIC_ARC - 1)) |
					(1 << (OROGEN_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE - 1)),
			]),
			dominantFeature: new Uint8Array(3),
		}
		const elevation = new Float32Array(3)
		const landFraction = new Array(36).fill(0.3)

		const baseline = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 1, pressure: 0 }),
		)
		const heated = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({ seed: 0, volcanism: 10, pressure: 0 }),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			terrainFeatures,
		)

		const arcDelta = heated.temperature_avg[0] - baseline.temperature_avg[0]
		const lipDelta = heated.temperature_avg[1] - baseline.temperature_avg[1]
		const combinedDelta =
			heated.temperature_avg[2] - baseline.temperature_avg[2]

		expect(arcDelta).toBeGreaterThan(0)
		expect(lipDelta).toBeGreaterThan(0)
		expect(combinedDelta).toBeGreaterThan(arcDelta)
		expect(combinedDelta).toBeGreaterThan(lipDelta)
	})

	it("applies terrain-feature volcanism in tidal climates with raw elevation fallback", () => {
		const mesh = buildMesh([0.5, -0.5, 0], [1, -1, 0], [0, 0, 1])
		const terrainFeatures = {
			featureMask: new Uint32Array([
				1 << (OROGEN_TERRAIN_FEATURE.VOLCANIC_ARC - 1),
				0,
				1 << (OROGEN_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE - 1),
			]),
			dominantFeature: new Uint8Array(3),
		}
		const elevation = new Float32Array([0.6, -0.3, 0.4])
		const landFraction = new Array(36).fill(0)

		const baseline = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({
				tidallyLocked: true,
				antistellarLon: 180,
				seed: 0,
				volcanism: 1,
				pressure: 0,
			}),
		)
		const heated = computeTemperature(
			mesh,
			elevation,
			landFraction,
			buildParams({
				tidallyLocked: true,
				antistellarLon: 180,
				seed: 0,
				volcanism: 10,
				pressure: 0,
			}),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			terrainFeatures,
		)

		expect(heated.temperature_avg[0]).toBeGreaterThan(
			baseline.temperature_avg[0],
		)
		expect(heated.temperature_avg[2]).toBeGreaterThan(
			baseline.temperature_avg[2],
		)
		expect(heated.temperature_monthly_nolapse[0]).toBeGreaterThan(
			heated.temperature_monthly[0],
		)
		expect(heated.temperature_monthly_nolapse[1]).toBeCloseTo(
			heated.temperature_monthly[1],
			6,
		)
	})
})
