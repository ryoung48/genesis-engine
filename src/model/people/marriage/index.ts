import { FRAME } from "@/model/history/world-frame"
import { ANCHORS } from "@/model/people/anchors"
import type { AnchoredCouple } from "@/model/people/anchors/types"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import type { MarriageType } from "@/model/people/doctrine/types"
import { FERTILITY } from "@/model/people/fertility"
import { PERSON_KEY } from "@/model/people/keys"
import type { PersonKey } from "@/model/people/keys/types"
import { KIN } from "@/model/people/kin"
import type {
	AnchoredMarriageParams,
	AttemptParams,
	ByKeyParams,
	Chain,
	ChainParams,
	ClaimParams,
	ConjuredSpouse,
	FinishParams,
	FreeSearchParams,
	Marriage,
	SettleSpouseParams,
	WedParams,
} from "@/model/people/marriage/types"
import { NOBILITY } from "@/model/people/nobility"
import { PEOPLE_STORE } from "@/model/people/store"
import { PERSON_STUB } from "@/model/people/stub"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const MARKET_CHANCE = 0.35
const MAX_GAP_YEARS = 9
const AGES = {
	female: { min: 16, max: 44 },
	male: { min: 18, max: 69 },
}
const CHANNEL = {
	seek: 1100,
	gap: 1101,
	season: 1102,
	betroth: 1103,
	betrothSeason: 1104,
	betrothGap: 1105,
	plural: 1110,
	pluralSeason: 1111,
	pluralGap: 1112,
}
const PLURAL = {
	minAge: 18,
	maxAge: 69,
	firstOrdinal: 100,
	desired: [0, 0, 1, 2, 3, 3],
}
function LOWBORN_SPOUSE(seat: number): ConjuredSpouse {
	return { tier: -1, seat, dynasty: -1, dynastyOrigin: -1 }
}

const BETROTHAL = { minAge: 12, adultAge: 16, maxGap: 5, maxSpouseAge: 20 }

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value))
}

function anchoredMarriage({ store, couple }: AnchoredMarriageParams): Marriage {
	const cached = store.marriages.get(couple.id)
	if (cached) return cached
	const index = PEOPLE_STORE.index(store)
	const husband = PERSON_STUB.of({ store, key: couple.father })
	const wife = PERSON_STUB.of({ store, key: couple.mother })
	const startMs = ANCHORS.coupleStart({ index, couple })
	const endMs = Math.min(
		PERSON_STUB.life({ store, stub: husband }).deathMs,
		PERSON_STUB.life({ store, stub: wife }).deathMs,
		couple.tie?.endMs ?? Infinity,
	)
	const marriage: Marriage = {
		key: PERSON_KEY.marriage({
			husband: couple.father,
			wife: couple.mother,
			startMs,
		}),
		husband: couple.father,
		wife: couple.mother,
		startMs,
		endMs,
		kind: couple.tie ? "tie" : "anchored",
		betrothedMs: null,
		kinship: null,
		pregnancies: [],
		children: [],
	}
	store.marriages.set(couple.id, marriage)
	store.marriages.set(marriage.key, marriage)
	FERTILITY.couple({ store, marriage, anchored: couple.children })
	return marriage
}

function anchoredOf(store: ChainParams["store"], key: PersonKey): Marriage[] {
	const index = PEOPLE_STORE.index(store)
	return ANCHORS.spouseCouples({ index, key })
		.map((couple: AnchoredCouple) => anchoredMarriage({ store, couple }))
		.sort((a, b) => a.startMs - b.startMs)
}

function searchFree({ store, owner, anchored }: FreeSearchParams): Marriage[] {
	const stub = PERSON_STUB.of({ store, key: owner })
	const life = PERSON_STUB.life({ store, stub })
	const ages = stub.sex === 1 ? AGES.female : AGES.male
	const seed = PERSON_STUB.seedOf(store, owner)
	const found: Marriage[] = []
	const limit = Math.min(
		life.deathMs,
		stub.birthMs + ages.max * YEAR,
		store.horizonMs,
	)
	let cursor = stub.birthMs + ages.min * YEAR
	const betrothed = betroth({ store, owner, anchored })
	if (betrothed) {
		found.push(betrothed)
		if (betrothed.endMs === Infinity) return found
		cursor = betrothed.endMs + YEAR
	}
	while (cursor <= limit) {
		const inside = anchored.find(
			(marriage) => marriage.startMs <= cursor && cursor < marriage.endMs,
		)
		if (inside) {
			if (inside.endMs === Infinity) break
			cursor = inside.endMs + YEAR
			continue
		}
		const age = Math.floor((cursor - stub.birthMs) / YEAR)
		const salt = found.length * 200 + age
		if (HASH.unit({ seed, channel: CHANNEL.seek, salt }) < MARKET_CHANCE) {
			const marriage = attempt({
				store,
				owner,
				anchored,
				cursor,
				salt,
				ordinal: found.length,
			})
			if (marriage) {
				found.push(marriage)
				if (marriage.endMs === Infinity) break
				cursor = marriage.endMs + YEAR
				continue
			}
		}
		cursor += YEAR
	}
	return found
}

