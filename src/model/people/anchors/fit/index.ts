import type {
	AttachParams,
	BirthWindow,
	ChildParams,
	CoupleParams,
	EnsureParentsParams,
	GapParams,
	NoteParams,
	OriginParams,
	ReserveParams,
	RevealParams,
	RulerSpecParams,
	SettleNowParams,
	SoloWindowParams,
	WindowParams,
} from "@/model/people/anchors/fit/types"
import { CAST } from "@/model/people/cast"
import type {
	Person,
	Reservation,
	ReservedChild,
} from "@/model/people/cast/types"
import { FERTILITY } from "@/model/people/fertility"
import { MARRIAGE } from "@/model/people/marriage"
import { NOBILITY } from "@/model/people/nobility"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const MONTH = YEAR / 12
const GESTATION = FERTILITY.gestationMs
const ADULT = FERTILITY.adult * YEAR
const LAST_BIRTH = FERTILITY.lastBirth * YEAR
const FATHER_GAP = { min: 20, span: 20 }
const MOTHER_GAP = { min: 17, span: 15 }
const SPOUSE_SPAN = 25
const CHANNEL = { father: 1300, mother: 1301, gap: 1302, death: 1303 }

function specOf({ ref, survivesMs }: RulerSpecParams): ReservedChild {
	return {
		sex: ref.sex,
		lineage: {
			house: true,
			dynasty: ref.dynasty,
			dynastyOrigin: ref.dynastyOrigin,
			home: ref.nameOrigin,
		},
		ruler: { kind: "ruler", ref },
		survivesMs,
		tier: -2,
	}
}

function reserve({
	cast,
	owner,
	spec,
	birthMs,
	source,
}: ReserveParams): Reservation {
	const reservation: Reservation = {
		child: spec,
		birthMs,
		owner,
		source,
		state: "open",
		placed: null,
	}
	const list = cast.reservations.get(owner) ?? []
	list.push(reservation)
	cast.reservations.set(owner, list)
	if (spec.ruler.kind === "ruler")
		cast.reserved.set(spec.ruler.ref.rulerId, reservation)
	return reservation
}

function reveal({ cast, people, marriage }: RevealParams): void {
	for (const person of people) person.revealedLater = true
	if (marriage) marriage.revealedLater = true
	cast.stats.revealedLater++
}

function attach({
	cast,
	marriage,
	spec,
	birthMs,
	revealed,
}: AttachParams): Person | null {
	const reservation: Reservation = {
		child: spec,
		birthMs,
		owner: "",
		source: "ladder",
		state: "open",
		placed: null,
	}
	if (!MARRIAGE.place({ cast, marriage, reservation })) return null
	const child = cast.persons[reservation.placed as number]
	if (revealed)
		reveal({
			cast,
			people: [
				child,
				cast.persons[marriage.husband],
				cast.persons[marriage.wife],
			],
			marriage: null,
		})
	return child
}

function advancedPast(
	marriage: AttachParams["marriage"],
	conceptionMs: number,
): boolean {
	return (
		marriage.cursor.closed ||
		marriage.startMs + marriage.cursor.month * MONTH > conceptionMs
	)
}

