import type {
	BuildChildrenCSRParams,
	BuildSovereignParams,
	FanoutForSizeParams,
	FanoutLevel,
	HierarchyProvinceScoreParams,
	MaxGroupSizeParams,
	PartitionMembersParams,
	TakeCapitalMembersParams,
} from "@/model/society/hierarchy/types"
import { TITLES } from "@/model/society/titles"
import type { TitleTier } from "@/model/society/titles/types"
import type { GenesisNationHierarchy } from "@/model/society/types"
import { WATER_ACCESS } from "@/model/society/water-access"

// Direct child realms of a realm, by the realm's own title tier. A province is
// a county, so counties and duchies are flat (a duchy's members are counties);
// every higher tier splits into groups sized for the tier below it.
const FANOUT_BY_TIER: Record<TitleTier, FanoutLevel | null> = {
	county: null,
	duchy: null,
	kingdom: [2, 7, 4],
	empire: [3, 7, 15],
	hegemony: [2, 6, 120],
}

function fanoutForSize({ size }: FanoutForSizeParams): FanoutLevel | null {
	return FANOUT_BY_TIER[TITLES.tierForSize({ size })]
}

function maxFanoutForSize({ size }: FanoutForSizeParams): number {
	const fanout = fanoutForSize({ size })
	if (!fanout) return Number.POSITIVE_INFINITY
	const [, maxChildRealms, capitalRealmSize] = fanout
	const capitalChildren = fanoutForSize({ size: capitalRealmSize })
		? maxFanoutForSize({ size: capitalRealmSize })
		: capitalRealmSize - 1
	return maxChildRealms + capitalChildren
}

function groupSizeCap({
	realmSize,
	groupCount,
	memberCount,
}: MaxGroupSizeParams): number {
	const belowTier =
		TITLES.minSizeForTier({ tier: TITLES.tierForSize({ size: realmSize }) }) - 1
	return belowTier * groupCount >= memberCount
		? belowTier
		: Math.ceil((memberCount * 1.2) / groupCount)
}

function takeCapitalMembers({
	capital,
	members,
	adjOffset,
	adjList,
	provinceCount,
	count,
}: TakeCapitalMembersParams): Int32Array {
	const inMembers = new Uint8Array(provinceCount)
	for (let i = 0; i < members.length; i++) inMembers[members[i]] = 1
	const seen = new Uint8Array(provinceCount)
	seen[capital] = 1
	const queue = [capital]
	const taken: number[] = []
	for (let head = 0; head < queue.length && taken.length < count; head++) {
		const province = queue[head]
		for (
			let j = adjOffset[province];
			j < adjOffset[province + 1] && taken.length < count;
			j++
		) {
			const neighbor = adjList[j]
			if (seen[neighbor] || !inMembers[neighbor]) continue
			seen[neighbor] = 1
			queue.push(neighbor)
			taken.push(neighbor)
		}
	}
	return Int32Array.from(taken)
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
	maxGroupSize,
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
			if (region.members.length >= maxGroupSize) continue
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
			maxGroupSize,
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
	habitability: Float32Array<ArrayBufferLike>
	urbanPop: Float32Array<ArrayBufferLike>
	waterAccess: Uint8Array<ArrayBufferLike>
	adjOffset: Int32Array<ArrayBufferLike>
	adjList: Int32Array<ArrayBufferLike>
	provinceCount: number
}): void {
	const {
		capital,
		members: allMembers,
		parent,
		depth,
		currentDepth,
		habitability,
		urbanPop,
		waterAccess,
		adjOffset,
		adjList,
		provinceCount,
	} = params
	if (allMembers.length === 0) return

	const fanout = fanoutForSize({ size: allMembers.length + 1 })
	if (!fanout) {
		for (let i = 0; i < allMembers.length; i++) {
			parent[allMembers[i]] = capital
			depth[allMembers[i]] = currentDepth + 1
		}
		return
	}

	const [minK, maxK, targetGroupSize] = fanout

	const capitalMembers = takeCapitalMembers({
		capital,
		members: allMembers,
		adjOffset,
		adjList,
		provinceCount,
		count: Math.min(targetGroupSize - 1, allMembers.length - minK),
	})
	let members = allMembers
	if (capitalMembers.length > 0) {
		rebalanceHierarchy({ ...params, members: capitalMembers })
		const inCapital = new Uint8Array(provinceCount)
		for (let i = 0; i < capitalMembers.length; i++)
			inCapital[capitalMembers[i]] = 1
		members = allMembers.filter((province) => !inCapital[province])
	}
	if (members.length === 0) return

	const rawK = Math.round(members.length / targetGroupSize)
	const k = Math.min(members.length, Math.max(minK, Math.min(maxK, rawK)))

	// Traversable set for BFS routing: capital + all members.
	// This lets BFS paths cut through the parent capital so seeds are
	// placed by actual graph-hop distance, not angular distance.
	const traversable = new Uint8Array(provinceCount)
	traversable[capital] = 1
	for (let i = 0; i < allMembers.length; i++) traversable[allMembers[i]] = 1

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
		maxGroupSize: groupSizeCap({
			realmSize: allMembers.length + 1,
			groupCount: k,
			memberCount: members.length,
		}),
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
}): Float32Array {
	const { habitability, childOffset, childList, depth, provinceCount } = params
	const gravity = new Float32Array(provinceCount)
	const domainSize = new Int32Array(provinceCount).fill(1)

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
			domainSize[province] += domainSize[childList[j]]
		}
		const maxChildren = maxFanoutForSize({ size: domainSize[province] })
		const overextended = childEnd - childStart > maxChildren ? OVEREXTENSION : 1
		gravity[province] = score * overextended
	}

	return gravity
}

export const HIERARCHY = {
	fanoutForSize,
	maxFanoutForSize,
	rebalanceHierarchy,
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
}
