import { expect, it } from "vitest"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import { TRADE_ROUTE_POSITIONS } from "@/ui/genesis/renderer/trade-route-positions"

it("computes globe and map segments for a land corridor", () => {
	const positions = TRADE_ROUTE_POSITIONS.compute({
		network: {
			fromRegion: new Int32Array([0, 1]),
			toRegion: new Int32Array([1, 2]),
			kind: new Uint8Array([
				TRANSPORT.ROUTE_LAND_MAJOR,
				TRANSPORT.ROUTE_LAND_MAJOR,
			]),
			usage: new Int32Array([1, 1]),
			weight: new Float32Array([1, 1]),
		},
		r_xyz: new Float32Array([1, 0, 0, 0.9, 0.3, 0, 0.7, 0.7, 0]),
		elevation: new Float32Array([0, 0, 0]),
		elevationVisible: false,
		centerLongitudeDeg: 0,
		projectionLatitudeDeg: 0,
	})
	const globe = positions.globe[TRANSPORT.ROUTE_LAND_MAJOR]
	expect(globe.length).toBeGreaterThan(0)
	expect(globe.length % 6).toBe(0)
	expect(positions.map[TRANSPORT.ROUTE_LAND_MAJOR].length % 6).toBe(0)
	expect(positions.globe[TRANSPORT.ROUTE_SEA]).toHaveLength(0)
	for (let i = 0; i < globe.length; i += 3) {
		expect(Math.hypot(globe[i], globe[i + 1], globe[i + 2])).toBeGreaterThan(
			0.9,
		)
	}
})

it("splits an edge that crosses the antimeridian on the map", () => {
	const positions = TRADE_ROUTE_POSITIONS.compute({
		network: {
			fromRegion: new Int32Array([0]),
			toRegion: new Int32Array([1]),
			kind: new Uint8Array([TRANSPORT.ROUTE_LAND_MAJOR]),
			usage: new Int32Array([1]),
			weight: new Float32Array([1]),
		},
		r_xyz: new Float32Array([-0.99, 0.1, 0, -0.99, -0.1, 0]),
		elevation: new Float32Array([0, 0]),
		elevationVisible: false,
		centerLongitudeDeg: 0,
		projectionLatitudeDeg: 0,
	})
	expect(
		positions.map[TRANSPORT.ROUTE_LAND_MAJOR].length,
	).toBeGreaterThanOrEqual(12)
})