function gap({ cast, parent, spec, birthMs }: GapParams): Person | null {
	const conceptionMs = birthMs - GESTATION
	const female = parent.sex === 1
	const life = CAST.lifeOf({ cast, person: parent })
	if (life.deathMs < (female ? birthMs : conceptionMs + 1)) return null
	const age = (conceptionMs - parent.birthMs) / YEAR
	if (age < FERTILITY.adult) return null
	if (female && age + GESTATION / YEAR >= FERTILITY.lastBirth) return null
	let previousEnd = parent.birthMs + ADULT
	let nextStart = Infinity
	let overlapping = false
	for (const id of parent.marriages) {
		const other = cast.marriages[id]
		if (!MARRIAGE.exclusive({ person: parent, marriage: other })) continue
		const end = CAST.endOf({ cast, marriage: other })
		if (other.startMs <= conceptionMs) {
			if (end > conceptionMs - MONTH) overlapping = true
			else previousEnd = Math.max(previousEnd, end + MONTH)
		} else {
			if (other.startMs <= birthMs + FERTILITY.restMs) overlapping = true
			else nextStart = Math.min(nextStart, other.startMs)
		}
	}
	if (overlapping && female) return null
	const concubine = overlapping
	const seed = HASH.keyed({
		seed: CAST.seedOf({ cast, id: parent.id }),
		key: `gap${Math.round(birthMs)}`,
	})
	const gapRange = female ? FATHER_GAP : MOTHER_GAP
	const spouseBirthMs =
		birthMs -
		(gapRange.min +
			gapRange.span * HASH.unit({ seed, channel: CHANNEL.gap, salt: 0 })) *
			YEAR
	const spouseDeathMs = concubine
		? null
		: Math.min(
				nextStart - MONTH,
				birthMs +
					(1 +
						SPOUSE_SPAN *
							HASH.unit({ seed, channel: CHANNEL.death, salt: 0 })) *
						YEAR,
			)
	const startMs = Math.max(
		concubine ? parent.birthMs + ADULT : previousEnd,
		spouseBirthMs + ADULT,
		conceptionMs - 6 * MONTH,
	)
	if (
		(spouseDeathMs !== null && spouseDeathMs <= birthMs + MONTH) ||
		startMs > conceptionMs - MONTH
	)
		return null
	const profile = parent.house
		? NOBILITY.consort({ cast, partner: parent, birthMs: spouseBirthMs })
		: NOBILITY.lowbornSpouse(parent.home)
	const spouse = CAST.add({
		cast,
		spec: {
			sex: 1 - parent.sex,
			birthMs: spouseBirthMs,
			lineage: {
				house: false,
				dynasty: profile.dynasty,
				dynastyOrigin: profile.dynastyOrigin,
				home: parent.home,
			},
			ruler: { kind: "none" },
			tier: profile.tier,
			seat: profile.seat,
			parents: { kind: "none", reason: "conjured" },
			inputs: {
				survivesMs: female ? conceptionMs : birthMs,
				fixedDeathMs: spouseDeathMs,
				forcedCause: null,
			},
		},
	})
	const [husband, wife] = female ? [spouse, parent] : [parent, spouse]
	const marriage = MARRIAGE.open({
		cast,
		husband: husband.id,
		wife: wife.id,
		startMs,
		kind: concubine ? "concubine" : "gap",
		betrothedMs: null,
		kinship: null,
		revealedLater: true,
	})
	marriage.cursor.closed = true
	const child = attach({ cast, marriage, spec, birthMs, revealed: false })
	if (!child) return null
	reveal({ cast, people: [child, spouse, parent], marriage })
	return child
}

function child({
	cast,
	parent,
	spec,
	birthMs,
	source,
}: ChildParams): Person | null {
	const conceptionMs = birthMs - GESTATION
	for (const id of parent.marriages) {
		const marriage = cast.marriages[id]
		if (!FERTILITY.canBear({ cast, marriage, birthMs })) continue
		const placed = attach({
			cast,
			marriage,
			spec,
			birthMs,
			revealed: advancedPast(marriage, conceptionMs),
		})
		if (placed) return placed
	}
	if (birthMs > cast.horizonMs) return null
	if (parent.generatedUntil <= conceptionMs) {
		const reservation = reserve({
			cast,
			owner: CAST.ownerKey(parent),
			spec,
			birthMs,
			source,
		})
		MARRIAGE.extend({
			cast,
			id: parent.id,
			untilMs: Math.min(cast.horizonMs, birthMs + MONTH),
		})
		if (reservation.state === "placed" && reservation.placed !== null)
			return cast.persons[reservation.placed]
		if (reservation.state === "open") reservation.state = "unfit"
		return null
	}
	return gap({ cast, parent, spec, birthMs })
}

function settledAlready(
	cast: SettleNowParams["cast"],
	reservation: Reservation,
): boolean {
	const spec = reservation.child
	if (spec.ruler.kind !== "ruler") return false
	const id = cast.rulerPerson.get(spec.ruler.ref.rulerId)
	if (id === undefined) return false
	reservation.state = "placed"
	reservation.placed = id
	return true
}

function settleNow({ cast, parent, reservation }: SettleNowParams): void {
	const birthMs = reservation.birthMs
	const conceptionMs = birthMs - GESTATION
	for (const id of parent.marriages) {
		const marriage = cast.marriages[id]
		if (!FERTILITY.canBear({ cast, marriage, birthMs })) continue
		if (!MARRIAGE.place({ cast, marriage, reservation })) continue
		if (advancedPast(marriage, conceptionMs))
			reveal({
				cast,
				people: [
					cast.persons[reservation.placed as number],
					cast.persons[marriage.husband],
					cast.persons[marriage.wife],
				],
				marriage: null,
			})
		return
	}
	if (parent.generatedUntil <= conceptionMs) return
	const placed = gap({ cast, parent, spec: reservation.child, birthMs })
	if (placed) {
		reservation.state = "placed"
		reservation.placed = placed.id
		return
	}
	if (settledAlready(cast, reservation)) return
	reservation.state = "unfit"
	if (reservation.source === "plan") cast.stats.reservedUnfit++
}

