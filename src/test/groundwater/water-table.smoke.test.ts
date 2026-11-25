import { describe, expect, it } from "vitest"
import { WATER_TABLE } from "@/model/geography/terrain/groundwater/water-table"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const POINTS = 32

function depthAt({
	mound,
	rise,
	u,
}: {
	mound: number
	rise: number
	u: number
}): number {
	return (rise - 2 * mound) * u + mound * u * u
}

function numericShare({
	mound,
	rise,
	depth,
}: {
	mound: number
	rise: number
	depth: number
}): number {
	const steps = POINTS * 64
	let hits = 0
	for (let i = 0; i < steps; i++) {
		if (depthAt({ mound, rise, u: (i + 0.5) / steps }) <= depth) hits++
	}
	return hits / steps
}

function numericMeanDepth({
	mound,
	rise,
}: {
	mound: number
	rise: number
}): number {
	const steps = POINTS * 64
	let sum = 0
	for (let i = 0; i < steps; i++)
		sum += Math.max(0, depthAt({ mound, rise, u: (i + 0.5) / steps }))
	return sum / steps
}

describe("water table", () => {
	it("hillShare matches numeric integration of the depth profile", () => {
		for (const mound of [0.5, 2, 8, 20]) {
			for (const rise of [5, 20, 60]) {
				for (const depth of [0.25, 1, 3, 30]) {
					const closed = WATER_TABLE.hillShare({ mound, rise, depth })
					const numeric = numericShare({ mound, rise, depth })
					expect(Math.abs(closed - numeric)).toBeLessThan(0.01)
				}
			}
		}
	})

	it("with no mound the share is min(1, depth / rise)", () => {
		for (const depth of [0.25, 1, 3, 30]) {
			expect(WATER_TABLE.hillShare({ mound: 0, rise: 10, depth })).toBeCloseTo(
				Math.min(1, depth / 10),
				9,
			)
		}
	})

	it("shares are monotone in depth and inside [0, 1]", () => {
		for (const mound of [0.1, 3, 12]) {
			let last = 0
			for (const depth of [0.05, 0.25, 1, 3, 10, 30, 100]) {
				const share = WATER_TABLE.hillShare({ mound, rise: 25, depth })
				expect(share).toBeGreaterThanOrEqual(last - 1e-12)
				expect(share).toBeGreaterThanOrEqual(0)
				expect(share).toBeLessThanOrEqual(1)
				last = share
			}
		}
	})

	it("mean depth matches numeric integration of the positive depths", () => {
		for (const mound of [0.5, 2, 8, 20]) {
			for (const rise of [5, 20, 60]) {
				const closed = WATER_TABLE.hillMeanDepth({ mound, rise })
				const numeric = numericMeanDepth({ mound, rise })
				expect(Math.abs(closed - numeric)).toBeLessThan(
					0.01 * Math.max(1, numeric),
				)
			}
		}
	})

	it("mean depth is positive and falls as the mound rises", () => {
		const low = WATER_TABLE.hillMeanDepth({ mound: 1, rise: 20 })
		const high = WATER_TABLE.hillMeanDepth({ mound: 8, rise: 20 })
		expect(low).toBeGreaterThan(0)
		expect(high).toBeLessThan(low)
	})

	it("stream spacing never drops below lFloorM", () => {
		const half = WATER_TABLE.halfSpacing({
			density: 1e6,
			transmissivity: 1e-3,
			rise: 5,
			recharge: 1e-6,
		})
		expect(half).toBeGreaterThanOrEqual(C.lFloorM)
	})

	it("drainage density rises with dissection and with slope, falls under ice", () => {
		const flat = WATER_TABLE.density({
			dissect: 0.5,
			slope: 0,
			glaciated: false,
		})
		const steep = WATER_TABLE.density({
			dissect: 0.5,
			slope: 0.1,
			glaciated: false,
		})
		const dissected = WATER_TABLE.density({
			dissect: 0.9,
			slope: 0,
			glaciated: false,
		})
		const glaciated = WATER_TABLE.density({
			dissect: 0.5,
			slope: 0,
			glaciated: true,
		})
		expect(steep).toBeGreaterThan(flat)
		expect(dissected).toBeGreaterThan(flat)
		expect(glaciated).toBeLessThan(flat)
	})

	function region({
		effective = 1e-8,
		transmissivity = 1e-3,
		slope = 0.01,
		shore = 0,
		band = 0,
		offset = 0,
	}: {
		effective?: number
		transmissivity?: number
		slope?: number
		shore?: number
		band?: number
		offset?: number
	}) {
		return WATER_TABLE.depth({
			transmissivity: Float64Array.of(transmissivity),
			effective: Float64Array.of(effective),
			incisionM: Float32Array.of(20),
			offsetM: Float32Array.of(offset),
			headM: Float32Array.of(0),
			heightM: Float32Array.of(100),
			slope: Float32Array.of(slope),
			widthM: Float64Array.of(50000),
			dissect: Float32Array.of(0.5),
			glaciated: Uint8Array.of(0),
			band: Float32Array.of(band),
			shore: Uint8Array.of(shore),
			active: Uint8Array.of(1),
		})
	}

	it("more recharge gives a shallower mean depth", () => {
		const dry = region({ effective: 1e-9 }).meanDepthM[0]
		const wet = region({ effective: 1e-7 }).meanDepthM[0]
		expect(wet).toBeLessThan(dry)
	})

	it("tighter rock gives a shallower table and steeper ground a deeper one", () => {
		const loose = region({ transmissivity: 1e-2 }).meanDepthM[0]
		const tight = region({ transmissivity: 1e-5 }).meanDepthM[0]
		expect(tight).toBeLessThanOrEqual(loose)
		const flat = region({ slope: 0.001 }).meanDepthM[0]
		const steep = region({ slope: 0.2 }).meanDepthM[0]
		expect(steep).toBeGreaterThanOrEqual(flat)
	})

	it("depth is never negative and at most height plus incision", () => {
		for (const effective of [0, 1e-10, 1e-8, 1e-6]) {
			for (const offset of [0, 10, 50]) {
				const d = region({ effective, offset }).meanDepthM[0]
				expect(d).toBeGreaterThanOrEqual(0)
				expect(d).toBeLessThanOrEqual(120)
			}
		}
	})

	it("a shoreline region adds the strip share min(1, d0 / (max(slope, shoreSlopeMin) * width))", () => {
		const slope = 0.002
		const result = region({ shore: 1, slope, effective: 0 })
		const classes = C.depthClassesM
		for (let k = 0; k < classes.length; k++) {
			const strip = Math.min(1, classes[k] / (slope * 50000))
			const hill = Math.min(1, classes[k] / 20)
			const expected = 1 - (1 - hill) * (1 - strip)
			expect(result.shallowShare[k] / 255).toBeCloseTo(expected, 1)
		}
	})

	it("a shoreline slope below shoreSlopeMin gives the same shares as the floor", () => {
		const flat = region({ shore: 1, slope: 1e-5, effective: 0 })
		const floor = region({ shore: 1, slope: C.shoreSlopeMin, effective: 0 })
		expect(Array.from(flat.shallowShare)).toEqual(
			Array.from(floor.shallowShare),
		)
	})

	it("shares stay inside [0, 255] and monotone across depth classes", () => {
		const result = region({})
		const classes = C.depthClassesM.length
		for (let k = 1; k < classes; k++)
			expect(result.shallowShare[k]).toBeGreaterThanOrEqual(
				result.shallowShare[k - 1],
			)
	})
})
