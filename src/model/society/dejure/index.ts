import type {
	BuildDejureParams,
	ClonedTitlesParams,
	ClusteredUnits,
	ClusterUnitsParams,
	DejureTitles,
	DepthOfParentsParams,
	DeriveParentsParams,
	DistrictSeatsParams,
	MembersOfParams,
	SeatRankParams,
	SeatScoreParams,
	TierRegionParams,
	TitleAtParams,
	TitleMembers,
	UnitAdjacencyParams,
} from "@/model/society/dejure/types"
import { TITLES } from "@/model/society/titles"
import { WATER_ACCESS } from "@/model/society/water-access"

const TIER_SLOTS = TITLES.tierOrder.length - 1
const BUILT_TIERS = 3
const TARGET_SIZE = [4, 16, 90]
const URBAN_POP_SCALE = 10_000

function minSizeOfTier(tier: number): number {
	return TITLES.minSizeForTier({ tier: TITLES.tierOrder[tier] })
}

function seatScore({
	province,
	habitability,
	urbanPop,
	waterAccess,
}: SeatScoreParams): number {
	return (
		habitability[province] +
		urbanPop[province] / URBAN_POP_SCALE +
		waterAccess[province] * WATER_ACCESS.waterAccessBonus
	)
}

function clusterUnits({
	unitSize,
	unitScore,
	adjOffset,
	adjList,
	targetSize,
	minSize,
	maxSize,
}: ClusterUnitsParams): ClusteredUnits {
	const unitCount = unitSize.length
	const groupOf = new Int32Array(unitCount).fill(-1)
	const order: number[] = []
	for (let unit = 0; unit < unitCount; unit++)
		if (unitSize[unit] > 0) order.push(unit)
	order.sort((a, b) => unitScore[b] - unitScore[a] || a - b)

	const weight: number[] = []
	const capital: number[] = []
	const members: number[][] = []
	for (const seed of order) {
		if (groupOf[seed] >= 0) continue
		const group = weight.length
		groupOf[seed] = group
		capital.push(seed)
		members.push([seed])
		let total = unitSize[seed]
		const queue = [seed]
		for (let head = 0; head < queue.length && total < targetSize; head++) {
			const unit = queue[head]
			for (
				let j = adjOffset[unit];
				j < adjOffset[unit + 1] && total < targetSize;
				j++
			) {
				const neighbor = adjList[j]
				if (
					unitSize[neighbor] <= 0 ||
					groupOf[neighbor] >= 0 ||
					total + unitSize[neighbor] > maxSize
				)
					continue
				groupOf[neighbor] = group
				members[group].push(neighbor)
				total += unitSize[neighbor]
				queue.push(neighbor)
			}
		}
		weight.push(total)
	}

	const alive = new Uint8Array(weight.length).fill(1)
	const byWeight = weight.map((_, group) => group)
	byWeight.sort((a, b) => weight[a] - weight[b] || a - b)
	for (const group of byWeight) {
		if (!alive[group] || weight[group] >= minSize) continue
		let target = -1
		for (const unit of members[group]) {
			for (let j = adjOffset[unit]; j < adjOffset[unit + 1]; j++) {
				const other = groupOf[adjList[j]]
				if (other < 0 || other === group) continue
				if (weight[other] + weight[group] > maxSize) continue
				if (
					target < 0 ||
					weight[other] < weight[target] ||
					(weight[other] === weight[target] && other < target)
				)
					target = other
			}
		}
		if (target < 0) continue
		for (const unit of members[group]) {
			groupOf[unit] = target
			members[target].push(unit)
		}
		weight[target] += weight[group]
		members[group] = []
		alive[group] = 0
	}

	const remap = new Int32Array(weight.length).fill(-1)
	const groupCapital: number[] = []
	for (let group = 0; group < weight.length; group++) {
		if (!alive[group]) continue
		remap[group] = groupCapital.length
		groupCapital.push(capital[group])
	}
	for (let unit = 0; unit < unitCount; unit++)
		if (groupOf[unit] >= 0) groupOf[unit] = remap[groupOf[unit]]
	return {
		groupOf,
		groupCount: groupCapital.length,
		groupCapital: Int32Array.from(groupCapital),
	}
}

function unitAdjacency({
	adjOffset,
	adjList,
	unitOfProvince,
	unitCount,
}: UnitAdjacencyParams): { offset: Int32Array; list: Int32Array } {
	const sets = Array.from({ length: unitCount }, () => new Set<number>())
	for (let province = 0; province < unitOfProvince.length; province++) {
		const unit = unitOfProvince[province]
		if (unit < 0) continue
		for (let j = adjOffset[province]; j < adjOffset[province + 1]; j++) {
			const other = unitOfProvince[adjList[j]]
			if (other >= 0 && other !== unit) sets[unit].add(other)
		}
	}
	const offset = new Int32Array(unitCount + 1)
	for (let unit = 0; unit < unitCount; unit++)
		offset[unit + 1] = offset[unit] + sets[unit].size
	const list = new Int32Array(offset[unitCount])
	for (let unit = 0; unit < unitCount; unit++) {
		let cursor = offset[unit]
		for (const other of sets[unit]) list[cursor++] = other
	}
	return { offset, list }
}

