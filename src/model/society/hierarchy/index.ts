import type {
	BuildChildrenCSRParams,
	BuildSovereignParams,
	ComputeGravityParams,
	OverextendedParams,
} from "@/model/society/hierarchy/types"
import type { GenesisNationHierarchy } from "@/model/society/types"

const TRIBUTE = 0.25

const OVEREXTENSION = 0.9

const VASSAL_LIMIT_BY_RANK = [
	Number.POSITIVE_INFINITY,
	Number.POSITIVE_INFINITY,
	7,
	12,
	20,
]

function isOverextended({
	lordRank,
	vassalSeats,
}: OverextendedParams): boolean {
	return vassalSeats > VASSAL_LIMIT_BY_RANK[lordRank]
}

function buildChildrenCSR({
	parent,
	provinceCount,
}: BuildChildrenCSRParams): Pick<
	GenesisNationHierarchy,
	"childOffset" | "childList"
> {
	const childOffset = new Int32Array(provinceCount + 1)
	for (let p = 0; p < provinceCount; p++) {
		const par = parent[p]
		if (par >= 0) childOffset[par + 1]++
	}
	for (let p = 0; p < provinceCount; p++) {
		childOffset[p + 1] += childOffset[p]
	}

	const childList = new Int32Array(childOffset[provinceCount])
	const cursor = childOffset.slice()
	for (let p = 0; p < provinceCount; p++) {
		const par = parent[p]
		if (par < 0) continue
		childList[cursor[par]++] = p
	}
	return { childOffset, childList }
}

function buildSovereign({
	parent,
	provinceCount,
}: BuildSovereignParams): Int32Array {
	const sovereign = new Int32Array(provinceCount).fill(-1)
	for (let p = 0; p < provinceCount; p++) {
		let current = p
		const trail: number[] = []
		while (current >= 0 && sovereign[current] < 0) {
			trail.push(current)
			current = parent[current]
		}
		const root =
			current >= 0 ? sovereign[current] : (trail[trail.length - 1] ?? -1)
		for (let i = 0; i < trail.length; i++) sovereign[trail[i]] = root
	}
	return sovereign
}

function computeGravity({
	habitability,
	childOffset,
	childList,
	depth,
	rank,
	provinceCount,
}: ComputeGravityParams): Float32Array {
	const gravity = new Float32Array(provinceCount)

	let maxDepth = 0
	for (let p = 0; p < provinceCount; p++) {
		if (depth[p] > maxDepth) maxDepth = depth[p]
	}

	const depthCounts = new Int32Array(maxDepth + 1)
	for (let p = 0; p < provinceCount; p++) depthCounts[depth[p]]++
	const depthOffsets = new Int32Array(maxDepth + 1)
	for (let d = 1; d <= maxDepth; d++) {
		depthOffsets[d] = depthOffsets[d - 1] + depthCounts[d - 1]
	}
	const order = new Int32Array(provinceCount)
	const cursor = depthOffsets.slice()
	for (let p = 0; p < provinceCount; p++) {
		order[cursor[depth[p]]++] = p
	}

	for (let i = provinceCount - 1; i >= 0; i--) {
		const province = order[i]
		let score = habitability[province]
		let vassalSeats = 0
		for (let j = childOffset[province]; j < childOffset[province + 1]; j++) {
			const child = childList[j]
			score += gravity[child] * TRIBUTE
			if (rank[child] > 0) vassalSeats++
		}
		const overextended = isOverextended({
			lordRank: rank[province],
			vassalSeats,
		})
		gravity[province] = score * (overextended ? OVEREXTENSION : 1)
	}

	return gravity
}

export const HIERARCHY = {
	isOverextended,
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
}
