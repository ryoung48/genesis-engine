import { describe, expect, it } from "vitest"
import { RIVER_SEDIMENT } from "@/model/geography/terrain/rocks/river-sediment"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

const RADIUS_KM = 1000

function flatWorld() {
	const mesh = MESH.buildSphereMesh({
		n: 6000,
		jitter: 0.5,
		rng: RNG.createRng({ seed: 77031 }),
	})
	const n = mesh.numRegions
	return {
		mesh,
		isLand: new Uint8Array(n).fill(1),
		elevationKm: new Float32Array(n),
		discharge: new Float32Array(n),
	}
}

describe("river sediment mask", () => {
	it("marks the thickest sediment as river deposit and thin sediment as none", () => {
		const { mesh, isLand, elevationKm, discharge } = flatWorld()
		const n = mesh.numRegions
		const sedimentKm = new Float32Array(n)
		for (let r = 0; r < n; r++) sedimentKm[r] = (r / n) * 0.01
		const { river, plainLowKm, plainHighKm } = RIVER_SEDIMENT.mask({
			mesh,
			planetRadiusKm: RADIUS_KM,
			isLand,
			sedimentKm,
			discharge,
			elevationKm,
		})
		expect(plainHighKm).toBeGreaterThan(plainLowKm)
		expect(river[0]).toBe(0)
		expect(river[n - 1]).toBe(1)
		let share = 0
		for (let r = 0; r < n; r++) if (river[r] >= 0.5) share++
		expect(share / n).toBeGreaterThan(SURFACE_CONFIG.plainsShare - 0.05)
		expect(share / n).toBeLessThan(SURFACE_CONFIG.plainsShare + 0.05)
	})

	it("floods the low ground along a big river and not far from it", () => {
		const { mesh, isLand, elevationKm, discharge } = flatWorld()
		const n = mesh.numRegions
		const source = 0
		discharge[source] = SURFACE_CONFIG.floodplainQ[1]
		const { river } = RIVER_SEDIMENT.mask({
			mesh,
			planetRadiusKm: RADIUS_KM,
			isLand,
			sedimentKm: new Float32Array(n),
			discharge,
			elevationKm,
		})
		expect(river[source]).toBeGreaterThan(0.5)
		let farthest = 0
		for (let r = 0; r < n; r++) {
			const dot =
				mesh.r_xyz[3 * r] * mesh.r_xyz[0] +
				mesh.r_xyz[3 * r + 1] * mesh.r_xyz[1] +
				mesh.r_xyz[3 * r + 2] * mesh.r_xyz[2]
			const km = Math.acos(Math.max(-1, Math.min(1, dot))) * RADIUS_KM
			if (km > SURFACE_CONFIG.floodplainKm[2] * 3) {
				farthest++
				expect(river[r]).toBe(0)
			}
		}
		expect(farthest).toBeGreaterThan(0)
	})

	it("keeps a river on high ground above its channel from flooding the heights", () => {
		const { mesh, isLand, elevationKm, discharge } = flatWorld()
		const n = mesh.numRegions
		discharge[0] = SURFACE_CONFIG.floodplainQ[1]
		const [, handNone] = SURFACE_CONFIG.floodplainHandKm
		const neighbor = mesh.adjList[mesh.adjOffset[0]]
		elevationKm[neighbor] = handNone * 2
		const { river } = RIVER_SEDIMENT.mask({
			mesh,
			planetRadiusKm: RADIUS_KM,
			isLand,
			sedimentKm: new Float32Array(n),
			discharge,
			elevationKm,
		})
		expect(river[neighbor]).toBe(0)
	})
})
