import { expect, it } from "vitest"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"

it("keeps water preference for small states without giving large states first choice of coasts", () => {
	const provinces = {
		habitability: new Float32Array([0.5, 0.5, 0.5]),
		waterAccess: new Uint8Array([0, 1, 2]),
		provinceContinent: new Uint8Array(3),
	}
	const small = [0, 1, 2].map((province) =>
		PLACEMENT.nationPlacementScore({ ...provinces, province, target: 9 }),
	)
	expect(small[2]).toBeGreaterThan(small[1])
	expect(small[1]).toBeGreaterThan(small[0])
	for (const target of [10, 24, 50, 250]) {
		const scores = [0, 1, 2].map((province) =>
			PLACEMENT.nationPlacementScore({ ...provinces, province, target }),
		)
		expect(scores[1]).toBe(scores[0])
		expect(scores[2]).toBe(scores[0])
	}
})

it("lets large states grow by proximity and habitability without a water bonus", () => {
	const claims = {
		nation: 0,
		seedProvince: 0,
		active: new Uint8Array([1, 1, 1]),
		assignment: new Int32Array([0, -1, -1]),
		habitability: new Float32Array([0.5, 0.6, 0.5]),
		waterAccess: new Uint8Array([0, 0, 2]),
		r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, 0, 1, 0]),
		provinceSeeds: new Int32Array([0, 1, 2]),
		adjOffset: new Int32Array([0, 2, 3, 4]),
		adjList: new Int32Array([1, 2, 0, 0]),
		noise: new SimplexNoise(1),
		maxSpreadRad: Math.PI,
	}
	expect(
		PLACEMENT.bestClaim({ ...claims, frontier: new Set([1, 2]), target: 9 }),
	).toBe(2)
	expect(
		PLACEMENT.bestClaim({ ...claims, frontier: new Set([1, 2]), target: 10 }),
	).toBe(1)
})
