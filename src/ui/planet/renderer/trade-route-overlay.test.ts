import { describe, expect, it } from "vitest"
import {
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
} from "@/model/transport/worker-types"
import {
	buildGlobeTradeRoutes,
	buildMapTradeRoutes,
} from "./trade-route-overlay"

function createWorld() {
	return {
		mesh: {
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0]),
		},
		elevation: new Float32Array([0.1, 0.1, 0.1]),
		provinces: {
			count: 3,
		},
	} as Parameters<typeof buildGlobeTradeRoutes>[0]
}

function createExtendedWorld() {
	return {
		mesh: {
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, 0, 0, 1]),
		},
		elevation: new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1]),
		provinces: {
			count: 5,
		},
	} as Parameters<typeof buildGlobeTradeRoutes>[0]
}

describe("trade-route-overlay", () => {
	it("collapses degree-2 chains into a single globe corridor and sets resolution", () => {
		const build = buildGlobeTradeRoutes(
			createWorld(),
			[
				{
					fromRegion: 0,
					toRegion: 1,
					kind: ROUTE_LAND_MAJOR,
					usage: 2,
					weight: 4,
				},
				{
					fromRegion: 1,
					toRegion: 2,
					kind: ROUTE_LAND_MAJOR,
					usage: 1,
					weight: 2,
				},
			],
			{ width: 800, height: 600 },
		)

		expect(build.group.children).toHaveLength(1)
		expect(build.materials).toHaveLength(1)
		expect(build.materials[0].color?.getHex()).toBe(0xb91c1c)
		expect(build.materials[0].resolution.x).toBe(800)
		expect(build.materials[0].resolution.y).toBe(600)
	})

	it("renders sea corridors with smaller dashed styling", () => {
		const world = {
			mesh: {
				r_xyz: new Float32Array([-1, 0.01, 0, 0, -1, 0, -1, -0.01, 0]),
			},
			elevation: new Float32Array([0.1, 0.1, 0.1]),
			provinces: {
				count: 3,
			},
		} as Parameters<typeof buildMapTradeRoutes>[0]

		const build = buildMapTradeRoutes(
			world,
			[
				{
					fromRegion: 0,
					toRegion: 1,
					kind: ROUTE_SEA,
					usage: 1,
					weight: 1,
				},
				{
					fromRegion: 1,
					toRegion: 2,
					kind: ROUTE_SEA,
					usage: 1,
					weight: 1,
				},
			],
			0,
			0,
			{ width: 640, height: 480 },
		)

		expect(build.group.children.length).toBe(1)
		expect(build.materials).toHaveLength(1)
		expect(build.materials[0].dashed).toBe(true)
		expect(build.materials[0].dashSize).toBeCloseTo(0.006, 6)
		expect(build.materials[0].gapSize).toBeCloseTo(0.004, 6)
	})

	it("does not recolor land corridors as sea when kinds overlap at a junction", () => {
		const build = buildGlobeTradeRoutes(
			createWorld(),
			[
				{
					fromRegion: 0,
					toRegion: 1,
					kind: ROUTE_LAND_MAJOR,
					usage: 1,
					weight: 1,
				},
				{
					fromRegion: 1,
					toRegion: 2,
					kind: ROUTE_SEA,
					usage: 1,
					weight: 1,
				},
				{
					fromRegion: 0,
					toRegion: 2,
					kind: ROUTE_LAND_MINOR,
					usage: 1,
					weight: 1,
				},
			],
			{ width: 800, height: 600 },
		)

		expect(build.group.children).toHaveLength(3)
		expect(
			build.materials.map((material) => material.color?.getHex()).sort(),
		).toEqual([0x2563eb, 0xb91c1c, 0xd97706].sort())
	})

	it("batches disjoint corridors of the same style into one draw object", () => {
		const build = buildGlobeTradeRoutes(
			createExtendedWorld(),
			[
				{
					fromRegion: 0,
					toRegion: 1,
					kind: ROUTE_LAND_MAJOR,
					usage: 1,
					weight: 1,
				},
				{
					fromRegion: 2,
					toRegion: 3,
					kind: ROUTE_LAND_MAJOR,
					usage: 1,
					weight: 1,
				},
				{
					fromRegion: 3,
					toRegion: 4,
					kind: ROUTE_LAND_MAJOR,
					usage: 1,
					weight: 1,
				},
			],
			{ width: 800, height: 600 },
		)

		expect(build.group.children).toHaveLength(1)
		expect(build.materials).toHaveLength(1)
		expect(build.materials[0].color?.getHex()).toBe(0xb91c1c)
	})

	it("renders minor roads thinner and lighter than major roads", () => {
		const build = buildGlobeTradeRoutes(
			createWorld(),
			[
				{
					fromRegion: 0,
					toRegion: 1,
					kind: ROUTE_LAND_MAJOR,
					usage: 1,
					weight: 1,
				},
				{
					fromRegion: 0,
					toRegion: 2,
					kind: ROUTE_LAND_MINOR,
					usage: 1,
					weight: 1,
				},
			],
			{ width: 800, height: 600 },
		)

		const materialsByColor = new Map(
			build.materials.map((material) => [material.color?.getHex(), material]),
		)
		const major = materialsByColor.get(0xb91c1c)
		const minor = materialsByColor.get(0xd97706)

		expect(major).toBeDefined()
		expect(minor).toBeDefined()
		expect(minor?.linewidth).toBeLessThan(major?.linewidth ?? Infinity)
		expect(minor?.opacity).toBeLessThan(major?.opacity ?? Infinity)
	})
})
