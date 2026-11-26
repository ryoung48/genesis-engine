import { describe, expect, it } from "vitest"
import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { PLACERS } from "@/model/geography/terrain/deposits/placers"
import { DRAINAGE } from "@/model/geography/terrain/drainage"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

const RADIUS_KM = 6371
const LENGTH_KM = 400
const MAX_STEPS = 40
const UNDERFLOW = 1e-6

function hill() {
	const mesh = MESH.buildSphereMesh({
		n: 4000,
		jitter: 0.5,
		rng: RNG.createRng({ seed: 11 }),
	})
	const n = mesh.numRegions
	const elevation = Float32Array.from(
		{ length: n },
		(_, r) => mesh.r_xyz[3 * r + 2],
	)
	const isLand = Uint8Array.from(elevation, (z) => (z > 0 ? 1 : 0))
	const order = DRAINAGE.order({
		mesh,
		elevation,
		isLand,
		sinks: new Uint8Array(n),
	})
	return { mesh, n, elevation, isLand, ...order }
}

function distanceKm({
	xyz,
	from,
	to,
}: {
	xyz: Float32Array
	from: number
	to: number
}): number {
	return (
		RADIUS_KM *
		Math.hypot(
			xyz[3 * to] - xyz[3 * from],
			xyz[3 * to + 1] - xyz[3 * from + 1],
			xyz[3 * to + 2] - xyz[3 * from + 2],
		)
	)
}

describe("placers", () => {
	const world = hill()
	let head = 0
	for (let r = 0; r < world.n; r++)
		if (world.isLand[r] && world.elevation[r] > world.elevation[head]) head = r
	const source = new Float32Array(world.n)
	source[head] = 1
	const carried = PLACERS.carry({
		mesh: world.mesh,
		planetRadiusKm: RADIUS_KM,
		isLand: world.isLand,
		drainTarget: world.drainTarget,
		processOrder: world.processOrder,
		source,
		lengthKm: LENGTH_KM,
	})

	it("decays as exp(-d/L) down the drainage path from the source", () => {
		let at = head
		let expected = 1
		let steps = 0
		while (steps < MAX_STEPS) {
			const next = world.drainTarget[at]
			if (next < 0 || !world.isLand[next]) break
			expected *= Math.exp(
				-distanceKm({ xyz: world.mesh.r_xyz, from: at, to: next }) / LENGTH_KM,
			)
			if (expected < UNDERFLOW) break
			expect(carried[next]).toBeCloseTo(expected, 5)
			expect(carried[next]).toBeLessThan(carried[at])
			at = next
			steps++
		}
		expect(steps).toBeGreaterThan(2)
	})

	it("puts nothing off the downstream path, so the order runs source to mouth", () => {
		const path = new Set<number>([head])
		let at = head
		while (world.drainTarget[at] >= 0 && world.isLand[world.drainTarget[at]]) {
			at = world.drainTarget[at]
			path.add(at)
		}
		for (let r = 0; r < world.n; r++)
			if (carried[r] > 0) expect(path.has(r), `region ${r}`).toBe(true)
	})

	it("takes at most 0.15 of the unglaciated value under present ice", () => {
		const base = { discharge: 1500, rough: 0.1, till: false }
		const open = PLACERS.factor({ ...base, glaciated: false })
		const iced = PLACERS.factor({ ...base, glaciated: true })
		expect(open).toBeGreaterThan(0)
		expect(iced).toBeLessThanOrEqual(0.15 * open + 1e-9)
		expect(
			PLACERS.factor({ ...base, till: true, glaciated: false }),
		).toBeLessThan(open)
	})

	it("gates rivers below the discharge floor to nothing", () => {
		expect(
			PLACERS.factor({
				discharge: DEPOSIT_CONFIG.placerDischarge[0] - 1,
				rough: 0,
				glaciated: false,
				till: false,
			}),
		).toBe(0)
	})
})
