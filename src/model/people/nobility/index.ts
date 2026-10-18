import type { WorldFrame } from "@/model/history/world-frame/types"
import { COUSINS } from "@/model/people/cousins"
import { PERSON_KEY } from "@/model/people/keys"
import type { PersonKey } from "@/model/people/keys/types"
import { MARRIAGE } from "@/model/people/marriage"
import type {
	CandidateParams,
	ConjuredSpouse,
	ConsortParams,
	DepthParams,
	FrameIndex,
	GeographyParams,
	HolderParams,
	KinParams,
	LinkRulerParams,
	NeighborParams,
	RealmSeedParams,
	RelatedParams,
	RulerAtParams,
	Seat,
	SeatList,
	SeatsParams,
	SeedParams,
	SpouseChoice,
	SpouseParams,
	TierParams,
} from "@/model/people/nobility/types"
import { PEOPLE_STORE } from "@/model/people/store"
import type { PeopleGeography, PeopleStore } from "@/model/people/store/types"
import { PERSON_STUB } from "@/model/people/stub"
import type { PersonStub } from "@/model/people/stub/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const BUCKET = 25 * YEAR
const INHERIT = -2
const LOWBORN = -1
const TOP_TIER = 5
const LABELS = ["Baron", "Count", "Duke", "King", "Emperor", "Hegemon"]
const COURT_LABEL = "Courtier"
const HOLDER_AGE = { min: 36, span: 26 }
const HOLDER_MALE_SHARE = 0.85
const CADET_CHANCE = { focus: 0.4, ring: 0.25 }
const KIN_CHANCE = { sibling: 0.6, uncle: 0.35 }
const KIN_MAX_TIER = 2
const KIN_ADULT_AGE = 16
const MAX_DEPTH = 2
const CONSORT_AGE = 25
const COUSIN_CHANCE = 0.25
const MAX_SEATS_TRIED = 6
const SPOUSE_AGE = {
	male: { min: 18, max: 69 },
	female: { min: 16, max: 44 },
}
const LOWBORN_CHANCE = [0.05, 0.04, 0.02, 0.01, 0.005, 0.005]
const BELOW_WEIGHT = [1, 0.5, 0.2, 0.08]
const ABOVE_WEIGHT = 0.3
const FAR_WEIGHT = 0.03
const CHANNEL = {
	sex: 1130,
	age: 1131,
	cadet: 1132,
	family: 1133,
	kin: 1134,
	lowborn: 1135,
	tier: 1136,
	order: 1137,
	pick: 1138,
	cousin: 1139,
}

function geographyOf(params: GeographyParams): PeopleGeography {
	return { ...params }
}

function unit(
	store: PeopleStore,
	id: string,
	channel: number,
	salt: number,
): number {
	return HASH.unit({
		seed: PERSON_KEY.seed({ worldSeed: store.worldSeed, key: id }),
		channel,
		salt,
	})
}

function rulerAt({ store, nationId, timeMs }: RulerAtParams) {
	const index = PEOPLE_STORE.index(store)
	const reigns = index.nationReigns.get(nationId) ?? []
	let found = reigns[0]
	for (const reign of reigns) if (reign.startMs <= timeMs) found = reign
	return found ? (index.facts.get(found.rulerId) ?? null) : null
}

