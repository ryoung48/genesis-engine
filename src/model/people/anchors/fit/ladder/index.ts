import { FIT } from "@/model/people/anchors/fit"
import type {
	HusbandParams,
	LadderParams,
	LadderStep,
	RulerParams,
	StepParams,
} from "@/model/people/anchors/fit/ladder/types"
import { CAST } from "@/model/people/cast"
import type { Person, ReservedChild } from "@/model/people/cast/types"
import { FERTILITY } from "@/model/people/fertility"
import { MARRIAGE } from "@/model/people/marriage"
import { NOBILITY } from "@/model/people/nobility"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const GESTATION = FERTILITY.gestationMs
const ADULT = FERTILITY.adult * YEAR
const LAST_BIRTH = FERTILITY.lastBirth * YEAR
const MONTH = YEAR / 12
const NEAR_BROTHER_GAP = 20 * YEAR
const BRANCH_REACH = 40 * YEAR
const BRANCH_STEP = { min: 25, span: 10 }
const MAX_BRANCH = 8
const SIBLING_LEAD = FERTILITY.restMs + GESTATION + 30 * 86_400_000
const HUSBAND_GAP = { min: 20, span: 20 }
const CHANNEL = { pick: 1310, husband: 1311 }

function unit(cast: RulerParams["cast"], key: string, channel: number): number {
	return HASH.unit({
		seed: HASH.keyed({ seed: cast.worldSeed, key }),
		channel,
		salt: 0,
	})
}

function parentsOf(
	cast: RulerParams["cast"],
	person: Person,
): [Person, Person] {
	FIT.ensureParents({ cast, person })
	const couple = CAST.parentsOf({ cast, person })
	if (!couple) throw new Error("Parents were not created")
	return [couple[0], couple[1]]
}

function specFor(fact: StepParams["fact"]) {
	return FIT.specOf({ ref: fact.ref, survivesMs: fact.survivesMs })
}

function place(params: StepParams, parent: Person): Person | null {
	return FIT.child({
		cast: params.cast,
		parent,
		spec: specFor(params.fact),
		birthMs: params.fact.birthMs,
		source: "kin",
	})
}

function stepSon(params: StepParams): Person | null {
	return place(params, params.late)
}

function brother(params: StepParams): Person | null {
	return place(params, parentsOf(params.cast, params.late)[0])
}

function youngerBrother(params: StepParams): Person | null {
	return params.fact.birthMs >= params.lateFact.birthMs ? brother(params) : null
}

function nearBrother(params: StepParams): Person | null {
	return Math.abs(params.fact.birthMs - params.lateFact.birthMs) <=
		NEAR_BROTHER_GAP
		? brother(params)
		: null
}

function member(survivesMs: number): ReservedChild {
	return {
		sex: 0,
		lineage: null,
		ruler: { kind: "none" },
		survivesMs,
		tier: NOBILITY.inherit,
	}
}

function branch(params: StepParams, base: Person): Person | null {
	const { cast, fact } = params
	const conceptionMs = fact.birthMs - GESTATION
	const [father, mother] = parentsOf(cast, base)
	const window = FIT.windowOf({ cast, father, mother })
	const range = {
		lo: Math.max(window.lo, base.birthMs + SIBLING_LEAD),
		hi: Math.min(window.hi, conceptionMs - ADULT),
	}
	if (range.lo > range.hi) return null
	const births = [
		range.lo +
			(range.hi - range.lo) * unit(cast, `n${fact.rulerId}`, CHANNEL.pick),
	]
	while (
		conceptionMs - births[births.length - 1] > BRANCH_REACH &&
		births.length < MAX_BRANCH
	) {
		const last = births[births.length - 1]
		const step = Math.min(
			(BRANCH_STEP.min +
				BRANCH_STEP.span *
					unit(cast, `b${fact.rulerId}:${births.length}`, CHANNEL.pick)) *
				YEAR,
			conceptionMs - last - ADULT,
		)
		births.push(last + step)
	}
	if (conceptionMs - births[births.length - 1] > BRANCH_REACH) return null
	let parent: Person | null = null
	for (const [at, birthMs] of births.entries()) {
		const next = (births[at + 1] ?? fact.birthMs) - GESTATION
		parent = FIT.child({
			cast,
			parent: parent ?? father,
			spec: member(next),
			birthMs,
			source: "ladder",
		})
		if (!parent) return null
	}
	return parent
}

