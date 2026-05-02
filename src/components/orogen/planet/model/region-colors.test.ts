import { describe, expect, it } from "vitest"
import type { PopulationMapMode } from "@/components/world/types"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import { dangerMapColor, precipitationAnnualColor } from "../../colors"
import type { NationMapMode } from "../controls/ModeBar"
import { computeRegionColors } from "./region-colors"

function expectRgbCloseTo(
	actual: Float32Array,
	expected: [number, number, number],
) {
	expect(actual).toHaveLength(3)
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]).toBeCloseTo(expected[i], 6)
	}
}

function buildWorld(
	overrides: Partial<SerializedOrogenWorld>,
): SerializedOrogenWorld {
	return {
		mesh: { numRegions: 1 },
		elevation: new Float32Array([1]),
		elevation_km: new Float32Array([0]),
		isLand: new Uint8Array([1]),
		...overrides,
	} as unknown as SerializedOrogenWorld
}

const DEFAULT_NATION_MODE: NationMapMode = "borders"
const DEFAULT_POPULATION_MODE: PopulationMapMode = "density"

describe("computeRegionColors", () => {
	it("uses annual precipitation thresholds for annual rainfall mode", () => {
		const world = buildWorld({
			rainfall: {
				annual: new Float32Array([120]),
				monthly: new Float32Array(12),
				east: new Float32Array([0]),
				west: new Float32Array([0]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"precipitation",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expectRgbCloseTo(rgb!, precipitationAnnualColor(120))
	})

	it("uses the mixed hazard tint for danger zones", () => {
		const world = buildWorld({
			hazards: {
				danger: new Float32Array([0.4]),
				earthquake: new Float32Array([0.1]),
				volcano: new Float32Array([1]),
			},
			elevation: new Float32Array([-1]),
			elevation_km: new Float32Array([-1]),
			isLand: new Uint8Array([0]),
		})

		const rgb = computeRegionColors(
			world,
			"dangerZones",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expectRgbCloseTo(rgb!, dangerMapColor(0.1, 1))
	})
})
