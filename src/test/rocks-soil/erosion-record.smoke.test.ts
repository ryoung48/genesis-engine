import { describe, expect, it } from "vitest"
import { EROSION } from "@/model/geography/terrain/erosion"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

function erodedWorld() {
	const mesh = MESH.buildSphereMesh({
		n: 6000,
		jitter: 0.5,
		rng: RNG.createRng({ seed: 77031 }),
	})
	const elev = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]
		elev[r] = 0.55 * Math.sin(3 * x + 1) * Math.cos(2 * y) + 0.35 * z * z - 0.12
	}
	const ocean = Uint8Array.from(elev, (e) => (e <= 0 ? 1 : 0))
	return { mesh, elev, ocean }
}

function checksum(values: Float32Array): number {
	let sum = 0
	for (let i = 0; i < values.length; i++) sum += values[i] * ((i % 97) + 1)
	return sum
}

const BASELINE_CHECKSUM = -24242.671899066801

function erode({ glacialStrength, K }: { glacialStrength: number; K: number }) {
	const world = erodedWorld()
	const record = EROSION.erodeComposite({
		mesh: world.mesh,
		elev: world.elev,
		r_isOcean: world.ocean,
		hIters: 10,
		K,
		m: 0.5,
		dt: 1,
		tIters: 5,
		talusSlope: 1,
		kThermal: 0.1,
		gIters: glacialStrength > 0 ? 5 : 0,
		glacialStrength,
	})
	return { ...world, record }
}

describe("erosion record", () => {
	it("leaves the eroded elevation bit-identical to the run before the record existed", () => {
		const { elev } = erode({ glacialStrength: 0.5, K: 0.003 })
		expect(checksum(elev)).toBe(BASELINE_CHECKSUM)
	})

	it("keeps sediment and moraines non-negative and on land only", () => {
		const { record, ocean } = erode({ glacialStrength: 0.5, K: 0.0003 })
		let sediment = 0
		let moraines = 0
		for (let r = 0; r < ocean.length; r++) {
			expect(record.sedimentElev[r]).toBeGreaterThanOrEqual(0)
			expect(record.morainesElev[r]).toBeGreaterThanOrEqual(0)
			if (ocean[r]) expect(record.glaciated[r]).toBe(0)
			sediment += record.sedimentElev[r]
			moraines += record.morainesElev[r]
		}
		expect(sediment).toBeGreaterThan(0)
		expect(moraines).toBeGreaterThan(0)
	})

	it("marks glaciated land only where the glacial index passes the fjord threshold", () => {
		const { record, mesh, ocean } = erode({ glacialStrength: 0.5, K: 0.003 })
		const thresholdLat = Math.PI / 2 - (0.5 * Math.PI) / 4.5
		let glaciated = 0
		for (let r = 0; r < ocean.length; r++) {
			if (!record.glaciated[r]) continue
			glaciated++
			const z = mesh.r_xyz[3 * r + 2]
			expect(Math.abs(Math.asin(z))).toBeGreaterThan(thresholdLat * 0.9)
		}
		expect(glaciated).toBeGreaterThan(0)
	})

	it("keeps the past-ice extent a land superset of the glaciated mask", () => {
		const { record, ocean } = erode({ glacialStrength: 0.5, K: 0.003 })
		let past = 0
		let present = 0
		for (let r = 0; r < ocean.length; r++) {
			if (record.glaciated[r]) {
				present++
				expect(record.pastIce[r]).toBe(1)
			}
			if (record.pastIce[r]) {
				past++
				expect(ocean[r]).toBe(0)
			}
		}
		expect(past).toBeGreaterThan(present)
	})

	it("has no glaciated land or moraines without glacial erosion", () => {
		const { record } = erode({ glacialStrength: 0, K: 0.003 })
		expect(record.glaciated.some((v) => v === 1)).toBe(false)
		expect(record.pastIce.some((v) => v === 1)).toBe(false)
		expect(record.morainesElev.some((v) => v > 0)).toBe(false)
	})
})
