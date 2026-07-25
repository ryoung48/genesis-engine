import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import {
	forEachEdge,
	networkCount,
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
	type RouteEdge,
	SerializedGenesisWorld,
	type SerializedNetwork,
	type SerializedRouteKind,
} from "@/model/transport/worker-types"
import { createMapProjection } from "./map-projection"

const TERRAIN_ELEVATION_SCALE = 0.04
const GLOBE_Z_LIFT = 0.009
const MAP_Z_LIFT = 0.012
const MAP_Z_ELEVATION_FACTOR = 0.5
const MAP_SEAM_THRESHOLD = 2
const SEA_ROUTE_DASH_STYLE = {
	dashSize: 0.006,
	gapSize: 0.004,
} as const
const TRADE_ROUTE_STYLE = {
	[ROUTE_LAND_MAJOR]: {
		color: 0xb91c1c,
		baseWidth: 0.5,
		opacity: 0.9,
		dashed: false,
	},
	[ROUTE_LAND_MINOR]: {
		color: 0xd97706,
		baseWidth: 0.35,
		opacity: 0.68,
		dashed: false,
	},
	[ROUTE_SEA]: {
		color: 0x2563eb,
		baseWidth: 1.2,
		opacity: 0.82,
		dashed: true,
	},
} as const

interface OverlayResolution {
	width: number
	height: number
}

interface Corridor {
	regions: number[]
	kind: SerializedRouteKind
	usage: number
	weight: number
}

interface TradeRouteOverlayBuild {
	group: THREE.Group
	materials: LineMaterial[]
}

type BatchedPositions = Record<SerializedRouteKind, number[]>

function isPackedInfrastructureNetwork(
	edges: readonly RouteEdge[] | SerializedNetwork,
): edges is SerializedNetwork {
	return !Array.isArray(edges)
}

function infrastructureEdgesCount(
	edges: readonly RouteEdge[] | SerializedNetwork,
): number {
	return isPackedInfrastructureNetwork(edges)
		? networkCount(edges)
		: edges.length
}

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

function buildTradeRouteCorridors(
	edges: readonly RouteEdge[] | SerializedNetwork,
): Corridor[] {
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
	if (isPackedInfrastructureNetwork(edges)) {
		forEachEdge(edges, appendEdge)
	} else {
		for (const edge of edges) appendEdge(edge)
	}

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
		[ROUTE_LAND_MAJOR]: [],
		[ROUTE_LAND_MINOR]: [],
		[ROUTE_SEA]: [],
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

function createBatchedLine(
	kind: SerializedRouteKind,
	positions: number[],
	resolution: OverlayResolution,
): { line: LineSegments2; material: LineMaterial } | null {
	if (positions.length < 6) return null
	const style = TRADE_ROUTE_STYLE[kind]
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: style.color,
		linewidth: style.baseWidth,
		transparent: true,
		opacity: style.opacity,
		depthWrite: false,
		dashed: style.dashed,
		dashSize: style.dashed ? SEA_ROUTE_DASH_STYLE.dashSize : undefined,
		gapSize: style.dashed ? SEA_ROUTE_DASH_STYLE.gapSize : undefined,
	})
	material.userData.baseWidth = style.baseWidth
	material.resolution.set(resolution.width, resolution.height)
	const line = new LineSegments2(geometry, material)
	line.computeLineDistances()
	line.renderOrder = 997
	return { line, material }
}

function appendBatchedLines(
	group: THREE.Group,
	materials: LineMaterial[],
	batchedPositions: BatchedPositions,
	resolution: OverlayResolution,
): void {
	for (const kind of [ROUTE_LAND_MAJOR, ROUTE_LAND_MINOR, ROUTE_SEA] as const) {
		const line = createBatchedLine(kind, batchedPositions[kind], resolution)
		if (!line) continue
		group.add(line.line)
		materials.push(line.material)
	}
}

function splitMapPoints(points: THREE.Vector3[]): THREE.Vector3[][] {
	if (points.length < 2) return points.length === 0 ? [] : [points]
	const segments: THREE.Vector3[][] = [[points[0]]]
	for (let i = 1; i < points.length; i++) {
		const current = points[i]
		const previous = points[i - 1]
		if (Math.abs(current.x - previous.x) > MAP_SEAM_THRESHOLD) {
			segments.push([current])
			continue
		}
		segments[segments.length - 1].push(current)
	}
	return segments.filter((segment) => segment.length >= 2)
}

export function buildGlobeTradeRoutes(
	world: SerializedGenesisWorld,
	edges: readonly RouteEdge[] | SerializedNetwork,
	resolution: OverlayResolution,
	elevationVisible: boolean,
): TradeRouteOverlayBuild {
	const group = new THREE.Group()
	const materials: LineMaterial[] = []
	if (!world.provinces || infrastructureEdgesCount(edges) === 0) {
		return { group, materials }
	}
	const batchedPositions = createEmptyBatchedPositions()
	for (const corridor of buildTradeRouteCorridors(edges)) {
		const points = corridor.regions.map((region) =>
			regionPositionGlobe(
				world.mesh.r_xyz,
				world.elevation,
				region,
				elevationVisible,
			),
		)
		appendPolylineSegments(batchedPositions[corridor.kind], points)
	}
	appendBatchedLines(group, materials, batchedPositions, resolution)
	return { group, materials }
}

export function buildMapTradeRoutes(
	world: SerializedGenesisWorld,
	edges: readonly RouteEdge[] | SerializedNetwork,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	resolution: OverlayResolution,
): TradeRouteOverlayBuild {
	const group = new THREE.Group()
	const materials: LineMaterial[] = []
	if (!world.provinces || infrastructureEdgesCount(edges) === 0) {
		return { group, materials }
	}
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const batchedPositions = createEmptyBatchedPositions()
	for (const corridor of buildTradeRouteCorridors(edges)) {
		const points = corridor.regions.map((region) =>
			regionPositionMap(projection, world.mesh.r_xyz, world.elevation, region),
		)
		for (const segment of splitMapPoints(points)) {
			appendPolylineSegments(batchedPositions[corridor.kind], segment)
		}
	}
	appendBatchedLines(group, materials, batchedPositions, resolution)
	return { group, materials }
}
