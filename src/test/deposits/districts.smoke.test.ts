import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/model/geography/terrain/deposits/districts"
import { DISTRICT_THRESHOLDS } from "@/model/geography/terrain/deposits/districts/thresholds"

const POINTS = 8_000
const SEED = 77031
const SHARE_TOLERANCE = 0.2
const FOOTPRINT = 1.35
const FOOTPRINT_CAP = 0.97
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const RADIUS_KM = DISTRICTS.calibrationRadiusKm

function sweep(seed: number): Float64Array[] {
	const systems = DISTRICTS.systems()
	const shapes = DISTRICTS.create({
		seed,
		systems,
		gridDeg: 1,
		radiusKm: RADIUS_KM,
	})
	const values = systems.map(() => new Float64Array(POINTS))
	for (let i = 0; i < POINTS; i++) {
		const z = 1 - (2 * (i + 0.5)) / POINTS
		const r = Math.sqrt(1 - z * z)
		shapes.cell({
			x: r * Math.cos(GOLDEN * i),
			y: r * Math.sin(GOLDEN * i),
			z,
			psiB: 0,
			wB: 0,
			psiC: 0,
			wC: 0,
		})
		for (let k = 0; k < systems.length; k++) values[k][i] = shapes.at(k)
	}
	return values
}

function correlation(a: Float64Array, b: Float64Array): number {
	let ma = 0
	let mb = 0
	for (let i = 0; i < a.length; i++) {
		ma += a[i]
		mb += b[i]
	}
	ma /= a.length
	mb /= b.length
	let sab = 0
	let saa = 0
	let sbb = 0
	for (let i = 0; i < a.length; i++) {
		sab += (a[i] - ma) * (b[i] - mb)
		saa += (a[i] - ma) ** 2
		sbb += (b[i] - mb) ** 2
	}
	return sab / Math.sqrt(saa * sbb)
}

describe("deposit districts", () => {
	const systems = DISTRICTS.systems()
	const values = sweep(SEED)

	it("ships thresholds that match a fresh calibration", () => {
		const fresh = DISTRICTS.calibrate({ systems, radiusKm: RADIUS_KM })
		expect(fresh.length).toBe(systems.length)
		const shipped = DISTRICT_THRESHOLDS
		expect(shipped.key).toBe(
			DISTRICTS.thresholdKey({ systems, radiusKm: RADIUS_KM }),
		)
		fresh.forEach((row, k) =>
			row.forEach((t, i) => expect(shipped.thresholds[k][i]).toBeCloseTo(t, 4)),
		)
	})

	it("covers each system's district share of the sphere, with its soft edge", () => {
		systems.forEach((system, k) => {
			let inside = 0
			for (let i = 0; i < POINTS; i++) if (values[k][i] > 0) inside++
			const share = inside / POINTS
			const footprint = Math.min(FOOTPRINT_CAP, FOOTPRINT * system.share)
			expect(
				Math.abs(share - footprint) / footprint,
				`system ${k}`,
			).toBeLessThan(SHARE_TOLERANCE)
		})
	})

	it("keeps every value in 0..1 and is the same for the same seed", () => {
		const again = sweep(SEED)
		values.forEach((row, k) => {
			for (let i = 0; i < POINTS; i++) {
				expect(row[i]).toBeGreaterThanOrEqual(0)
				expect(row[i]).toBeLessThanOrEqual(1)
				expect(again[k][i]).toBe(row[i])
			}
		})
	})

	it("differs between seeds", () => {
		const other = sweep(SEED + 1)
		let same = 0
		for (let i = 0; i < POINTS; i++) if (other[0][i] === values[0][i]) same++
		expect(same / POINTS).toBeLessThan(0.99)
	})

	it("keeps unassociated systems loosely correlated", () => {
		const free = systems
			.map((s, k) => ({ s, k }))
			.filter(({ s }) => s.assoc === null)
			.slice(0, 6)
		for (let a = 0; a < free.length; a++)
			for (let b = a + 1; b < free.length; b++)
				expect(
					Math.abs(correlation(values[free[a].k], values[free[b].k])),
				).toBeLessThan(0.4)
	})
})
