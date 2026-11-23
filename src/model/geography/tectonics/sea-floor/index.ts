import type {
	BuildSeaFloorParams,
	SpreadParams,
} from "@/model/geography/tectonics/sea-floor/types"
import { PriorityHeap } from "@/model/shared/min-heap"

const MIN_HALF_SPREAD_CM_YR = 1
const MAX_FLOOR_AGE_MYR = 180
const UNREACHED_HALF_SPREAD_CM_YR = 1.2
const UNREACHED_START_MYR = 90

function build({
	mesh,
	plates,
	fronts,
	planetRadiusKm,
}: BuildSeaFloorParams): Float32Array {
	const { numRegions, adjOffset, adjList, neighborDist } = mesh
	const cellPlate = plates.cellPlate
	const land = new Uint8Array(numRegions)
	for (let c = 0; c < numRegions; c++)
		land[c] = plates.isOcean.has(cellPlate[c]) ? 0 : 1
	const time = new Float64Array(numRegions).fill(Infinity)
	const speed = new Float64Array(numRegions)
	const heap = new PriorityHeap<number>()
	const edgeKm = (slot: number) =>
		2 * Math.asin(Math.min(1, neighborDist[slot] / 2)) * planetRadiusKm

	for (const front of fronts.ridge) {
		for (const i of front.edges) {
			const half = Math.max(
				MIN_HALF_SPREAD_CM_YR,
				0.5 * Math.abs(fronts.edges.closingCmYr[i]),
			)
			for (const c of [fronts.edges.cellA[i], fronts.edges.cellB[i]]) {
				if (land[c] || time[c] === 0) continue
				time[c] = 0
				speed[c] = half * 10
				heap.push(0, c)
			}
		}
	}

	const spread = ({ canEnter }: SpreadParams) => {
		for (let top = heap.pop(); top; top = heap.pop()) {
			const c = top.value
			const tc = top.key
			if (tc > time[c]) continue
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
				const nb = adjList[k]
				if (land[nb] || !canEnter(c, nb)) continue
				const t = tc + edgeKm(k) / speed[c]
				if (t < time[nb]) {
					time[nb] = t
					speed[nb] = speed[c]
					heap.push(t, nb)
				}
			}
		}
	}

	spread({ canEnter: (a, b) => cellPlate[a] === cellPlate[b] })
	const slow = UNREACHED_HALF_SPREAD_CM_YR * 10
	for (let c = 0; c < numRegions; c++) {
		if (land[c] || time[c] === Infinity) continue
		speed[c] = slow
		heap.push(time[c], c)
	}
	spread({ canEnter: () => true })
	for (let c = 0; c < numRegions; c++) {
		if (land[c] || time[c] < Infinity) continue
		let edge = false
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (land[nb] || cellPlate[nb] !== cellPlate[c]) {
				edge = true
				break
			}
		}
		if (!edge) continue
		time[c] = UNREACHED_START_MYR
		speed[c] = slow
		heap.push(time[c], c)
	}
	spread({ canEnter: () => true })

	const ageMyr = new Float32Array(numRegions)
	for (let c = 0; c < numRegions; c++) {
		if (land[c]) continue
		ageMyr[c] = Math.min(
			MAX_FLOOR_AGE_MYR,
			time[c] < Infinity ? time[c] : MAX_FLOOR_AGE_MYR,
		)
	}
	return ageMyr
}

export const SEA_FLOOR = { build }
