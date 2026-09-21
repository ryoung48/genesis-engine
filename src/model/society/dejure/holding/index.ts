import { DEJURE } from "@/model/society/dejure"
import type {
	HolderInParams,
	MinToHoldParams,
	NextHolderParams,
	SettleTitleParams,
	SettleTitlesParams,
	ShareCounts,
	TitleChange,
} from "@/model/society/dejure/holding/types"
import { TITLES } from "@/model/society/titles"

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

function nextHolder({ counts, tier }: NextHolderParams): number {
	const need = Math.max(
		minToHold({ tier, total: counts.total }),
		Math.floor(counts.total / 2) + 1,
	)
	for (const [owner, count] of counts.byOwner) if (count >= need) return owner
	return -1
}

function holderIn({
	titles,
	provinceCount,
	ownerOf,
	title,
	previous,
	realm,
}: HolderInParams): number {
	if (realm < 0 || previous < 0 || ownerOf[previous] !== realm) return realm
	const seatInRegion =
		titles.regionOf[(titles.tier[title] - 1) * provinceCount + previous] ===
		title
	return seatInRegion ? previous : realm
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
	exclude,
}: SettleTitleParams & { holder: number; exclude: number }): number {
	let best = -1
	let bestKey = Number.NEGATIVE_INFINITY
	for (let i = members.offset[title]; i < members.offset[title + 1]; i++) {
		const province = members.list[i]
		if (ownerOf[province] !== holder || province === exclude) continue
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
	const realm = nextHolder({
		counts: shareCounts(params),
		tier: titles.tier[title],
	})
	const holder = holderIn({
		titles,
		provinceCount: params.provinceCount,
		ownerOf,
		title,
		previous,
		realm,
	})
	if (holder !== previous) {
		titles.holder[title] = holder
		changes.push({ kind: "passed", title, from: previous, to: holder })
	}
	if (realm < 0) return changes
	const seat = titles.seat[title]
	const seatInRegion =
		titles.regionOf[(titles.tier[title] - 1) * params.provinceCount + seat] ===
		title
	if (ownerOf[seat] === realm && seatInRegion) return changes
	const moved = bestSeat({ ...params, holder: realm, exclude: -1 })
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

export const HOLDING = { settleTitles, bestSeat }
