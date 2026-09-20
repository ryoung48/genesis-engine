import Delaunator from "delaunator"
import type {
	GalaxyTopology,
	GalaxyTopologyParams,
	LaneGraphParams,
} from "@/model/celestial/galaxy/topology/types"
import { RNG } from "@/model/shared/random/rng"

/**
 * Builds CSR adjacency from Delaunay triangles + halfedges: for each
 * halfedge pair we emit the edge exactly once (either at a hull edge, where
 * the opposite halfedge is -1, or when this side's index is the lower of
 * the pair).
 */
function buildCSR({
	triangles,
	halfedges,
	numSystems,
}: {
	triangles: Uint32Array
	halfedges: Int32Array
	numSystems: number
}): { adjOffset: Int32Array; adjList: Int32Array } {
	const numSides = triangles.length
	const next = (s: number) => (s % 3 === 2 ? s - 2 : s + 1)

	const degree = new Int32Array(numSystems)
	for (let s = 0; s < numSides; s++) {
		const opp = halfedges[s]!
		if (opp === -1 || s < opp) {
			degree[triangles[s]!]!++
			degree[triangles[next(s)]!]!++
		}
	}

	const adjOffset = new Int32Array(numSystems + 1)
	for (let i = 0; i < numSystems; i++)
		adjOffset[i + 1] = adjOffset[i]! + degree[i]!

	const adjList = new Int32Array(adjOffset[numSystems]!)
	const cursor = new Int32Array(numSystems)

	for (let s = 0; s < numSides; s++) {
		const opp = halfedges[s]!
		if (opp === -1 || s < opp) {
			const a = triangles[s]!
			const b = triangles[next(s)]!
			adjList[adjOffset[a]! + cursor[a]!++] = b
			adjList[adjOffset[b]! + cursor[b]!++] = a
		}
	}

	return { adjOffset, adjList }
}

/** CSR adjacency over the hyperlane graph only (the flat [a0,b0, a1,b1, …]
 * pair list from buildHyperlanes), deduped and undirected. Nation territory
 * spreads along this instead of the full Delaunay adjacency so realms follow
 * travel routes. */
function buildLaneCSR({ lanes, numSystems }: LaneGraphParams): {
	laneAdjOffset: Int32Array
	laneAdjList: Int32Array
} {
	const neighbors: Set<number>[] = Array.from(
		{ length: numSystems },
		() => new Set<number>(),
	)
	for (let i = 0; i < lanes.length; i += 2) {
		const a = lanes[i]!
		const b = lanes[i + 1]!
		neighbors[a]!.add(b)
		neighbors[b]!.add(a)
	}

	const laneAdjOffset = new Int32Array(numSystems + 1)
	for (let i = 0; i < numSystems; i++) {
		laneAdjOffset[i + 1] = laneAdjOffset[i]! + neighbors[i]!.size
	}

	const laneAdjList = new Int32Array(laneAdjOffset[numSystems]!)
	let cursor = 0
	for (let i = 0; i < numSystems; i++) {
		for (const nb of neighbors[i]!) laneAdjList[cursor++] = nb
	}

	return { laneAdjOffset, laneAdjList }
}

/** Returns true if segment (x1,y1)-(x2,y2) intersects the circle at
 * (cx,cy) with radius r, via the parametric line-circle discriminant. */
function segmentCrossesCircle({
	x1,
	y1,
	x2,
	y2,
	cx,
	cy,
	r,
}: {
	x1: number
	y1: number
	x2: number
	y2: number
	cx: number
	cy: number
	r: number
}): boolean {
	const dx = x2 - x1
	const dy = y2 - y1
	const fx = x1 - cx
	const fy = y1 - cy
	const a = dx * dx + dy * dy
	const b = 2 * (fx * dx + fy * dy)
	const c = fx * fx + fy * fy - r * r
	const disc = b * b - 4 * a * c
	if (disc < 0) return false
	const sq = Math.sqrt(disc)
	const t1 = (-b - sq) / (2 * a)
	const t2 = (-b + sq) / (2 * a)
	return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1)
}

/** Ordered-by-weight candidate-edge queue used by Prim's MST below. Kept as
 * a plain array + linear scan (candidate counts here are in the low
 * thousands at most) rather than a binary heap class, per this repo's
 * "avoid classes" convention. */
function makeCandidateQueue() {
	const weights: number[] = []
	const froms: number[] = []
	const tos: number[] = []

	return {
		get length() {
			return weights.length
		},
		push(from: number, to: number, weight: number): void {
			weights.push(weight)
			froms.push(from)
			tos.push(to)
		},
		popLowest(): { from: number; to: number } {
			let best = 0
			for (let i = 1; i < weights.length; i++) {
				if (weights[i]! < weights[best]!) best = i
			}
			const from = froms[best]!
			const to = tos[best]!
			const last = weights.length - 1
			weights[best] = weights[last]!
			froms[best] = froms[last]!
			tos[best] = tos[last]!
			weights.pop()
			froms.pop()
			tos.pop()
			return { from, to }
		},
	}
}

