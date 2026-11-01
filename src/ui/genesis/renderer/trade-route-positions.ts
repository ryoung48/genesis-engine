import * as THREE from "three"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { SerializedRouteKind } from "@/model/society/infrastructure/transport/types"
import type { SerializedNetwork } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type {
	TradeRoutePositionRequest,
	TradeRoutePositionSet,
	TradeRoutePositions,
} from "@/ui/genesis/renderer/types"

const TERRAIN_ELEVATION_SCALE = 0.04
const GLOBE_Z_LIFT = 0.009
const MAP_Z_LIFT = 0.012
const MAP_Z_ELEVATION_FACTOR = 0.5

interface Corridor {
	regions: number[]
	kind: SerializedRouteKind
	usage: number
	weight: number
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

function smoothPoints(points: THREE.Vector3[]): THREE.Vector3[] {
	if (points.length <= 2) return points
	const curve = new THREE.CatmullRomCurve3(points, false, "centripetal")
	const segments = Math.max(points.length * 4, 8)
	return curve.getPoints(segments)
}

function buildTradeRouteCorridors(network: SerializedNetwork): Corridor[] {
	const adjacency = new Map<
		number,
		Array<{
			neighbor: number
			kind: SerializedRouteKind
			usage: number
			weight: number
			key: string
		}>
	>()
	const appendEdge = (edge: {
		fromRegion: number
		toRegion: number
		kind: SerializedRouteKind
		usage: number
		weight: number
	}) => {
		const key = `${edge.kind}:${networkKey(edge.fromRegion, edge.toRegion)}`
		const fromList = adjacency.get(edge.fromRegion) ?? []
		fromList.push({
			neighbor: edge.toRegion,
			kind: edge.kind,
			usage: edge.usage,
			weight: edge.weight,
			key,
		})
		adjacency.set(edge.fromRegion, fromList)
		const toList = adjacency.get(edge.toRegion) ?? []
		toList.push({
			neighbor: edge.fromRegion,
			kind: edge.kind,
			usage: edge.usage,
			weight: edge.weight,
			key,
		})
		adjacency.set(edge.toRegion, toList)
	}
	TRANSPORT.forEachEdge({ network, callback: appendEdge })

	const visited = new Set<string>()
	const corridors: Corridor[] = []

	function walk(
		start: number,
		next: number,
		initialKey: string,
		corridorKind: SerializedRouteKind,
	): Corridor {
		const regions = [start, next]
		const usages: number[] = []
		const weights: number[] = []
		let previous = start
		let current = next
		let edgeId = initialKey

		while (true) {
			visited.add(edgeId)
			const step = adjacency
				.get(previous)
				?.find((entry) => entry.neighbor === current && entry.key === edgeId)
			if (step) {
				usages.push(step.usage)
				weights.push(step.weight)
			}
			const neighbors = (adjacency.get(current) ?? []).filter(
				(entry) => entry.kind === corridorKind,
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
			edgeId = nextEdge.key
			regions.push(current)
		}

		return {
			regions,
			kind: corridorKind,
			usage: Math.max(...usages),
			weight: Math.max(...weights),
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
				corridors.push(
					walk(region, neighbor.neighbor, neighbor.key, neighbor.kind),
				)
			}
		}
	}

	for (const [region, neighbors] of adjacency) {
		for (const neighbor of neighbors) {
			if (visited.has(neighbor.key)) continue
			corridors.push(
				walk(region, neighbor.neighbor, neighbor.key, neighbor.kind),
			)
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
	const smoothed = smoothPoints(points)
	for (let i = 1; i < smoothed.length; i++) {
		const previous = smoothed[i - 1]
		const current = smoothed[i]
		positions.push(
			previous.x,
			previous.y,
			previous.z,
			current.x,
			current.y,
			current.z,
		)
	}
}

// Corridors that cross the antimeridian relative to the current view
// project to a huge jump in map-space x. Rather than dropping the
// crossing edge (which is fine for coastline polygons but leaves real
// connectivity data like trade routes visibly disconnected), each
// crossing edge is split and extended to the map's left/right border --
// the slide clones added by addMapSlideClones() then make the route
// appear to continue seamlessly off one edge and back in on the other.
function splitMapPoints(
	points: THREE.Vector3[],
	halfWidth: number,
	repeatWidth: number,
): THREE.Vector3[][] {
	if (points.length < 2) return points.length === 0 ? [] : [points]
	const segments: THREE.Vector3[][] = [[points[0]]]
	for (let i = 1; i < points.length; i++) {
		const current = points[i]
		const previous = points[i - 1]
		if (Math.abs(current.x - previous.x) > halfWidth) {
			const sign = Math.sign(previous.x) || 1
			const unwrappedCurrentX = current.x - sign * repeatWidth
			const edgeX = sign * halfWidth
			const denom = unwrappedCurrentX - previous.x
			const t = THREE.MathUtils.clamp(
				denom !== 0 ? (edgeX - previous.x) / denom : 0,
				0,
				1,
			)
			const y = THREE.MathUtils.lerp(previous.y, current.y, t)
			const z = THREE.MathUtils.lerp(previous.z, current.z, t)
			segments[segments.length - 1].push(new THREE.Vector3(edgeX, y, z))
			segments.push([new THREE.Vector3(-edgeX, y, z), current])
			continue
		}
		segments[segments.length - 1].push(current)
	}
	return segments.filter((segment) => segment.length >= 2)
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
		for (const segment of splitMapPoints(
			mapPoints,
			projection.halfWidth,
			projection.repeatWidth,
		)) {
			appendPolylineSegments(map[corridor.kind], segment)
		}
	}
	return { globe: toPositionSet(globe), map: toPositionSet(map) }
}

export const TRADE_ROUTE_POSITIONS = { compute }
