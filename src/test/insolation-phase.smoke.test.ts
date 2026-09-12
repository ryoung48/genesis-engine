import { describe, expect, it } from "vitest"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"

describe("explicit orbital phase", () => {
	it("reindexes a circular orbit when the year starts a quarter orbit later", () => {
		const params = {
			lats: [0],
			orbital: { OBLIQUITY: 30, ECCENTRICITY: 0, PERIHELION: 40 },
			sampleCount: 360,
		}
		const original = INSOLATION.compute({
			...params,
			startSolarLongitudeDegrees: 0,
		})
		const shifted = INSOLATION.compute({
			...params,
			startSolarLongitudeDegrees: 90,
		})
		for (let day = 0; day < params.sampleCount; day++) {
			const originalDay = (day + 90) % params.sampleCount
			expect(shifted._declination[day]).toBeCloseTo(
				original._declination[originalDay],
				6,
			)
			expect(shifted._insolation[0][day]).toBeCloseTo(
				original._insolation[0][originalDay],
				5,
			)
		}
	})

	it.each([
		0, 90, 210,
	])("keeps zero-tilt declination zero at starting phase %s", (phase) => {
		const result = INSOLATION.compute({
			lats: [0],
			orbital: { OBLIQUITY: 0, ECCENTRICITY: 0.3, PERIHELION: 70 },
			sampleCount: 240,
			startSolarLongitudeDegrees: phase,
		})
		expect(result._declination.every((value) => value === 0)).toBe(true)
	})

	it("preserves unequal season lengths on eccentric orbits", () => {
		const northernDays = [90, 270].map((perihelion) => {
			const result = INSOLATION.compute({
				lats: [0],
				orbital: {
					OBLIQUITY: 40,
					ECCENTRICITY: 0.3,
					PERIHELION: perihelion,
				},
				sampleCount: 360,
				startSolarLongitudeDegrees: 0,
			})
			return result._declination.filter((value) => value > 1e-10).length
		})
		expect(northernDays[0]).toBeGreaterThan(220)
		expect(northernDays[1]).toBeLessThan(140)
	})
})
