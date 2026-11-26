import { describe, expect, it } from "vitest"
import { FARMING_GROUND } from "@/model/society/farming/ground"
import type { ProvinceGround } from "@/model/society/farming/ground/types"

const SOIL_REF = 0.5
const MAX_LOSS = 0.92

function groundOf({ soil }: { soil: number }): ProvinceGround {
	return {
		plough: Float32Array.of(0.8),
		terrace: Float32Array.of(0.9),
		soil: Float32Array.of(soil),
	}
}

function groundFrom(soilFertility: Float32Array | null): ProvinceGround {
	return FARMING_GROUND.provinceGround({
		provinces: { count: 1, regionProvince: Int32Array.of(0, 0) } as never,
		mesh: { numRegions: 2, regionArea: Float64Array.of(1, 3) } as never,
		elevationKm: Float32Array.of(0, 0),
		slopeScore: Float32Array.of(0, 0),
		soilFertility,
		lakeKind: new Uint8Array(2),
	})
}

describe("farming soil factor", () => {
	const climateFit = Float64Array.of(0.6)

	it("leaves the climate fit unchanged where soil is at least average", () => {
		const fits = FARMING_GROUND.fits({
			climateFit,
			ground: groundOf({ soil: 1 }),
		})
		expect(fits.cropFit[0]).toBeCloseTo(0.6 * 0.8, 6)
	})

	it("cuts crop and terrace fit to the garden-plot floor on barren soil", () => {
		const floor = 1 - MAX_LOSS
		const poor = FARMING_GROUND.fits({
			climateFit,
			ground: groundOf({ soil: floor }),
		})
		const good = FARMING_GROUND.fits({
			climateFit,
			ground: groundOf({ soil: 1 }),
		})
		expect(poor.cropFit[0] / good.cropFit[0]).toBeCloseTo(floor, 6)
		expect(poor.terraceFit[0] / good.terraceFit[0]).toBeCloseTo(floor, 5)
	})

	it("treats a missing soil layer as neutral", () => {
		expect(groundFrom(null).soil[0]).toBe(1)
	})

	it("area-weights the factor over a province's regions", () => {
		const ground = groundFrom(Float32Array.of(0, SOIL_REF))
		expect(ground.soil[0]).toBeCloseTo(0.25 * (1 - MAX_LOSS) + 0.75, 5)
	})
})