function nephewOf(params: StepParams, base: Person): Person | null {
	const parent = branch(params, base)
	return parent ? place(params, parent) : null
}

function nephew(params: StepParams): Person | null {
	return nephewOf(params, params.late)
}

function uncle(params: StepParams): Person | null {
	const father = parentsOf(params.cast, params.late)[0]
	return place(params, parentsOf(params.cast, father)[0])
}

function cousin(params: StepParams): Person | null {
	const father = parentsOf(params.cast, params.late)[0]
	return nephewOf(params, father)
}

function husbandOf({ cast, wife, fact }: HusbandParams): Person | null {
	const ref = fact.ref
	const conceptionMs = fact.birthMs - GESTATION
	const roll = unit(cast, `h${fact.rulerId}`, CHANNEL.husband)
	const husband = CAST.add({
		cast,
		spec: {
			sex: 0,
			birthMs:
				fact.birthMs - (HUSBAND_GAP.min + HUSBAND_GAP.span * roll) * YEAR,
			lineage: {
				house: ref.dynasty >= 0,
				dynasty: ref.dynasty,
				dynastyOrigin: ref.dynastyOrigin,
				home: ref.nameOrigin,
			},
			ruler: { kind: "none" },
			tier: NOBILITY.tierOf({ cast, person: wife, timeMs: fact.birthMs }),
			seat: ref.nameOrigin,
			parents: { kind: "none", reason: "conjured" },
			inputs: {
				survivesMs: conceptionMs,
				fixedDeathMs: null,
				forcedCause: null,
			},
		},
	})
	const marriage = MARRIAGE.open({
		cast,
		husband: husband.id,
		wife: wife.id,
		startMs: Math.max(
			conceptionMs - YEAR,
			husband.birthMs + ADULT,
			wife.birthMs + ADULT,
		),
		kind: "origin",
		betrothedMs: null,
		kinship: null,
		revealedLater: false,
	})
	return FIT.attach({
		cast,
		marriage,
		spec: specFor(fact),
		birthMs: fact.birthMs,
		revealed: false,
	})
}

function grandson(params: StepParams): Person | null {
	const { cast, late, fact } = params
	const window = FIT.soloWindow({ cast, parent: late })
	const lo = Math.max(window.lo, fact.birthMs - LAST_BIRTH)
	const hi = Math.min(window.hi, fact.birthMs - GESTATION - ADULT)
	if (lo > hi) return null
	const daughter = FIT.child({
		cast,
		parent: late,
		spec: {
			sex: 1,
			lineage: null,
			ruler: { kind: "none" },
			survivesMs: fact.birthMs,
			tier: NOBILITY.inherit,
		},
		birthMs: lo + (hi - lo) * unit(cast, `g${fact.rulerId}`, CHANNEL.pick),
		source: "ladder",
	})
	return daughter ? husbandOf({ cast, wife: daughter, fact }) : null
}

function sisterSon(params: StepParams): Person | null {
	const { cast, late, fact } = params
	const [father, mother] = parentsOf(cast, late)
	const window = FIT.windowOf({ cast, father, mother })
	const lo = Math.max(window.lo, fact.birthMs - LAST_BIRTH)
	const hi = Math.min(window.hi, fact.birthMs - GESTATION - ADULT)
	if (lo > hi) return null
	const sister = FIT.child({
		cast,
		parent: father,
		spec: {
			sex: 1,
			lineage: null,
			ruler: { kind: "none" },
			survivesMs: fact.birthMs,
			tier: NOBILITY.inherit,
		},
		birthMs: lo + (hi - lo) * unit(cast, `s${fact.rulerId}`, CHANNEL.pick),
		source: "ladder",
	})
	return sister ? husbandOf({ cast, wife: sister, fact }) : null
}

const LADDERS: Record<string, LadderStep[]> = {
	son: [
		{ name: "son", run: stepSon },
		{ name: "brother", run: youngerBrother },
		{ name: "nephew", run: nephew },
	],
	daughterLine: [
		{ name: "grandson", run: grandson },
		{ name: "sisterSon", run: sisterSon },
	],
	nearBrotherYounger: [
		{ name: "brother", run: nearBrother },
		{ name: "nephew", run: nephew },
	],
	nearYounger: [{ name: "nephew", run: nephew }],
	nearOlder: [{ name: "uncle", run: uncle }],
	kinsman: [
		{ name: "cousin", run: cousin },
		{ name: "uncle", run: uncle },
	],
}

