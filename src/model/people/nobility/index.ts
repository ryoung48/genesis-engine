import type { WorldFrame } from "@/model/history/world-frame/types"
import { ANCHORS } from "@/model/people/anchors"
import type { RulerFact } from "@/model/people/anchors/types"
import { CAST } from "@/model/people/cast"
import type { Cast, PeopleGeography, Person } from "@/model/people/cast/types"
import type {
	ConjuredSpouse,
	ConsortParams,
	DepthParams,
	FrameIndex,
	GeographyParams,
	NeighborParams,
	RankDraw,
	RankDrawParams,
	RealmParams,
	RingParams,
	TierParams,
} from "@/model/people/nobility/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const BUCKET = 25 * YEAR
const INHERIT = -2
const LOWBORN = -1
const TOP_TIER = 5
const LABELS = ["Baron", "Count", "Duke", "King", "Emperor", "Hegemon"]
const COURT_LABEL = "Courtier"
const CONSORT_AGE = 25
const LOWBORN_CHANCE = [0.05, 0.04, 0.02, 0.01, 0.005, 0.005]
const BELOW_WEIGHT = [1, 0.5, 0.2, 0.08]
const ABOVE_WEIGHT = 0.3
const FAR_WEIGHT = 0.03
const CHANNEL = { family: 1133, lowborn: 1135, tier: 1136 }

function geographyOf(params: GeographyParams): PeopleGeography {
	return { ...params }
}

function keyed(cast: Cast, key: string, channel: number, salt: number): number {
	return HASH.unit({
		seed: HASH.keyed({ seed: cast.worldSeed, key }),
		channel,
		salt,
	})
}

const FRAME_INDEXES = new WeakMap<WorldFrame, FrameIndex>()

function indexOf(frame: WorldFrame): FrameIndex {
	const cached = FRAME_INDEXES.get(frame)
	if (cached) return cached
	const provinces = new Map<number, number[]>()
	for (let province = 0; province < frame.provinceCount; province++) {
		const nation = frame.provinceNation[province]
		if (nation < 0) continue
		const list = provinces.get(nation)
		if (list) list.push(province)
		else provinces.set(nation, [province])
	}
	const titles = new Map<number, number[]>()
	if (frame.titles)
		for (let title = 0; title < frame.titles.count; title++) {
			const holder = frame.titles.holder[title]
			if (holder < 0) continue
			const list = titles.get(holder)
			if (list) list.push(title)
			else titles.set(holder, [title])
		}
	const index = { provinces, titles }
	FRAME_INDEXES.set(frame, index)
	return index
}

function topTier(frame: WorldFrame, nationId: number): number {
	let top = -1
	for (const title of indexOf(frame).titles.get(nationId) ?? [])
		top = Math.max(top, frame.titles?.tier[title] ?? 0)
	return top
}

function rulerNation(
	cast: Cast,
	person: Person,
	timeMs: number,
): number | null {
	const fact = CAST.factOf({ cast, person })
	return fact ? ANCHORS.nationAt({ fact, timeMs }) : null
}

function tierOf(params: TierParams): number {
	return tierAt({ ...params, depth: 0 })
}

function tierAt(params: DepthParams): number {
	const { cast, person, timeMs, depth } = params
	const nation = rulerNation(cast, person, timeMs)
	if (nation !== null) {
		const frame = CAST.snappedFrame({ cast, timeMs })
		if (!frame) return 1
		const id = `${nation}:${Math.floor(timeMs / BUCKET)}`
		let tier = cast.tiers.get(id)
		if (tier === undefined) {
			tier = Math.max(1, topTier(frame, nation) + 1)
			cast.tiers.set(id, tier)
		}
		return tier
	}
	if (person.tier !== INHERIT) return person.tier
	if (depth > 6) return LOWBORN
	const couple = CAST.parentsOf({ cast, person })
	if (!couple) return LOWBORN
	return couple.reduce(
		(best, parent) =>
			Math.max(
				best,
				tierAt({ cast, person: parent, timeMs, depth: depth + 1 }),
			),
		LOWBORN,
	)
}

function accessionTier({
	cast,
	fact,
}: {
	cast: Cast
	fact: RulerFact
}): number {
	const nation = ANCHORS.nationAt({ fact, timeMs: fact.accessionMs })
	const frame = CAST.snappedFrame({ cast, timeMs: fact.accessionMs })
	if (nation === null || !frame) return 1
	return Math.max(1, topTier(frame, nation) + 1)
}

function seatOf(params: TierParams): number {
	return seatAt({ ...params, depth: 0 })
}

function seatAt(params: DepthParams): number {
	const { cast, person, timeMs, depth } = params
	const nation = rulerNation(cast, person, timeMs)
	if (nation !== null) {
		const frame = CAST.snappedFrame({ cast, timeMs })
		return frame
			? (frame.nations.get(nation)?.capitalProvince ?? person.home)
			: person.home
	}
	if (person.seat !== INHERIT) return person.seat
	if (depth > 6) return person.home
	const couple = CAST.parentsOf({ cast, person })
	for (const parent of couple ?? [])
		if (parent.house)
			return seatAt({ cast, person: parent, timeMs, depth: depth + 1 })
	return person.home
}

