import { describe, expect, it } from "vitest"
import type { WindArrowData } from "@/model/climate/weather/wind/types"
import { uiWindMap } from "@/ui/components/tokens"
import {
	buildGlobeWindArrows,
	buildMapWindArrows,
	buildWindArrowData,
} from "@/ui/genesis/renderer/overlay-builders/wind-arrows"
import { windSpeedColor } from "@/ui/genesis/shared/colors"
import { getVisibleGeographyModeOptions } from "@/ui/genesis/shared/map-modes"

const eastward: WindArrowData = {
	lat: Float32Array.of(0),
	lon: Float32Array.of(0),
	u: Float32Array.of(1),
	v: Float32Array.of(0),
	speed: Float32Array.of(20),
}

describe("wind map", () => {
	it("exposes a weather group with the reference mint-to-cyan wind speed scale", () => {
		expect(getVisibleGeographyModeOptions(false)).toContainEqual([
			"precipitation",
			"Weather",
		])
		expect(windSpeedColor(0)).toEqual([232 / 255, 1, 241 / 255])
		expect(windSpeedColor(20)).toEqual([0, 207 / 255, 232 / 255])
		expect(windSpeedColor(40)).toEqual(windSpeedColor(20))
	})

	it("samples direction and speed together on a sparse grid", () => {
		const data = buildWindArrowData({
			width: 360,
			height: 181,
			u: new Float32Array(360 * 181).fill(3),
			v: new Float32Array(360 * 181).fill(4),
			speed: new Float32Array(360 * 181).fill(5),
		})
		expect(data.lat.length).toBe(uiWindMap.columns ** 2 / 2)
		expect(data.u[0]).toBe(3)
		expect(data.v[0]).toBe(4)
		expect(data.speed[0]).toBe(5)
		expect(Math.max(...data.lat)).toBeLessThan(90)
		expect(Math.min(...data.lat)).toBeGreaterThan(-90)
	})

	it("points east and scales the shaft with speed", () => {
		const full = buildMapWindArrows({
			data: eastward,
			viewMode: "map",
			projectionLatitudeDeg: 0,
		})
		const half = buildMapWindArrows({
			data: { ...eastward, speed: Float32Array.of(10) },
			viewMode: "map",
			projectionLatitudeDeg: 0,
		})
		if (!full || !half) throw new Error("Missing wind arrows")
		const a = full.geometry.getAttribute("position")
		const b = half.geometry.getAttribute("position")
		expect(a.count).toBe(6)
		expect(a.getX(1)).toBeGreaterThan(a.getX(0))
		expect(a.getY(1)).toBeCloseTo(a.getY(0))
		expect((a.getX(1) - a.getX(0)) / (b.getX(1) - b.getX(0))).toBeCloseTo(2, 2)
	})

	it("projects arrows with the rotated map and splits the seam", () => {
		const rotated = buildMapWindArrows({
			data: { ...eastward, lon: Float32Array.of(90) },
			viewMode: "map",
			projectionLatitudeDeg: 45,
		})
		const seam = buildMapWindArrows({
			data: { ...eastward, lon: Float32Array.of(179) },
			viewMode: "map",
			projectionLatitudeDeg: 0,
		})
		if (!rotated || !seam) throw new Error("Missing wind arrows")
		const a = rotated.geometry.getAttribute("position")
		expect(a.getY(1)).toBeGreaterThan(a.getY(0))
		const b = seam.geometry.getAttribute("position")
		let longest = 0
		for (let i = 0; i < b.count; i += 2) {
			longest = Math.max(longest, Math.abs(b.getX(i + 1) - b.getX(i)))
		}
		expect(longest).toBeLessThan(0.2)
	})

	it("keeps globe arrows above the surface and omits calm winds", () => {
		const globe = buildGlobeWindArrows({
			data: eastward,
			viewMode: "globe",
			elevationVisible: false,
		})
		if (!globe) throw new Error("Missing wind arrows")
		const positions = globe.geometry.getAttribute("position")
		let radiusError = 0
		for (let i = 0; i < positions.count; i++) {
			radiusError = Math.max(
				radiusError,
				Math.abs(
					Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)) -
						uiWindMap.globeRadius,
				),
			)
		}
		expect(radiusError).toBeLessThan(1e-6)
		expect(positions.getY(1)).toBeGreaterThan(positions.getY(0))
		expect(
			buildMapWindArrows({
				data: { ...eastward, speed: Float32Array.of(0) },
				viewMode: "map",
				projectionLatitudeDeg: 0,
			}),
		).toBeNull()
	})
})