function wed({
	store,
	owner,
	anchored,
	ordinal,
	spouseBirthMs,
	startMs,
	betrothedMs,
	kind,
	exclusive,
	spouse: conjured,
}: WedParams): Marriage | null {
	const stub = PERSON_STUB.of({ store, key: owner })
	const key = PERSON_KEY.spouse({ owner, index: ordinal })
	store.names.delete(key)
	const spouse = PERSON_STUB.make({
		store,
		key,
		kind: "spouse",
		sex: 1 - stub.sex,
		birthMs: spouseBirthMs,
		lineage: {
			house: false,
			dynasty: conjured.dynasty,
			dynastyOrigin: conjured.dynastyOrigin,
			home: stub.home,
		},
		noParentCharacter: true,
		tier: conjured.tier,
		seat: conjured.seat,
		survivesMs: startMs,
		fixedDeathMs: null,
		forcedCause: null,
	})
	const endMs = Math.min(
		PERSON_STUB.life({ store, stub }).deathMs,
		PERSON_STUB.life({ store, stub: spouse }).deathMs,
	)
	if (
		endMs <= startMs ||
		(exclusive &&
			anchored.some(
				(marriage) => marriage.startMs < endMs && marriage.endMs > startMs,
			))
	)
		return null
	const [husband, wife] = stub.sex === 0 ? [owner, key] : [key, owner]
	const marriage: Marriage = {
		key: PERSON_KEY.marriage({ husband, wife, startMs }),
		husband,
		wife,
		startMs,
		endMs,
		kind,
		betrothedMs,
		kinship: null,
		pregnancies: [],
		children: [],
	}
	store.marriages.set(marriage.key, marriage)
	FERTILITY.couple({ store, marriage, anchored: [] })
	return marriage
}

function attempt({
	store,
	owner,
	anchored,
	cursor,
	salt,
	ordinal,
}: AttemptParams): Marriage | null {
	const stub = PERSON_STUB.of({ store, key: owner })
	const seed = PERSON_STUB.seedOf(store, owner)
	const startMs =
		cursor + HASH.unit({ seed, channel: CHANNEL.season, salt }) * 0.99 * YEAR
	const age = (startMs - stub.birthMs) / YEAR
	const gap = Math.floor(
		HASH.unit({ seed, channel: CHANNEL.gap, salt }) * MAX_GAP_YEARS,
	)
	const spouseAge =
		stub.sex === 1
			? clamp(age + gap, AGES.male.min, AGES.male.max)
			: clamp(age - gap, AGES.female.min, AGES.female.max)
	return settleSpouse({
		store,
		owner,
		anchored,
		ordinal,
		spouseBirthMs: startMs - spouseAge * YEAR,
		startMs,
		betrothedMs: null,
		kind: "free",
		exclusive: true,
	})
}

function settleSpouse(params: SettleSpouseParams): Marriage | null {
	const stub = PERSON_STUB.of({ store: params.store, key: params.owner })
	const choice = NOBILITY.spouse({
		store: params.store,
		owner: stub,
		startMs: params.startMs,
		spouseSex: 1 - stub.sex,
	})
	if (choice.kind === "claim") {
		const claimed = claim({
			store: params.store,
			owner: params.owner,
			anchored: params.anchored,
			candidate: choice.candidate.key,
			startMs: params.startMs,
			kind: params.kind,
			betrothedMs: params.betrothedMs,
			exclusive: params.exclusive,
		})
		if (claimed) return claimed
	}
	return wed({
		...params,
		spouse:
			choice.kind === "conjure"
				? choice
				: LOWBORN_SPOUSE(
						NOBILITY.seatOf({
							store: params.store,
							stub,
							timeMs: params.startMs,
						}),
					),
	})
}

