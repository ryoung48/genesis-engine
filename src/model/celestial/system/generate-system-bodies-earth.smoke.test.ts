import { describe, expect, it } from "vitest"
import { generateSystemBodies } from "./generate-system-bodies"
import { SOL_SEED } from "./sol-system"

describe("Earth's moons survive generateSystemBodies (moonsOverride wiring)", () => {
	it("Sol seed: Earth carries Luna", () => {
		const bodies = generateSystemBodies({
			seed: SOL_SEED,
			spectralClass: "G",
			starSubtype: 2,
			hoursPerDay: 24,
			mainWorld: {
				orbitalDistanceAU: 1,
				diameterKm: 12742,
				moons: [
					{
						idx: 1,
						name: "Luna",
						massKg: 7.34e22,
						diameterKm: 3474,
						sizeClass: 2,
						densityEarthRelative: 0.607,
						densityDescription: "Mostly Rock",
						group: "dwarf",
						classification: "rockball",
						hydrosphereFraction: 0,
						atmosphere: {
							code: 0,
							pressureBar: 0,
							type: "vacuum",
							breathable: false,
						},
						orbitalPeriodDays: 27.3,
						siderealDayHours: 655.2,
						eccentricity: 0.055,
						inclinationDeg: 5.1,
						longitudeOfAscendingNodeDeg: 0,
						longitudeOfPerihelionDeg: 0,
						meanAnomalyAtEpochDeg: 0,
						axialTiltDeg: 6.7,
						orbitRange: "middle",
						semiMajorAxisPlanetDiameters: 30.17,
						albedo: 0.12,
						greenhouseFactor: 0,
					},
				],
				massKg: 5.973886146404331e24,
				gravityG: 1,
				siderealDayHours: 24,
				eccentricity: 0.0167,
				longitudeOfPerihelionDeg: 102,
				axialTiltDeg: 23.5,
				atmosphere: {
					code: 5,
					pressureBar: 1,
					type: "breathable",
					breathable: true,
				},
				tideLock: null,
			},
		})
		const earth = bodies.find((b) => b.isMainWorld)
		expect(earth).toBeTruthy()
		expect(earth?.moons.length).toBe(1)
		expect(earth?.moons[0]?.name).toBe("Luna")
	})
})
