import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { PERSON_KEY } from "@/model/people/keys"
import type { PersonKey } from "@/model/people/keys/types"
import type {
	BarParams,
	EarliestParams,
	GroupParams,
	KinParams,
	Pair,
	ParentGroupParams,
	SettleParams,
	Span,
} from "@/model/people/kin/types"
import { MARRIAGE } from "@/model/people/marriage"
import type { Kinship, Marriage } from "@/model/people/marriage/types"
import { PEOPLE_STORE } from "@/model/people/store"
import type { PeopleStore } from "@/model/people/store/types"
import { PERSON_STUB } from "@/model/people/stub"
import type { PersonStub } from "@/model/people/stub/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const PAIR_CHANCE = 0.25
const ADULT_AGE = 16
const LAST_AGE = 44
const BAR_AGE = 25
const GATE_AGE = 30
const REQUIRED: Record<Kinship, number> = {
	sibling: 3,
	"half-sibling": 3,
	"uncle-niece": 2,
	cousin: 1,
}
const CHANNEL = { pair: 1120, season: 1121 }
const EXCLUSIVE = new Set(["free", "anchored", "tie"])

function barOf({ store, stub }: BarParams): number {
	const doctrine = store.context?.doctrine
	const frame = PEOPLE_STORE.snappedFrame({
		store,
		timeMs: stub.birthMs + BAR_AGE * YEAR,
	})
	if (!doctrine || !frame) return 0
	return RELIGION_DOCTRINE.consanguinity({
		doctrine,
		religion: frame.provinceReligion[stub.home] ?? -1,
	})
}

function pairSeed(store: PeopleStore, pair: Pair): number {
	const [a, b] = [pair.first.key, pair.second.key].sort()
	return PERSON_KEY.seed({ worldSeed: store.worldSeed, key: `K(${a},${b})` })
}

function earliest({ store, pair, busy }: EarliestParams): Span | null {
	const { first, second } = pair
	if (
		first.sex === second.sex ||
		barOf({ store, stub: first }) < REQUIRED[pair.kinship] ||
		barOf({ store, stub: second }) < REQUIRED[pair.kinship]
	)
		return null
	const firstLife = PERSON_STUB.life({ store, stub: first })
	const secondLife = PERSON_STUB.life({ store, stub: second })
	const endMs = Math.min(firstLife.deathMs, secondLife.deathMs)
	const female = first.sex === 1 ? first : second
	const lo = Math.max(first.birthMs, second.birthMs) + ADULT_AGE * YEAR
	const hi = Math.min(endMs, female.birthMs + LAST_AGE * YEAR, store.horizonMs)
	const seed = pairSeed(store, pair)
	const spans = [...busy(first), ...busy(second)]
	for (let year = 0; lo + year * YEAR < hi; year++) {
		if (HASH.unit({ seed, channel: CHANNEL.pair, salt: year }) >= PAIR_CHANCE)
			continue
		const startMs =
			lo +
			(year + 0.99 * HASH.unit({ seed, channel: CHANNEL.season, salt: year })) *
				YEAR
		if (startMs >= hi) break
		if (!spans.some((span) => span.startMs < endMs && span.endMs > startMs))
			return { startMs, endMs }
	}
	return null
}

function spansOf(marriages: Marriage[]): Span[] {
	return marriages
		.filter((marriage) => EXCLUSIVE.has(marriage.kind))
		.map((marriage) => ({ startMs: marriage.startMs, endMs: marriage.endMs }))
}

function settle({ store, pairs, lower }: SettleParams): Marriage[] {
	const busy = (stub: PersonStub): Span[] => [
		...spansOf(MARRIAGE.baseChain({ store, key: stub.key }).marriages),
		...spansOf(lower(stub)),
	]
	const candidates = pairs
		.flatMap((pair) => {
			const span = earliest({ store, pair, busy })
			return span ? [{ pair, span }] : []
		})
		.sort(
			(a, b) =>
				a.span.startMs - b.span.startMs ||
				a.pair.first.key.localeCompare(b.pair.first.key),
		)
	const accepted: Marriage[] = []
	const taken = new Map<string, Span[]>()
	for (const { pair, span } of candidates) {
		const clash = [pair.first, pair.second].some((stub) =>
			(taken.get(stub.key) ?? []).some(
				(other) => other.startMs < span.endMs && other.endMs > span.startMs,
			),
		)
		if (clash) continue
		for (const stub of [pair.first, pair.second]) {
			const list = taken.get(stub.key) ?? []
			list.push(span)
			taken.set(stub.key, list)
		}
		const [husband, wife] =
			pair.first.sex === 0
				? [pair.first, pair.second]
				: [pair.second, pair.first]
		accepted.push(
			MARRIAGE.finish({
				store,
				husband: husband.key,
				wife: wife.key,
				startMs: span.startMs,
				endMs: span.endMs,
				kinship: pair.kinship,
				kind: "free",
				betrothedMs: null,
			}),
		)
	}
	return accepted
}

function childrenOf(store: PeopleStore, marriage: Marriage): PersonStub[] {
	return marriage.children.map((child) =>
		PERSON_STUB.of({ store, key: child.key }),
	)
}

