import { describe, expect, it } from "vitest"
import type { GenesisClimate, GenesisRainfall, SphereMesh } from ".."
import {
	assignKoppenClimate,
	KOPPEN_LABELS,
	koppenClimateColor,
	koppenClimateName,
} from "./koppen"

function buildMesh(zValues: number[]): SphereMesh {
	const r_xyz = new Float32Array(zValues.length * 3)
	for (let i = 0; i < zValues.length; i++) {
		r_xyz[i * 3 + 2] = zValues[i]
	}
	return {
		numRegions: zValues.length,
		r_xyz,
		adjList: new Int32Array(0),
		adjOffset: new Int32Array(zValues.length + 1),
	} as SphereMesh
}

function buildClimate(
	monthlyTemps: number[],
	monthlyRain: number[],
	z = 0,
): {
	mesh: SphereMesh
	isLand: Uint8Array
	climate: GenesisClimate
	rainfall: GenesisRainfall
} {
	const monthly = Float32Array.from(monthlyTemps)
	const min = Math.min(...monthlyTemps)
	const max = Math.max(...monthlyTemps)
	return {
		mesh: buildMesh([z]),
		isLand: new Uint8Array([1]),
		climate: {
			temperature_avg: new Float32Array([
				monthlyTemps.reduce((sum, value) => sum + value, 0) /
					monthlyTemps.length,
			]),
			temperature_min: new Float32Array([min]),
			temperature_max: new Float32Array([max]),
			temperature_monthly: monthly,
			temperature_monthly_nolapse: new Float32Array(12),
			temperature_monthly_range: new Float32Array(12),
			insolation_monthly: new Float32Array(12),
			pet_monthly: new Float32Array(12),
			daylight_hours_monthly: new Float32Array(12),
			landFraction: [],
		},
		rainfall: {
			monthly: Float32Array.from(monthlyRain),
			annual: new Float32Array([
				monthlyRain.reduce((sum, value) => sum + value, 0),
			]),
			east: new Float32Array([0]),
			west: new Float32Array([0]),
		},
	}
}

function classify(
	monthlyTemps: number[],
	monthlyRain: number[],
	z = 0,
): string {
	const { mesh, isLand, climate, rainfall } = buildClimate(
		monthlyTemps,
		monthlyRain,
		z,
	)
	return KOPPEN_LABELS[assignKoppenClimate(mesh, isLand, climate, rainfall)[0]]!
}

describe("assignKoppenClimate", () => {
	it("classifies polar climates before other groups", () => {
		expect(classify(new Array(12).fill(-5), new Array(12).fill(40))).toBe("EF")
		expect(
			classify([5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 2], new Array(12).fill(40)),
		).toBe("ET")
	})

	it("distinguishes hot and cold arid climates", () => {
		expect(classify(new Array(12).fill(25), new Array(12).fill(8))).toBe("BWh")
		expect(classify(new Array(12).fill(12), new Array(12).fill(9))).toBe("BWk")
		expect(classify(new Array(12).fill(25), new Array(12).fill(30))).toBe("BSh")
	})

	it("classifies tropical rainforest, monsoon, and savanna climates", () => {
		expect(classify(new Array(12).fill(26), new Array(12).fill(80))).toBe("Af")
		expect(
			classify(
				new Array(12).fill(26),
				[200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 50],
			),
		).toBe("Am")
		expect(
			classify(
				new Array(12).fill(26),
				[10, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
			),
		).toBe("Aw")
	})

	it("applies hemisphere-aware dry-summer and dry-winter seasonality", () => {
		expect(
			classify(
				[5, 6, 10, 15, 20, 25, 24, 22, 18, 12, 8, 5],
				[120, 110, 90, 80, 70, 10, 5, 10, 60, 80, 100, 130],
			),
		).toBe("Csa")
		expect(
			classify(
				[24, 25, 21, 18, 14, 9, 6, 7, 10, 14, 19, 23],
				[130, 120, 80, 60, 40, 5, 3, 4, 30, 50, 90, 140],
			),
		).toBe("Cwa")
	})

	it("classifies continental climates with extreme winters", () => {
		expect(
			classify(
				[-40, -38, -20, -5, 3, 11, 15, 13, 8, -2, -18, -35],
				new Array(12).fill(60),
				0.6,
			),
		).toBe("Dfd")
	})

	it("covers no-dry-season temperate and continental subclasses", () => {
		expect(
			classify(
				[2, 4, 7, 11, 15, 19, 21, 20, 17, 12, 7, 3],
				new Array(12).fill(80),
			),
		).toBe("Cfb")
		expect(
			classify(
				[-15, -12, -8, -2, 4, 10, 12, 11, 6, 0, -6, -12],
				new Array(12).fill(60),
			),
		).toBe("Dfc")
	})

	it("distinguishes cold steppe climates and zero-rain aridity fallback", () => {
		expect(classify(new Array(12).fill(10), new Array(12).fill(15))).toBe("BSk")
		expect(classify(new Array(12).fill(22), new Array(12).fill(0))).toBe("BWh")
	})
})

describe("koppen helpers", () => {
	it("returns human-readable labels and safe fallback colors", () => {
		expect(koppenClimateName(1)).toBe("Tropical rainforest")
		expect(koppenClimateName(999)).toBe("Ocean")
		expect(koppenClimateColor(4)).toEqual([1, 0, 0])
		expect(koppenClimateColor(999)).toEqual([0.29, 0.44, 0.65])
	})
})
