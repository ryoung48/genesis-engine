import { describe, expect, it } from "vitest"
import { GLACIAL } from "@/model/geography/terrain/rocks/glacial"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

const RADIUS_KM = 1000
const CAP_Z = 0.85

function capWorld() {
	const mesh = MESH.buildSphereMesh({
		n: 6000,
		jitter: 0.5,
		rng: RNG.createRng({ seed: 77031 }),
	})
	const n = mesh.numRegions
	const isLand = new Uint8Array(n).fill(1)
	const glaciated = new Uint8Array(n)
	for (let r = 0; r < n; r++)
		if (mesh.r_xyz[3 * r + 2] > CAP_Z) glaciated[r] = 1
	return { mesh, isLand, glaciated }
}

function kmFromCap(z: number): number {
	return (Math.acos(Math.min(1, z)) - Math.acos(CAP_Z)) * RADIUS_KM
}

describe("glacial till", () => {
	it("is zero on the ice, positive near its edge and zero past the outwash reach", () => {
		const { mesh, isLand, glaciated } = capWorld()
		const till = GLACIAL.till({
			mesh,
			planetRadiusKm: RADIUS_KM,
			isLand,
			glaciated,
			pastIce: glaciated,
			morainesKm: new Float32Array(mesh.numRegions),
		})
		let edge = 0
		let far = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (glaciated[r]) {
				expect(till[r]).toBe(0)
				continue
			}
			expect(till[r]).toBeGreaterThanOrEqual(0)
			expect(till[r]).toBeLessThanOrEqual(1)
			const km = kmFromCap(mesh.r_xyz[3 * r + 2])
			if (km < SURFACE_CONFIG.outwashKm * 0.3 && till[r] > 0) edge++
			if (km > SURFACE_CONFIG.outwashKm * 3) {
				far++
				expect(till[r]).toBe(0)
			}
		}
		expect(edge).toBeGreaterThan(0)
		expect(far).toBeGreaterThan(0)
	})

	it("never lowers till where a moraine sits", () => {
		const { mesh, isLand, glaciated } = capWorld()
		const morainesKm = new Float32Array(mesh.numRegions)
		let target = -1
		for (let r = 0; r < mesh.numRegions; r++)
			if (!glaciated[r] && kmFromCap(mesh.r_xyz[3 * r + 2]) < 100) {
				target = r
				break
			}
		const params = {
			mesh,
			planetRadiusKm: RADIUS_KM,
			isLand,
			glaciated,
			pastIce: glaciated,
			morainesKm,
		}
		const without = GLACIAL.till(params)[target]
		morainesKm[target] = SURFACE_CONFIG.moraineKm
		expect(GLACIAL.till(params)[target]).toBeGreaterThanOrEqual(without)
		expect(GLACIAL.till(params)[target]).toBe(1)
	})
	it("covers land inside the past-ice extent but outside the present ice with drift", () => {
		const { mesh, isLand, glaciated } = capWorld()
		const pastIce = Uint8Array.from(glaciated)
		for (let r = 0; r < mesh.numRegions; r++)
			if (mesh.r_xyz[3 * r + 2] > CAP_Z - 0.1) pastIce[r] = 1
		const till = GLACIAL.till({
			mesh,
			planetRadiusKm: RADIUS_KM,
			isLand,
			glaciated,
			pastIce,
			morainesKm: new Float32Array(mesh.numRegions),
		})
		let drift = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (glaciated[r]) expect(till[r]).toBe(0)
			else if (pastIce[r]) {
				drift++
				expect(till[r]).toBe(1)
			}
		}
		expect(drift).toBeGreaterThan(0)
	})
})
