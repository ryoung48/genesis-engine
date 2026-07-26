import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedGenesisWorld } from "@/model/transport"
import type { createMapProjection } from "./map-projection"

export interface CoastlineLineData {
	rings: number[][] // each ring: flat [lon0, lat0, lon1, lat1, ...] in degrees
}

let cachedLines: Promise<CoastlineLineData> | null = null

function fetchLineData(url: string): Promise<CoastlineLineData> {
	return fetch(url).then((res) => {
		if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
		return res.json() as Promise<CoastlineLineData>
	})
}

// Fetched once and reused across globe rebuilds — this is static vector
// data (Natural Earth land + lake polygons), independent of any generated
// world. Lake shorelines are included so the coastline overlay draws real
// lake outlines too, not just the continental coastline.
export function loadCoastlineLines(): Promise<CoastlineLineData> {
	if (!cachedLines) {
		cachedLines = Promise.all([
			fetchLineData("/heightmap/coastline-lines.json"),
			fetchLineData("/heightmap/lake-lines.json"),
		]).then(([coastline, lakes]) => ({
			rings: [...coastline.rings, ...lakes.rings],
		}))
	}
	return cachedLines
}

// lon/lat (degrees) -> unit sphere xyz, matching the convention used
// elsewhere in the genesis pipeline (lat = asin(z), lon = atan2(y, x)).
function lonLatToXyz(
	lonDeg: number,
	latDeg: number,
	radius: number,
): [number, number, number] {
	const lon = (lonDeg * Math.PI) / 180
	const lat = (latDeg * Math.PI) / 180
	const cosLat = Math.cos(lat)
	return [
		Math.cos(lon) * cosLat * radius,
		Math.sin(lon) * cosLat * radius,
		Math.sin(lat) * radius,
	]
}

// ── Derived coastline for procedurally generated (non-Earth) worlds ──
//
// There's no real vector coastline for a made-up planet, so instead we walk
// the mesh's own land/ocean boundary (the same technique province-overlay.ts
// uses for province borders — Voronoi edges between differently-classified
// regions), chain those edges into loops, and Catmull-Rom-smooth each loop
// so it doesn't look like a raw polygon outline of mesh cells. Lazy: only
// called when the coastline overlay is actually toggled on.

function extractCoastlineBoundaryEdges(
	world: SerializedGenesisWorld,
): Array<[number, number]> {
	const { mesh, isLand } = world
	if (!isLand) return []
	const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t } = mesh
	const edges: Array<[number, number]> = []

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite < 0 || side > opposite) continue
		const r0 = s_begin_r[side]
		const r1 = s_begin_r[opposite]
		if (isLand[r0] === isLand[r1]) continue

		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		edges.push([tInner, tOuter])
	}
	return edges
}

// Chains an unordered edge set (triangle-center index pairs) into loops by
// walking shared endpoints. Mesh coastline boundaries are topologically
// closed curves (the sphere has no border), so loops are expected to close;
// a hard iteration cap guards against degenerate/non-manifold edge cases
// (e.g. three regions meeting at one point) turning into an infinite walk.
function chainEdgesIntoLoops(edges: Array<[number, number]>): number[][] {
	const adjacency = new Map<number, number[]>()
	for (const [a, b] of edges) {
		;(adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b)
		;(adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a)
	}
	const visited = new Set<string>()
	const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

	const loops: number[][] = []
	for (const [start] of edges) {
		for (const next of adjacency.get(start) ?? []) {
			if (visited.has(edgeKey(start, next))) continue

			const loop = [start, next]
			visited.add(edgeKey(start, next))
			let current = next
			let guard = edges.length + 1
			while (guard-- > 0) {
				const candidates = adjacency.get(current) ?? []
				const nextStep = candidates.find(
					(c) => !visited.has(edgeKey(current, c)),
				)
				if (nextStep === undefined) break
				visited.add(edgeKey(current, nextStep))
				current = nextStep
				if (current === start) break
				loop.push(current)
			}
			if (loop.length >= 3) loops.push(loop)
		}
	}
	return loops
}

