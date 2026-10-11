import { DEJURE } from "@/model/society/dejure"
import type {
	DissolvedTitle,
	DissolveTitleParams,
	DuchyGroupsParams,
	FoundedTitle,
	FoundTitleParams,
	FullyHeldChildrenParams,
	OrphanParams,
	QualifiedFounding,
	QualifiesParams,
	QualifyingParams,
	SameAboveParams,
	TrimDuchyParams,
	WholeHeldParams,
} from "@/model/society/dejure/founding/types"
import { TITLES } from "@/model/society/titles"

const TIER_SLOTS = 4
const MIN_CHILDREN = 2
const DUCHY_MIN_SIZE = TITLES.minSizeForTier({ tier: "duchy" })
// The duchy size at generation (title-hierarchy doc, Tiers).
const DUCHY_TARGET = 4

function wholeHeld({
	members,
	ownerOf,
	holder,
	title,
}: WholeHeldParams): boolean {
	if (members.offset[title + 1] === members.offset[title]) return false
	for (let i = members.offset[title]; i < members.offset[title + 1]; i++)
		if (ownerOf[members.list[i]] !== holder) return false
	return true
}

// A wholly held child counts toward a founding unless the title above it is
// wholly held too.
function orphan({ childHeld, parentHeld }: OrphanParams): boolean {
	return childHeld && !parentHeld
}

function fullyHeldChildren({
	titles,
	members,
	provinceCount,
	ownerOf,
	holder,
	tier,
	orphansOnly,
}: FullyHeldChildrenParams): number[] {
	const result: number[] = []
	for (let title = 0; title < titles.count; title++) {
		if (titles.tier[title] !== tier - 1 || titles.holder[title] !== holder)
			continue
		if (!wholeHeld({ members, ownerOf, holder, title })) continue
		if (orphansOnly) {
			const parent =
				titles.regionOf[
					(tier - 1) * provinceCount + members.list[members.offset[title]]
				]
			if (
				!orphan({
					childHeld: true,
					parentHeld:
						parent >= 0 &&
						wholeHeld({ members, ownerOf, holder, title: parent }),
				})
			)
				continue
		}
		result.push(title)
	}
	return result
}

function qualifies({ members, children, tier }: QualifiesParams): boolean {
	if (tier === 1) return children.length >= DUCHY_MIN_SIZE
	if (children.length < MIN_CHILDREN) return false
	let provinces = 0
	for (const child of children)
		provinces += members.offset[child + 1] - members.offset[child]
	return provinces >= TITLES.minSizeForTier({ tier: TITLES.tierOrder[tier] })
}

function sameAbove({ titles, provinceCount, a, b }: SameAboveParams): boolean {
	for (let slot = 1; slot < TIER_SLOTS; slot++)
		if (
			titles.regionOf[slot * provinceCount + a] !==
			titles.regionOf[slot * provinceCount + b]
		)
			return false
	return true
}

// A holder's duchy group: the largest connected set of its provinces whose
// duchy was destroyed, joined only where every higher region agrees, cut to
// the duchy target size from the best seat outward. Ties go to the lowest id.
function duchyGroups(params: DuchyGroupsParams): Map<number, number[]> {
	const { titles, provinceCount, ownerOf, gap, adjOffset, adjList } = params
	const open = new Set<number>()
	for (let p = 0; p < provinceCount; p++)
		if (gap[p] && ownerOf[p] >= 0 && titles.regionOf[p] < 0) open.add(p)
	const largest = new Map<number, number[]>()
	for (const start of [...open]) {
		if (!open.has(start)) continue
		open.delete(start)
		const group = [start]
		for (let i = 0; i < group.length; i++) {
			const p = group[i]
			for (let edge = adjOffset[p]; edge < adjOffset[p + 1]; edge++) {
				const neighbor = adjList[edge]
				if (
					!open.has(neighbor) ||
					ownerOf[neighbor] !== ownerOf[p] ||
					!sameAbove({ titles, provinceCount, a: p, b: neighbor })
				)
					continue
				open.delete(neighbor)
				group.push(neighbor)
			}
		}
		const current = largest.get(ownerOf[start])
		if (!current || group.length > current.length)
			largest.set(ownerOf[start], group)
	}
	const groups = new Map<number, number[]>()
	for (const [holder, group] of largest)
		if (group.length >= DUCHY_MIN_SIZE)
			groups.set(holder, trimDuchy({ group, params }))
	return groups
}

function trimDuchy({ group, params }: TrimDuchyParams): number[] {
	if (group.length <= DUCHY_TARGET) return group.toSorted((a, b) => a - b)
	const { adjOffset, adjList, habitability, urbanPop, waterAccess } = params
	const score = (province: number) =>
		DEJURE.seatScore({ province, habitability, urbanPop, waterAccess })
	const better = (a: number, b: number) => score(b) - score(a) || a - b
	const remaining = new Set(group)
	const selected = [group.toSorted(better)[0]]
	remaining.delete(selected[0])
	while (selected.length < DUCHY_TARGET) {
		const frontier = new Set<number>()
		for (const p of selected)
			for (let edge = adjOffset[p]; edge < adjOffset[p + 1]; edge++)
				if (remaining.has(adjList[edge])) frontier.add(adjList[edge])
		const next = [...frontier].sort(better)[0]
		selected.push(next)
		remaining.delete(next)
	}
	return selected.sort((a, b) => a - b)
}

