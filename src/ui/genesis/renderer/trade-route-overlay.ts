import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type {
	TradeRouteDetailBuildParams,
	TradeRoutePositionRequest,
	TradeRoutePositionSet,
	TradeRoutePositions,
	TradeRouteWorkerResponse,
} from "@/ui/genesis/renderer/types"

const SEA_ROUTE_DASH_STYLE = {
	dashSize: 0.006,
	gapSize: 0.004,
} as const
const MAP_OVERVIEW_ZOOM = 4
const GLOBE_OVERVIEW_DISTANCE_SQUARED = 1.5 ** 2
export const TRADE_ROUTE_DETAIL_LAYER = 1
const TRADE_ROUTE_OVERVIEW_LAYER = 2
const DETAIL_TILE_SIZE = 0.25
const DETAIL_TILE_BOUNDS_PADDING = 0.005
const ROUTE_RENDER_ORDER = 997
const TRADE_ROUTE_STYLE = {
	[TRANSPORT.ROUTE_LAND_MAJOR]: {
		color: 0xb91c1c,
		baseWidth: 0.5,
		opacity: 0.9,
		dashed: false,
	},
	[TRANSPORT.ROUTE_LAND_MINOR]: {
		color: 0xd97706,
		baseWidth: 0.35,
		opacity: 0.68,
		dashed: false,
	},
	[TRANSPORT.ROUTE_SEA]: {
		color: 0x2563eb,
		baseWidth: 0.55,
		opacity: 0.82,
		dashed: true,
	},
} as const

interface OverlayResolution {
	width: number
	height: number
}

interface TradeRouteOverlayBuild {
	group: THREE.Group
	materials: LineMaterial[]
}

interface PendingRequest {
	resolve: (positions: TradeRoutePositions) => void
}

let worker: Worker | null = null
let nextRequestId = 0
const pending = new Map<number, PendingRequest>()

function getWorker(): Worker {
	if (worker) return worker
	worker = new Worker(new URL("./trade-route.worker.ts", import.meta.url), {
		type: "module",
	})
	worker.onmessage = (event: MessageEvent<TradeRouteWorkerResponse>) => {
		const { requestId, positions } = event.data
		pending.get(requestId)?.resolve(positions)
		pending.delete(requestId)
	}
	return worker
}

export function computeTradeRoutePositions(
	request: TradeRoutePositionRequest,
): Promise<TradeRoutePositions> {
	const requestId = nextRequestId++
	return new Promise((resolve) => {
		pending.set(requestId, { resolve })
		getWorker().postMessage({ requestId, request })
	})
}

export function terminateTradeRouteWorker() {
	worker?.terminate()
	worker = null
	pending.clear()
}

function appendDetailTiles({
	group,
	positions,
	material,
	dashSource,
}: TradeRouteDetailBuildParams): void {
	const tiles = new Map<string, { positions: number[]; distances: number[] }>()
	const distanceStart = dashSource?.getAttribute("instanceDistanceStart")
	const distanceEnd = dashSource?.getAttribute("instanceDistanceEnd")
	for (let i = 0; i < positions.length; i += 6) {
		const x = Math.floor(
			(positions[i] + positions[i + 3]) / (2 * DETAIL_TILE_SIZE),
		)
		const y = Math.floor(
			(positions[i + 1] + positions[i + 4]) / (2 * DETAIL_TILE_SIZE),
		)
		const z = Math.floor(
			(positions[i + 2] + positions[i + 5]) / (2 * DETAIL_TILE_SIZE),
		)
		const key = `${x}:${y}:${z}`
		let tile = tiles.get(key)
		if (!tile) {
			tile = { positions: [], distances: [] }
			tiles.set(key, tile)
		}
		for (let j = i; j < i + 6; j++) tile.positions.push(positions[j])
		if (distanceStart && distanceEnd) {
			tile.distances.push(distanceStart.getX(i / 6), distanceEnd.getX(i / 6))
		}
	}
	for (const tile of tiles.values()) {
		const geometry = new LineSegmentsGeometry().setPositions(tile.positions)
		if (geometry.boundingSphere)
			geometry.boundingSphere.radius += DETAIL_TILE_BOUNDS_PADDING
		if (tile.distances.length) {
			const distances = new THREE.InstancedInterleavedBuffer(
				Float32Array.from(tile.distances),
				2,
			)
			geometry.setAttribute(
				"instanceDistanceStart",
				new THREE.InterleavedBufferAttribute(distances, 1, 0),
			)
			geometry.setAttribute(
				"instanceDistanceEnd",
				new THREE.InterleavedBufferAttribute(distances, 1, 1),
			)
		}
		const line = new LineSegments2(geometry, material)
		line.layers.set(TRADE_ROUTE_DETAIL_LAYER)
		line.renderOrder = ROUTE_RENDER_ORDER
		group.add(line)
	}
}

export function buildTradeRouteLines(
	positions: TradeRoutePositionSet,
	resolution: OverlayResolution,
): TradeRouteOverlayBuild {
	const group = new THREE.Group()
	const materials: LineMaterial[] = []
	for (const kind of [
		TRANSPORT.ROUTE_LAND_MAJOR,
		TRANSPORT.ROUTE_LAND_MINOR,
		TRANSPORT.ROUTE_SEA,
	] as const) {
		const segments = positions[kind]
		if (segments.length < 6) continue
		const style = TRADE_ROUTE_STYLE[kind]
		const material = new LineMaterial({
			color: style.color,
			linewidth: style.baseWidth,
			transparent: true,
			opacity: style.opacity,
			depthWrite: false,
			dashed: style.dashed,
			...(style.dashed ? SEA_ROUTE_DASH_STYLE : {}),
		})
		material.userData.baseWidth = style.baseWidth
		material.resolution.set(resolution.width, resolution.height)
		materials.push(material)
		let dashSource: LineSegmentsGeometry | null = null
		if (kind !== TRANSPORT.ROUTE_LAND_MINOR) {
			const geometry = new LineSegmentsGeometry().setPositions(segments)
			const line = new LineSegments2(geometry, material)
			if (style.dashed) {
				line.computeLineDistances()
				dashSource = geometry
			}
			line.layers.set(TRADE_ROUTE_OVERVIEW_LAYER)
			line.renderOrder = ROUTE_RENDER_ORDER
			group.add(line)
		}
		appendDetailTiles({ group, positions: segments, material, dashSource })
	}
	return { group, materials }
}

export function syncTradeRouteDetail(
	camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
): void {
	const showDetail =
		camera instanceof THREE.OrthographicCamera
			? camera.zoom >= MAP_OVERVIEW_ZOOM
			: camera.position.lengthSq() <= GLOBE_OVERVIEW_DISTANCE_SQUARED
	if (showDetail) {
		camera.layers.enable(TRADE_ROUTE_DETAIL_LAYER)
		camera.layers.disable(TRADE_ROUTE_OVERVIEW_LAYER)
	} else {
		camera.layers.disable(TRADE_ROUTE_DETAIL_LAYER)
		camera.layers.enable(TRADE_ROUTE_OVERVIEW_LAYER)
	}
}
