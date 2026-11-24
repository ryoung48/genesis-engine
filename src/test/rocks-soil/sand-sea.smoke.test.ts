import { describe, expect, it } from "vitest"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { SAND_SEA } from "@/model/geography/terrain/rocks/sand-sea"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

const RADIUS_KM = 1000
const HOT_DESERT = KOPPEN.koppenLabels.indexOf("BWh")
const COLD_DESERT = KOPPEN.koppenLabels.indexOf("BWk")
const STEPPE = KOPPEN.koppenLabels.indexOf("BSk")
const FOREST = KOPPEN.koppenLabels.indexOf("Cfb")

function world() {
	const mesh = MESH.buildSphereMesh({
		n: 6000,
		jitter: 0.5,
		rng: RNG.createRng({ seed: 77031 }),
	})
	const n = mesh.numRegions
	return { mesh, n, isLand: new Uint8Array(n).fill(1) }
}

function hollows({ n, amplitudeKm }: { n: number; amplitudeKm: number }) {
	return Float32Array.from({ length: n }, (_, r) => {
		const x = Math.sin(r * 12.9898) * 43758.5453
		return 0.5 + amplitudeKm * (2 * (x - Math.floor(x)) - 1)
	})
}

function extentOf({
	koppenCode,
	amplitudeKm,
}: {
	koppenCode: number
	amplitudeKm: number
}) {
	const { mesh, n, isLand } = world()
	return SAND_SEA.extent({
		mesh,
		planetRadiusKm: RADIUS_KM,
		isLand,
		koppen: new Uint8Array(n).fill(koppenCode),
		elevationKm: hollows({ n, amplitudeKm }),
	})
}

describe("sand seas", () => {
	it("form in flat hot desert with hollows, and stay within 0..1", () => {
		const extent = extentOf({ koppenCode: HOT_DESERT, amplitudeKm: 0.12 })
		expect(extent.some((v) => v > 0)).toBe(true)
		for (const v of extent) {
			expect(v).toBeGreaterThanOrEqual(0)
			expect(v).toBeLessThanOrEqual(1)
		}
	})

	it("never form outside deserts and steppes", () => {
		expect(
			extentOf({ koppenCode: FOREST, amplitudeKm: 0.12 }).every((v) => v === 0),
		).toBe(true)
	})

	it("form less in cold desert and far less in steppe than in hot desert", () => {
		const total = (koppenCode: number) =>
			extentOf({ koppenCode, amplitudeKm: 0.12 }).reduce((a, v) => a + v, 0)
		expect(total(HOT_DESERT)).toBeGreaterThan(total(COLD_DESERT))
		expect(total(COLD_DESERT)).toBeGreaterThan(total(STEPPE))
	})

	it("form far less on rough ground", () => {
		const total = (amplitudeKm: number) =>
			extentOf({ koppenCode: HOT_DESERT, amplitudeKm }).reduce(
				(a, v) => a + v,
				0,
			)
		expect(total(1.5)).toBeLessThan(0.1 * total(0.12))
	})
})
