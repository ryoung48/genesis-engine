import * as THREE from "three"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { expect, it } from "vitest"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildTradeRouteLines,
	syncTradeRouteDetail,
	TRADE_ROUTE_DETAIL_LAYER,
} from "@/ui/genesis/renderer/trade-route-overlay"
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
	expect(globe.length).toBeGreaterThanOrEqual(12)
	expect(globe.length).toBeLessThanOrEqual(24)
	expect(globe.length % 6).toBe(0)
	const map = positions.map[TRANSPORT.ROUTE_LAND_MAJOR]
	expect(map.length).toBe(12)
	expect(map.slice(3, 6)).toEqual(map.slice(6, 9))
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
	expect(positions.map[TRANSPORT.ROUTE_LAND_MAJOR]).toHaveLength(12)
})

it("shows all major roads and sea routes, and gates only minor roads on map and globe zoom", () => {
	const segment = new Float32Array([0, 0, 0, 1, 0, 0])
	const { group } = buildTradeRouteLines(
		{
			[TRANSPORT.ROUTE_LAND_MAJOR]: segment,
			[TRANSPORT.ROUTE_LAND_MINOR]: segment,
			[TRANSPORT.ROUTE_SEA]: segment,
		},
		{ width: 100, height: 100 },
	)
	addMapSlideClones(group)
	const visibleLines = (camera: THREE.Camera) => {
		const visible: LineSegments2[] = []
		group.traverse((child) => {
			if (child instanceof LineSegments2 && camera.layers.test(child.layers)) {
				visible.push(child)
			}
		})
		return visible
	}
	const mapCamera = new THREE.OrthographicCamera()
	const globeCamera = new THREE.PerspectiveCamera()
	globeCamera.position.z = 3
	for (const camera of [mapCamera, globeCamera]) {
		syncTradeRouteDetail(camera)
		const overview = visibleLines(camera)
		expect(overview).toHaveLength(6)
		expect(overview.filter((line) => line.material.dashed)).toHaveLength(3)
		expect(
			overview.every(
				(line) => !line.layers.isEnabled(TRADE_ROUTE_DETAIL_LAYER),
			),
		).toBe(true)
	}
	mapCamera.zoom = 4
	globeCamera.position.z = 1.5
	for (const camera of [mapCamera, globeCamera]) {
		syncTradeRouteDetail(camera)
		expect(visibleLines(camera)).toHaveLength(9)
	}
	mapCamera.zoom = 1
	syncTradeRouteDetail(mapCamera)
	expect(visibleLines(mapCamera)).toHaveLength(6)
})

it("culls off-screen detail tiles while retaining crossing segments and sea dash distances", () => {
	const { group } = buildTradeRouteLines(
		{
			[TRANSPORT.ROUTE_LAND_MAJOR]: new Float32Array(),
			[TRANSPORT.ROUTE_LAND_MINOR]: new Float32Array(),
			[TRANSPORT.ROUTE_SEA]: new Float32Array([
				0, 0, 0, 0.1, 0, 0, 1, 0, 0, 1.1, 0, 0, 0.05, 0.01, 0, 0.8, 0.01, 0,
			]),
		},
		{ width: 100, height: 100 },
	)
	const camera = new THREE.OrthographicCamera(-0.4, 0.4, 0.4, -0.4, 0.1, 10)
	camera.position.z = 2
	camera.zoom = 4
	camera.updateProjectionMatrix()
	camera.updateMatrixWorld()
	syncTradeRouteDetail(camera)
	group.updateMatrixWorld()
	const frustum = new THREE.Frustum().setFromProjectionMatrix(
		new THREE.Matrix4().multiplyMatrices(
			camera.projectionMatrix,
			camera.matrixWorldInverse,
		),
	)
	const detailTiles = group.children.filter(
		(child): child is LineSegments2 =>
			child instanceof LineSegments2 && camera.layers.test(child.layers),
	)
	expect(detailTiles).toHaveLength(3)
	expect(detailTiles.map((tile) => frustum.intersectsObject(tile))).toEqual([
		true,
		false,
		true,
	])
	expect(
		detailTiles[2].geometry.getAttribute("instanceDistanceStart").getX(0),
	).toBeCloseTo(0.2)
})