function ladderFor({ cast, fact }: LadderParams): LadderStep[] | null {
	const kin = fact.kin
	if (!kin) return null
	const late = cast.anchors.facts.get(kin.late.rulerId)
	if (!late) return []
	if (kin.relation === "son") return LADDERS.son
	if (kin.relation === "daughterLine") return LADDERS.daughterLine
	if (kin.relation === "kinsman") return LADDERS.kinsman
	const gap = Math.abs(fact.birthMs - late.birthMs)
	if (gap <= NEAR_BROTHER_GAP) return LADDERS.nearBrotherYounger
	return fact.birthMs > late.birthMs ? LADDERS.nearYounger : LADDERS.nearOlder
}

function fromLadder({ cast, fact }: LadderParams): Person | null {
	const steps = ladderFor({ cast, fact })
	const kin = fact.kin
	if (!steps || !kin) return null
	const lateFact = cast.anchors.facts.get(kin.late.rulerId)
	const late = lateFact ? ruler({ cast, rulerId: kin.late.rulerId }) : null
	if (!lateFact || !late) {
		FIT.note({ cast, fact, step: "unknown", first: true })
		return null
	}
	for (const [position, step] of steps.entries()) {
		const created = step.run({ cast, late, lateFact, fact })
		const exists =
			created ?? cast.persons[cast.rulerPerson.get(fact.rulerId) ?? -1]
		if (!exists) continue
		FIT.note({ cast, fact, step: step.name, first: position === 0 })
		return exists
	}
	const raced = cast.rulerPerson.get(fact.rulerId)
	if (raced !== undefined) return cast.persons[raced]
	FIT.note({ cast, fact, step: "unknown", first: false })
	return null
}

function ownerOf(cast: RulerParams["cast"], owner: string): Person | null {
	if (owner.startsWith("r"))
		return ruler({ cast, rulerId: Number(owner.slice(1)) })
	if (owner.startsWith("p")) return cast.persons[Number(owner.slice(1))] ?? null
	return null
}

function noteSon(cast: RulerParams["cast"], rulerId: number): void {
	const fact = cast.anchors.facts.get(rulerId)
	const id = cast.rulerPerson.get(rulerId)
	if (!fact?.kin || id === undefined) return
	const couple = CAST.parentsOf({ cast, person: cast.persons[id] })
	const late = fact.kin.late.rulerId
	const son = couple?.some(
		(parent) =>
			parent.ruler.kind === "ruler" && parent.ruler.ref.rulerId === late,
	)
	FIT.note({ cast, fact, step: son ? "son" : "unknown", first: son === true })
}

function ruler({ cast, rulerId }: RulerParams): Person | null {
	const known = cast.rulerPerson.get(rulerId)
	if (known !== undefined) {
		noteSon(cast, rulerId)
		return cast.persons[known]
	}
	const fact = cast.anchors.facts.get(rulerId)
	const reservation = cast.reserved.get(rulerId)
	if (!fact && !reservation) return null
	if (
		reservation &&
		reservation.state === "open" &&
		reservation.birthMs <= cast.horizonMs
	) {
		const owner = ownerOf(cast, reservation.owner)
		if (owner) {
			MARRIAGE.extend({
				cast,
				id: owner.id,
				untilMs: Math.min(cast.horizonMs, reservation.birthMs + MONTH),
			})
		}
		const placed = cast.rulerPerson.get(rulerId)
		if (placed !== undefined) {
			noteSon(cast, rulerId)
			return cast.persons[placed]
		}
	}
	if (!fact) return null
	const created = fromLadder({ cast, fact })
	if (created) return created
	const raced = cast.rulerPerson.get(rulerId)
	if (raced !== undefined) return cast.persons[raced]
	return FIT.origin({
		cast,
		spec: FIT.specOf({ ref: fact.ref, survivesMs: fact.survivesMs }),
		birthMs: fact.birthMs,
		tier: NOBILITY.accessionTier({ cast, fact }),
		key: `r${rulerId}`,
		flagged: fact.kin !== null,
	})
}

export const LADDER = { ruler, noteExisting: noteSon }
