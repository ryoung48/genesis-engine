import { RULER_NAMES } from "@/model/history/record/rulers"
import { ANCHORS } from "@/model/people/anchors"
import type { ChildInfo } from "@/model/people/anchors/types"
import { CHARACTER } from "@/model/people/character"
import type { Character } from "@/model/people/character/types"
import { HEALTH } from "@/model/people/health"
import type { Life } from "@/model/people/health/types"
import { PERSON_KEY } from "@/model/people/keys"
import type { PersonKey } from "@/model/people/keys/types"
import { MARRIAGE } from "@/model/people/marriage"
import { NOBILITY } from "@/model/people/nobility"
import { PEOPLE_STORE } from "@/model/people/store"
import type { PeopleStore } from "@/model/people/store/types"
import type {
	MakeStubParams,
	NameSeedParams,
	PersonNames,
	PersonStub,
	StubParams,
	StubRefParams,
} from "@/model/people/stub/types"
import { HASH } from "@/model/shared/random/hash"

const CHANNEL = { name: 1400 }
const INHERIT = -2
const LOWBORN = -1
const NAME_ATTEMPTS = 24

function seedOf(store: PeopleStore, key: PersonKey): number {
	return PERSON_KEY.seed({ worldSeed: store.worldSeed, key })
}

function nameSeedFor({ store, seed, home, sex }: NameSeedParams): number {
	let found = 0
	for (let attempt = 0; attempt < NAME_ATTEMPTS; attempt++) {
		found = Math.floor(
			HASH.unit({ seed, channel: CHANNEL.name, salt: attempt }) * 0x7fffffff,
		)
		if (
			store.generator.ruler({ province: home, nameSeed: found }).female ===
			(sex === 1)
		)
			return found
	}
	return found
}

function register(store: PeopleStore, stub: PersonStub): PersonStub {
	store.stubs.set(stub.key, stub)
	store.builds.l1.add(stub.key)
	return stub
}

function make({
	store,
	key,
	kind,
	sex,
	birthMs,
	lineage,
	noParentCharacter,
	tier,
	seat,
	survivesMs,
	fixedDeathMs,
	forcedCause,
}: MakeStubParams): PersonStub {
	return register(store, {
		key,
		kind,
		sex,
		birthMs,
		...lineage,
		noParentCharacter,
		tier,
		seat,
		survivesMs,
		fixedDeathMs,
		forcedCause,
		character: null,
		life: null,
	})
}

function fromRuler(store: PeopleStore, rulerId: number): PersonStub | null {
	const fact = PEOPLE_STORE.index(store).facts.get(rulerId)
	if (!fact) return null
	NOBILITY.linkCousins({ store, ruler: fact })
	return register(store, {
		key: fact.key,
		kind: "ruler",
		sex: fact.ref.sex,
		birthMs: fact.birthMs,
		house: true,
		dynasty: fact.ref.dynasty,
		dynastyOrigin: fact.ref.dynastyOrigin,
		home: fact.ref.nameOrigin,
		noParentCharacter: false,
		tier: INHERIT,
		seat: INHERIT,
		survivesMs: fact.survivesMs,
		fixedDeathMs: fact.fixedDeathMs,
		forcedCause: null,
		character: null,
		life: null,
	})
}

function ensureGenerated(store: PeopleStore, key: PersonKey): void {
	const parsed = PERSON_KEY.parse(key)
	if (parsed.tag !== "A" || !parsed.anchor.startsWith("p:")) return
	const child = of({ store, key: parsed.anchor.slice(2) })
	ANCHORS.parentCouple({
		index: PEOPLE_STORE.index(store),
		key: child.key,
		info: infoOf(child),
	})
}

function fromInjected(store: PeopleStore, key: PersonKey): PersonStub | null {
	const index = PEOPLE_STORE.index(store)
	if (!index.injected.has(key)) ensureGenerated(store, key)
	const person = index.injected.get(key)
	if (!person) return null
	const consort = person.house
		? null
		: NOBILITY.consortProfile({ store, key, birthMs: person.birthMs })
	return make({
		store,
		key,
		kind: "injected",
		sex: person.sex,
		birthMs: person.birthMs,
		lineage: {
			house: person.house,
			dynasty: consort ? consort.dynasty : person.dynasty,
			dynastyOrigin: consort ? consort.dynastyOrigin : person.dynastyOrigin,
			home: person.home,
		},
		noParentCharacter: person.noParentCharacter,
		tier: consort ? consort.tier : person.house ? INHERIT : LOWBORN,
		seat: consort ? consort.seat : INHERIT,
		survivesMs: person.survivesMs,
		fixedDeathMs: null,
		forcedCause: null,
	})
}

