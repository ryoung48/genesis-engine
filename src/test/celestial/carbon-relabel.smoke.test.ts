import { describe, expect, it } from "vitest"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { DENSITY } from "@/model/celestial/planet/environment/density"
import { RNG } from "@/model/shared/random/rng"

function describeAt(densityEarthRelative: number, seed: number): string {
	const profile = DENSITY.buildProfile({
		rng: RNG.createRng({ seed }),
		massKg: ORBIT_BODY.massKgFromEarthRelativeDensity({
			diameterKm: ORBIT_BODY.earthDiameterKm,
			densityEarthRelative,
		}),
		diameterKm: ORBIT_BODY.earthDiameterKm,
		classification: "tectonic",
		hostSpectralClass: "G",
	})
	return profile?.description ?? "missing"
}

describe("Carbon relabel gating", () => {
	it("never relabels Mostly Metal or Compressed Metal densities", () => {
		for (const density of [1.15, 1.3, 1.45, 1.5, 1.7, 2.0]) {
			for (let seed = 1; seed <= 200; seed++) {
				expect(describeAt(density, seed)).not.toBe("Carbon")
			}
		}
	})

	it("still relabels silicate-range densities often enough to occur", () => {
		const seen = new Set<string>()
		for (let seed = 1; seed <= 500; seed++) {
			seen.add(describeAt(0.65, seed))
			seen.add(describeAt(1.0, seed))
		}
		expect(seen.has("Carbon")).toBe(true)
		expect(seen.has("Mostly Rock")).toBe(true)
		expect(seen.has("Rock and Metal")).toBe(true)
	})
})
