import { describe, expect, it } from "vitest"
import { HYDRAULIC_SOIL } from "@/model/geography/terrain/groundwater/hydraulic-soil"
import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import type { RegionClimate } from "@/model/geography/terrain/groundwater/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { RNG } from "@/model/shared/random/rng"

const C = GROUNDWATER_CONFIG

const SAMPLES = 200

function randomClimate({
	n,
	seed,
}: {
	n: number
	seed: number
}): RegionClimate {
	const rng = RNG.createRng({ seed })
	const make = (lo: number, hi: number) =>
		Float32Array.from({ length: n }, () => lo + (hi - lo) * rng.random())
	const coldest = make(-30, 25)
	return {
		rain: make(0, 3000),
		pet: make(200, 2200),
		mean: Float32Array.from(coldest, (c) => c + 10),
		coldest,
		warmest: Float32Array.from(coldest, (c) => c + 20),
		wetIndex: make(0, 1.5),
	}
}

describe("hydraulic soil", () => {
	it("texture sums to 100 and follows the table row at neutral climate", () => {
		for (const key of ROCK_KEY.keys) {
			const base = C.texture[key]
			const [sand, silt, clay] = HYDRAULIC_SOIL.texture({
				base,
				rain: 0,
				mean: 0,
				wetIndex: 1,
			})
			expect(sand + silt + clay).toBeCloseTo(100, 6)
			expect(sand).toBeCloseTo(base[0], 6)
			expect(clay).toBeCloseTo(base[2], 6)
		}
	})

	it("texture sums to 100 under hot wet and hot dry climates", () => {
		for (const key of ROCK_KEY.keys) {
			for (const climate of [
				{ rain: 3000, mean: 28, wetIndex: 1.5 },
				{ rain: 50, mean: 28, wetIndex: 0 },
			]) {
				const [sand, silt, clay] = HYDRAULIC_SOIL.texture({
					base: C.texture[key],
					...climate,
				})
				expect(sand + silt + clay).toBeCloseTo(100, 6)
			}
		}
	})

	it("depth stays inside its bounds, falls with slope and halves on glaciated hard rock", () => {
		const common = {
			mass: 100,
			rate: 0.5,
			rain: 800,
			coldest: 5,
			warmest: 25,
			halved: false,
			young: false,
		}
		for (const slope of [0, 0.01, 0.05, 0.3, 1]) {
			const d = HYDRAULIC_SOIL.depth({ ...common, slope })
			expect(d).toBeGreaterThanOrEqual(C.soilMinM)
			expect(d).toBeLessThanOrEqual(C.soilMaxM)
		}
		const flat = HYDRAULIC_SOIL.depth({ ...common, slope: 0.01 })
		const steep = HYDRAULIC_SOIL.depth({ ...common, slope: 0.2 })
		expect(steep).toBeLessThan(flat)
		const halved = HYDRAULIC_SOIL.depth({
			...common,
			slope: 0.01,
			halved: true,
		})
		expect(halved).toBeCloseTo(flat / 2, 6)
		const young = HYDRAULIC_SOIL.depth({ ...common, slope: 0.3, young: true })
		expect(young).toBeGreaterThanOrEqual(C.youngSoilM)
		expect(young).toBeLessThanOrEqual(C.soilMaxM)
	})

	it("layer matches the closed formulas on sampled regions", () => {
		const climate = randomClimate({ n: SAMPLES, seed: 11 })
		const rng = RNG.createRng({ seed: 12 })
		const keyCode = Uint8Array.from({ length: SAMPLES }, () =>
			Math.floor(rng.random() * ROCK_KEY.keys.length),
		)
		const slope = Float32Array.from(
			{ length: SAMPLES },
			() => rng.random() * 0.3,
		)
		const glaciated = Uint8Array.from({ length: SAMPLES }, () =>
			rng.random() < 0.3 ? 1 : 0,
		)
		const layer = HYDRAULIC_SOIL.layer({
			keyCode,
			glaciated,
			slope,
			climate,
			active: new Uint8Array(SAMPLES).fill(1),
		})
		for (let r = 0; r < SAMPLES; r++) {
			const sand = layer.sand[r]
			const clay = layer.clay[r]
			const silt = 100 - sand - clay
			expect(
				layer.ksMs[r] /
					(7.06e-6 * 10 ** (-0.6 + 0.0126 * sand - 0.0064 * clay)),
			).toBeCloseTo(1, 6)
			expect(layer.infiltration[r]).toBeCloseTo(
				(0.9 * sand + 0.75 * silt + 0.1 * clay) / 100,
				5,
			)
			expect(layer.awcMm[r]).toBeCloseTo(
				(C.awcScale *
					(0.25 * sand + 0.75 * silt + clay) *
					Math.min(layer.depthM[r], C.rootM)) /
					100,
				3,
			)
		}
	})
})