function build({
	adjOffset,
	adjList,
	active,
	habitability,
	waterAccess,
	provinceCount,
}: BuildDejureParams): DejureTitles {
	const regionOf = new Int32Array(TIER_SLOTS * provinceCount).fill(-1)
	const tier: number[] = []
	const seat: number[] = []
	const unitOfProvince = new Int32Array(provinceCount)
	let unitSize = new Int32Array(provinceCount)
	let unitSeat = new Int32Array(provinceCount)
	for (let province = 0; province < provinceCount; province++) {
		unitOfProvince[province] = active[province] ? province : -1
		unitSize[province] = active[province] ? 1 : 0
		unitSeat[province] = province
	}
	const urbanPop = new Float32Array(provinceCount)
	let unitAdj = { offset: adjOffset, list: adjList }
	for (let slot = 0; slot < BUILT_TIERS; slot++) {
		const unitScore = new Float32Array(unitSize.length)
		for (let unit = 0; unit < unitSize.length; unit++)
			if (unitSize[unit] > 0)
				unitScore[unit] = seatScore({
					province: unitSeat[unit],
					habitability,
					urbanPop,
					waterAccess,
				})
		const clustered = clusterUnits({
			unitSize,
			unitScore,
			adjOffset: unitAdj.offset,
			adjList: unitAdj.list,
			targetSize: TARGET_SIZE[slot],
			minSize: minSizeOfTier(slot + 1),
			maxSize: minSizeOfTier(slot + 2) - 1,
		})
		const nextSize = new Int32Array(clustered.groupCount)
		const nextSeat = new Int32Array(clustered.groupCount)
		for (let province = 0; province < provinceCount; province++) {
			const unit = unitOfProvince[province]
			if (unit < 0) continue
			nextSize[clustered.groupOf[unit]]++
		}
		const titleOfGroup = new Int32Array(clustered.groupCount).fill(-1)
		for (let group = 0; group < clustered.groupCount; group++) {
			nextSeat[group] = unitSeat[clustered.groupCapital[group]]
			if (nextSize[group] < minSizeOfTier(slot + 1)) continue
			titleOfGroup[group] = tier.length
			tier.push(slot + 1)
			seat.push(nextSeat[group])
		}
		for (let province = 0; province < provinceCount; province++) {
			const unit = unitOfProvince[province]
			if (unit < 0) continue
			const group = clustered.groupOf[unit]
			regionOf[slot * provinceCount + province] = titleOfGroup[group]
			unitOfProvince[province] = group
		}
		unitSize = nextSize
		unitSeat = nextSeat
		unitAdj = unitAdjacency({
			adjOffset,
			adjList,
			unitOfProvince,
			unitCount: clustered.groupCount,
		})
	}
	return {
		count: tier.length,
		tier: Uint8Array.from(tier),
		seat: Int32Array.from(seat),
		holder: new Int32Array(tier.length).fill(-1),
		regionOf,
	}
}

function titleAt({
	titles,
	provinceCount,
	tier,
	province,
}: TitleAtParams): number {
	return titles.regionOf[(tier - 1) * provinceCount + province]
}

function tierRegion({
	titles,
	provinceCount,
	tier,
}: TierRegionParams): Int32Array {
	return titles.regionOf.subarray(
		(tier - 1) * provinceCount,
		tier * provinceCount,
	)
}

function membersOf({ titles, provinceCount }: MembersOfParams): TitleMembers {
	const offset = new Int32Array(titles.count + 1)
	for (let slot = 0; slot < TIER_SLOTS; slot++)
		for (let province = 0; province < provinceCount; province++) {
			const title = titles.regionOf[slot * provinceCount + province]
			if (title >= 0) offset[title + 1]++
		}
	for (let title = 0; title < titles.count; title++)
		offset[title + 1] += offset[title]
	const list = new Int32Array(offset[titles.count])
	const cursor = offset.slice(0, titles.count)
	for (let slot = 0; slot < TIER_SLOTS; slot++)
		for (let province = 0; province < provinceCount; province++) {
			const title = titles.regionOf[slot * provinceCount + province]
			if (title >= 0) list[cursor[title]++] = province
		}
	return { offset, list }
}

