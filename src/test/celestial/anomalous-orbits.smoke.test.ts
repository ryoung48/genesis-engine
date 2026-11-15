import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { ANOMALOUS_ORBITS } from "@/model/celestial/system/generation/anomalous-orbits"
import { RNG } from "@/model/shared/random/rng"

describe("Anomalous orbits", () => {
	it("rolls zero to three system-wide reservations for eligible stars", () => {
		let foundReservation = false
		for (let seed = 1; seed <= 100; seed++) {
			const reservations = ANOMALOUS_ORBITS.roll({
				rng: RNG.createRng({ seed }),
				terrestrialCount: 4,
				eligibleStarIndices: [2, 5],
			})
			expect(reservations.length).toBeLessThanOrEqual(3)
			for (const reservation of reservations) {
				expect([2, 5]).toContain(reservation.starIndex)
				expect([
					"random",
					"eccentric",
					"inclined",
					"retrograde",
					"trojan",
				]).toContain(reservation.type)
			}
			foundReservation ||= reservations.length > 0
		}
		expect(foundReservation).toBe(true)
	})

	it("converts anomalies beyond thirteen terrestrials into belts", () => {
		for (let seed = 1; seed <= 100; seed++) {
			const reservations = ANOMALOUS_ORBITS.roll({
				rng: RNG.createRng({ seed }),
				terrestrialCount: 13,
				eligibleStarIndices: [0],
			})
			for (const reservation of reservations) {
				expect(reservation.worldType).toBe("belt")
			}
		}
	})

	it("keeps fitted-region reservations compatible with circular coplanar placement", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		for (const allocation of system.stars.flatMap((star) => star.regions)) {
			for (const reservation of allocation.anomalousOrbitReservations) {
				if (allocation.region.fitted)
					expect(["random", "trojan"]).toContain(reservation.type)
			}
		}
	})
})
