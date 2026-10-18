import { ANCHORS } from "@/model/people/anchors"
import type {
	EligibleParams,
	PairParams,
	ProposeParams,
	Side,
	SideParams,
	StartParams,
	TieClass,
	WedParams,
} from "@/model/people/anchors/alliance/types"
import { FIT } from "@/model/people/anchors/fit"
import { LADDER } from "@/model/people/anchors/fit/ladder"
import { CAST } from "@/model/people/cast"
import type { Marriage, Person, ReservedChild } from "@/model/people/cast/types"
import { FERTILITY } from "@/model/people/fertility"
import { MARRIAGE } from "@/model/people/marriage"
import { KINSHIP } from "@/model/people/marriage/kinship"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const GESTATION = FERTILITY.gestationMs
const ELIGIBLE = { female: [16, 44], male: [18, 69] }
const CHILD_AGE = { min: 16, max: 25 }
const SIBLING_SPREAD = 10 * YEAR
const CHANNEL = { sex: 1312 }
const KNOWN_ORDER: Array<[TieClass, TieClass]> = [
	["R", "C"],
	["C", "R"],
	["R", "R"],
	["C", "C"],
	["R", "S"],
	["S", "R"],
	["C", "S"],
	["S", "C"],
	["S", "S"],
]
const CREATED_ORDER: Array<[TieClass, TieClass]> = [
	["R", "I"],
	["I", "R"],
	["C", "I"],
	["I", "C"],
	["S", "I"],
	["I", "S"],
	["I", "I"],
]
const RULE: Record<TieClass, number> = { R: 1, C: 2, S: 3, I: 2 }

function eligible({ cast, person, timeMs }: EligibleParams): boolean {
	const age = CAST.ageAt({ person, timeMs })
	const [low, high] = person.sex === 1 ? ELIGIBLE.female : ELIGIBLE.male
	if (age < low || age > high || person.generatedUntil > timeMs) return false
	if (CAST.lifeOf({ cast, person }).deathMs <= timeMs) return false
	return !person.marriages.some((id) => {
		const marriage = cast.marriages[id]
		return (
			MARRIAGE.exclusive({ person, marriage }) &&
			CAST.endOf({ cast, marriage }) > timeMs
		)
	})
}

function childrenOf(cast: SideParams["cast"], person: Person): Person[] {
	return person.marriages.flatMap((id) =>
		cast.marriages[id].children.map((child) => cast.persons[child.id]),
	)
}

function siblingsOf(cast: SideParams["cast"], person: Person): Person[] {
	const marriage =
		person.parents.kind === "couple" ? person.parents.marriage : -1
	if (marriage < 0) return []
	return cast.marriages[marriage].children
		.map((child) => cast.persons[child.id])
		.filter((other) => other.id !== person.id)
}

function sideOf({ cast, fact, ruler, timeMs }: SideParams): Side {
	const usable = (person: Person) => eligible({ cast, person, timeMs })
	return {
		fact,
		ruler,
		classes: {
			R: usable(ruler) ? [ruler] : [],
			C: childrenOf(cast, ruler).filter(
				(child) =>
					usable(child) &&
					CAST.ageAt({ person: child, timeMs }) >= CHILD_AGE.min &&
					CAST.ageAt({ person: child, timeMs }) <= CHILD_AGE.max,
			),
			S: siblingsOf(cast, ruler).filter(
				(other) =>
					usable(other) &&
					Math.abs(other.birthMs - ruler.birthMs) <= SIBLING_SPREAD,
			),
		},
	}
}

function compatible({ cast, first, second }: PairParams): boolean {
	return first.sex !== second.sex && KINSHIP.allowed({ cast, first, second })
}

function pairOf(
	cast: SideParams["cast"],
	one: Person[],
	two: Person[],
): [Person, Person] | null {
	for (const first of one)
		for (const second of two)
			if (compatible({ cast, first, second })) return [first, second]
	return null
}

function propose({ cast, side, timeMs, sex }: ProposeParams): Person | null {
	const spec: ReservedChild = {
		sex,
		lineage: null,
		ruler: { kind: "none" },
		survivesMs: timeMs,
		tier: -2,
	}
	const [low, high] = sex === 1 ? ELIGIBLE.female : ELIGIBLE.male
	const parent = side.ruler
	const window = FIT.soloWindow({ cast, parent })
	const range = {
		lo: Math.max(window.lo, timeMs - CHILD_AGE.max * YEAR),
		hi: Math.min(window.hi, timeMs - (CHILD_AGE.min * YEAR + GESTATION)),
	}
	if (range.lo <= range.hi) {
		const seed = HASH.keyed({
			seed: CAST.seedOf({ cast, id: parent.id }),
			key: `tc${Math.round(timeMs)}`,
		})
		const created = FIT.child({
			cast,
			parent,
			spec,
			birthMs:
				range.lo +
				(range.hi - range.lo) *
					HASH.unit({ seed, channel: CHANNEL.sex, salt: 1 }),
			source: "ladder",
		})
		if (created) return created
	}
	if (parent.parents.kind !== "couple")
		FIT.ensureParents({ cast, person: parent })
	const couple = CAST.parentsOf({ cast, person: parent })
	if (!couple) return null
	const [father, mother] = couple
	const sibling = FIT.windowOf({ cast, father, mother })
	const span = {
		lo: Math.max(
			sibling.lo,
			parent.birthMs - SIBLING_SPREAD,
			timeMs - high * YEAR,
		),
		hi: Math.min(
			sibling.hi,
			parent.birthMs + SIBLING_SPREAD,
			timeMs - low * YEAR,
		),
	}
	if (span.lo > span.hi) return null
	const seed = HASH.keyed({
		seed: CAST.seedOf({ cast, id: parent.id }),
		key: `ts${Math.round(timeMs)}`,
	})
	return FIT.child({
		cast,
		parent: father,
		spec,
		birthMs:
			span.lo +
			(span.hi - span.lo) * HASH.unit({ seed, channel: CHANNEL.sex, salt: 2 }),
		source: "ladder",
	})
}

