import * as THREE from "three"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { SerializedRouteKind } from "@/model/society/infrastructure/transport/types"
import type { SerializedNetwork } from "@/model/worker-protocol/types"
import {
	createMapProjection,
	splitMapPoints,
} from "@/ui/genesis/renderer/map-projection"
import type {
	TradeRouteCorridorEdge,
	TradeRouteCorridorStart,
	TradeRoutePositionRequest,
	TradeRoutePositionSet,
	TradeRoutePositions,
} from "@/ui/genesis/renderer/types"

const TERRAIN_ELEVATION_SCALE = 0.04
const GLOBE_Z_LIFT = 0.009
const MAP_Z_LIFT = 0.012
const MAP_Z_ELEVATION_FACTOR = 0.5
const CURVE_TOLERANCE_SQUARED = 0.0001 ** 2

interface Corridor {
	regions: number[]
	kind: SerializedRouteKind
}

type BatchedPositions = Record<SerializedRouteKind, number[]>

function networkKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`
}

function regionPositionGlobe(
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	elevationVisible: boolean,
): THREE.Vector3 {
	const x = r_xyz[3 * region]
	const y = r_xyz[3 * region + 1]
	const z = r_xyz[3 * region + 2]
	const len = Math.sqrt(x * x + y * y + z * z)
	const elev = elevation[region]
	const adj = elevationVisible
		? elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
		: 0
	const lift = elevationVisible ? GLOBE_Z_LIFT : 0.004
	const radius = 1 + adj + lift
	return new THREE.Vector3(
		(x / len) * radius,
		(y / len) * radius,
		(z / len) * radius,
	)
}

function regionPositionMap(
	projection: ReturnType<typeof createMapProjection>,
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
): THREE.Vector3 {
	const projected = projection.projectCartesian(
		r_xyz[3 * region],
		r_xyz[3 * region + 1],
		r_xyz[3 * region + 2],
	)
	const elev = elevation[region]
	const adj =
		elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
	const z = MAP_Z_LIFT + adj * MAP_Z_ELEVATION_FACTOR
	const [x, y] = projection.projectRadians(projected.lon, projected.lat, z)
	return new THREE.Vector3(x, y, z)
}

function buildTradeRouteCorridors(network: SerializedNetwork): Corridor[] {
	const adjacency = new Map<number, TradeRouteCorridorEdge[]>()
	const appendEdge = (edge: {
		fromRegion: number
		toRegion: number
		kind: SerializedRouteKind
	}) => {
		const key = `${edge.kind}:${networkKey(edge.fromRegion, edge.toRegion)}`
		const fromList = adjacency.get(edge.fromRegion) ?? []
		fromList.push({
			neighbor: edge.toRegion,
			kind: edge.kind,
			key,
		})
		adjacency.set(edge.fromRegion, fromList)
		const toList = adjacency.get(edge.toRegion) ?? []
		toList.push({
			neighbor: edge.fromRegion,
			kind: edge.kind,
			key,
		})
		adjacency.set(edge.toRegion, toList)
	}
	TRANSPORT.forEachEdge({ network, callback: appendEdge })

	const visited = new Set<string>()
	const corridors: Corridor[] = []

	function walk({
		region: start,
		edge: initialEdge,
	}: TradeRouteCorridorStart): Corridor {
		const { neighbor: next, kind } = initialEdge
		const regions = [start, next]
		let previous = start
		let current = next
		let edge = initialEdge

		while (true) {
			visited.add(edge.key)
			const neighbors = (adjacency.get(current) ?? []).filter(
				(entry) => entry.kind === kind,
			)
			const candidates = neighbors.filter(
				(entry) => entry.neighbor !== previous && !visited.has(entry.key),
			)
			if (neighbors.length !== 2 || candidates.length !== 1) {
				break
			}
			const nextEdge = candidates[0]
			previous = current
			current = nextEdge.neighbor
			edge = nextEdge
			regions.push(current)
		}

		return {
			regions,
			kind,
		}
	}

	for (const [region, neighbors] of adjacency) {
		const neighborsByKind = new Map<SerializedRouteKind, typeof neighbors>()
		for (const neighbor of neighbors) {
			const list = neighborsByKind.get(neighbor.kind) ?? []
			list.push(neighbor)
			neighborsByKind.set(neighbor.kind, list)
		}
		for (const kindNeighbors of neighborsByKind.values()) {
			if (kindNeighbors.length === 2) continue
			for (const neighbor of kindNeighbors) {
				if (visited.has(neighbor.key)) continue
				corridors.push(walk({ region, edge: neighbor }))
			}
		}
	}

	for (const [region, neighbors] of adjacency) {
		for (const neighbor of neighbors) {
			if (visited.has(neighbor.key)) continue
			corridors.push(walk({ region, edge: neighbor }))
		}
	}

	return corridors
}

function createEmptyBatchedPositions(): BatchedPositions {
	return {
		[TRANSPORT.ROUTE_LAND_MAJOR]: [],
		[TRANSPORT.ROUTE_LAND_MINOR]: [],
		[TRANSPORT.ROUTE_SEA]: [],
	}
}

function appendPolylineSegments(
	positions: number[],
	points: THREE.Vector3[],
): void {
	if (points.length < 2) return
	const edgeCount = points.length - 1
	const curve =
		edgeCount > 1
			? new THREE.CatmullRomCurve3(points, false, "centripetal")
			: null
	const midpoint = new THREE.Vector3()
	const chord = new THREE.Line3()
	const nearest = new THREE.Vector3()
	for (let i = 0; i < edgeCount; i++) {
		const start = points[i]
		const end = points[i + 1]
		if (curve) {
			curve.getPoint((i + 0.5) / edgeCount, midpoint)
			chord.set(start, end).closestPointToPoint(midpoint, true, nearest)
			if (midpoint.distanceToSquared(nearest) > CURVE_TOLERANCE_SQUARED) {
				positions.push(
					start.x,
					start.y,
					start.z,
					midpoint.x,
					midpoint.y,
					midpoint.z,
				)
				positions.push(midpoint.x, midpoint.y, midpoint.z, end.x, end.y, end.z)
				continue
			}
		}
		positions.push(start.x, start.y, start.z, end.x, end.y, end.z)
	}
}

function toPositionSet(batched: BatchedPositions): TradeRoutePositionSet {
	return {
		[TRANSPORT.ROUTE_LAND_MAJOR]: new Float32Array(
			batched[TRANSPORT.ROUTE_LAND_MAJOR],
		),
		[TRANSPORT.ROUTE_LAND_MINOR]: new Float32Array(
			batched[TRANSPORT.ROUTE_LAND_MINOR],
		),
		[TRANSPORT.ROUTE_SEA]: new Float32Array(batched[TRANSPORT.ROUTE_SEA]),
	}
}

function compute({
	network,
	r_xyz,
	elevation,
	elevationVisible,
	centerLongitudeDeg,
	projectionLatitudeDeg,
}: TradeRoutePositionRequest): TradeRoutePositions {
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const globe = createEmptyBatchedPositions()
	const map = createEmptyBatchedPositions()
	for (const corridor of buildTradeRouteCorridors(network)) {
		appendPolylineSegments(
			globe[corridor.kind],
			corridor.regions.map((region) =>
				regionPositionGlobe(r_xyz, elevation, region, elevationVisible),
			),
		)
		const mapPoints = corridor.regions.map((region) =>
			regionPositionMap(projection, r_xyz, elevation, region),
		)
		for (const segment of splitMapPoints({
			points: mapPoints,
			halfWidth: projection.halfWidth,
			repeatWidth: projection.repeatWidth,
		})) {
			appendPolylineSegments(map[corridor.kind], segment)
		}
	}
	return { globe: toPositionSet(globe), map: toPositionSet(map) }
}

export const TRADE_ROUTE_POSITIONS = { compute }
