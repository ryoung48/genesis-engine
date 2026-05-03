import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import {
	clamp,
	clamp01,
	eulerVelocityAt,
	getRegionLatLonDegrees,
	piecewise,
	smoothstep,
} from "./math"

describe("clamp", () => {
	it("returnsValueWhenWithinRange", () => {
		expect(clamp(0.5, 0, 1)).toBe(0.5)
	})

	it("clampsToLo", () => {
		expect(clamp(-5, 0, 10)).toBe(0)
	})

	it("clampsToHi", () => {
		expect(clamp(15, 0, 10)).toBe(10)
	})
})

describe("clamp01", () => {
	it("returnsValueWhenWithinRange", () => {
		expect(clamp01(0.3)).toBeCloseTo(0.3)
	})

	it("clampsNegativeToZero", () => {
		expect(clamp01(-1)).toBe(0)
	})

	it("clampsAboveOneToOne", () => {
		expect(clamp01(2)).toBe(1)
	})
})

describe("smoothstep", () => {
	it("returnsZeroAtEdge0", () => {
		expect(smoothstep(0, 1, 0)).toBe(0)
	})

	it("returnsOneAtEdge1", () => {
		expect(smoothstep(0, 1, 1)).toBe(1)
	})

	it("returnsMidpointAtHalf", () => {
		expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
	})

	it("clampsOutsideRange", () => {
		expect(smoothstep(0, 1, -1)).toBe(0)
		expect(smoothstep(0, 1, 2)).toBe(1)
	})

	it("handlesEqualEdges", () => {
		expect(smoothstep(5, 5, 5)).toBe(1)
		expect(smoothstep(5, 5, 4)).toBe(0)
	})
})

describe("eulerVelocityAt", () => {
	it("returnsZeroVelocityForZeroOmega", () => {
		const v = eulerVelocityAt([0, 0, 1], 0, 1, 0, 0)
		expect(v).toEqual([0, 0, 0])
	})

	it("computesCrossProduct", () => {
		// pole = z-axis [0,0,1], omega=1, point = [1,0,0]
		// v = omega * (pole x point) = [0*0-1*0, 1*1-0*0, 0*0-0*1] = [0,1,0]
		const v = eulerVelocityAt([0, 0, 1], 1, 1, 0, 0)
		expect(v[0]).toBeCloseTo(0)
		expect(v[1]).toBeCloseTo(1)
		expect(v[2]).toBeCloseTo(0)
	})

	it("scalesWithOmega", () => {
		const v1 = eulerVelocityAt([0, 0, 1], 1, 1, 0, 0)
		const v2 = eulerVelocityAt([0, 0, 1], 2, 1, 0, 0)
		expect(v2[1]).toBeCloseTo(v1[1] * 2)
	})
})

describe("getRegionLatLonDegrees", () => {
	it("returnsZeroLatLonForPosXPoint", () => {
		const mesh = {
			numRegions: 1,
			r_xyz: new Float32Array([1, 0, 0]),
		} as unknown as SphereMesh
		const { latDeg, lonDeg } = getRegionLatLonDegrees(mesh)
		expect(latDeg[0]).toBeCloseTo(0)
		expect(lonDeg[0]).toBeCloseTo(0)
	})

	it("returns90LatForNorthPole", () => {
		const mesh = {
			numRegions: 1,
			r_xyz: new Float32Array([0, 0, 1]),
		} as unknown as SphereMesh
		const { latDeg } = getRegionLatLonDegrees(mesh)
		expect(latDeg[0]).toBeCloseTo(90)
	})

	it("returnsNeg90LatForSouthPole", () => {
		const mesh = {
			numRegions: 1,
			r_xyz: new Float32Array([0, 0, -1]),
		} as unknown as SphereMesh
		const { latDeg } = getRegionLatLonDegrees(mesh)
		expect(latDeg[0]).toBeCloseTo(-90)
	})

	it("returns90LonForPosYPoint", () => {
		const mesh = {
			numRegions: 1,
			r_xyz: new Float32Array([0, 1, 0]),
		} as unknown as SphereMesh
		const { lonDeg } = getRegionLatLonDegrees(mesh)
		expect(lonDeg[0]).toBeCloseTo(90)
	})
})

describe("piecewise", () => {
	it("returnsFirstValueBelowDomain", () => {
		expect(piecewise([0, 1], [10, 20], -1)).toBe(10)
	})

	it("returnsLastValueAboveDomain", () => {
		expect(piecewise([0, 1], [10, 20], 2)).toBe(20)
	})

	it("interpolatesLinearly", () => {
		expect(piecewise([0, 1], [0, 100], 0.5)).toBeCloseTo(50)
	})
})
