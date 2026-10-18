import { RULER_NAMES } from "@/model/history/record/rulers"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { ANCHORS } from "@/model/people/anchors"
import type { RulerFact } from "@/model/people/anchors/types"
import type {
	AddParams,
	AncestorsParams,
	Cast,
	LifeDrawParams,
	LifeInputs,
	Marriage,
	NameSeedParams,
	OfParams,
	ParentsOfParams,
	Person,
	PersonNames,
	PersonParams,
	RefreshParams,
	SnappedFrameParams,
} from "@/model/people/cast/types"
import { CHARACTER } from "@/model/people/character"
import type { Character } from "@/model/people/character/types"
import { HEALTH } from "@/model/people/health"
import type { Life } from "@/model/people/health/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const FRAME_STEP = 25 * YEAR
const LIFE_SPAN = 130 * YEAR
const NAME_ATTEMPTS = 24
const NAME_POOL = 16
const CHANNEL = { name: 1400 }
const casts = new WeakMap<object, Cast>()

function create({ record }: OfParams): Cast {
	return {
		record,
		worldSeed: RULER_NAMES.seed(record),
		generator: RULER_NAMES.generator(record),
		context: null,
		anchors: ANCHORS.create(),
		persons: [],
		marriages: [],
		bySex: [[], []],
		rulerPerson: new Map(),
		seatFamilies: new Map(),
		reservations: new Map(),
		reserved: new Map(),
		pendingTies: new Map(),
		ingested: { nations: new Map(), diplomacy: 0 },
		horizonMs: record.minTimeMs,
		depth: 0,
		houses: new Map(),
		namePool: new Map(),
		tiers: new Map(),
		rings: new Map(),
		placements: [],
		stats: {
			castSpouses: 0,
			createdSpouses: 0,
			seatFamilies: 0,
			unrecordedParents: 0,
			revealedLater: 0,
			reservedUnfit: 0,
			deathContradictions: 0,
		},
		passedOver: new Set(),
		plans: new Map(),
		blocks: new Map(),
		arrivals: [],
		unions: [],
	}
}

function of(params: OfParams): Cast {
	let cast = casts.get(params.record)
	if (!cast) {
		cast = create(params)
		casts.set(params.record, cast)
	}
	cast.context = params.context
	return cast
}

function seedOf({ cast, id }: { cast: Cast; id: number }): number {
	return (
		(Math.imul(cast.worldSeed | 0, 0x9e3779b1) ^
			Math.imul(id + 1, 0x85ebca6b)) |
		0
	)
}

function marriageSeed({ cast, id }: { cast: Cast; id: number }): number {
	return (
		(Math.imul(cast.worldSeed | 0, 0x7feb352d) ^
			Math.imul(id + 1, 0x846ca68b)) |
		0
	)
}

function endOf({ cast, marriage }: { cast: Cast; marriage: Marriage }): number {
	return Math.min(
		lifeOf({ cast, person: cast.persons[marriage.husband] }).deathMs,
		lifeOf({ cast, person: cast.persons[marriage.wife] }).deathMs,
	)
}

function person({ cast, id }: PersonParams): Person {
	return cast.persons[id]
}

function parentsOf({
	cast,
	person: child,
}: ParentsOfParams): [Person, Person] | null {
	if (child.parents.kind === "none") return null
	const marriage = cast.marriages[child.parents.marriage]
	return [cast.persons[marriage.husband], cast.persons[marriage.wife]]
}

function drawLife({
	cast,
	seed,
	character,
	birthMs,
	sex,
	inputs,
}: LifeDrawParams): {
	life: Life
	untilMs: number
} {
	const untilMs =
		inputs.fixedDeathMs === Infinity
			? Math.max(cast.horizonMs, birthMs)
			: Math.max(birthMs + LIFE_SPAN, inputs.survivesMs + LIFE_SPAN / 2)
	const life = HEALTH.life({
		seed,
		character,
		birthMs,
		sex,
		survivesMs: inputs.survivesMs,
		fixedDeathMs: inputs.fixedDeathMs,
		horizonMs: untilMs,
	})
	if (inputs.forcedCause && life.deathMs !== Infinity)
		life.cause = inputs.forcedCause
	return { life, untilMs }
}

