import type {
	BuildChildrenCSRParams,
	BuildSovereignParams,
	FanoutRanges,
	HierarchyProvinceScoreParams,
	PartitionMembersParams,
} from "@/model/society/hierarchy/types"
import type { GenesisNationHierarchy } from "@/model/society/types"
import { WATER_ACCESS } from "@/model/society/water-access"

const DUCHY_FANOUT: FanoutRanges = []

const KINGDOM_FANOUT: FanoutRanges = [[2, 6, 4]]

const EMPIRE_FANOUT: FanoutRanges = [
	[3, 8, 15],
	[2, 6, 4],
]

const hegemonFanout: FanoutRanges = [
	[3, 8, 80],
	[3, 8, 15],
	[2, 6, 4],
]

function fanoutRangesForSize(size: number): FanoutRanges {
	if (size >= 251) return hegemonFanout
	if (size >= 50) return EMPIRE_FANOUT
	if (size >= 10) return KINGDOM_FANOUT
	return DUCHY_FANOUT
}

function maxFanoutForNationSize(size: number): number {
	const ranges = fanoutRangesForSize(size)
	return ranges[0]?.[1] ?? Infinity
}

const TRIBUTE = 0.25

const OVEREXTENSION = 0.9

const URBAN_POP_SCALE = 10_000

function hierarchyProvinceScore({
	province,
	habitability,
	urbanPop,
	waterAccess,
}: HierarchyProvinceScoreParams): number {
	return (
		habitability[province] +
		urbanPop[province] / URBAN_POP_SCALE +
		waterAccess[province] * WATER_ACCESS.waterAccessBonus
	)
}