function rankLabel(person: Person, tier: number): string {
	if (tier >= 0) return LABELS[Math.min(tier, TOP_TIER)]
	return person.house ? COURT_LABEL : "Lowborn"
}

function neighbors({ frame, geography, nationId }: NeighborParams): number[] {
	const found = new Set<number>()
	for (const province of indexOf(frame).provinces.get(nationId) ?? []) {
		for (
			let at = geography.provinceAdjOffset[province];
			at < geography.provinceAdjOffset[province + 1];
			at++
		) {
			const other = frame.provinceNation[geography.provinceAdjList[at]]
			if (other >= 0 && other !== nationId) found.add(other)
		}
	}
	return [...found].sort((a, b) => a - b)
}

function ringOf({ cast, nationId, timeMs }: RingParams): number[] {
	const bucket = Math.floor(timeMs / BUCKET)
	const id = `${nationId}:${bucket}`
	const cached = cast.rings.get(id)
	if (cached) return cached
	const frame = CAST.snappedFrame({ cast, timeMs })
	const geography = cast.context?.geography
	const ring =
		frame && geography ? neighbors({ frame, geography, nationId }) : []
	cast.rings.set(id, ring)
	return ring
}

function realmOf({ cast, person, timeMs }: RealmParams): number {
	const frame = CAST.snappedFrame({ cast, timeMs })
	if (!frame) return -1
	return frame.provinceNation[seatOf({ cast, person, timeMs })] ?? -1
}

function targetTier(
	cast: Cast,
	owner: Person,
	ownerTier: number,
	startMs: number,
) {
	const roll = HASH.unit({
		seed: CAST.seedOf({ cast, id: owner.id }),
		channel: CHANNEL.tier,
		salt: Math.floor(startMs / YEAR),
	})
	const options: { tier: number; weight: number }[] = []
	for (let tier = 0; tier <= Math.min(TOP_TIER, ownerTier + 1); tier++) {
		const gap = ownerTier - tier
		options.push({
			tier,
			weight: gap < 0 ? ABOVE_WEIGHT : (BELOW_WEIGHT[gap] ?? FAR_WEIGHT),
		})
	}
	const total = options.reduce((sum, option) => sum + option.weight, 0)
	let left = roll * total
	for (const option of options) {
		left -= option.weight
		if (left < 0) return option.tier
	}
	return options[options.length - 1].tier
}

function draw({ cast, owner, startMs }: RankDrawParams): RankDraw {
	if (!cast.context?.geography) return { lowborn: true, tier: LOWBORN }
	const ownerTier = Math.max(
		0,
		tierOf({ cast, person: owner, timeMs: startMs }),
	)
	const roll = HASH.unit({
		seed: CAST.seedOf({ cast, id: owner.id }),
		channel: CHANNEL.lowborn,
		salt: Math.floor(startMs / YEAR),
	})
	if (roll < LOWBORN_CHANCE[Math.min(TOP_TIER, ownerTier)])
		return { lowborn: true, tier: LOWBORN }
	return { lowborn: false, tier: targetTier(cast, owner, ownerTier, startMs) }
}

function lowbornSpouse(seat: number): ConjuredSpouse {
	return { tier: LOWBORN, seat, dynasty: -1, dynastyOrigin: -1 }
}

function nobleSpouse(cast: Cast, tier: number, seat: number): ConjuredSpouse {
	return {
		tier,
		seat,
		dynasty: Math.floor(
			keyed(cast, `${seat}:${tier}`, CHANNEL.family, 1) * 50000,
		),
		dynastyOrigin: seat,
	}
}

function consort({ cast, partner, birthMs }: ConsortParams): ConjuredSpouse {
	const lowborn = {
		tier: LOWBORN,
		seat: INHERIT,
		dynasty: -1,
		dynastyOrigin: -1,
	}
	if (!cast.context?.geography) return lowborn
	const timeMs = birthMs + CONSORT_AGE * YEAR
	const partnerTier = tierOf({ cast, person: partner, timeMs })
	if (!partner.house || partnerTier < 0) return lowborn
	const roll = HASH.unit({
		seed: CAST.seedOf({ cast, id: partner.id }),
		channel: CHANNEL.lowborn,
		salt: Math.floor(birthMs / YEAR) + 7919,
	})
	if (roll < LOWBORN_CHANCE[Math.min(TOP_TIER, partnerTier)]) return lowborn
	const seat = seatOf({ cast, person: partner, timeMs })
	return nobleSpouse(cast, targetTier(cast, partner, partnerTier, timeMs), seat)
}

export const NOBILITY = {
	tierOf,
	accessionTier,
	seatOf,
	rankLabel,
	draw,
	consort,
	geographyOf,
	ringOf,
	realmOf,
	lowbornSpouse,
	nobleSpouse,
	inherit: INHERIT,
	lowborn: LOWBORN,
}
