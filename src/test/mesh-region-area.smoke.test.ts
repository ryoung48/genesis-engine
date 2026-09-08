import { describe, expect, it } from "vitest"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

describe("mesh regionArea", () => {
	it("sums to 4pi on a uniform mesh", () => {
		const mesh = MESH.buildSphereMesh({
			n: 4000,
			jitter: 0.5,
			rng: RNG.createRng({ seed: 1 }),
		})
		let sum = 0
		for (let r = 0; r < mesh.numRegions; r++) sum += mesh.regionArea[r]
		expect(sum).toBeCloseTo(4 * Math.PI, 3)
	})

	it("is non-uniform on a land-densified adaptive mesh", () => {
		const near = (lat: number, lon: number) =>
			Math.abs(lat) < 20 && Math.abs(lon) < 20 ? 8 : 1
		const mesh = MESH.buildSphereMesh({
			n: 4000,
			jitter: 0.5,
			rng: RNG.createRng({ seed: 2 }),
			densityWeight: near,
		})
		let sum = 0
		let min = Infinity
		let max = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			const a = mesh.regionArea[r]
			sum += a
			if (a < min) min = a
			if (a > max) max = a
		}
		// Centroid-dual cells (t_xyz is the normalized centroid, not the true
		// circumcenter) leave ~0.1% total-area slack on skinny seam triangles.
		expect(sum).toBeGreaterThan(4 * Math.PI * 0.99)
		expect(sum).toBeLessThan(4 * Math.PI * 1.01)
		expect(max / min).toBeGreaterThan(3)
	})
})
