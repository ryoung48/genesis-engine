import { PriorityHeap } from "@/model/shared/min-heap"
import { UNITS } from "@/model/shared/units"
import type {
	SeaLink,
	SeaLinksParams,
	SeaLinksResult,
} from "@/model/society/migration/sea-links/types"

function build({
	mesh,
	water,
	regionProvince,
	active,
	planetRadiusKm,
}: SeaLinksParams): SeaLinksResult {
	const distance = (a: number, b: number) =>
		UNITS.regionDistanceKm({
			r_xyz: mesh.r_xyz,
			fromRegion: a,
			toRegion: b,
			planetRadiusKm,
		})
	const shore = new Int32Array(mesh.numRegions).fill(-1)
	const costs = new Float64Array(mesh.numRegions).fill(Infinity)
	const firstLeg = new Float64Array(mesh.numRegions)
	const heap = new PriorityHeap<number>()
	const waterEdgeLengths: number[] = []
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!water[r]) continue
		for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
			const q = mesh.adjList[j]
			if (water[q]) {
				if (q > r) waterEdgeLengths.push(distance(r, q))
				continue
			}
			const province = regionProvince[q]
			if (province < 0 || !active[province]) continue
			const cost = distance(r, q)
			if (cost < costs[r] || (cost === costs[r] && province < shore[r])) {
				costs[r] = cost
				firstLeg[r] = cost
				shore[r] = province
			}
		}
		if (shore[r] >= 0) heap.push(costs[r], r)
	}
	while (heap.size) {
		const entry = heap.pop()!
		const r = entry.value
		if (entry.key !== costs[r]) continue
		for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
			const q = mesh.adjList[j]
			if (!water[q]) continue
			const next = entry.key + distance(r, q)
			if (next < costs[q]) {
				costs[q] = next
				firstLeg[q] = firstLeg[r]
				shore[q] = shore[r]
				heap.push(next, q)
			}
		}
	}
	const waterFrom = (r: number) => costs[r] - firstLeg[r] / 2
	const best = new Map<string, SeaLink>()
	const retain = (from: number, to: number, distanceKm: number) => {
		const a = Math.min(from, to)
		const b = Math.max(from, to)
		const key = `${a}:${b}`
		if (distanceKm < (best.get(key)?.distanceKm ?? Infinity))
			best.set(key, { a, b, distanceKm: Math.max(1, distanceKm) })
	}
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!water[r] || shore[r] < 0) continue
		for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
			const q = mesh.adjList[j]
			if (water[q]) {
				if (q <= r || shore[q] < 0 || shore[r] === shore[q]) continue
				retain(shore[r], shore[q], waterFrom(r) + distance(r, q) + waterFrom(q))
			} else {
				const province = regionProvince[q]
				if (province < 0 || !active[province] || province === shore[r]) continue
				retain(shore[r], province, waterFrom(r) + distance(r, q) / 2)
			}
		}
	}
	return { links: [...best.values()], waterEdgeLengths }
}

export const SEA_LINKS = { build }