function gated(
	store: PeopleStore,
	house: PersonKey,
	birthOrStart: number,
	bar: number,
) {
	const stub = PERSON_STUB.of({ store, key: house })
	const frame = PEOPLE_STORE.snappedFrame({
		store,
		timeMs: birthOrStart + GATE_AGE * YEAR,
	})
	const doctrine = store.context?.doctrine
	if (!doctrine || !frame) return false
	return (
		RELIGION_DOCTRINE.consanguinity({
			doctrine,
			religion: frame.provinceReligion[stub.home] ?? -1,
		}) >= bar
	)
}

function memo(
	store: PeopleStore,
	key: string,
	build: () => Marriage[],
): Marriage[] {
	const cached = store.kin.get(key)
	if (cached) return cached
	store.kin.set(key, [])
	const built = build()
	store.kin.set(key, built)
	return built
}

function involving(marriages: Marriage[], key: PersonKey): Marriage[] {
	return marriages.filter(
		(marriage) => marriage.husband === key || marriage.wife === key,
	)
}

function siblings({ store, marriage }: GroupParams): Marriage[] {
	return memo(store, `a:${marriage.key}`, () => {
		if (!gated(store, marriage.husband, marriage.startMs, REQUIRED.sibling))
			return []
		const kids = childrenOf(store, marriage).filter((stub) => stub.house)
		const pairs: Pair[] = []
		for (const [index, first] of kids.entries())
			for (const second of kids.slice(index + 1))
				pairs.push({ first, second, kinship: "sibling" })
		return settle({ store, pairs, lower: () => [] })
	})
}

function halves({ store, key }: ParentGroupParams): Marriage[] {
	return memo(store, `b:${key}`, () => {
		const parent = PERSON_STUB.of({ store, key })
		if (
			!parent.house ||
			!gated(store, key, parent.birthMs, REQUIRED["half-sibling"])
		)
			return []
		const groups = MARRIAGE.baseChain({ store, key }).marriages.map(
			(marriage) => childrenOf(store, marriage).filter((stub) => stub.house),
		)
		const pairs: Pair[] = []
		for (const [index, group] of groups.entries())
			for (const other of groups.slice(index + 1))
				for (const first of group)
					for (const second of other)
						pairs.push({ first, second, kinship: "half-sibling" })
		return settle({ store, pairs, lower: (stub) => lowerA(store, stub) })
	})
}

function lowerA(store: PeopleStore, stub: PersonStub): Marriage[] {
	if (!stub.house) return []
	return involving(
		siblings({
			store,
			marriage: MARRIAGE.parentMarriage({ store, key: stub.key }),
		}),
		stub.key,
	)
}

function lowerB(store: PeopleStore, stub: PersonStub): Marriage[] {
	const parents = parentsOf(store, stub)
	return [
		...lowerA(store, stub),
		...parents.flatMap((parent) =>
			involving(halves({ store, key: parent.key }), stub.key),
		),
	]
}

function parentsOf(store: PeopleStore, stub: PersonStub): PersonStub[] {
	const marriage = MARRIAGE.parentMarriage({ store, key: stub.key })
	return [marriage.husband, marriage.wife].map((key) =>
		PERSON_STUB.of({ store, key }),
	)
}

function grand({ store, marriage }: GroupParams): Marriage[] {
	return memo(store, `c:${marriage.key}`, () => {
		if (!gated(store, marriage.husband, marriage.startMs, REQUIRED.cousin))
			return []
		const children = childrenOf(store, marriage).filter((stub) => stub.house)
		const grandchildren: Array<{ stub: PersonStub; parent: PersonKey }> = []
		for (const child of children)
			for (const own of [
				...MARRIAGE.baseChain({ store, key: child.key }).marriages,
				...lowerB(store, child).filter(
					(kin) => kin.husband === child.key || kin.wife === child.key,
				),
			])
				for (const grandchild of childrenOf(store, own))
					if (grandchild.house)
						grandchildren.push({ stub: grandchild, parent: child.key })
		const pairs: Pair[] = []
		for (const child of children)
			for (const { stub, parent } of grandchildren)
				if (parent !== child.key)
					pairs.push({ first: child, second: stub, kinship: "uncle-niece" })
		for (const [index, one] of grandchildren.entries())
			for (const two of grandchildren.slice(index + 1))
				if (one.parent !== two.parent)
					pairs.push({ first: one.stub, second: two.stub, kinship: "cousin" })
		return settle({ store, pairs, lower: (stub) => lowerB(store, stub) })
	})
}

function marriagesOf({ store, key }: KinParams): Marriage[] {
	const stub = PERSON_STUB.of({ store, key })
	if (!stub.house || !store.context?.doctrine) return []
	if (barOf({ store, stub }) < REQUIRED.cousin) return []
	const found: Marriage[] = []
	const own = MARRIAGE.parentMarriage({ store, key })
	found.push(...involving(siblings({ store, marriage: own }), key))
	found.push(...involving(grand({ store, marriage: own }), key))
	for (const parent of parentsOf(store, stub)) {
		found.push(...involving(halves({ store, key: parent.key }), key))
		if (parent.house)
			found.push(
				...involving(
					grand({
						store,
						marriage: MARRIAGE.parentMarriage({ store, key: parent.key }),
					}),
					key,
				),
			)
	}
	return [
		...new Map(found.map((marriage) => [marriage.key, marriage])).values(),
	]
}

export const KIN = { marriagesOf }