function claim({
	store,
	owner,
	anchored,
	candidate,
	startMs,
	kind,
	betrothedMs,
	exclusive,
}: ClaimParams): Marriage | null {
	const stub = PERSON_STUB.of({ store, key: owner })
	const other = PERSON_STUB.of({ store, key: candidate })
	const endMs = Math.min(
		PERSON_STUB.life({ store, stub }).deathMs,
		PERSON_STUB.life({ store, stub: other }).deathMs,
	)
	const clash = (marriage: Marriage) =>
		marriage.startMs < endMs && marriage.endMs > startMs
	if (
		endMs <= startMs ||
		(exclusive && anchored.some(clash)) ||
		(betrothedMs !== null &&
			other.birthMs > betrothedMs - BETROTHAL.minAge * YEAR)
	)
		return null
	const [husband, wife] =
		stub.sex === 0 ? [owner, candidate] : [candidate, owner]
	const marriage = finish({
		store,
		husband,
		wife,
		startMs,
		endMs,
		kinship: null,
		kind,
		betrothedMs,
	})
	store.claims.set(candidate, [marriage])
	return marriage
}

function betroth({
	store,
	owner,
	anchored,
}: FreeSearchParams): Marriage | null {
	const stub = PERSON_STUB.of({ store, key: owner })
	const seed = PERSON_STUB.seedOf(store, owner)
	for (let age = BETROTHAL.minAge; age < BETROTHAL.adultAge; age++) {
		if (
			HASH.unit({ seed, channel: CHANNEL.betroth, salt: age }) >= MARKET_CHANCE
		)
			continue
		const betrothedMs =
			stub.birthMs +
			(age +
				0.99 * HASH.unit({ seed, channel: CHANNEL.betrothSeason, salt: age })) *
				YEAR
		const gap =
			Math.floor(
				HASH.unit({ seed, channel: CHANNEL.betrothGap, salt: age }) *
					(2 * BETROTHAL.maxGap + 1),
			) - BETROTHAL.maxGap
		const spouseBirthMs =
			betrothedMs -
			clamp(age + gap, BETROTHAL.minAge, BETROTHAL.maxSpouseAge) * YEAR
		const marriage = settleSpouse({
			store,
			owner,
			anchored,
			ordinal: 0,
			spouseBirthMs,
			startMs: Math.max(
				stub.birthMs + BETROTHAL.adultAge * YEAR,
				spouseBirthMs + BETROTHAL.adultAge * YEAR,
			),
			betrothedMs,
			kind: "free",
			exclusive: true,
		})
		if (marriage) return marriage
	}
	return null
}

function standingOf(
	store: ChainParams["store"],
	key: PersonKey,
	timeMs: number,
): number {
	const parsed = PERSON_KEY.parse(key)
	if (parsed.tag !== "R") return 0
	const reign = PEOPLE_STORE.index(store).facts.get(parsed.rulerId)?.reigns[0]
	const frame = PEOPLE_STORE.snappedFrame({ store, timeMs })
	if (!reign || !frame) return 0
	const tier = FRAME.heldTitles({ frame, nationId: reign.nationId }).reduce(
		(top, title) => Math.max(top, frame.titles?.tier[title] ?? 0),
		-1,
	)
	return tier + 1
}

function marriageTypeAt(
	store: ChainParams["store"],
	home: number,
	timeMs: number,
): MarriageType {
	const doctrine = store.context?.doctrine
	const frame = PEOPLE_STORE.snappedFrame({ store, timeMs })
	if (!doctrine || !frame) return "monogamy"
	return RELIGION_DOCTRINE.marriageType({
		doctrine,
		religion: frame.provinceReligion[home] ?? -1,
	})
}