function wed({ cast, first, second, timeMs }: WedParams): Marriage {
	const [husband, wife] = first.sex === 0 ? [first, second] : [second, first]
	return MARRIAGE.open({
		cast,
		husband: husband.id,
		wife: wife.id,
		startMs: timeMs,
		kind: "tie",
		betrothedMs: null,
		kinship: KINSHIP.label({ cast, first, second }),
		revealedLater: false,
	})
}

function findKnown(
	cast: SideParams["cast"],
	one: Side,
	two: Side,
): { pair: [Person, Person]; rule: number } | null {
	for (const [a, b] of KNOWN_ORDER) {
		if (a === "I" || b === "I") continue
		const pair = pairOf(
			cast,
			one.classes[a as "R" | "C" | "S"],
			two.classes[b as "R" | "C" | "S"],
		)
		if (pair) return { pair, rule: Math.max(RULE[a], RULE[b]) }
	}
	return null
}

function findCreated(
	cast: SideParams["cast"],
	one: Side,
	two: Side,
	timeMs: number,
): { pair: [Person, Person]; rule: number } | null {
	for (const [a, b] of CREATED_ORDER) {
		const known =
			a === "I"
				? two.classes[b as "R" | "C" | "S"]
				: one.classes[a as "R" | "C" | "S"]
		if (a === "I" && b === "I") {
			const sex = Math.round(
				HASH.unit({
					seed: CAST.seedOf({ cast, id: one.ruler.id }),
					channel: CHANNEL.sex,
					salt: Math.floor(timeMs / YEAR),
				}),
			)
			const first = propose({ cast, side: one, timeMs, sex })
			const second = first
				? propose({ cast, side: two, timeMs, sex: 1 - sex })
				: null
			if (first && second && compatible({ cast, first, second }))
				return { pair: [first, second], rule: RULE.I }
			continue
		}
		if (known.length === 0) continue
		const other = known[0]
		const side = a === "I" ? one : two
		const made = propose({ cast, side, timeMs, sex: 1 - other.sex })
		if (
			!made ||
			!eligible({ cast, person: made, timeMs }) ||
			!compatible({ cast, first: made, second: other })
		)
			continue
		return {
			pair: a === "I" ? [made, other] : [other, made],
			rule: Math.max(RULE[a], RULE[b]),
		}
	}
	return null
}

function start({ cast, tie }: StartParams): void {
	if (tie.status !== "pending") return
	const first = ANCHORS.rulerAt({
		index: cast.anchors,
		nationId: tie.first,
		timeMs: tie.timeMs,
	})
	const second = ANCHORS.rulerAt({
		index: cast.anchors,
		nationId: tie.second,
		timeMs: tie.timeMs,
	})
	const unfilled = () => {
		tie.status = "unfilled"
	}
	if (!first || !second || first.rulerId === second.rulerId) return unfilled()
	const one = LADDER.ruler({ cast, rulerId: first.rulerId })
	const two = LADDER.ruler({ cast, rulerId: second.rulerId })
	if (!one || !two) return unfilled()
	const a = sideOf({ cast, fact: first, ruler: one, timeMs: tie.timeMs })
	const b = sideOf({ cast, fact: second, ruler: two, timeMs: tie.timeMs })
	const found = findKnown(cast, a, b) ?? findCreated(cast, a, b, tie.timeMs)
	if (!found) return unfilled()
	wed({ cast, first: found.pair[0], second: found.pair[1], timeMs: tie.timeMs })
	tie.status = "filled"
	tie.rule = found.rule
}

function defer({ cast, tie }: StartParams): void {
	for (const rulerId of [tie.first, tie.second]) {
		const fact = ANCHORS.rulerAt({
			index: cast.anchors,
			nationId: rulerId,
			timeMs: tie.timeMs,
		})
		if (!fact) continue
		const list = cast.pendingTies.get(fact.rulerId) ?? []
		list.push(tie)
		cast.pendingTies.set(fact.rulerId, list)
	}
}

function arrive(cast: StartParams["cast"], rulerId: number): void {
	const ties = cast.pendingTies.get(rulerId)
	if (!ties) return
	const waiting = ties.filter((tie) => !bothInCast(cast, tie))
	if (waiting.length > 0) cast.pendingTies.set(rulerId, waiting)
	else cast.pendingTies.delete(rulerId)
	for (const tie of ties) if (!waiting.includes(tie)) start({ cast, tie })
}

function bothInCast(
	cast: StartParams["cast"],
	tie: StartParams["tie"],
): boolean {
	return [tie.first, tie.second].every((nationId) => {
		const fact = ANCHORS.rulerAt({
			index: cast.anchors,
			nationId,
			timeMs: tie.timeMs,
		})
		return fact !== null && cast.rulerPerson.has(fact.rulerId)
	})
}

export const ALLIANCE = { start, defer, arrive }
