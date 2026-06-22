import { describe, expect, it } from "vitest"
import {
	generateGasGiantSystem,
	M_SOL_KG,
} from "../celestial/moons/orbital-mechanics"
import { getStarMassSol } from "../celestial/star/star-types"
import { computeGasGiantTidalSchedule } from "./tidal-schedule"

describe("gas giant tidal schedule", () => {
	const spectralClass = "G"
	const starSubtype = 2
	const planetRadiusKm = 6371
	const orbitalDistanceAU = 1
	const starMassKg = getStarMassSol(spectralClass, starSubtype) * M_SOL_KG
	const gasGiantSystem = generateGasGiantSystem(
		1234,
		planetRadiusKm,
		orbitalDistanceAU,
		starMassKg,
		23.5,
	)

	it("builds contributor series relative to the main world", () => {
		const schedule = computeGasGiantTidalSchedule(gasGiantSystem, {
			daysPerYear: 180,
			hoursPerDay: 24,
			planetRadiusKm,
			tideLock: null,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			eccentricity: 0.03,
			perihelion: 90,
		})

		expect(schedule.events).toHaveLength(180)
		expect(schedule.contributorLabels).toHaveLength(
			gasGiantSystem.siblingMoons.length + 1,
		)
		expect(schedule.contributorLabels[0]).toBe("Gas Giant")
		expect(
			Math.max(
				...schedule.events.map((event) => Math.abs(event.moonForces[0] ?? 0)),
			),
		).toBeGreaterThan(0)
	})

	it("suppresses the gas giant series when the main world is giant-locked", () => {
		const schedule = computeGasGiantTidalSchedule(gasGiantSystem, {
			daysPerYear: 60,
			hoursPerDay: 24,
			planetRadiusKm,
			tideLock: { type: "lunar", target: 0 },
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			eccentricity: 0.03,
			perihelion: 90,
		})

		expect(
			schedule.events.every((event) => (event.moonForces[0] ?? 0) === 0),
		).toBe(true)
	})
})