function rulerNation(store: PeopleStore, stub: PersonStub, timeMs: number) {
	const parsed = PERSON_KEY.parse(stub.key)
	if (parsed.tag !== "R") return null
	const reigns =
		PEOPLE_STORE.index(store).facts.get(parsed.rulerId)?.reigns ?? []
	let found = reigns[0]
	for (const reign of reigns) if (reign.startMs <= timeMs) found = reign
	return found ? found.nationId : null
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

function parentsOf(store: PeopleStore, stub: PersonStub): PersonStub[] {
	const parsed = PERSON_KEY.parse(stub.key)
	if (parsed.tag === "S" || stub.noParentCharacter) return []
	const marriage = MARRIAGE.parentMarriage({ store, key: stub.key })
	return [marriage.husband, marriage.wife].map((key) =>
		PERSON_STUB.of({ store, key }),
	)
}

function tierOf(params: TierParams): number {
	return tierAt({ ...params, depth: 0 })
}

function tierAt(params: DepthParams): number {
	const { store, stub, timeMs, depth } = params
	if (stub.kind === "ruler") {
		const nation = rulerNation(store, stub, timeMs)
		const frame = PEOPLE_STORE.snappedFrame({ store, timeMs })
		if (nation === null || !frame) return 1
		const id = `${nation}:${Math.floor(timeMs / BUCKET)}`
		let tier = store.tiers.get(id)
		if (tier === undefined) {
			tier = Math.max(1, topTier(frame, nation) + 1)
			store.tiers.set(id, tier)
		}
		return tier
	}
	if (stub.tier !== INHERIT) return stub.tier
	if (depth > 6) return LOWBORN
	const parsed = PERSON_KEY.parse(stub.key)
	if (parsed.tag === "A" && parsed.anchor.startsWith("p:"))
		return tierAt({
			store,
			stub: PERSON_STUB.of({ store, key: parsed.anchor.slice(2) }),
			timeMs,
			depth: depth + 1,
		})
	return parentsOf(store, stub).reduce(
		(best, parent) =>
			Math.max(best, tierAt({ store, stub: parent, timeMs, depth: depth + 1 })),
		LOWBORN,
	)
}

function seatOf(params: TierParams): number {
	return seatAt({ ...params, depth: 0 })
}

function seatAt(params: DepthParams): number {
	const { store, stub, timeMs, depth } = params
	if (stub.kind === "ruler") {
		const nation = rulerNation(store, stub, timeMs)
		const frame = PEOPLE_STORE.snappedFrame({ store, timeMs })
		return nation === null || !frame
			? stub.home
			: (frame.nations.get(nation)?.capitalProvince ?? stub.home)
	}
	if (stub.seat !== INHERIT) return stub.seat
	if (depth > 6) return stub.home
	for (const parent of parentsOf(store, stub)) {
		if (parent.house)
			return seatAt({ store, stub: parent, timeMs, depth: depth + 1 })
	}
	return stub.home
}

function rankLabel(stub: PersonStub, tier: number): string {
	if (tier >= 0) return LABELS[Math.min(tier, TOP_TIER)]
	return stub.house ? COURT_LABEL : "Lowborn"
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

function seatsOf({ frame, nationId }: SeatsParams): Seat[] {
	const capital = frame.nations.get(nationId)?.capitalProvince ?? -1
	const titles = indexOf(frame).titles.get(nationId) ?? []
	const top = topTier(frame, nationId)
	const seats: Seat[] = []
	if (frame.titles)
		for (const title of titles) {
			const tier = frame.titles.tier[title]
			const province = frame.titles.seat[title]
			if (tier < top && tier >= 1 && province !== capital)
				seats.push({ key: `T${title}`, tier: tier + 1, province })
		}
	for (const province of indexOf(frame).provinces.get(nationId) ?? [])
		if (province !== capital)
			seats.push({ key: `P${province}`, tier: 1, province })
	return seats.sort((a, b) => b.tier - a.tier || a.key.localeCompare(b.key))
}

function holderOf({
	store,
	seat,
	bucket,
	timeMs,
	dynasty,
	dynastyOrigin,
	cadet,
}: HolderParams): PersonStub {
	const id = `${seat.key}:${bucket}`
	const male = unit(store, id, CHANNEL.sex, 0) < HOLDER_MALE_SHARE
	const age = HOLDER_AGE.min + unit(store, id, CHANNEL.age, 0) * HOLDER_AGE.span
	const family = Math.floor(unit(store, seat.key, CHANNEL.family, 0) * 50000)
	return PERSON_STUB.make({
		store,
		key: PERSON_KEY.holder({ seat: seat.key, bucket }),
		kind: "holder",
		sex: male ? 0 : 1,
		birthMs: timeMs - age * YEAR,
		lineage: {
			house: true,
			dynasty: cadet ? dynasty : family,
			dynastyOrigin: cadet ? dynastyOrigin : seat.province,
			home: seat.province,
		},
		noParentCharacter: false,
		tier: seat.tier,
		seat: seat.province,
		survivesMs: timeMs,
		fixedDeathMs: null,
		forcedCause: null,
	})
}

function kinCandidates({ store, ruler, timeMs }: KinParams): PersonStub[][] {
	const adult = (stub: PersonStub) =>
		stub.house &&
		stub.key !== ruler.key &&
		stub.birthMs + KIN_ADULT_AGE * YEAR <= timeMs &&
		PERSON_STUB.life({ store, stub }).deathMs > timeMs
	const siblings = MARRIAGE.parentMarriage({ store, key: ruler.key })
		.children.map((child) => PERSON_STUB.of({ store, key: child.key }))
		.filter(adult)
	const uncles = parentsOf(store, ruler)
		.filter((parent) => parent.house)
		.flatMap((parent) =>
			MARRIAGE.parentMarriage({ store, key: parent.key })
				.children.filter((child) => child.key !== parent.key)
				.map((child) => PERSON_STUB.of({ store, key: child.key })),
		)
		.filter(adult)
	return [siblings, uncles]
}

function seedRealm({
	store,
	frame,
	nationId,
	bucket,
	timeMs,
	focus,
}: RealmSeedParams): void {
	const ruler = rulerAt({ store, nationId, timeMs })
	const seats = seatsOf({ frame, nationId })
	const taken = new Set<string>()
	const kinHolders: PersonKey[] = []
	if (focus && ruler) {
		const rulerStub = PERSON_STUB.of({ store, key: ruler.key })
		const [siblings, uncles] = kinCandidates({
			store,
			ruler: rulerStub,
			timeMs,
		})
		const chances = [KIN_CHANCE.sibling, KIN_CHANCE.uncle]
		for (const [group, list] of [siblings, uncles].entries())
			for (const kin of list) {
				if (
					unit(store, kin.key, CHANNEL.kin, bucket) >= chances[group] ||
					kin.tier >= 0
				)
					continue
				const seat = seats.find(
					(entry) => !taken.has(entry.key) && entry.tier <= KIN_MAX_TIER,
				)
				if (!seat) break
				taken.add(seat.key)
				kin.tier = seat.tier
				kin.seat = seat.province
				store.holders.set(`${seat.key}:${bucket}`, kin.key)
				kinHolders.push(kin.key)
			}
	}
	store.seats.set(`${nationId}:${bucket}`, {
		seats: seats.filter((seat) => !taken.has(seat.key)),
		kin: kinHolders,
		dynasty: ruler?.ref.dynasty ?? -1,
		dynastyOrigin: ruler?.ref.dynastyOrigin ?? -1,
		focus,
		timeMs,
	})
}

function holderFor(
	store: PeopleStore,
	list: SeatList,
	seat: Seat,
	bucket: number,
): PersonStub {
	const id = `${seat.key}:${bucket}`
	const known = store.holders.get(id)
	if (known) return PERSON_STUB.of({ store, key: known })
	const cadet =
		list.dynasty >= 0 &&
		unit(store, id, CHANNEL.cadet, 0) <
			(list.focus ? CADET_CHANCE.focus : CADET_CHANCE.ring)
	const holder = holderOf({
		store,
		seat,
		bucket,
		timeMs: list.timeMs,
		dynasty: list.dynasty,
		dynastyOrigin: list.dynastyOrigin >= 0 ? list.dynastyOrigin : seat.province,
		cadet,
	})
	store.holders.set(id, holder.key)
	return holder
}

function linkCousins({ store, ruler }: LinkRulerParams): void {
	const geography = store.context?.geography
	const timeMs = ruler.accessionMs
	const nationId = ruler.reigns[0]?.nationId
	const frame = PEOPLE_STORE.snappedFrame({ store, timeMs })
	if (!geography || !frame || nationId === undefined) return
	for (const other of neighbors({ frame, geography, nationId })) {
		const neighbor = rulerAt({ store, nationId: other, timeMs })
		const pair = `${Math.min(ruler.rulerId, neighbor?.rulerId ?? -1)}:${Math.max(ruler.rulerId, neighbor?.rulerId ?? -1)}`
		if (
			!neighbor ||
			neighbor.rulerId === ruler.rulerId ||
			store.pairs.has(pair)
		)
			continue
		store.pairs.add(pair)
		if (unit(store, pair, CHANNEL.cousin, 0) < COUSIN_CHANCE)
			COUSINS.link({ store, first: ruler, second: neighbor })
	}
}

function seed({ store, nationId, timeMs }: SeedParams): void {
	const geography = store.context?.geography
	const frame = PEOPLE_STORE.snappedFrame({ store, timeMs })
	const bucket = Math.floor(timeMs / BUCKET)
	const id = `${nationId}:${bucket}`
	if (!geography || !frame || store.seeded.has(id)) return
	store.seeded.add(id)
	seedRealm({ store, frame, nationId, bucket, timeMs, focus: true })
	const ring = neighbors({ frame, geography, nationId })
	store.rings.set(id, ring)
	for (const other of ring) {
		const ringId = `${other}:${bucket}`
		if (store.seeded.has(ringId)) continue
		store.seeded.add(ringId)
		seedRealm({ store, frame, nationId: other, bucket, timeMs, focus: false })
	}
}

function ancestors(store: PeopleStore, stub: PersonStub): Set<PersonKey> {
	const found = new Set<PersonKey>()
	let layer = [stub]
	for (let depth = 0; depth < 2; depth++) {
		const next: PersonStub[] = []
		for (const person of layer)
			for (const parent of parentsOf(store, person)) {
				found.add(parent.key)
				next.push(parent)
			}
		layer = next
	}
	return found
}

function related({ store, first, second }: RelatedParams): boolean {
	const one = ancestors(store, first)
	const two = ancestors(store, second)
	if (one.has(second.key) || two.has(first.key)) return true
	for (const key of one) if (two.has(key)) return true
	return false
}

function candidateOf({
	store,
	owner,
	holder,
	startMs,
	spouseSex,
}: CandidateParams): PersonStub | null {
	const parent = PERSON_STUB.of({ store, key: holder })
	const ownerAge = (startMs - owner.birthMs) / YEAR
	const bounds = spouseSex === 1 ? SPOUSE_AGE.female : SPOUSE_AGE.male
	const window = spouseSex === 1 ? [-10, 2] : [-2, 10]
	const eligible: PersonStub[] = []
	for (const marriage of MARRIAGE.baseChain({ store, key: parent.key })
		.marriages) {
		for (const child of marriage.children) {
			const stub = PERSON_STUB.of({ store, key: child.key })
			const age = (startMs - stub.birthMs) / YEAR
			if (
				stub.sex !== spouseSex ||
				!stub.house ||
				age < bounds.min ||
				age > bounds.max ||
				age - ownerAge < window[0] ||
				age - ownerAge > window[1] ||
				store.baseChains.has(stub.key) ||
				store.claims.has(stub.key) ||
				PERSON_STUB.life({ store, stub }).deathMs <= startMs ||
				related({ store, first: owner, second: stub })
			)
				continue
			eligible.push(stub)
		}
	}
	eligible.sort((a, b) => a.key.localeCompare(b.key))
	if (eligible.length === 0) return null
	return eligible[
		Math.floor(unit(store, owner.key, CHANNEL.pick, startMs) * eligible.length)
	]
}

function targetTier(
	store: PeopleStore,
	owner: PersonStub,
	ownerTier: number,
	startMs: number,
) {
	const roll = unit(store, owner.key, CHANNEL.tier, Math.floor(startMs / YEAR))
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

function partnerOf(key: PersonKey): PersonKey | null {
	const parsed = PERSON_KEY.parse(key)
	if (parsed.tag === "A" && parsed.anchor.startsWith("k:"))
		return parsed.anchor.slice(2)
	if (parsed.tag === "A" && parsed.anchor.startsWith("p:"))
		return PERSON_KEY.injected({
			anchor: parsed.anchor,
			role: parsed.role === "f" ? "m" : "f",
		})
	return null
}

function consortProfile({
	store,
	key,
	birthMs,
}: ConsortParams): ConjuredSpouse {
	const lowborn = {
		tier: LOWBORN,
		seat: INHERIT,
		dynasty: -1,
		dynastyOrigin: -1,
	}
	const partnerKey = partnerOf(key)
	if (!partnerKey || !store.context?.geography) return lowborn
	let partner: PersonStub
	try {
		partner = PERSON_STUB.of({ store, key: partnerKey })
	} catch {
		return lowborn
	}
	const timeMs = birthMs + CONSORT_AGE * YEAR
	const partnerTier = tierOf({ store, stub: partner, timeMs })
	if (!partner.house || partnerTier < 0) return lowborn
	if (
		unit(store, key, CHANNEL.lowborn, 1) <
		LOWBORN_CHANCE[Math.min(TOP_TIER, partnerTier)]
	)
		return lowborn
	const seat = seatOf({ store, stub: partner, timeMs })
	const tier = targetTier(store, partner, partnerTier, timeMs)
	return {
		tier,
		seat,
		dynasty: Math.floor(
			unit(store, `${seat}:${tier}`, CHANNEL.family, 1) * 50000,
		),
		dynastyOrigin: seat,
	}
}

function spouse({
	store,
	owner,
	startMs,
	spouseSex,
}: SpouseParams): SpouseChoice {
	const seat = seatOf({ store, stub: owner, timeMs: startMs })
	const lowborn: SpouseChoice = {
		kind: "conjure",
		tier: LOWBORN,
		seat,
		dynasty: -1,
		dynastyOrigin: -1,
	}
	const frame = PEOPLE_STORE.snappedFrame({ store, timeMs: startMs })
	const nation = frame?.provinceNation[seat] ?? -1
	if (!store.context?.geography || !frame || nation < 0) return lowborn
	const ownerTier = Math.max(0, tierOf({ store, stub: owner, timeMs: startMs }))
	if (
		unit(store, owner.key, CHANNEL.lowborn, Math.floor(startMs / YEAR)) <
		LOWBORN_CHANCE[Math.min(TOP_TIER, ownerTier)]
	)
		return lowborn
	const tier = targetTier(store, owner, ownerTier, startMs)
	const noble = (): SpouseChoice => ({
		kind: "conjure",
		tier,
		seat,
		dynasty: Math.floor(
			unit(store, `${seat}:${tier}`, CHANNEL.family, 1) * 50000,
		),
		dynastyOrigin: seat,
	})
	if (tier < 1 || store.depth >= MAX_DEPTH) return noble()
	store.depth++
	try {
		seed({ store, nationId: nation, timeMs: startMs })
		const bucket = Math.floor(startMs / BUCKET)
		const nations = [nation, ...(store.rings.get(`${nation}:${bucket}`) ?? [])]
		const options = nations
			.flatMap((id) => {
				const list = store.seats.get(`${id}:${bucket}`)
				return list
					? list.seats
							.filter((seat) => seat.tier === tier)
							.map((seat) => ({ seat, list }))
					: []
			})
			.sort(
				(a, b) =>
					unit(store, a.seat.key + owner.key, CHANNEL.order, 0) -
					unit(store, b.seat.key + owner.key, CHANNEL.order, 0),
			)
			.slice(0, MAX_SEATS_TRIED)
		const kept = nations
			.flatMap((id) => store.seats.get(`${id}:${bucket}`)?.kin ?? [])
			.map((key) => PERSON_STUB.of({ store, key }))
			.filter((stub) => stub.tier === tier)
		const holders = [
			...options.map(({ seat, list }) => holderFor(store, list, seat, bucket)),
			...kept,
		].filter((stub) => stub.key !== owner.key)
		for (const holder of holders) {
			const candidate = candidateOf({
				store,
				owner,
				holder: holder.key,
				startMs,
				spouseSex,
			})
			if (candidate) return { kind: "claim", candidate }
		}
	} finally {
		store.depth--
	}
	return noble()
}

export const NOBILITY = {
	tierOf,
	seatOf,
	rankLabel,
	spouse,
	consortProfile,
	seed,
	linkCousins,
	geographyOf,
	unrelated: (params: RelatedParams) => !related(params),
	seatsOf,
	inherit: INHERIT,
}