function partitionMembers({
	seeds,
	members,
	adjOffset,
	adjList,
	provinceCount,
	habitability,
	urbanPop,
	waterAccess,
}: PartitionMembersParams): Int32Array[] {
	const inMembers = new Uint8Array(provinceCount)
	const unassigned = new Uint8Array(provinceCount)
	for (let i = 0; i < members.length; i++) {
		const province = members[i]
		inMembers[province] = 1
		unassigned[province] = 1
	}
	for (let i = 0; i < seeds.length; i++) {
		unassigned[seeds[i]] = 0
	}

	const regions = new Array(seeds.length)
	for (let i = 0; i < seeds.length; i++) {
		const seed = seeds[i]
		const frontier: number[] = []
		for (let j = adjOffset[seed], jEnd = adjOffset[seed + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (inMembers[nb] && unassigned[nb]) frontier.push(nb)
		}
		regions[i] = { members: [seed], frontier, head: 0 }
	}

	while (true) {
		let bestRegion = -1
		let bestSize = Infinity
		for (let i = 0; i < regions.length; i++) {
			const region = regions[i]
			while (
				region.head < region.frontier.length &&
				(!inMembers[region.frontier[region.head]] ||
					!unassigned[region.frontier[region.head]])
			) {
				region.head++
			}
			if (region.head >= region.frontier.length) continue
			if (region.members.length < bestSize) {
				bestSize = region.members.length
				bestRegion = i
			}
		}
		if (bestRegion < 0) break

		const region = regions[bestRegion]
		const next = region.frontier[region.head++]
		if (!unassigned[next]) continue
		unassigned[next] = 0
		region.members.push(next)

		for (let j = adjOffset[next], jEnd = adjOffset[next + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (inMembers[nb] && unassigned[nb]) region.frontier.push(nb)
		}
	}

	const result = regions.map((region) => Int32Array.from(region.members))
	const leftovers: number[] = []
	for (let i = 0; i < members.length; i++) {
		const province = members[i]
		if (unassigned[province]) leftovers.push(province)
	}
	if (leftovers.length > 0) {
		let seed = leftovers[0]
		if (habitability && urbanPop && waterAccess) {
			for (let i = 1; i < leftovers.length; i++) {
				const candidate = leftovers[i]
				if (
					hierarchyProvinceScore({
						province: candidate,
						habitability,
						urbanPop,
						waterAccess,
					}) >
					hierarchyProvinceScore({
						province: seed,
						habitability,
						urbanPop,
						waterAccess,
					})
				) {
					seed = candidate
				}
			}
		}
		const rest = leftovers.filter((province) => province !== seed)
		const seedArray = new Int32Array(1)
		seedArray[0] = seed
		const extraGroups = partitionMembers({
			seeds: seedArray,
			members: Int32Array.from(rest),
			adjOffset,
			adjList,
			provinceCount,
			habitability,
			urbanPop,
			waterAccess,
		})
		for (let i = 0; i < extraGroups.length; i++) {
			result.push(Int32Array.from(extraGroups[i]))
		}
	}
	return result
}

function rebalanceHierarchy(params: {
	capital: number
	members: Int32Array<ArrayBufferLike>
	parent: Int32Array<ArrayBufferLike>
	depth: Int32Array<ArrayBufferLike>
	currentDepth: number
	fanoutRanges: FanoutRanges
	habitability: Float32Array<ArrayBufferLike>
	urbanPop: Float32Array<ArrayBufferLike>
	waterAccess: Uint8Array<ArrayBufferLike>
	adjOffset: Int32Array<ArrayBufferLike>
	adjList: Int32Array<ArrayBufferLike>
	provinceCount: number
}): void {
	const {
		capital,
		members,
		parent,
		depth,
		currentDepth,
		fanoutRanges,
		habitability,
		urbanPop,
		waterAccess,
		adjOffset,
		adjList,
		provinceCount,
	} = params
	if (members.length === 0) return

	if (currentDepth >= fanoutRanges.length) {
		for (let i = 0; i < members.length; i++) {
			parent[members[i]] = capital
			depth[members[i]] = currentDepth + 1
		}
		return
	}

	const [minK, maxK, targetGroupSize] = fanoutRanges[currentDepth]
	const rawK = Math.round(members.length / targetGroupSize)
	const k = Math.min(members.length, Math.max(minK, Math.min(maxK, rawK)))

	// Traversable set for BFS routing: capital + all members.
	// This lets BFS paths cut through the parent capital so seeds are
	// placed by actual graph-hop distance, not angular distance.
	const traversable = new Uint8Array(provinceCount)
	traversable[capital] = 1
	for (let i = 0; i < members.length; i++) traversable[members[i]] = 1

	// Farthest-first seed selection using multi-source BFS graph distance.
	// First seed: most habitable member.
	// Subsequent seeds: member with greatest min-hop distance to any existing
	// seed, with habitability as a tiebreaker.
	const isSeed = new Uint8Array(provinceCount)
	const seeds = new Int32Array(k)
	let seedCount = 0

	for (; seedCount < k; seedCount++) {
		let bestIdx = -1
		let bestScore = -1

		if (seedCount === 0) {
			for (let i = 0; i < members.length; i++) {
				const score = hierarchyProvinceScore({
					province: members[i],
					habitability,
					urbanPop,
					waterAccess,
				})
				if (score > bestScore) {
					bestScore = score
					bestIdx = i
				}
			}
		} else {
			// Multi-source BFS from all existing seeds.
			const bfsDist = new Int32Array(provinceCount).fill(-1)
			const queue: number[] = []
			for (let s = 0; s < seedCount; s++) {
				bfsDist[seeds[s]] = 0
				queue.push(seeds[s])
			}
			for (let head = 0; head < queue.length; head++) {
				const p = queue[head]
				const d = bfsDist[p] + 1
				for (let j = adjOffset[p]; j < adjOffset[p + 1]; j++) {
					const nb = adjList[j]
					if (traversable[nb] && bfsDist[nb] < 0) {
						bfsDist[nb] = d
						queue.push(nb)
					}
				}
			}
			// Pick the member farthest from all seeds; use habitability to
			// break ties between equidistant provinces.
			for (let i = 0; i < members.length; i++) {
				const p = members[i]
				if (isSeed[p]) continue
				const d = bfsDist[p]
				if (d < 0) continue
				const score =
					d * 1000 +
					hierarchyProvinceScore({
						province: p,
						habitability,
						urbanPop,
						waterAccess,
					})
				if (score > bestScore) {
					bestScore = score
					bestIdx = i
				}
			}
		}

		if (bestIdx < 0) break
		seeds[seedCount] = members[bestIdx]
		isSeed[members[bestIdx]] = 1
	}
	if (seedCount === 0) return

	const seedList = Int32Array.from(seeds.slice(0, seedCount))
	const regions = partitionMembers({
		seeds: seedList,
		members,
		adjOffset,
		adjList,
		provinceCount,
		habitability,
		urbanPop,
		waterAccess,
	})

	for (let i = 0; i < regions.length; i++) {
		const region = regions[i]
		if (region.length === 0) continue
		const seed = region[0]
		parent[seed] = capital
		depth[seed] = currentDepth + 1
		if (region.length > 1) {
			rebalanceHierarchy({
				capital: seed,
				members: region.subarray(1),
				parent,
				depth,
				currentDepth: currentDepth + 1,
				fanoutRanges,
				habitability,
				urbanPop,
				waterAccess,
				adjOffset,
				adjList,
				provinceCount,
			})
		}
	}
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

function computeGravity(params: {
	habitability: Float32Array<ArrayBufferLike>
	childOffset: Int32Array<ArrayBufferLike>
	childList: Int32Array<ArrayBufferLike>
	depth: Int32Array<ArrayBufferLike>
	provinceCount: number
	fanoutRanges: FanoutRanges
}): Float32Array {
	const {
		habitability,
		childOffset,
		childList,
		depth,
		provinceCount,
		fanoutRanges,
	} = params
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
		const childStart = childOffset[province]
		const childEnd = childOffset[province + 1]
		for (let j = childStart; j < childEnd; j++) {
			score += gravity[childList[j]] * TRIBUTE
		}
		const maxChildren = fanoutRanges[depth[province]]?.[1] ?? 100
		const overextended = childEnd - childStart > maxChildren ? OVEREXTENSION : 1
		gravity[province] = score * overextended
	}

	return gravity
}

export const HIERARCHY = {
	hegemonFanout,
	fanoutRangesForSize,
	maxFanoutForNationSize,
	rebalanceHierarchy,
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
}
