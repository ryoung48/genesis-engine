import Delaunator from "delaunator"

function edgeKey(a: number, b: number, span: number): number {
	const from = a < b ? a : b
	const to = a < b ? b : a
	return from * span + to
}

export function buildUrquhartEdges(
	points: readonly [number, number][],
): Array<[number, number]> {
	if (points.length < 2) return []
	if (points.length === 2) return [[0, 1]]

	const flat = new Float64Array(points.length * 2)
	for (let i = 0; i < points.length; i++) {
		const point = points[i]
		flat[i * 2] = point[0]
		flat[i * 2 + 1] = point[1]
	}
	return buildUrquhartEdgesFromFlat(flat)
}

export function buildUrquhartEdgesFromFlat(
	flatPoints: ArrayLike<number>,
): Array<[number, number]> {
	const pointCount = Math.floor(flatPoints.length / 2)
	if (pointCount < 2) return []
	if (pointCount === 2) return [[0, 1]]

	const delaunay = new Delaunator(flatPoints)
	const kept = new Set<number>()

	for (let triangle = 0; triangle < delaunay.triangles.length; triangle += 3) {
		const a = delaunay.triangles[triangle]
		const b = delaunay.triangles[triangle + 1]
		const c = delaunay.triangles[triangle + 2]
		const ab = squaredDistance(flatPoints, a, b)
		const bc = squaredDistance(flatPoints, b, c)
		const ca = squaredDistance(flatPoints, c, a)
		if (ab >= bc && ab >= ca) {
			kept.add(edgeKey(b, c, pointCount))
			kept.add(edgeKey(c, a, pointCount))
		} else if (bc >= ab && bc >= ca) {
			kept.add(edgeKey(a, b, pointCount))
			kept.add(edgeKey(c, a, pointCount))
		} else {
			kept.add(edgeKey(a, b, pointCount))
			kept.add(edgeKey(b, c, pointCount))
		}
	}

	return [...kept].map((key) => [
		Math.floor(key / pointCount),
		key % pointCount,
	]) as Array<[number, number]>
}

function squaredDistance(
	flatPoints: ArrayLike<number>,
	a: number,
	b: number,
): number {
	const ax = flatPoints[a * 2] ?? 0
	const ay = flatPoints[a * 2 + 1] ?? 0
	const bx = flatPoints[b * 2] ?? 0
	const by = flatPoints[b * 2 + 1] ?? 0
	const dx = ax - bx
	const dy = ay - by
	return dx * dx + dy * dy
}
