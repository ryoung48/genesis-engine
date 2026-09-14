import { describe, expect, it } from "vitest"
import { ORBIT_PLACEMENT } from "@/model/celestial/system/generation/orbit-placement"
import { RNG } from "@/model/shared/random/rng"

describe("Orbit placement", () => {
	it("walks regular slots around the baseline and assigns every ordinary type", () => {
		const slots = ORBIT_PLACEMENT.place({
			rng: RNG.createRng({ seed: 1 }),
			baselineNumber: 3,
			baselineOrbitNumber: 3,
			totalWorlds: 6,
			gasGiantCount: 1,
			beltCount: 1,
			terrestrialCount: 3,
			emptyOrbitCount: 1,
			anomalousOrbitReservations: [],
			minimumOrbitNumber: 0,
			maximumOrbitNumber: 10,
			exclusionZones: [],
		})
		expect(slots).toHaveLength(6)
		expect(slots.find((slot) => slot.isBaseline)?.orbitNumber).toBe(3)
		expect(slots.filter((slot) => slot.type === "empty")).toHaveLength(1)
		expect(slots.filter((slot) => slot.type === "gas-giant")).toHaveLength(1)
		expect(slots.filter((slot) => slot.type === "belt")).toHaveLength(1)
		expect(slots.filter((slot) => slot.type === "terrestrial")).toHaveLength(3)
		expect(slots.find((slot) => slot.isBaseline)?.type).not.toBe("empty")
	})

	it("inserts anomalous slots and protects trojan hosts from empty placement", () => {
		const slots = ORBIT_PLACEMENT.place({
			rng: RNG.createRng({ seed: 2 }),
			baselineNumber: 2,
			baselineOrbitNumber: 2,
			totalWorlds: 3,
			gasGiantCount: 0,
			beltCount: 0,
			terrestrialCount: 2,
			emptyOrbitCount: 1,
			anomalousOrbitReservations: [
				{ type: "random", worldType: "belt", starIndex: 0 },
				{ type: "trojan", worldType: "terrestrial", starIndex: 0 },
			],
			minimumOrbitNumber: 0,
			maximumOrbitNumber: 10,
			exclusionZones: [],
		})
		expect(slots).toHaveLength(4)
		expect(slots.some((slot) => slot.anomalousOrbitType === "random")).toBe(
			true,
		)
		expect(slots.find((slot) => slot.trojanCount === 1)?.type).not.toBe("empty")
	})

	it("routes regular slots around a companion exclusion zone", () => {
		for (let seed = 1; seed <= 50; seed++) {
			const slots = ORBIT_PLACEMENT.place({
				rng: RNG.createRng({ seed }),
				baselineNumber: 3,
				baselineOrbitNumber: 3,
				totalWorlds: 8,
				gasGiantCount: 2,
				beltCount: 1,
				terrestrialCount: 5,
				emptyOrbitCount: 0,
				anomalousOrbitReservations: [],
				minimumOrbitNumber: 0,
				maximumOrbitNumber: 10,
				exclusionZones: [{ minOrbitNumber: 4, maxOrbitNumber: 6 }],
			})
			expect(slots).toHaveLength(8)
			for (const slot of slots) {
				expect(slot.orbitNumber >= 0 && slot.orbitNumber <= 10).toBe(true)
				const insideZone = slot.orbitNumber > 4 && slot.orbitNumber < 6
				expect(insideZone).toBe(false)
			}
		}
	})

	it("varies regular slot spacing instead of a smooth deterministic ramp", () => {
		const slots = ORBIT_PLACEMENT.place({
			rng: RNG.createRng({ seed: 7 }),
			baselineNumber: 4,
			baselineOrbitNumber: 4,
			totalWorlds: 9,
			gasGiantCount: 0,
			beltCount: 0,
			terrestrialCount: 9,
			emptyOrbitCount: 0,
			anomalousOrbitReservations: [],
			minimumOrbitNumber: 0,
			maximumOrbitNumber: 15,
			exclusionZones: [],
		}).sort((a, b) => a.orbitNumber - b.orbitNumber)
		const gaps = slots
			.slice(1)
			.map((slot, index) => slot.orbitNumber - slots[index]!.orbitNumber)
		const allGapsEqual = gaps.every((gap) => Math.abs(gap - gaps[0]!) < 1e-9)
		expect(allGapsEqual).toBe(false)
	})

	it("reports each slot's own real spread, not a fixed stand-in", () => {
		const slots = ORBIT_PLACEMENT.place({
			rng: RNG.createRng({ seed: 3 }),
			baselineNumber: 3,
			baselineOrbitNumber: 3,
			totalWorlds: 8,
			gasGiantCount: 1,
			beltCount: 1,
			terrestrialCount: 6,
			emptyOrbitCount: 0,
			anomalousOrbitReservations: [
				{ type: "random", worldType: "terrestrial", starIndex: 0 },
			],
			minimumOrbitNumber: 0,
			maximumOrbitNumber: 20,
			exclusionZones: [],
		})
		for (const slot of slots) {
			expect(slot.spreadOrbitNumber).toBeGreaterThan(0)
		}
		// An anomalous slot's spread should match whichever regular slot it
		// landed nearest to, not an unrelated constant.
		const anomalous = slots.find(
			(slot) => slot.anomalousOrbitType === "random",
		)!
		const regular = slots.filter((slot) => slot.anomalousOrbitType === null)
		const nearest = regular.reduce((best, slot) =>
			Math.abs(slot.orbitNumber - anomalous.orbitNumber) <
			Math.abs(best.orbitNumber - anomalous.orbitNumber)
				? slot
				: best,
		)
		expect(anomalous.spreadOrbitNumber).toBe(nearest.spreadOrbitNumber)
	})
})