function of({ store, key }: StubParams): PersonStub {
	const cached = store.stubs.get(key)
	if (cached) return cached
	const parsed = PERSON_KEY.parse(key)
	let stub: PersonStub | null = null
	if (parsed.tag === "R") stub = fromRuler(store, parsed.rulerId)
	else if (parsed.tag === "A" || parsed.tag === "P")
		stub = fromInjected(store, key)
	else if (parsed.tag === "S") MARRIAGE.chain({ store, key: parsed.owner })
	else if (parsed.tag === "C") MARRIAGE.byKey({ store, key: parsed.marriage })
	stub ??= store.stubs.get(key) ?? null
	if (!stub) throw new Error(`Unknown person ${key}`)
	return stub
}

function infoOf(stub: PersonStub): ChildInfo {
	return {
		house: stub.house,
		dynasty: stub.dynasty,
		dynastyOrigin: stub.dynastyOrigin,
		home: stub.home,
		birthMs: stub.birthMs,
		sex: stub.sex,
	}
}

function parentKeys(
	store: PeopleStore,
	stub: PersonStub,
): [PersonKey, PersonKey] | null {
	const parsed = PERSON_KEY.parse(stub.key)
	if (parsed.tag === "C") {
		const marriage = PERSON_KEY.parseMarriage(parsed.marriage)
		return [marriage.husband, marriage.wife]
	}
	const couple = ANCHORS.parentCouple({
		index: PEOPLE_STORE.index(store),
		key: stub.key,
		info: infoOf(stub),
	})
	return [couple.father, couple.mother]
}

function parents({ store, key }: StubParams): [PersonStub, PersonStub] {
	const stub = of({ store, key })
	const keys = parentKeys(store, stub)
	if (!keys) throw new Error(`No parents for ${key}`)
	return [of({ store, key: keys[0] }), of({ store, key: keys[1] })]
}

function character({ store, stub }: StubRefParams): Character {
	if (stub.character) return stub.character
	let first: Character | null = null
	let second: Character | null = null
	if (!stub.noParentCharacter) {
		const keys = parentKeys(store, stub)
		if (keys) {
			first = character({ store, stub: of({ store, key: keys[0] }) })
			second = character({ store, stub: of({ store, key: keys[1] }) })
		}
	}
	stub.character = CHARACTER.draw({
		seed: seedOf(store, stub.key),
		first,
		second,
	})
	return stub.character
}

function life({ store, stub }: StubRefParams): Life {
	if (stub.life) return stub.life
	stub.life = HEALTH.life({
		seed: seedOf(store, stub.key),
		character: character({ store, stub }),
		birthMs: stub.birthMs,
		sex: stub.sex,
		survivesMs: stub.survivesMs,
		fixedDeathMs: stub.fixedDeathMs,
		horizonMs: store.horizonMs,
	})
	if (stub.forcedCause && stub.life.deathMs !== Infinity)
		stub.life.cause = stub.forcedCause
	return stub.life
}

function houseName(store: PeopleStore, stub: PersonStub): string {
	const id = `${stub.dynasty}:${stub.dynastyOrigin}`
	let house = store.houses.get(id)
	if (house === undefined) {
		house = store.generator.dynasty({
			dynastyIdx: stub.dynasty,
			province: stub.dynastyOrigin,
		})
		store.houses.set(id, house)
	}
	return house
}

function names({ store, stub }: StubRefParams): PersonNames {
	const cached = store.names.get(stub.key)
	if (cached) return cached
	let result: PersonNames
	const parsed = PERSON_KEY.parse(stub.key)
	if (parsed.tag === "R") {
		const fact = PEOPLE_STORE.index(store).facts.get(parsed.rulerId)
		if (!fact) throw new Error(`Unknown ruler ${stub.key}`)
		const named = RULER_NAMES.names({ record: store.record, ref: fact.ref })
		result = { name: named.name, house: named.house }
	} else
		result = {
			name: store.generator.ruler({
				province: stub.home,
				nameSeed: nameSeedFor({
					store,
					seed: seedOf(store, stub.key),
					home: stub.home,
					sex: stub.sex,
				}),
			}).name,
			house: stub.dynasty >= 0 ? houseName(store, stub) : null,
		}
	store.names.set(stub.key, result)
	return result
}

export const PERSON_STUB = {
	of,
	make,
	parents,
	character,
	life,
	names,
	infoOf,
	seedOf,
}
