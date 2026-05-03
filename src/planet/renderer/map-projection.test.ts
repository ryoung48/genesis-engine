import { describe, expect, it } from "vitest"
import { createMapProjection, wrapLongitudeRadians } from "./map-projection"

describe("map projection helpers", () => {
	it("wraps longitudes around the selected map center", () => {
		const ninetyDegrees = Math.PI / 2
		expect(wrapLongitudeRadians(Math.PI * 1.5, ninetyDegrees)).toBeCloseTo(
			Math.PI,
		)
		expect(wrapLongitudeRadians(-Math.PI * 1.5, -ninetyDegrees)).toBeCloseTo(
			-Math.PI,
		)
		expect(wrapLongitudeRadians(Math.PI * 1.2)).toBeCloseTo(-0.8 * Math.PI)
		expect(wrapLongitudeRadians(-Math.PI * 1.2)).toBeCloseTo(0.8 * Math.PI)
	})

	it("projects cartesian points into map lon lat coordinates", () => {
		const projection = createMapProjection(0)
		expect(projection.projectCartesian(1, 0, 0)).toEqual({ lon: 0, lat: 0 })
		expect(projection.projectCartesian(0, 1, 0).lon).toBeCloseTo(Math.PI / 2)
		expect(projection.projectCartesian(0, 0, 1).lat).toBeCloseTo(Math.PI / 2)
	})

	it("centers the selected latitude in the map projection", () => {
		const northPolar = createMapProjection(0, 90)
		const southPolar = createMapProjection(0, -90)

		expect(northPolar.projectCartesian(0, 0, 1).lon).toBeCloseTo(0)
		expect(northPolar.projectCartesian(0, 0, 1).lat).toBeCloseTo(0)
		expect(southPolar.projectCartesian(0, 0, -1).lon).toBeCloseTo(0)
		expect(southPolar.projectCartesian(0, 0, -1).lat).toBeCloseTo(0)
	})

	it("projects radians while preserving the optional z coordinate", () => {
		const projection = createMapProjection(30, 60)
		const projected = projection.projectRadians(Math.PI / 2, Math.PI / 4, 3)

		expect(projected[0]).toBeCloseTo(1)
		expect(projected[1]).toBeCloseTo(0.5)
		expect(projected[2]).toBe(3)
		expect(projection.clampX(4)).toBeCloseTo(projection.halfWidth)
		expect(projection.clampY(4)).toBe(1)
		expect(projection.repeatWidth).toBe(4)
	})
})