function smoothLoopToLonLatRing(
	loop: number[],
	t_xyz: Float32Array,
	samplesPerSegment: number,
): number[] {
	const points = loop.map(
		(t) => new THREE.Vector3(t_xyz[3 * t], t_xyz[3 * t + 1], t_xyz[3 * t + 2]),
	)
	const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5)
	const sampleCount = Math.min(
		2000,
		Math.max(8, loop.length * samplesPerSegment),
	)
	const sampled = curve.getPoints(sampleCount)

	const ring: number[] = []
	for (const p of sampled) {
		const len = p.length() || 1
		const x = p.x / len
		const y = p.y / len
		const z = p.z / len
		const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		const lon = (Math.atan2(y, x) * 180) / Math.PI
		ring.push(lon, lat)
	}
	return ring
}

export function deriveCoastlineFromWorld(
	world: SerializedGenesisWorld,
): CoastlineLineData {
	const edges = extractCoastlineBoundaryEdges(world)
	const loops = chainEdgesIntoLoops(edges)
	const rings = loops.map((loop) =>
		smoothLoopToLonLatRing(loop, world.mesh.t_xyz, 4),
	)
	return { rings }
}

// Natural Earth polygons that get clipped at the antimeridian during
// production (Antarctica, and Eurasia/Africa near the Bering Strait/
// Chukotka Peninsula are the known cases in this dataset) have their ring
// artificially closed with a straight edge that runs *along* the clip
// boundary itself — both endpoints sit right on lon=±180° regardless of how
// far apart their latitudes are. This isn't real coastline; it's a data
// artifact from the clipping process. Detected independent of map
// pan/rotation (unlike the projected-x seam check below), since both
// endpoints being pinned to the true dateline is the fingerprint regardless
// of where the current view happens to be centered.
const DATELINE_CLIP_EPS_DEG = 0.05
function isDatelineClipArtifact(lon0: number, lon1: number): boolean {
	return (
		Math.abs(Math.abs(lon0) - 180) < DATELINE_CLIP_EPS_DEG &&
		Math.abs(Math.abs(lon1) - 180) < DATELINE_CLIP_EPS_DEG
	)
}

export function buildCoastlineGlobeLines(
	data: CoastlineLineData,
	radius: number,
	resolution: readonly [number, number],
): LineSegments2 {
	const positions: number[] = []
	for (const ring of data.rings) {
		const numPoints = ring.length / 2
		for (let i = 0; i < numPoints; i++) {
			const j = (i + 1) % numPoints
			if (isDatelineClipArtifact(ring[2 * i], ring[2 * j])) continue
			const [x0, y0, z0] = lonLatToXyz(ring[2 * i], ring[2 * i + 1], radius)
			const [x1, y1, z1] = lonLatToXyz(ring[2 * j], ring[2 * j + 1], radius)
			positions.push(x0, y0, z0, x1, y1, z1)
		}
	}

	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: 0x0b1f33,
		linewidth: 1.2,
		resolution: new THREE.Vector2(resolution[0], resolution[1]),
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
	})
	const lines = new LineSegments2(geometry, material)
	lines.computeLineDistances()
	lines.renderOrder = 998
	return lines
}

// Flat-map version. Ring edges that cross the antimeridian project to a
// huge jump in map-space x (the seam in this projection sits at
// centerLongitude ± 180°) — rather than draw a spurious line all the way
// across the map, such edges are simply skipped (LineSegments2 draws
// independent segments, so a gap here is visually correct, not a bug).
export function buildCoastlineMapLines(
	data: CoastlineLineData,
	projection: ReturnType<typeof createMapProjection>,
	z: number,
	resolution: readonly [number, number],
): LineSegments2 {
	const seamThreshold = projection.repeatWidth * 0.5
	const positions: number[] = []
	for (const ring of data.rings) {
		const numPoints = ring.length / 2
		for (let i = 0; i < numPoints; i++) {
			const j = (i + 1) % numPoints
			if (isDatelineClipArtifact(ring[2 * i], ring[2 * j])) continue
			const a = projection.projectDegrees(ring[2 * i], ring[2 * i + 1], z)
			const b = projection.projectDegrees(ring[2 * j], ring[2 * j + 1], z)
			if (Math.abs(b[0] - a[0]) > seamThreshold) continue
			positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
		}
	}

	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: 0x0b1f33,
		linewidth: 1.2,
		resolution: new THREE.Vector2(resolution[0], resolution[1]),
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
	})
	const lines = new LineSegments2(geometry, material)
	lines.computeLineDistances()
	lines.renderOrder = 998
	return lines
}