function searchPlural({
	store,
	owner,
	anchored,
}: FreeSearchParams): Marriage[] {
	const stub = PERSON_STUB.of({ store, key: owner })
	if (stub.sex !== 0 || !store.context?.doctrine) return []
	const seed = PERSON_STUB.seedOf(store, owner)
	const limit = Math.min(
		PERSON_STUB.life({ store, stub }).deathMs,
		stub.birthMs + PLURAL.maxAge * YEAR,
		store.horizonMs,
	)
	const found: Marriage[] = []
	for (let age = PLURAL.minAge; stub.birthMs + age * YEAR <= limit; age++) {
		if (
			HASH.unit({ seed, channel: CHANNEL.plural, salt: age }) >= MARKET_CHANCE
		)
			continue
		const now = stub.birthMs + age * YEAR
		const type = marriageTypeAt(store, stub.home, now)
		if (type === "monogamy") continue
		const desired =
			PLURAL.desired[
				Math.min(standingOf(store, owner, now), PLURAL.desired.length - 1)
			]
		if (found.filter((marriage) => marriage.endMs > now).length >= desired)
			continue
		const startMs =
			now +
			HASH.unit({ seed, channel: CHANNEL.pluralSeason, salt: age }) *
				0.99 *
				YEAR
		const gap = Math.floor(
			HASH.unit({ seed, channel: CHANNEL.pluralGap, salt: age }) *
				MAX_GAP_YEARS,
		)
		const marriage = settleSpouse({
			store,
			owner,
			anchored,
			ordinal: PLURAL.firstOrdinal + found.length,
			spouseBirthMs:
				startMs - clamp(age - gap, AGES.female.min, AGES.female.max) * YEAR,
			startMs,
			betrothedMs: null,
			kind: type === "polygamy" ? "plural" : "concubine",
			exclusive: false,
		})
		if (marriage) found.push(marriage)
	}
	return found
}

function finish({
	store,
	husband,
	wife,
	startMs,
	endMs,
	kinship,
	kind,
	betrothedMs,
}: FinishParams): Marriage {
	const marriage: Marriage = {
		key: PERSON_KEY.marriage({ husband, wife, startMs }),
		husband,
		wife,
		startMs,
		endMs,
		kind,
		betrothedMs,
		kinship,
		pregnancies: [],
		children: [],
	}
	store.marriages.set(marriage.key, marriage)
	FERTILITY.couple({ store, marriage, anchored: [] })
	return marriage
}

function baseChain({ store, key }: ChainParams): Chain {
	const cached = store.baseChains.get(key)
	if (cached) return cached
	const stub = PERSON_STUB.of({ store, key })
	let marriages: Marriage[]
	if (stub.house) {
		const anchored = [
			...anchoredOf(store, key),
			...(store.claims.get(key) ?? []),
		]
		const free = searchFree({ store, owner: key, anchored })
		marriages = [
			...anchored,
			...free,
			...searchPlural({ store, owner: key, anchored: [...anchored, ...free] }),
		]
	} else {
		const parsed = PERSON_KEY.parse(key)
		const owned =
			parsed.tag === "S"
				? baseChain({ store, key: parsed.owner }).marriages.filter(
						(marriage) => marriage.husband === key || marriage.wife === key,
					)
				: []
		marriages = [...owned, ...anchoredOf(store, key)]
	}
	marriages.sort((a, b) => a.startMs - b.startMs)
	const result: Chain = { owner: key, marriages }
	store.baseChains.set(key, result)
	return result
}

function chain({ store, key }: ChainParams): Chain {
	const cached = store.chains.get(key)
	if (cached) return cached
	const base = baseChain({ store, key })
	const marriages = [
		...base.marriages,
		...KIN.marriagesOf({ store, key }),
	].sort((a, b) => a.startMs - b.startMs)
	const result: Chain = { owner: key, marriages }
	store.chains.set(key, result)
	store.builds.l2.add(key)
	return result
}

function parentMarriage({ store, key }: ChainParams): Marriage {
	const parsed = PERSON_KEY.parse(key)
	if (parsed.tag === "C") return byKey({ store, key: parsed.marriage })
	const stub = PERSON_STUB.of({ store, key })
	return anchoredMarriage({
		store,
		couple: ANCHORS.parentCouple({
			index: PEOPLE_STORE.index(store),
			key,
			info: PERSON_STUB.infoOf(stub),
		}),
	})
}

function byKey({ store, key }: ByKeyParams): Marriage {
	const known = store.marriages.get(key)
	if (known) return known
	const parsed = PERSON_KEY.parseMarriage(key)
	for (const spouse of [parsed.husband, parsed.wife]) {
		chain({ store, key: spouse })
		const marriage = store.marriages.get(key)
		if (marriage) return marriage
	}
	throw new Error(`Unknown marriage ${key}`)
}

export const MARRIAGE = {
	chain,
	baseChain,
	byKey,
	parentMarriage,
	anchored: anchoredMarriage,
	finish,
}
