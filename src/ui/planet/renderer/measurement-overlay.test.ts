import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { describe, expect, it } from "vitest"
import {
	buildGlobeMeasurementOverlay,
	buildMapMeasurementOverlay,
} from "./measurement-overlay"

describe("measurement-overlay", () => {
	const start: [number, number, number] = [1, 0, 0]
	const end: [number, number, number] = [0, 1, 0]
	const fromLonLat = (
		lonDeg: number,
		latDeg: number,
	): [number, number, number] => {
		const lon = THREE.MathUtils.degToRad(lonDeg)
		const lat = THREE.MathUtils.degToRad(latDeg)
		const cosLat = Math.cos(lat)
		return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)]
	}

	it("renders a single globe dot before the end point is chosen", () => {
		const overlay = buildGlobeMeasurementOverlay(
			start,
			null,
			"globe",
			[800, 600],
		)

		expect(overlay.line).toBeNull()
		expect(overlay.dots).toBeInstanceOf(THREE.Group)
		expect(overlay.dots.visible).toBe(true)
		expect(overlay.dots.children).toHaveLength(1)
	})

	it("renders globe dots and a dashed line once both points are set", () => {
		const overlay = buildGlobeMeasurementOverlay(
			start,
			end,
			"globe",
			[800, 600],
		)

		expect(overlay.line).not.toBeNull()
		expect((overlay.line?.material as LineMaterial).dashed).toBe(true)
		expect(overlay.dots.children).toHaveLength(2)
	})

	it("renders a single map dot before the end point is chosen", () => {
		const overlay = buildMapMeasurementOverlay(
			start,
			null,
			"map",
			[800, 600],
			0,
			0,
		)

		expect(overlay.line).toBeNull()
		expect(overlay.dots.visible).toBe(true)
		expect(overlay.dots.children).toHaveLength(1)
	})

	it("renders a dashed map line once both points are set", () => {
		const overlay = buildMapMeasurementOverlay(
			start,
			end,
			"map",
			[800, 600],
			0,
			0,
		)

		expect(overlay.line).not.toBeNull()
		expect((overlay.line?.material as LineMaterial).dashed).toBe(true)
		expect(overlay.dots.children).toHaveLength(2)
	})

	it("keeps seam-crossing map measurements local around the antimeridian", () => {
		const overlay = buildMapMeasurementOverlay(
			fromLonLat(179, 0),
			fromLonLat(-179, 0),
			"map",
			[800, 600],
			0,
			0,
		)

		const geometry = overlay.line?.geometry as THREE.BufferGeometry
		const starts = geometry.getAttribute(
			"instanceStart",
		) as THREE.BufferAttribute
		const ends = geometry.getAttribute("instanceEnd") as THREE.BufferAttribute
		const xs = [
			...Array.from(starts.array as ArrayLike<number>).filter(
				(_value, index) => index % 3 === 0,
			),
			...Array.from(ends.array as ArrayLike<number>).filter(
				(_value, index) => index % 3 === 0,
			),
		]

		expect(overlay.line).not.toBeNull()
		expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.2)
	})
})
