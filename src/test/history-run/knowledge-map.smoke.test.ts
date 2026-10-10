import { expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { computeRegionColors } from "@/ui/genesis/shared/region-colors"

it("scales knowledge from yellow to purple within each frame, excluding desolate provinces", () => {
	const world = {
		mesh: { numRegions: 3 },
		climate: { temperature_avg: new Float32Array(3) },
		rainfall: { annual: new Float32Array(3) },
		isLand: new Uint8Array([1, 1, 1]),
		elevation: new Float32Array([1, 1, 1]),
		elevation_km: new Float32Array(3),
		provinces: {
			count: 3,
			regionProvince: new Int32Array([0, 1, 2]),
			desolate: new Uint8Array([0, 0, 1]),
		},
		knowledge: new Float32Array([0.4, 0.7, -100]),
		development: new Float32Array([0.9, 0.1, 0]),
	} as unknown as SerializedGenesisWorld
	const first = computeRegionColors(
		world,
		"population",
		"borders",
		"knowledge",
		-1,
		-1,
		-1,
		-1,
	)
	if (!first) throw new Error("Knowledge produced no colors")
	expect(first.slice(0, 3)).not.toEqual(first.slice(3, 6))
	expect(first[0]).toBeGreaterThan(0.8)
	expect(first[1]).toBeGreaterThan(0.8)
	expect(first[2]).toBeLessThan(0.2)
	expect(first[5]).toBeGreaterThan(first[3])
	expect(first[4]).toBeLessThan(0.1)
	world.knowledge?.set([10, 20, -100])
	const later = computeRegionColors(
		world,
		"population",
		"borders",
		"knowledge",
		-1,
		-1,
		-1,
		-1,
	)
	expect(later?.slice(0, 3)).toEqual(first.slice(0, 3))
	expect(later?.slice(3, 6)).toEqual(first.slice(3, 6))
	world.knowledge?.set([2, 2, -100])
	const uniform = computeRegionColors(
		world,
		"population",
		"borders",
		"knowledge",
		-1,
		-1,
		-1,
		-1,
	)
	expect(uniform?.slice(0, 3)).toEqual(uniform?.slice(3, 6))
	expect(uniform?.every(Number.isFinite)).toBe(true)
})
