import { describe, expect, it } from "vitest"
import { LATERAL_FLUX } from "@/model/geography/terrain/groundwater/lateral-flux"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const AREA = 1e9
const DIST = 3e4
const RECHARGE = 3e-9

function run({
	n,
	transmissivity,
	heads,
	order,
	recharge,
	active,
	pan,
	karst,
}: {
	n: number
	transmissivity: number[]
	heads?: number[]
	order?: number[]
	recharge?: number[]
	active?: number[]
	pan?: number[]
	karst?: number[]
}) {
	const drainTarget = Int32Array.from({ length: n }, (_, i) => i - 1)
	const processOrder = Int32Array.from(
		order ?? Array.from({ length: n }, (_, i) => i),
	)
	return LATERAL_FLUX.cascade({
		drainTarget,
		processOrder,
		targetDistM: new Float32Array(n).fill(DIST),
		headM: Float32Array.from(
			heads ?? Array.from({ length: n }, (_, i) => i * 20),
		),
		active: Uint8Array.from(active ?? new Array(n).fill(1)),
		pan: Uint8Array.from(pan ?? new Array(n).fill(0)),
		karst: Uint8Array.from(karst ?? new Array(n).fill(0)),
		recharge: Float64Array.from(recharge ?? new Array(n).fill(RECHARGE)),
		areaM2: new Float64Array(n).fill(AREA),
		transmissivity: Float64Array.from(transmissivity),
	})
}

describe("lateral flux", () => {
	it("capacity uses the sMin floor and Darcy form", () => {
		expect(
			LATERAL_FLUX.capacity({ transmissivity: 1, headDropM: 0, distM: 1000 }),
		).toBeCloseTo((C.sMin * 1000) / Math.sqrt(3), 12)
		expect(
			LATERAL_FLUX.capacity({ transmissivity: 2, headDropM: 10, distM: 1000 }),
		).toBeCloseTo((2 * 0.01 * 1000) / Math.sqrt(3), 12)
	})

	it("flux grows by the regional share of local recharge until it meets capacity, then holds", () => {
		const n = 8
		const T = 0.1
		const result = run({ n, transmissivity: new Array(n).fill(T) })
		const own = C.regionalShare * RECHARGE * AREA
		const cap = LATERAL_FLUX.capacity({
			transmissivity: T,
			headDropM: 20,
			distM: DIST,
		})
		let expected = 0
		for (let r = n - 1; r >= 1; r--) {
			expected = Math.min(expected + own, cap)
			expect(result.qout[r]).toBeCloseTo(expected, 12)
		}
		expect(own).toBeLessThan(cap)
		expect(own * (n - 1)).toBeGreaterThan(cap)
	})

	it("no outflow exceeds capacity or inflow plus own recharge, and effective recharge is non-negative", () => {
		const n = 10
		const result = run({
			n,
			transmissivity: [
				0.01, 0.0001, 0.02, 0.0002, 0.05, 0.001, 0.001, 0.003, 0.0005, 0.01,
			],
		})
		const own = C.regionalShare * RECHARGE * AREA
		for (let r = 1; r < n; r++) {
			expect(result.qout[r]).toBeLessThanOrEqual(result.qin[r] + own + 1e-12)
			expect(result.effective[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("conserves water between recharge, retention and discharge", () => {
		const n = 12
		const T = new Array(n).fill(0.0008)
		const active = [0, ...new Array(n - 1).fill(1)]
		const result = run({ n, transmissivity: T, active })
		const own = C.regionalShare * RECHARGE * AREA
		let retained = 0
		for (let r = 1; r < n; r++) {
			retained += result.qin[r] + own - result.qout[r]
		}
		expect(result.dischargedM3s).toBeGreaterThan(0)
		expect(retained + result.dischargedM3s).toBeCloseTo((n - 1) * own, 12)
	})

	it("a drop in transmissivity makes emergence positive at the drop only", () => {
		const n = 6
		const T = [0.01, 0.01, 0.01, 0.0001, 0.01, 0.01]
		const result = run({ n, transmissivity: T, active: [0, 1, 1, 1, 1, 1] })
		for (let r = 1; r < n; r++) {
			if (r === 3) expect(result.qem[r]).toBeGreaterThan(0)
			else expect(result.qem[r]).toBe(0)
		}
	})

	it("ice, pans and missing targets have no capacity", () => {
		const base = run({
			n: 3,
			transmissivity: [1, 1, 1],
			pan: [0, 1, 0],
		})
		expect(base.qout[1]).toBe(0)
		expect(base.qout[0]).toBe(0)
	})

	it("flat ground passes a trickle", () => {
		const n = 3
		const result = run({
			n,
			transmissivity: new Array(n).fill(1),
			heads: [0, 0, 0],
		})
		expect(result.qout[2]).toBeGreaterThan(0)
	})

	it("does not depend on the order of independent branches", () => {
		const T = [0.01, 0.01, 0.002, 0.003]
		const drainTarget = Int32Array.of(-1, 0, 0, 1)
		const heads = Float32Array.of(0, 20, 20, 40)
		const dep = (order: number[]) =>
			LATERAL_FLUX.cascade({
				drainTarget,
				processOrder: Int32Array.from(order),
				targetDistM: new Float32Array(4).fill(DIST),
				headM: heads,
				active: new Uint8Array(4).fill(1),
				pan: new Uint8Array(4),
				karst: new Uint8Array(4),
				recharge: new Float64Array(4).fill(RECHARGE),
				areaM2: new Float64Array(4).fill(AREA),
				transmissivity: Float64Array.from(T),
			})
		const first = dep([0, 1, 2, 3])
		const second = dep([0, 2, 1, 3])
		expect(Array.from(first.qout)).toEqual(Array.from(second.qout))
		expect(Array.from(first.effective)).toEqual(Array.from(second.effective))
	})

	it("tracks karst flux through the cascade", () => {
		const n = 3
		const result = run({
			n,
			transmissivity: new Array(n).fill(0.01),
			karst: [0, 1, 1],
		})
		expect(result.qkarst[0]).toBeGreaterThan(0)
		expect(result.qkarst[0]).toBeLessThanOrEqual(result.qin[0] + 1e-12)
	})
})