/**
 * Prim's MST over the packed (non-edge) systems using the Delaunay CSR
 * adjacency, with edge weights drawn from the seeded RNG rather than
 * distance -- this makes hyperlane routing feel organic instead of always
 * picking the geometrically shortest connection. Rejects edges that would
 * cross the core-radius circle, then adds back ~30% of the safe rejected
 * edges for extra connectivity/cycles.
 */
function buildHyperlanes({
	packing,
	adjOffset,
	adjList,
	numSystems,
	dimensions,
	coreRadius,
	rng,
}: {
	packing: GalaxyTopologyParams["packing"]
	adjOffset: Int32Array
	adjList: Int32Array
	numSystems: number
	dimensions: { w: number; h: number }
	coreRadius: number
	rng: ReturnType<typeof RNG.createRng>
}): { lanes: Int32Array; laneCount: number } {
	const { r_xy, r_edge } = packing
	const cx = dimensions.w / 2
	const cy = dimensions.h / 2

	const crosses = (a: number, b: number): boolean =>
		segmentCrossesCircle({
			x1: r_xy[2 * a]!,
			y1: r_xy[2 * a + 1]!,
			x2: r_xy[2 * b]!,
			y2: r_xy[2 * b + 1]!,
			cx,
			cy,
			r: coreRadius,
		})

	let startIdx = 0
	while (startIdx < numSystems && r_edge[startIdx]) startIdx++
	if (startIdx >= numSystems) return { lanes: new Int32Array(0), laneCount: 0 }

	let nonEdgeCount = 0
	for (let i = 0; i < numSystems; i++) if (!r_edge[i]) nonEdgeCount++

	const visited = new Uint8Array(numSystems)
	const laneBuffer: number[] = []
	const rejectBuffer: Array<[number, number]> = []
	const queue = makeCandidateQueue()

	visited[startIdx] = 1
	let visitedCount = 1

	for (let j = adjOffset[startIdx]!; j < adjOffset[startIdx + 1]!; j++) {
		const nb = adjList[j]!
		if (!r_edge[nb]) queue.push(startIdx, nb, rng.random())
	}

	while (visitedCount < nonEdgeCount && queue.length > 0) {
		const { from: a, to: b } = queue.popLowest()
		if (visited[b] || crosses(a, b)) {
			rejectBuffer.push([a, b])
			continue
		}
		visited[b] = 1
		visitedCount++
		laneBuffer.push(a, b)

		for (let j = adjOffset[b]!; j < adjOffset[b + 1]!; j++) {
			const nb = adjList[j]!
			if (!visited[nb] && !r_edge[nb]) queue.push(b, nb, rng.random())
		}
	}

	const safeRejects = rejectBuffer.filter(([a, b]) => !crosses(a, b))
	const shuffledRejects = rng.shuffle(safeRejects)
	const extraCount = Math.floor(shuffledRejects.length * 0.3)
	for (let i = 0; i < extraCount; i++) {
		const [a, b] = shuffledRejects[i]!
		laneBuffer.push(a, b)
	}

	const lanes = new Int32Array(laneBuffer)
	return { lanes, laneCount: lanes.length / 2 }
}

/**
 * Connects packed systems into a navigable topology: full Delaunay
 * adjacency (for anything that needs "nearby systems", e.g. future
 * territory partitioning) plus a sparser hyperlane MST (for travel/render).
 * Kept independent of packing/systems generation -- see plans/
 * galaxy-view-port.md's axiomatic-design section.
 */
function build({
	packing,
	seed,
	dimensions,
	coreRadius,
}: GalaxyTopologyParams): GalaxyTopology {
	const numSystems = packing.r_edge.length
	const coords = Float64Array.from(packing.r_xy)

	const delaunay = new Delaunator(coords)
	const { adjOffset, adjList } = buildCSR({
		triangles: delaunay.triangles,
		halfedges: delaunay.halfedges,
		numSystems,
	})

	const rng = RNG.createRng({ seed })
	const { lanes, laneCount } = buildHyperlanes({
		packing,
		adjOffset,
		adjList,
		numSystems,
		dimensions,
		coreRadius,
		rng,
	})

	const { laneAdjOffset, laneAdjList } = buildLaneCSR({ lanes, numSystems })

	return { adjOffset, adjList, lanes, laneCount, laneAdjOffset, laneAdjList }
}

export const GALAXY_TOPOLOGY = { build, buildLaneCSR }
