import { describe, expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { getHoverRainfall } from "./hover"

function makeWorld(
	overrides: Record<string, unknown> = {},
): SerializedGenesisWorld {
	return {
		mesh: { numRegions: 1 },
		rainfall: {
			annual: new Float32Array([1200]),
			monthly: new Float32Array(Array.from({ length: 12 }, () => 100)),
		},
		isLand: new Uint8Array([1]),
		landmarks: {
			regionLandmark: new Int32Array([-1]),
			type: new Uint8Array([5]),
			size: new Int32Array([1]),
			count: 1,
		},
		...overrides,
	} as unknown as SerializedGenesisWorld
}

describe("getHoverRainfall", () => {
	it("returns rainfall for lake regions", () => {
		const world = makeWorld({
			isLand: new Uint8Array([0]),
			landmarks: {
				regionLandmark: new Int32Array([0]),
				type: new Uint8Array([5]),
				size: new Int32Array([1]),
				count: 1,
			},
		})

		expect(getHoverRainfall({ region: 0, x: 0, y: 0 }, world, 0)).toBe(1200)
		expect(getHoverRainfall({ region: 0, x: 0, y: 0 }, world, 3)).toBe(100)
	})

	it("keeps rainfall hidden for non-lake water regions", () => {
		const world = makeWorld({
			isLand: new Uint8Array([0]),
			landmarks: {
				regionLandmark: new Int32Array([-1]),
				type: new Uint8Array([5]),
				size: new Int32Array([1]),
				count: 1,
			},
		})

		expect(getHoverRainfall({ region: 0, x: 0, y: 0 }, world, 0)).toBeNull()
	})
})