function couple({ cast, spec, birthMs, tier, key }: CoupleParams) {
	const seed = HASH.keyed({ seed: cast.worldSeed, key: `o${key}` })
	const fatherRoll = HASH.unit({ seed, channel: CHANNEL.father, salt: 0 })
	const motherRoll = HASH.unit({ seed, channel: CHANNEL.mother, salt: 0 })
	const lineage = spec.lineage ?? {
		house: false,
		dynasty: -1,
		dynastyOrigin: -1,
		home: 0,
	}
	const fatherHouse = lineage.house && lineage.dynasty >= 0
	const father = CAST.add({
		cast,
		spec: {
			sex: 0,
			birthMs: birthMs - (FATHER_GAP.min + FATHER_GAP.span * fatherRoll) * YEAR,
			lineage: fatherHouse
				? { ...lineage, house: true }
				: {
						house: false,
						dynasty: -1,
						dynastyOrigin: -1,
						home: lineage.home,
					},
			ruler: { kind: "none" },
			tier,
			seat: lineage.home,
			parents: { kind: "none", reason: "conjured" },
			inputs: {
				survivesMs: birthMs - GESTATION,
				fixedDeathMs: null,
				forcedCause: null,
			},
		},
	})
	const mother = CAST.add({
		cast,
		spec: {
			sex: 1,
			birthMs: birthMs - (MOTHER_GAP.min + MOTHER_GAP.span * motherRoll) * YEAR,
			lineage: {
				house: false,
				dynasty: -1,
				dynastyOrigin: -1,
				home: lineage.home,
			},
			ruler: { kind: "none" },
			tier,
			seat: lineage.home,
			parents: { kind: "none", reason: "conjured" },
			inputs: { survivesMs: birthMs, fixedDeathMs: null, forcedCause: null },
		},
	})
	return MARRIAGE.open({
		cast,
		husband: father.id,
		wife: mother.id,
		startMs: Math.max(
			birthMs - GESTATION - YEAR,
			father.birthMs + ADULT,
			mother.birthMs + ADULT,
		),
		kind: "origin",
		betrothedMs: null,
		kinship: null,
		revealedLater: false,
	})
}

function origin({
	cast,
	spec,
	birthMs,
	tier,
	key,
	flagged,
}: OriginParams): Person {
	const marriage = couple({ cast, spec, birthMs, tier, key })
	const placed = attach({ cast, marriage, spec, birthMs, revealed: false })
	if (!placed) throw new Error(`Origin couple cannot bear ${key}`)
	if (flagged) cast.stats.unrecordedParents++
	return placed
}

function parentTier(cast: EnsureParentsParams["cast"], person: Person): number {
	const fact = CAST.factOf({ cast, person })
	if (fact) return NOBILITY.accessionTier({ cast, fact })
	if (person.tier !== NOBILITY.inherit) return person.tier
	return NOBILITY.tierOf({ cast, person, timeMs: person.birthMs + 25 * YEAR })
}

function ensureParents({ cast, person }: EnsureParentsParams): void {
	if (person.parents.kind === "couple") return
	const marriage = couple({
		cast,
		spec: {
			sex: person.sex,
			lineage: {
				house: person.house,
				dynasty: person.dynasty,
				dynastyOrigin: person.dynastyOrigin,
				home: person.home,
			},
			ruler: { kind: "none" },
			survivesMs: person.birthMs,
			tier: person.tier,
		},
		birthMs: person.birthMs,
		tier: parentTier(cast, person),
		key: CAST.ownerKey(person),
	})
	FERTILITY.planBirth({
		marriage,
		child: person.id,
		birthMs: person.birthMs,
	})
	person.parents = { kind: "couple", marriage: marriage.id }
}

function windowOf({ cast, father, mother }: WindowParams): BirthWindow {
	return {
		lo: Math.max(mother.birthMs + ADULT, father.birthMs + ADULT + GESTATION),
		hi: Math.min(
			mother.birthMs + LAST_BIRTH,
			CAST.lifeOf({ cast, person: mother }).deathMs,
			CAST.lifeOf({ cast, person: father }).deathMs + GESTATION,
		),
	}
}

function soloWindow({ cast, parent }: SoloWindowParams): BirthWindow {
	const deathMs = CAST.lifeOf({ cast, person: parent }).deathMs
	if (parent.sex === 1)
		return {
			lo: parent.birthMs + ADULT,
			hi: Math.min(parent.birthMs + LAST_BIRTH, deathMs),
		}
	return { lo: parent.birthMs + ADULT + GESTATION, hi: deathMs + GESTATION }
}

function note({ cast, fact, step, first }: NoteParams): void {
	if (!fact.kin) return
	if (cast.placements.some((entry) => entry.rulerId === fact.rulerId)) return
	cast.placements.push({
		rulerId: fact.rulerId,
		requested: fact.kin.relation,
		step: step as never,
		first,
	})
}

export const FIT = {
	specOf,
	reserve,
	child,
	gap,
	origin,
	attach,
	settleNow,
	ensureParents,
	windowOf,
	soloWindow,
	note,
	parentTier,
}
