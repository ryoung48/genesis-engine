import type {
	BleedOntoLandParams,
	FillLandParams,
} from "@/model/climate/ocean/coastal-bleed/types"

const LAND_FADE_KM = 1200
const MIN_LAND_FADE_HOPS = 4

function bleedOntoLand({
	mesh,
	isLand,
	isLake,
	oceanValue,
	avgEdgeKm,
}: BleedOntoLandParams): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const bleed = new Float32Array(N)
	const coastalValue = new Float32Array(N)
	const landFadeHops = Math.max(
		MIN_LAND_FADE_HOPS,
		Math.round(LAND_FADE_KM / avgEdgeKm),
	)
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let sum = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && !isLake[nb]) {
				sum += oceanValue[nb]
				count++
			}
		}
		if (count === 0) continue
		bleed[r] = sum / count
		coastalValue[r] = bleed[r]
		dist[r] = 0
		queue[tail++] = r
	}

	while (head < tail) {
		const r = queue[head++]
		const d = dist[r] + 1
		if (d >= landFadeHops) continue
		const fade = 1 - d / landFadeHops
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] && dist[nb] === -1) {
				dist[nb] = d
				coastalValue[nb] = coastalValue[r]
				bleed[nb] = coastalValue[r] * fade
				queue[tail++] = nb
			}
		}
	}

	return bleed
}

function fillLand({
	mesh,
	isLand,
	isLake,
	avgEdgeKm,
	sst,
	sstMonthly,
}: FillLandParams): void {
	const N = mesh.numRegions
	const annual = bleedOntoLand({
		mesh,
		isLand,
		isLake,
		oceanValue: sst,
		avgEdgeKm,
	})
	for (let r = 0; r < N; r++) if (isLand[r]) sst[r] = annual[r]

	const months = sstMonthly.length / N
	for (let month = 0; month < months; month++) {
		const monthValues = sstMonthly.subarray(month * N, (month + 1) * N)
		const bleed = bleedOntoLand({
			mesh,
			isLand,
			isLake,
			oceanValue: monthValues,
			avgEdgeKm,
		})
		for (let r = 0; r < N; r++) if (isLand[r]) monthValues[r] = bleed[r]
	}
}

export const COASTAL_BLEED = {
	fillLand,
}
