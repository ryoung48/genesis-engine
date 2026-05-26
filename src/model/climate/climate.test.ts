import { describe, expect, it } from "vitest"
import type { OrogenClimate, OrogenParams, SphereMesh } from ".."
import {
	applyDtrToClimateMinMax,
	computeLandFraction,
	computeTemperature,
	elevToHeightKm,
} from "./climate"
import {
	computeLockedMonthlyDaylightHours,
	computeTidalTransportParams,
} from "./locked/heat"

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
	it("keeps strengthening tidal redistribution above ten bar", () => {
		const thinAir = computeTidalTransportParams(buildParams({ pressure: 1 }))
		const denseAir = computeTidalTransportParams(buildParams({ pressure: 10 }))
		const superDenseAir = computeTidalTransportParams(
			buildParams({ pressure: 100 }),
		)

		expect(denseAir.redistribution).toBeGreaterThan(thinAir.redistribution)
		expect(superDenseAir.redistribution).toBeGreaterThan(
			denseAir.redistribution,
		)
		expect(superDenseAir.contrast).toBeLessThan(denseAir.contrast)
	})

	it("uses tidal-lock daylight geometry and ocean distance to shape temperatures", () => {
		const mesh = buildMesh([0, 0, 0, 0, 0], [1, -1, 0, 1, -1], [0, 0, 1, 0, 0])

		const climate = computeTemperature(
			mesh,
			new Float32Array(5),
			new Array(36).fill(0),
			buildParams({
				tidallyLocked: true,
				antistellarLon: 180,
				seed: 0,
				eccentricity: 0,
			}),
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

	it("lets tidally locked obliquity shift polar daylight through the year", () => {
		const mesh = buildMesh([1, -1, 0], [0, 0, 1], [0, 0, 0])

		const flat = computeLockedMonthlyDaylightHours(
			mesh,
			buildParams({
				tidallyLocked: true,
				obliquity: 0,
				antistellarLon: 180,
				eccentricity: 0,
				seed: 0,
			}),
		)
		const tilted = computeLockedMonthlyDaylightHours(
			mesh,
			buildParams({
				tidallyLocked: true,
				obliquity: 60,
				antistellarLon: 180,
				eccentricity: 0,
				seed: 0,
			}),
		)

		expect(flat[0]).toBe(12)
		expect(flat[1]).toBe(12)
		expect(
			Array.from({ length: 12 }, (_, month) => tilted[month * 3]),
		).toContain(24)
		expect(
			Array.from({ length: 12 }, (_, month) => tilted[month * 3]),
		).toContain(0)
		expect(
			Array.from({ length: 12 }, (_, month) => tilted[month * 3 + 1]),
		).toContain(24)
		expect(
			Array.from({ length: 12 }, (_, month) => tilted[month * 3 + 1]),
		).toContain(0)
	})

	it("mirrors locked polar seasons when the obliquity is retrograde", () => {
		const mesh = buildMesh([1, -1], [0, 0], [0, 0])

		const prograde = computeLockedMonthlyDaylightHours(
			mesh,
			buildParams({
				tidallyLocked: true,
				obliquity: 60,
				antistellarLon: 180,
				eccentricity: 0,
				seed: 0,
			}),
		)
		const retrograde = computeLockedMonthlyDaylightHours(
			mesh,
			buildParams({
				tidallyLocked: true,
				obliquity: 120,
				antistellarLon: 180,
				eccentricity: 0,
				seed: 0,
			}),
		)

		expect(
			Array.from({ length: 12 }, (_, month) => retrograde[month * 2]),
		).toEqual(Array.from({ length: 12 }, (_, month) => prograde[month * 2 + 1]))
		expect(
			Array.from({ length: 12 }, (_, month) => retrograde[month * 2 + 1]),
		).toEqual(Array.from({ length: 12 }, (_, month) => prograde[month * 2]))
	})

	it("keeps an Earth-like locked planet milder than the previous extreme baseline", () => {
		const mesh = buildMesh([0, 0, 0], [1, -1, 0], [0, 0, 1])

		const climate = computeTemperature(
			mesh,
			new Float32Array(3),
			new Array(36).fill(0),
			buildParams({
				tidallyLocked: true,
				antistellarLon: 180,
				seed: 0,
				eccentricity: 0,
				pressure: 1,
				planetRadiusKm: 6371,
				daysPerYear: 365,
				sunTempFactor: 1,
			}),
			new Float32Array([0, 0, 0]),
		)

		expect(climate.temperature_avg[0]).toBeLessThan(35)
		expect(climate.temperature_avg[1]).toBeLessThan(-30)
		expect(climate.temperature_avg[1]).toBeGreaterThan(-42)
		expect(
			climate.temperature_avg[0] - climate.temperature_avg[1],
		).toBeLessThan(70)
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
})