function add({ cast, spec }: AddParams): Person {
	const id = cast.persons.length
	const seed = seedOf({ cast, id })
	let first: Character | null = null
	let second: Character | null = null
	if (spec.parents.kind === "couple") {
		const marriage = cast.marriages[spec.parents.marriage]
		first = cast.persons[marriage.husband].character
		second = cast.persons[marriage.wife].character
	}
	const character = CHARACTER.draw({ seed, first, second })
	const drawn = drawLife({
		cast,
		seed,
		character,
		birthMs: spec.birthMs,
		sex: spec.sex,
		inputs: spec.inputs,
	})
	const created: Person = {
		id,
		sex: spec.sex,
		birthMs: spec.birthMs,
		house: spec.lineage.house,
		dynasty: spec.lineage.dynasty,
		dynastyOrigin: spec.lineage.dynastyOrigin,
		home: spec.lineage.home,
		ruler: spec.ruler,
		tier: spec.tier,
		seat: spec.seat,
		parents: spec.parents,
		character,
		life: drawn.life,
		inputs: spec.inputs,
		lifeUntilMs: drawn.untilMs,
		search: {
			cursorMs: spec.birthMs + (spec.sex === 1 ? 16 : 18) * YEAR,
			betrothAge: 12,
			pluralAge: 18,
			found: 0,
		},
		marriages: [],
		generatedUntil: spec.birthMs,
		rows: [],
		revealedLater: false,
		names: null,
	}
	cast.persons.push(created)
	cast.bySex[spec.sex === 1 ? 1 : 0].push(id)
	if (spec.ruler.kind === "ruler") {
		cast.rulerPerson.set(spec.ruler.ref.rulerId, id)
		cast.arrivals.push(spec.ruler.ref.rulerId)
	}
	return created
}

function lifeOf({
	cast,
	person: subject,
}: {
	cast: Cast
	person: Person
}): Life {
	if (
		subject.life.deathMs !== Infinity ||
		subject.lifeUntilMs >= cast.horizonMs
	)
		return subject.life
	const drawn = drawLife({
		cast,
		seed: seedOf({ cast, id: subject.id }),
		character: subject.character,
		birthMs: subject.birthMs,
		sex: subject.sex,
		inputs: subject.inputs,
	})
	subject.life = drawn.life
	subject.lifeUntilMs = drawn.untilMs
	return subject.life
}

function refresh({ cast, fact }: RefreshParams): void {
	const id = cast.rulerPerson.get(fact.rulerId)
	if (id === undefined) return
	const subject = cast.persons[id]
	const inputs: LifeInputs = {
		survivesMs: fact.survivesMs,
		fixedDeathMs: fact.fixedDeathMs,
		forcedCause: null,
	}
	const drawn = drawLife({
		cast,
		seed: seedOf({ cast, id }),
		character: subject.character,
		birthMs: subject.birthMs,
		sex: subject.sex,
		inputs,
	})
	const old = subject.life
	if (old.deathMs !== Infinity && drawn.life.deathMs !== old.deathMs) {
		cast.stats.deathContradictions++
		return
	}
	subject.inputs = inputs
	subject.life = drawn.life
	subject.lifeUntilMs = drawn.untilMs
}

function mortal({
	cast,
	person: subject,
	fromMs,
}: {
	cast: Cast
	person: Person
	fromMs: number
}): void {
	const inputs: LifeInputs = {
		survivesMs: fromMs,
		fixedDeathMs: null,
		forcedCause: null,
	}
	const drawn = drawLife({
		cast,
		seed: seedOf({ cast, id: subject.id }),
		character: subject.character,
		birthMs: subject.birthMs,
		sex: subject.sex,
		inputs,
	})
	if (
		subject.life.deathMs !== Infinity &&
		drawn.life.deathMs !== subject.life.deathMs
	) {
		cast.stats.deathContradictions++
		return
	}
	subject.inputs = inputs
	subject.life = drawn.life
	subject.lifeUntilMs = drawn.untilMs
}