function seatRank({
	titles,
	provinceCount,
	heldOnly,
}: SeatRankParams): Uint8Array {
	const rank = new Uint8Array(provinceCount)
	for (let title = 0; title < titles.count; title++) {
		if (heldOnly && titles.holder[title] < 0) continue
		const seat = titles.seat[title]
		if (seat >= 0 && titles.tier[title] > rank[seat])
			rank[seat] = titles.tier[title]
	}
	return rank
}

function districtSeats({
	titles,
	provinceCount,
	rank,
	ownerOf,
	members,
	root,
}: DistrictSeatsParams): number[] {
	let top = 0
	for (let i = 0; i < members.length; i++) top = Math.max(top, rank[members[i]])
	if (top === 0) return []
	if (top === 1)
		return Array.from(members).filter((p) => p !== root && rank[p] === 0)
	const region = tierRegion({ titles, provinceCount, tier: top - 1 })
	const crown = new Set<number>()
	for (let i = 0; i < members.length; i++) {
		const p = members[i]
		if (p === root || rank[p] === top) crown.add(region[p])
	}
	return Array.from(members).filter((p) => {
		const title = region[p]
		return (
			p !== root &&
			rank[p] === top - 1 &&
			title >= 0 &&
			titles.holder[title] === ownerOf[root] &&
			titles.seat[title] === p &&
			!crown.has(title)
		)
	})
}

function deriveParents({
	titles,
	provinceCount,
	rank,
	ownerOf,
	members,
	root,
	parent,
	district,
	adjOffset,
	adjList,
}: DeriveParentsParams): number {
	let top = 0
	const owned = new Set<number>()
	for (let i = 0; i < members.length; i++) {
		const p = members[i]
		top = Math.max(top, rank[p])
		owned.add(p)
		parent[p] = -2
		district[p] = 0
	}
	const seats = districtSeats({
		titles,
		provinceCount,
		rank,
		ownerOf,
		members,
		root,
	})
	for (const seat of seats) district[seat] = 1
	const region =
		top >= 2 ? tierRegion({ titles, provinceCount, tier: top - 1 }) : null
	const crown = new Set<number>()
	for (const p of owned) {
		if (p === root || rank[p] === top) {
			parent[p] = root
			if (region) crown.add(region[p])
		} else if (top <= 1) parent[p] = root
	}
	if (region) {
		for (const p of owned)
			if (
				region[p] >= 0 &&
				titles.holder[region[p]] === ownerOf[root] &&
				crown.has(region[p])
			)
				parent[p] = root
		for (const seat of seats) {
			parent[seat] = root
			const title = region[seat]
			const queue = [seat]
			for (let head = 0; head < queue.length; head++) {
				const p = queue[head]
				for (let j = adjOffset[p]; j < adjOffset[p + 1]; j++) {
					const neighbor = adjList[j]
					if (
						!owned.has(neighbor) ||
						region[neighbor] !== title ||
						parent[neighbor] !== -2
					)
						continue
					parent[neighbor] = seat
					queue.push(neighbor)
				}
			}
		}
	}
	const queue = Array.from(owned)
		.filter((p) => parent[p] !== -2)
		.sort((a, b) => a - b)
	for (let head = 0; head < queue.length; head++) {
		const p = queue[head]
		const anchor = district[p] ? p : parent[p]
		for (let j = adjOffset[p]; j < adjOffset[p + 1]; j++) {
			const neighbor = adjList[j]
			if (!owned.has(neighbor) || parent[neighbor] !== -2) continue
			parent[neighbor] = anchor
			queue.push(neighbor)
		}
	}
	for (const p of owned) if (parent[p] === -2) parent[p] = root
	parent[root] = -1
	return top
}

function depthOfParents({ parent }: DepthOfParentsParams): Int32Array {
	const depth = new Int32Array(parent.length).fill(-1)
	for (let province = 0; province < parent.length; province++) {
		if (depth[province] >= 0) continue
		const path: number[] = []
		let current = province
		while (current >= 0 && depth[current] < 0) {
			path.push(current)
			current = parent[current]
		}
		let next = current >= 0 ? depth[current] + 1 : 0
		while (path.length > 0) depth[path.pop() as number] = next++
	}
	return depth
}

function withCapacity({ titles, capacity }: ClonedTitlesParams): DejureTitles {
	const tier = new Uint8Array(capacity)
	const seat = new Int32Array(capacity).fill(-1)
	const holder = new Int32Array(capacity).fill(-1)
	tier.set(titles.tier)
	seat.set(titles.seat)
	holder.set(titles.holder)
	return {
		count: titles.count,
		tier,
		seat,
		holder,
		regionOf: titles.regionOf.slice(),
	}
}

export const DEJURE = {
	build,
	seatScore,
	titleAt,
	tierRegion,
	membersOf,
	seatRank,
	deriveParents,
	districtSeats,
	depthOfParents,
	withCapacity,
}
