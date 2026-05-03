import type { OrogenNationHierarchy } from ".."

const DOMAIN_BREAKS = [3, 5, 8, 13, 21, 31, 51, 81]
const DOMAIN_RANGE = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const TRIBUTE = 0.25
const OVEREXTENSION = 0.9
const URBAN_POP_SCALE = 10_000

export function domainLimitFn(count: number): number {
	for (let i = 0; i < DOMAIN_BREAKS.length; i++) {
		if (count < DOMAIN_BREAKS[i]) return DOMAIN_RANGE[i]
	}
	return DOMAIN_RANGE[DOMAIN_RANGE.length - 1]
}

function provinceSeedDistance(
	aProvince: number,
	bProvince: number,
	provinceSeeds: Int32Array<ArrayBufferLike>,
	r_xyz: Float32Array<ArrayBufferLike>,
): number {
	const a = provinceSeeds[aProvince]
	const b = provinceSeeds[bProvince]
	const ax = r_xyz[3 * a]
	const ay = r_xyz[3 * a + 1]
	const az = r_xyz[3 * a + 2]
	const bx = r_xyz[3 * b]
	const by = r_xyz[3 * b + 1]
	const bz = r_xyz[3 * b + 2]
	const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))
	return Math.acos(dot)
}

function partitionMembers(
	seeds: Int32Array<ArrayBufferLike>,
	members: Int32Array<ArrayBufferLike>,
	adjOffset: Int32Array<ArrayBufferLike>,
	adjList: Int32Array<ArrayBufferLike>,
	provinceCount: number,
	habitability?: Float32Array<ArrayBufferLike>,
): Int32Array[] {
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
		if (habitability) {
			for (let i = 1; i < leftovers.length; i++) {
				if (habitability[leftovers[i]] > habitability[seed]) seed = leftovers[i]
			}
		}
		const rest = leftovers.filter((province) => province !== seed)
		const seedArray = new Int32Array(1)
		seedArray[0] = seed
		const extraGroups = partitionMembers(
			seedArray,
			Int32Array.from(rest),
			adjOffset,
			adjList,
			provinceCount,
			habitability,
		)
		for (let i = 0; i < extraGroups.length; i++) {
			result.push(Int32Array.from(extraGroups[i]))
		}
	}
	return result
}

export function rebalanceHierarchy(params: {
	capital: number
	members: Int32Array<ArrayBufferLike>
	parent: Int32Array<ArrayBufferLike>
	depth: Int32Array<ArrayBufferLike>
	currentDepth: number
	habitability: Float32Array<ArrayBufferLike>
	urbanPop: Float32Array<ArrayBufferLike>
	provinceSeeds: Int32Array<ArrayBufferLike>
	r_xyz: Float32Array<ArrayBufferLike>
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
		habitability,
		urbanPop,
		provinceSeeds,
		r_xyz,
		adjOffset,
		adjList,
		provinceCount,
	} = params
	if (members.length === 0) return

	const k = Math.min(members.length, domainLimitFn(members.length))
	const distances = new Float32Array(members.length)
	let mean = 0
	for (let i = 0; i < members.length; i++) {
		const distance = provinceSeedDistance(
			capital,
			members[i],
			provinceSeeds,
			r_xyz,
		)
		distances[i] = distance
		mean += distance
	}
	mean /= Math.max(1, members.length)

	let variance = 0
	for (let i = 0; i < distances.length; i++) {
		const delta = distances[i] - mean
		variance += delta * delta
	}
	const std = Math.sqrt(variance / Math.max(1, distances.length - 1))

	const candidates = new Uint8Array(members.length).fill(1)
	const baseScores = new Float32Array(members.length)
	for (let i = 0; i < members.length; i++) {
		const z = std === 0 ? 1 : Math.max(1, Math.abs((distances[i] - mean) / std))
		baseScores[i] =
			(habitability[members[i]] + urbanPop[members[i]] / URBAN_POP_SCALE) /
			Math.sqrt(z)
	}

	const seeds = new Int32Array(k)
	let seedCount = 0
	for (; seedCount < k; seedCount++) {
		let bestMember = -1
		let bestScore = -Infinity
		for (let i = 0; i < members.length; i++) {
			if (!candidates[i]) continue
			const province = members[i]
			const centerDistance = distances[i]
			const centerPenalty =
				std === 0
					? 1
					: Math.max(1, Math.abs((centerDistance - mean) / std)) ** 2
			let minDist = 1
			if (seedCount > 0) {
				minDist = Infinity
				for (let s = 0; s < seedCount; s++) {
					const dist = provinceSeedDistance(
						province,
						seeds[s],
						provinceSeeds,
						r_xyz,
					)
					if (dist < minDist) minDist = dist
				}
			}
			const adjusted = (baseScores[i] * minDist) / centerPenalty
			if (adjusted > bestScore) {
				bestScore = adjusted
				bestMember = i
			}
		}
		if (bestMember < 0) break
		seeds[seedCount] = members[bestMember]
		candidates[bestMember] = 0
	}
	if (seedCount === 0) return

	const seedList = Int32Array.from(seeds.slice(0, seedCount))
	const regions = partitionMembers(
		seedList,
		members,
		adjOffset,
		adjList,
		provinceCount,
		habitability,
	)

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
				provinceSeeds,
				r_xyz,
				adjOffset,
				adjList,
				provinceCount,
			})
		}
	}
}

export function buildChildrenCSR(
	parent: Int32Array<ArrayBufferLike>,
	provinceCount: number,
): Pick<OrogenNationHierarchy, "childOffset" | "childList"> {
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

export function buildSovereign(
	parent: Int32Array<ArrayBufferLike>,
	provinceCount: number,
): Int32Array {
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

export function computeGravity(params: {
	habitability: Float32Array<ArrayBufferLike>
	childOffset: Int32Array<ArrayBufferLike>
	childList: Int32Array<ArrayBufferLike>
	depth: Int32Array<ArrayBufferLike>
	provinceCount: number
}): Float32Array {
	const { habitability, childOffset, childList, depth, provinceCount } = params
	const gravity = new Float32Array(provinceCount)
	const subtreeSize = new Int32Array(provinceCount)

	let maxDepth = 0
	for (let p = 0; p < provinceCount; p++) {
		subtreeSize[p] = 1
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
		const childStart = childOffset[province]
		const childEnd = childOffset[province + 1]
		for (let j = childStart; j < childEnd; j++) {
			subtreeSize[province] += subtreeSize[childList[j]]
		}
	}

	for (let i = provinceCount - 1; i >= 0; i--) {
		const province = order[i]
		let score = habitability[province]
		const childStart = childOffset[province]
		const childEnd = childOffset[province + 1]
		for (let j = childStart; j < childEnd; j++) {
			score += gravity[childList[j]] * TRIBUTE
		}
		const overextended =
			childEnd - childStart > domainLimitFn(subtreeSize[province])
				? OVEREXTENSION
				: 1
		gravity[province] = score * overextended
	}

	return gravity
}
