import Delaunator from "delaunator"
import type {
	EdgeKeyParams,
	SquaredDistanceParams,
} from "@/model/shared/urquhart/types"

function edgeKey({ a, b, span }: EdgeKeyParams): number {
	const from = a < b ? a : b
	const to = a < b ? b : a
	return from * span + to
}

function buildUrquhartEdgesFromFlat(
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
		const ab = squaredDistance({ flatPoints, a, b })
		const bc = squaredDistance({ flatPoints, a: b, b: c })
		const ca = squaredDistance({ flatPoints, a: c, b: a })
		if (ab >= bc && ab >= ca) {
			kept.add(edgeKey({ a: b, b: c, span: pointCount }))
			kept.add(edgeKey({ a: c, b: a, span: pointCount }))
		} else if (bc >= ab && bc >= ca) {
			kept.add(edgeKey({ a, b, span: pointCount }))
			kept.add(edgeKey({ a: c, b: a, span: pointCount }))
		} else {
			kept.add(edgeKey({ a, b, span: pointCount }))
			kept.add(edgeKey({ a: b, b: c, span: pointCount }))
		}
	}

	return [...kept].map((key) => [
		Math.floor(key / pointCount),
		key % pointCount,
	]) as Array<[number, number]>
}

function squaredDistance({ flatPoints, a, b }: SquaredDistanceParams): number {
	const ax = flatPoints[a * 2] ?? 0
	const ay = flatPoints[a * 2 + 1] ?? 0
	const bx = flatPoints[b * 2] ?? 0
	const by = flatPoints[b * 2 + 1] ?? 0
	const dx = ax - bx
	const dy = ay - by
	return dx * dx + dy * dy
}

export const URQUHART = {
	buildUrquhartEdgesFromFlat,
}
