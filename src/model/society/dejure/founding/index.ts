import { DEJURE } from "@/model/society/dejure"
import type {
	DissolvedTitle,
	DissolveTitleParams,
	FoundedTitle,
	FoundTitleParams,
	FullyHeldChildrenParams,
	WholeHeldParams,
} from "@/model/society/dejure/founding/types"
import { TITLES } from "@/model/society/titles"

const TIER_SLOTS = 4

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
		if (
			titles.tier[title] !== tier - 1 ||
			titles.holder[title] < 0 ||
			ownerOf[titles.holder[title]] !== holder
		)
			continue
		if (!wholeHeld({ members, ownerOf, holder, title })) continue
		if (orphansOnly) {
			const parent =
				titles.regionOf[
					(tier - 1) * provinceCount + members.list[members.offset[title]]
				]
			if (parent >= 0 && wholeHeld({ members, ownerOf, holder, title: parent }))
				continue
		}
		result.push(title)
	}
	return result
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
	const provinces: number[] = []
	for (const child of children)
		for (let i = members.offset[child]; i < members.offset[child + 1]; i++)
			provinces.push(members.list[i])
	if (
		provinces.length < TITLES.minSizeForTier({ tier: TITLES.tierOrder[tier] })
	)
		return null
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
		for (let slot = tier; slot < TIER_SLOTS; slot++) {
			const above = titles.regionOf[slot * provinceCount + province]
			if (above >= 0) sources.add(above)
		}
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

export const FOUNDING = { fullyHeldChildren, found, dissolve }
