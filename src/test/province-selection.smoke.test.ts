import { expect, it } from "vitest"
import { PROVINCE_LOCATIONS } from "@/model/geography/terrain/provinces/locations"
import type { Eu4ProvinceFillGeometry } from "@/model/history/earth/data-source/types"
import type { GenesisProvinces } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { PROVINCE_SELECTION } from "@/ui/genesis/shared/province-selection"

it("inverts flat-map recentering and latitude rotation", () => {
	const point = PROVINCE_SELECTION.unproject({
		x: 0,
		y: 0,
		centerLongitude: 170,
		centerLatitude: 30,
	})
	expect(point.longitude).toBeCloseTo(170, 6)
	expect(point.latitude).toBeCloseTo(30, 6)
	expect(
		PROVINCE_SELECTION.unproject({
			x: 2,
			y: 0,
			centerLongitude: 170,
			centerLatitude: 0,
		}).longitude,
	).toBeCloseTo(-10, 6)
})
it("chooses stable region samples with normalized area weights and an explicit tiny-province fallback", () => {
	const input = {
		mesh: {
			numRegions: 4,
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0]),
			regionArea: new Float32Array([1, 2, 3, 4]),
		},
		provinces: {
			count: 2,
			seeds: new Int32Array([0, -1]),
			regionProvince: new Int32Array([0, 0, 0, 0]),
		} as GenesisProvinces,
		isLand: new Uint8Array([1, 1, 1, 1]),
		representatives: new Map<number, [number, number]>([[1, [90, 0]]]),
	}
	const locations = PROVINCE_LOCATIONS.build(input)
	expect(locations).toEqual(PROVINCE_LOCATIONS.build(input))
	expect(locations[0].samples).toHaveLength(3)
	expect(
		locations[0].samples.reduce((sum, sample) => sum + sample.weight, 0),
	).toBeCloseTo(1, 6)
	expect(locations[1].approximateLocation).toBe(true)
	expect(locations[1].samples[0].region).toBe(1)
})

it("uses the picked point for sparse Earth IDs and retains mesh fallback", () => {
	const world = {
		provinces: {
			count: 2,
			realIds: new Int32Array([10, 30]),
			regionProvince: new Int32Array([0, -1]),
		},
	} as unknown as SerializedGenesisWorld
	const geometry: Eu4ProvinceFillGeometry = {
		ringCount: 1,
		ringProvinceId: new Int32Array([30]),
		ringPolygonIndex: new Int32Array([0]),
		ringIsHole: new Uint8Array([0]),
		ringPointOffset: new Int32Array([0, 5]),
		pointsLonLatDeg: new Float32Array([9, -1, 11, -1, 11, 1, 9, 1, 9, -1]),
		triangleGroupCount: 0,
		triangleProvinceId: new Int32Array(),
		trianglePointOffset: new Int32Array([0]),
		trianglePointsLonLatDeg: new Float32Array(),
	}
	expect(
		PROVINCE_SELECTION.resolve({
			world,
			geometry,
			region: 0,
			longitude: 10,
			latitude: 0,
		}),
	).toBe(1)
	expect(
		PROVINCE_SELECTION.resolve({
			world,
			geometry,
			region: 0,
			longitude: 0,
			latitude: 0,
		}),
	).toBe(0)
	expect(
		PROVINCE_SELECTION.resolve({
			world,
			geometry,
			region: 1,
			longitude: 0,
			latitude: 0,
		}),
	).toBeNull()
})
