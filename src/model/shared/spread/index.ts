import { PriorityHeap } from "@/model/shared/min-heap"
import type {
	BlurRecordParams,
	ComponentsParams,
	NearestLandParams,
	NeighbourAverageParams,
	SpreadParams,
} from "@/model/shared/spread/types"

function km({
	mesh,
	radiusKm,
	dist,
	maxKm,
	canEnter,
	onReach,
}: SpreadParams): void {
	const { adjOffset, adjList, r_xyz } = mesh
	const heap = new PriorityHeap<number>()
	for (let c = 0; c < dist.length; c++)
		if (dist[c] < Infinity) heap.push(dist[c], c)
	for (let top = heap.pop(); top; top = heap.pop()) {
		const c = top.value
		if (top.key > dist[c]) continue
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (!canEnter({ from: c, to: nb })) continue
			const dot =
				r_xyz[3 * c] * r_xyz[3 * nb] +
				r_xyz[3 * c + 1] * r_xyz[3 * nb + 1] +
				r_xyz[3 * c + 2] * r_xyz[3 * nb + 2]
			const nd = top.key + Math.acos(Math.max(-1, Math.min(1, dot))) * radiusKm
			if (nd < dist[nb] && nd <= maxKm) {
				dist[nb] = nd
				onReach({ from: c, to: nb })
				heap.push(nd, nb)
			}
		}
	}
}

function components({ mesh, isMember, canConnect }: ComponentsParams) {
	const { numRegions: n, adjOffset, adjList } = mesh
	const label = new Int32Array(n).fill(-1)
	const cells: number[][] = []
	for (let start = 0; start < n; start++) {
		if (label[start] >= 0 || !isMember(start)) continue
		const group = [start]
		label[start] = cells.length
		for (let i = 0; i < group.length; i++) {
			const from = group[i]
			for (let k = adjOffset[from]; k < adjOffset[from + 1]; k++) {
				const to = adjList[k]
				if (label[to] >= 0 || !isMember(to) || !canConnect({ from, to }))
					continue
				label[to] = cells.length
				group.push(to)
			}
		}
		cells.push(group)
	}
	return { label, cells }
}

function blurRecord({
	mesh,
	land,
	fields,
	strides,
	neighbour,
}: BlurRecordParams): void {
	const { adjOffset, adjList, numRegions: n } = mesh
	fields.forEach((field, f) => {
		const stride = strides[f]
		const was = field.slice()
		for (let c = 0; c < n; c++) {
			if (!land[c]) continue
			let count = 1
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++)
				if (land[adjList[k]]) count += neighbour
			for (let s = 0; s < stride; s++) {
				let sum = was[stride * c + s]
				for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
					const nb = adjList[k]
					if (land[nb]) sum += neighbour * was[stride * nb + s]
				}
				field[stride * c + s] = sum / count
			}
		}
	})
}

function nearestLand({ mesh, land }: NearestLandParams): Int32Array {
	const { adjOffset, adjList, numRegions: n } = mesh
	const out = new Int32Array(n).fill(-1)
	for (let c = 0; c < n; c++) {
		if (land[c]) {
			out[c] = c
			continue
		}
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++)
			if (land[adjList[k]]) {
				out[c] = adjList[k]
				break
			}
	}
	return out
}

function neighbourAverage({
	mesh,
	field,
	include,
	passes,
}: NeighbourAverageParams): Float32Array {
	const { adjOffset, adjList, numRegions: n } = mesh
	let current = Float32Array.from(field)
	for (let pass = 0; pass < passes; pass++) {
		const next = Float32Array.from(current)
		for (let r = 0; r < n; r++) {
			if (!include[r]) continue
			let sum = current[r]
			let count = 1
			for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
				const nb = adjList[k]
				if (!include[nb]) continue
				sum += current[nb]
				count++
			}
			next[r] = sum / count
		}
		current = next
	}
	return current
}

export const SPREAD = {
	km,
	components,
	blurRecord,
	nearestLand,
	neighbourAverage,
}
