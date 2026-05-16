import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	buildSelectedProvinceBorderGlobe,
	buildSelectedProvinceBorderMap,
	collectProvinceBorderGlobePositions,
	collectProvinceBorderMapPositions,
} from "./province-overlay"

function makeWorld(regionProvince: Int32Array = new Int32Array([0, 1])) {
	return {
		elevation: new Float32Array([0, 0]),
		mesh: {
			numSides: 2,
			halfedges: new Int32Array([1, 0]),
			s_begin_r: new Int32Array([0, 1]),
			s_inner_t: new Int32Array([0, 1]),
			s_outer_t: new Int32Array([1, 0]),
			t_xyz: new Float32Array([1, 0, 0, 0, 1, 0]),
		},
		provinces: {
			regionProvince,
		},
	} as SerializedOrogenWorld
}

function makeWrappedWorld(reverse = false) {
	const lonA = ((reverse ? -179 : 179) * Math.PI) / 180
	const lonB = ((reverse ? 179 : -179) * Math.PI) / 180
	return {
		elevation: new Float32Array([0, 0]),
		mesh: {
			numSides: 2,
			halfedges: new Int32Array([1, 0]),
			s_begin_r: new Int32Array([0, 1]),
			s_inner_t: new Int32Array([0, 1]),
			s_outer_t: new Int32Array([1, 0]),
			t_xyz: new Float32Array([
				Math.cos(lonA),
				Math.sin(lonA),
				0,
				Math.cos(lonB),
				Math.sin(lonB),
				0,
			]),
		},
		provinces: {
			regionProvince: new Int32Array([0, 1]),
		},
	} as SerializedOrogenWorld
}

describe("province-overlay", () => {
	it("collects province border positions on globe and map projections", () => {
		const world = makeWorld()

		expect(collectProvinceBorderGlobePositions(world, 0, 0.003)).toHaveLength(6)
		expect(
			collectProvinceBorderMapPositions(world, 0, 0, 0, 0.004),
		).toHaveLength(6)
	})

	it("builds selected province borders only when the province has an external edge", () => {
		const world = makeWorld()
		const mergedWorld = makeWorld(new Int32Array([0, 0]))

		const globeBorder = buildSelectedProvinceBorderGlobe(world, 0, "globe")
		const mapBorder = buildSelectedProvinceBorderMap(world, 0, 0, 0, "map")

		expect(globeBorder).not.toBeNull()
		expect(globeBorder?.visible).toBe(true)
		expect((globeBorder?.material as LineMaterial).linewidth).toBe(4)
		expect(mapBorder).not.toBeNull()
		expect(mapBorder?.visible).toBe(true)
		expect((mapBorder?.material as LineMaterial).linewidth).toBe(4)
		expect(buildSelectedProvinceBorderGlobe(mergedWorld, 0, "globe")).toBeNull()
		expect(
			buildSelectedProvinceBorderMap(mergedWorld, 0, 0, 0, "map"),
		).toBeNull()
	})

	it("skips invalid province edges and missing province data", () => {
		const invalidWorld = {
			elevation: new Float32Array([0, 0]),
			mesh: {
				numSides: 2,
				halfedges: new Int32Array([1, 0]),
				s_begin_r: new Int32Array([0, 1]),
				s_inner_t: new Int32Array([-1, 1]),
				s_outer_t: new Int32Array([1, 0]),
				t_xyz: new Float32Array([1, 0, 0, 0, 1, 0]),
			},
			provinces: {
				regionProvince: new Int32Array([0, 1]),
			},
		} as SerializedOrogenWorld

		expect(
			collectProvinceBorderGlobePositions(
				{ mesh: invalidWorld.mesh } as SerializedOrogenWorld,
				0,
				0,
			),
		).toEqual([])
		expect(
			buildSelectedProvinceBorderGlobe(
				{
					mesh: invalidWorld.mesh,
					elevation: invalidWorld.elevation,
				} as SerializedOrogenWorld,
				0,
				"globe",
			),
		).toBeNull()
		expect(
			buildSelectedProvinceBorderMap(
				{
					mesh: invalidWorld.mesh,
					elevation: invalidWorld.elevation,
				} as SerializedOrogenWorld,
				0,
				0,
				0,
				"map",
			),
		).toBeNull()
		expect(collectProvinceBorderGlobePositions(invalidWorld, 0, 0)).toEqual([])
		expect(collectProvinceBorderMapPositions(invalidWorld, 0, 0, 0, 0)).toEqual(
			[],
		)
	})

	it("handles wrapped map borders and hidden selected-border variants", () => {
		const wrappedWorld = makeWrappedWorld()
		const reversedWrappedWorld = makeWrappedWorld(true)

		expect(
			collectProvinceBorderMapPositions(wrappedWorld, 0, 0, 0, 0),
		).toHaveLength(12)
		expect(
			collectProvinceBorderMapPositions(reversedWrappedWorld, 0, 0, 0, 0),
		).toHaveLength(12)
		expect(
			buildSelectedProvinceBorderGlobe(wrappedWorld, 0, "map", {
				color: 0xabcdef,
				opacity: 0.5,
				radiusBoost: 0.01,
			})?.visible,
		).toBe(false)
		expect(
			buildSelectedProvinceBorderMap(wrappedWorld, 0, 0, 0, "globe", {
				color: 0xabcdef,
				opacity: 0.5,
				zBoost: 0.01,
			})?.visible,
		).toBe(false)
		expect(
			(
				buildSelectedProvinceBorderGlobe(wrappedWorld, 0, "globe", {
					lineWidth: 6,
					resolution: [1920, 1080],
				})?.material as LineMaterial
			).linewidth,
		).toBe(6)
		expect(
			buildSelectedProvinceBorderGlobe(wrappedWorld, 2, "globe"),
		).toBeNull()
		expect(
			buildSelectedProvinceBorderMap(wrappedWorld, 2, 0, 0, "map"),
		).toBeNull()
	})

	it("covers non-participating provinces, invalid halfedges, and negative elevations", () => {
		const negativeWorld = {
			elevation: new Float32Array([-1, -1]),
			mesh: {
				numSides: 2,
				halfedges: new Int32Array([1, 0]),
				s_begin_r: new Int32Array([0, 1]),
				s_inner_t: new Int32Array([0, 1]),
				s_outer_t: new Int32Array([1, 0]),
				t_xyz: new Float32Array([1, 0, 0, 0, 1, 0]),
			},
			provinces: {
				regionProvince: new Int32Array([0, 1]),
			},
		} as SerializedOrogenWorld
		const invalidHalfedgeWorld = {
			elevation: new Float32Array([0, 0, 0]),
			mesh: {
				numSides: 3,
				halfedges: new Int32Array([1, 0, -1]),
				s_begin_r: new Int32Array([0, 1, 2]),
				s_inner_t: new Int32Array([0, 1, 2]),
				s_outer_t: new Int32Array([1, 0, 2]),
				t_xyz: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
			},
			provinces: {
				regionProvince: new Int32Array([0, 1, 2]),
			},
		} as SerializedOrogenWorld

		expect(collectProvinceBorderGlobePositions(makeWorld(), 2, 0)).toEqual([])
		expect(collectProvinceBorderMapPositions(makeWorld(), 2, 0, 0, 0)).toEqual(
			[],
		)
		expect(
			collectProvinceBorderGlobePositions(negativeWorld, 0, 0)[0],
		).toBeCloseTo(0.994)
		expect(
			collectProvinceBorderGlobePositions(invalidHalfedgeWorld, 2, 0),
		).toEqual([])
	})
})
