import { DEJURE } from "@/model/society/dejure"
import type {
	MinToHoldParams,
	NextHolderParams,
	SettleTitleParams,
	SettleTitlesParams,
	ShareCounts,
	TitleChange,
} from "@/model/society/dejure/holding/types"
import { TITLES } from "@/model/society/titles"

const KEEP_SHARE = 0.5
const CHALLENGE_SHARE = 0.25

function minToHold({ tier, total }: MinToHoldParams): number {
	return Math.min(
		total,
		TITLES.minSizeForTier({ tier: TITLES.tierOrder[tier] }),
	)
}

function shareCounts({
	members,
	ownerOf,
	title,
}: Pick<SettleTitleParams, "members" | "ownerOf" | "title">): ShareCounts {
	const byOwner = new Map<number, number>()
	for (let i = members.offset[title]; i < members.offset[title + 1]; i++) {
		const owner = ownerOf[members.list[i]]
		if (owner >= 0) byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1)
	}
	return { total: members.offset[title + 1] - members.offset[title], byOwner }
}

function nextHolder({ current, counts, tier }: NextHolderParams): number {
	const need = minToHold({ tier, total: counts.total })
	const held = current >= 0 ? (counts.byOwner.get(current) ?? 0) : 0
	if (held >= need && held >= counts.total * KEEP_SHARE) return current
	let best = -1
	let bestCount = 0
	for (const [owner, count] of counts.byOwner)
		if (count > bestCount || (count === bestCount && owner < best)) {
			best = owner
			bestCount = count
		}
	const challenges =
		best >= 0 &&
		bestCount >= need &&
		bestCount > held &&
		(held < need || bestCount >= counts.total * CHALLENGE_SHARE)
	if (challenges) return best
	return held >= need ? current : -1
}

function bestSeat({
	titles,
	members,
	ownerOf,
	rank,
	habitability,
	urbanPop,
	waterAccess,
	title,
	holder,
}: SettleTitleParams & { holder: number }): number {
	let best = -1
	let bestKey = Number.NEGATIVE_INFINITY
	for (let i = members.offset[title]; i < members.offset[title + 1]; i++) {
		const province = members.list[i]
		if (ownerOf[province] !== holder) continue
		const key =
			rank[province] * 1000 +
			DEJURE.seatScore({ province, habitability, urbanPop, waterAccess })
		if (key > bestKey) {
			bestKey = key
			best = province
		}
	}
	return best < 0 ? titles.seat[title] : best
}

function settleTitle(params: SettleTitleParams): TitleChange[] {
	const { titles, ownerOf, title } = params
	const changes: TitleChange[] = []
	const previous = titles.holder[title]
	const liveHolder =
		previous >= 0 && ownerOf[previous] === previous ? previous : -1
	const holder = nextHolder({
		current: liveHolder,
		counts: shareCounts(params),
		tier: titles.tier[title],
	})
	if (holder !== previous) {
		titles.holder[title] = holder
		changes.push({ kind: "passed", title, from: previous, to: holder })
	}
	if (holder < 0) return changes
	const seat = titles.seat[title]
	const seatInRegion =
		titles.regionOf[(titles.tier[title] - 1) * params.provinceCount + seat] ===
		title
	if (ownerOf[seat] === holder && seatInRegion) return changes
	const moved = bestSeat({ ...params, holder })
	if (moved === seat) return changes
	titles.seat[title] = moved
	changes.push({
		kind: "moved",
		title,
		from: seat,
		to: moved,
		cause: holder !== previous ? "title passed" : "seat lost",
	})
	return changes
}

function settleTitles({
	touched,
	...params
}: SettleTitlesParams): TitleChange[] {
	const ordered = [...new Set(touched)].sort(
		(a, b) => params.titles.tier[b] - params.titles.tier[a] || a - b,
	)
	return ordered.flatMap((title) => settleTitle({ ...params, title }))
}

export const HOLDING = { settleTitles }