function snappedFrame({ cast, timeMs }: SnappedFrameParams): WorldFrame | null {
	if (!cast.context) return null
	const snapped = Math.floor(timeMs / FRAME_STEP) * FRAME_STEP
	return cast.context.frameAt(
		Math.min(cast.record.maxTimeMs, Math.max(cast.record.minTimeMs, snapped)),
	)
}

function nameFor({ cast, seed, home, sex }: NameSeedParams): string {
	const slot = Math.floor(
		HASH.unit({ seed, channel: CHANNEL.name, salt: 0 }) * NAME_POOL,
	)
	const culture =
		cast.context?.frameAt(cast.record.minTimeMs).provinceCulture[home] ?? -1
	const id = `${culture >= 0 ? `c${culture}` : `p${home}`}:${sex}:${slot}`
	const cached = cast.namePool.get(id)
	if (cached !== undefined) return cached
	const poolSeed = HASH.keyed({ seed: cast.worldSeed, key: id })
	let named = cast.generator.ruler({ province: home, nameSeed: 0 })
	for (let attempt = 0; attempt < NAME_ATTEMPTS; attempt++) {
		named = cast.generator.ruler({
			province: home,
			nameSeed: Math.floor(
				HASH.unit({ seed: poolSeed, channel: CHANNEL.name, salt: attempt }) *
					0x7fffffff,
			),
		})
		if (named.female === (sex === 1)) break
	}
	cast.namePool.set(id, named.name)
	return named.name
}

function houseName(cast: Cast, subject: Person): string {
	const id = `${subject.dynasty}:${subject.dynastyOrigin}`
	let house = cast.houses.get(id)
	if (house === undefined) {
		house = cast.generator.dynasty({
			dynastyIdx: subject.dynasty,
			province: subject.dynastyOrigin,
		})
		cast.houses.set(id, house)
	}
	return house
}

function names({
	cast,
	person: subject,
}: {
	cast: Cast
	person: Person
}): PersonNames {
	if (subject.names) return subject.names
	let result: PersonNames
	if (subject.ruler.kind === "ruler") {
		const named = RULER_NAMES.names({
			record: cast.record,
			ref: subject.ruler.ref,
		})
		result = { name: named.name, house: named.house }
	} else
		result = {
			name: nameFor({
				cast,
				seed: seedOf({ cast, id: subject.id }),
				home: subject.home,
				sex: subject.sex,
			}),
			house: subject.dynasty >= 0 ? houseName(cast, subject) : null,
		}
	subject.names = result
	return result
}

function factOf({
	cast,
	person: subject,
}: {
	cast: Cast
	person: Person
}): RulerFact | null {
	return subject.ruler.kind === "ruler"
		? (cast.anchors.facts.get(subject.ruler.ref.rulerId) ?? null)
		: null
}

function ancestors({ cast, id, generations }: AncestorsParams): Set<number> {
	const found = new Set<number>()
	let layer = [cast.persons[id]]
	for (let depth = 0; depth < generations; depth++) {
		const next: Person[] = []
		for (const subject of layer) {
			const couple = parentsOf({ cast, person: subject })
			if (!couple) continue
			for (const parent of couple) {
				found.add(parent.id)
				next.push(parent)
			}
		}
		layer = next
	}
	return found
}

function ownerKey(person: Person): string {
	return person.ruler.kind === "ruler"
		? `r${person.ruler.ref.rulerId}`
		: `p${person.id}`
}

function ageAt({
	person: subject,
	timeMs,
}: {
	person: Person
	timeMs: number
}): number {
	return (timeMs - subject.birthMs) / YEAR
}

export const CAST = {
	of,
	seedOf,
	marriageSeed,
	endOf,
	person,
	parentsOf,
	add,
	lifeOf,
	refresh,
	mortal,
	snappedFrame,
	names,
	factOf,
	ancestors,
	ageAt,
	ownerKey,
}