// Every realm's qualifying children at every tier from one pass over the
// registry: each title's members are read once to find its sole owner, and the
// orphan rule is then answered from that cache.
function qualifying({
	titles,
	members,
	provinceCount,
	ownerOf,
}: QualifyingParams): QualifiedFounding[] {
	const soleOwner = new Int32Array(titles.count).fill(-1)
	const parentOf = new Int32Array(titles.count).fill(-1)
	for (let title = 0; title < titles.count; title++) {
		const start = members.offset[title]
		const end = members.offset[title + 1]
		if (start === end) continue
		const first = members.list[start]
		if (titles.tier[title] < TIER_SLOTS)
			parentOf[title] =
				titles.regionOf[titles.tier[title] * provinceCount + first]
		let owner = ownerOf[first]
		for (let i = start + 1; i < end && owner >= 0; i++)
			if (ownerOf[members.list[i]] !== owner) owner = -1
		soleOwner[title] = owner
	}
	const groups = new Map<number, QualifiedFounding>()
	for (let title = 0; title < titles.count; title++) {
		const holder = titles.holder[title]
		const tier = titles.tier[title] + 1
		if (tier > TIER_SLOTS || titles.tier[title] < 1 || holder < 0) continue
		const parent = parentOf[title]
		if (
			!orphan({
				childHeld: soleOwner[title] === holder,
				parentHeld: parent >= 0 && soleOwner[parent] === holder,
			})
		)
			continue
		const key = holder * (TIER_SLOTS + 1) + tier
		const group = groups.get(key)
		if (group) group.children.push(title)
		else groups.set(key, { holder, tier, children: [title] })
	}
	return [...groups.values()]
		.filter(({ children, tier }) => qualifies({ members, children, tier }))
		.sort((a, b) => a.holder - b.holder || a.tier - b.tier)
}

function found({
	titles,
	members,
	provinceCount,
	ownerOf,
	rank,
	habitability,
	urbanPop,
	waterAccess,
	holder,
	tier,
	children,
}: FoundTitleParams): FoundedTitle | null {
	const title = titles.count
	if (title >= titles.tier.length) return null
	if (!qualifies({ members, children, tier })) return null
	const provinces: number[] = []
	if (tier === 1) provinces.push(...children)
	else
		for (const child of children)
			for (let i = members.offset[child]; i < members.offset[child + 1]; i++)
				provinces.push(members.list[i])
	let seat = provinces.includes(holder) ? holder : -1
	if (seat < 0) {
		let bestKey = Number.NEGATIVE_INFINITY
		for (const province of provinces) {
			if (ownerOf[province] !== holder) continue
			const key =
				rank[province] * 1000 +
				DEJURE.seatScore({ province, habitability, urbanPop, waterAccess })
			if (key > bestKey) {
				bestKey = key
				seat = province
			}
		}
	}
	if (seat < 0) return null
	const ancestors: number[] = []
	for (let slot = tier; slot < TIER_SLOTS; slot++)
		ancestors.push(titles.regionOf[slot * provinceCount + seat])
	const sources = new Set<number>()
	for (const province of provinces) {
		const old = titles.regionOf[(tier - 1) * provinceCount + province]
		if (old >= 0) sources.add(old)
		titles.regionOf[(tier - 1) * provinceCount + province] = title
		for (let i = 0; i < ancestors.length; i++)
			titles.regionOf[(tier + i) * provinceCount + province] = ancestors[i]
	}
	titles.tier[title] = tier
	titles.seat[title] = seat
	titles.holder[title] = holder
	titles.count++
	return {
		title,
		tier,
		seat,
		holder,
		children,
		ancestors,
		sources: [...sources],
	}
}

function dissolve({
	titles,
	members,
	provinceCount,
	title,
}: DissolveTitleParams): DissolvedTitle {
	const tier = titles.tier[title]
	const seat = titles.seat[title]
	const children = new Set<number>()
	for (let i = members.offset[title]; i < members.offset[title + 1]; i++) {
		const province = members.list[i]
		const child = titles.regionOf[(tier - 2) * provinceCount + province]
		if (tier >= 2 && child >= 0) children.add(child)
		titles.regionOf[(tier - 1) * provinceCount + province] = -1
	}
	const ancestors: number[] = []
	for (let slot = tier; slot < TIER_SLOTS; slot++)
		ancestors.push(
			seat >= 0 ? titles.regionOf[slot * provinceCount + seat] : -1,
		)
	titles.holder[title] = -1
	titles.seat[title] = -1
	return { title, tier, children: [...children], ancestors }
}

export const FOUNDING = {
	minChildren: MIN_CHILDREN,
	fullyHeldChildren,
	duchyGroups,
	qualifies,
	qualifying,
	found,
	dissolve,
}
