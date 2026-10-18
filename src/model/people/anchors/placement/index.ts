import { COUPLES } from "@/model/people/anchors/couples"
import type {
	InfoParams,
	LadderStep,
	Proposal,
	ProposeParams,
	StepParams,
} from "@/model/people/anchors/placement/types"
import type {
	AnchoredCouple,
	AnchorIndex,
	ChildInfo,
	Placement,
	PlaceParams,
	PlaceTieParams,
	RulerFact,
} from "@/model/people/anchors/types"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const GESTATION = (280 / 365) * YEAR
const ADULT = 16 * YEAR
const LAST_BIRTH = 45 * YEAR
const NEAR_BROTHER_GAP = 20 * YEAR
const SIBLING_SPREAD = 10 * YEAR
const TIE_CHILD_MAX_AGE = 25 * YEAR
const ELIGIBLE = { female: [16, 44], male: [18, 69] }
const CHANNEL = { pick: 1310, husband: 1311, tieSex: 1312 }
const HUSBAND_GAP = { min: 20, span: 20 }

function infoOf({ index, key }: InfoParams): ChildInfo {
	return {
		...COUPLES.lineage({ index, key }),
		birthMs: COUPLES.birthOf({ index, key }),
		sex: COUPLES.sexOf({ index, key }),
	}
}

function parentsOf(index: AnchorIndex, key: string): AnchoredCouple {
	return COUPLES.parentCoupleFor({ index, key, info: infoOf({ index, key }) })
}

function pick(
	index: AnchorIndex,
	id: string,
	window: { lo: number; hi: number },
): number {
	return (
		window.lo +
		(window.hi - window.lo) * COUPLES.unit({ index, id, channel: CHANNEL.pick })
	)
}

function inject(
	index: AnchorIndex,
	params: {
		anchor: string
		role: string
		sex: number
		birthMs: number
		couple: AnchoredCouple
		survivesMs: number
	},
): string {
	const person = COUPLES.inject({
		index,
		anchor: params.anchor,
		role: params.role,
		sex: params.sex,
		birthMs: params.birthMs,
		lineage: COUPLES.childLineage({ index, couple: params.couple }),
		noParentCharacter: false,
		survivesMs: params.survivesMs,
	})
	COUPLES.join({
		index,
		couple: params.couple,
		child: person.key,
		birthMs: params.birthMs,
	})
	return person.key
}

function kidsOf(
	index: AnchorIndex,
	parent: string,
	firstBirthMs: number,
): AnchoredCouple {
	return COUPLES.outsiderFor({
		index,
		parent,
		anchor: `k:${parent}`,
		firstBirthMs,
	})
}

function stepSon({ index, late, successor }: StepParams): boolean {
	if (
		!COUPLES.fits(
			COUPLES.kidsWindow({ index, parent: late.key }),
			successor.birthMs,
		)
	)
		return false
	COUPLES.join({
		index,
		couple: kidsOf(index, late.key, successor.birthMs),
		child: successor.key,
		birthMs: successor.birthMs,
	})
	return true
}

function brother({ index, late, successor }: StepParams): boolean {
	const couple = parentsOf(index, late.key)
	if (!COUPLES.fits(COUPLES.birthWindow({ index, couple }), successor.birthMs))
		return false
	COUPLES.join({
		index,
		couple,
		child: successor.key,
		birthMs: successor.birthMs,
	})
	return true
}

function youngerBrother(params: StepParams): boolean {
	return params.successor.birthMs >= params.late.birthMs && brother(params)
}

function nearBrother(params: StepParams): boolean {
	return (
		Math.abs(params.successor.birthMs - params.late.birthMs) <=
			NEAR_BROTHER_GAP && brother(params)
	)
}

function nephewOf(
	index: AnchorIndex,
	couple: AnchoredCouple,
	successor: RulerFact,
): boolean {
	const window = COUPLES.birthWindow({ index, couple })
	const conception = successor.birthMs - GESTATION
	const range = { lo: window.lo, hi: Math.min(window.hi, conception - ADULT) }
	if (range.lo > range.hi) return false
	const birthMs = pick(index, `n:${successor.key}`, range)
	const uncleKey = inject(index, {
		anchor: `n:${successor.key}`,
		role: "b",
		sex: 0,
		birthMs,
		couple,
		survivesMs: conception,
	})
	COUPLES.join({
		index,
		couple: kidsOf(index, uncleKey, successor.birthMs),
		child: successor.key,
		birthMs: successor.birthMs,
	})
	return true
}

function nephew({ index, late, successor }: StepParams): boolean {
	return nephewOf(index, parentsOf(index, late.key), successor)
}

function uncle({ index, late, successor }: StepParams): boolean {
	const father = parentsOf(index, late.key).father
	const couple = parentsOf(index, father)
	if (!COUPLES.fits(COUPLES.birthWindow({ index, couple }), successor.birthMs))
		return false
	COUPLES.join({
		index,
		couple,
		child: successor.key,
		birthMs: successor.birthMs,
	})
	return true
}

function cousin({ index, late, successor }: StepParams): boolean {
	const father = parentsOf(index, late.key).father
	return nephewOf(index, parentsOf(index, father), successor)
}

function husbandOf(
	index: AnchorIndex,
	successor: RulerFact,
	wife: string,
	couple: AnchoredCouple | null,
): void {
	const { ref } = successor
	const roll = COUPLES.unit({
		index,
		id: `g:${successor.key}`,
		channel: CHANNEL.husband,
	})
	const husband = COUPLES.inject({
		index,
		anchor: `g:${successor.key}`,
		role: "h",
		sex: 0,
		birthMs:
			successor.birthMs - (HUSBAND_GAP.min + HUSBAND_GAP.span * roll) * YEAR,
		lineage: {
			house: ref.dynasty >= 0,
			dynasty: ref.dynasty,
			dynastyOrigin: ref.dynastyOrigin,
			home: ref.nameOrigin,
		},
		noParentCharacter: true,
		survivesMs: successor.birthMs - GESTATION,
	})
	const marriage =
		couple ??
		COUPLES.newCouple({
			index,
			id: `g:${successor.key}`,
			father: husband.key,
			mother: wife,
			tie: null,
		})
	COUPLES.join({
		index,
		couple: marriage,
		child: successor.key,
		birthMs: successor.birthMs,
	})
}

function grandson({ index, late, successor }: StepParams): boolean {
	const window = COUPLES.kidsWindow({ index, parent: late.key })
	const range = {
		lo: Math.max(window.lo, successor.birthMs - LAST_BIRTH),
		hi: Math.min(window.hi, successor.birthMs - ADULT),
	}
	if (range.lo > range.hi) return false
	const birthMs = pick(index, `g:${successor.key}`, range)
	const couple = kidsOf(index, late.key, birthMs)
	const daughter = inject(index, {
		anchor: `g:${successor.key}`,
		role: "d",
		sex: 1,
		birthMs,
		couple,
		survivesMs: successor.birthMs,
	})
	husbandOf(index, successor, daughter, null)
	return true
}

function sisterSon({ index, late, successor }: StepParams): boolean {
	const couple = parentsOf(index, late.key)
	const window = COUPLES.birthWindow({ index, couple })
	const range = {
		lo: Math.max(window.lo, successor.birthMs - LAST_BIRTH),
		hi: Math.min(window.hi, successor.birthMs - ADULT),
	}
	if (range.lo > range.hi) return false
	const birthMs = pick(index, `s:${successor.key}`, range)
	const sister = inject(index, {
		anchor: `s:${successor.key}`,
		role: "s",
		sex: 1,
		birthMs,
		couple,
		survivesMs: successor.birthMs,
	})
	husbandOf(index, successor, sister, null)
	return true
}

function unknown({ index, successor }: StepParams): boolean {
	parentsOf(index, successor.key)
	return true
}

const LADDERS: Record<string, LadderStep[]> = {
	son: [
		{ name: "son", run: stepSon },
		{ name: "brother", run: youngerBrother },
		{ name: "nephew", run: nephew },
		{ name: "unknown", run: unknown },
	],
	daughterLine: [
		{ name: "grandson", run: grandson },
		{ name: "sisterSon", run: sisterSon },
		{ name: "unknown", run: unknown },
	],
	nearBrotherYounger: [
		{ name: "brother", run: nearBrother },
		{ name: "nephew", run: nephew },
		{ name: "unknown", run: unknown },
	],
	nearYounger: [
		{ name: "nephew", run: nephew },
		{ name: "unknown", run: unknown },
	],
	nearOlder: [
		{ name: "uncle", run: uncle },
		{ name: "unknown", run: unknown },
	],
	kinsman: [
		{ name: "cousin", run: cousin },
		{ name: "uncle", run: uncle },
		{ name: "unknown", run: unknown },
	],
}

function ladderFor({ index, fact }: PlaceParams): LadderStep[] | null {
	const kin = fact.kin
	if (!kin) return null
	const late = index.facts.get(kin.late.rulerId)
	if (!late) return LADDERS.kinsman.slice(-1)
	if (kin.relation === "son") return LADDERS.son
	if (kin.relation === "daughterLine") return LADDERS.daughterLine
	if (kin.relation === "kinsman") return LADDERS.kinsman
	const gap = Math.abs(fact.birthMs - late.birthMs)
	if (gap <= NEAR_BROTHER_GAP) return LADDERS.nearBrotherYounger
	return fact.birthMs > late.birthMs ? LADDERS.nearYounger : LADDERS.nearOlder
}

function place({ index, fact }: PlaceParams): void {
	const ladder = ladderFor({ index, fact })
	const kin = fact.kin
	if (!ladder || !kin) return
	const late = index.facts.get(kin.late.rulerId)
	if (!late || index.parentCouple.has(fact.key)) return
	for (const [position, step] of ladder.entries()) {
		if (!step.run({ index, late, successor: fact })) continue
		const placement: Placement = {
			rulerId: fact.rulerId,
			requested: kin.relation,
			step: step.name,
			first: position === 0,
		}
		index.placements.push(placement)
		return
	}
}

function ageAt(index: AnchorIndex, key: string, timeMs: number): number {
	return (timeMs - COUPLES.birthOf({ index, key })) / YEAR
}

function eligible(index: AnchorIndex, key: string, timeMs: number): boolean {
	const age = ageAt(index, key, timeMs)
	const [low, high] =
		COUPLES.sexOf({ index, key }) === 1 ? ELIGIBLE.female : ELIGIBLE.male
	return age >= low && age <= high
}

function spanOf(index: AnchorIndex, couple: AnchoredCouple): [number, number] {
	if (couple.tie) return [couple.tie.startMs, couple.tie.endMs]
	const last = Math.max(...couple.children.map((child) => child.birthMs))
	return [COUPLES.start({ index, couple }), last + YEAR]
}

function married(index: AnchorIndex, key: string, timeMs: number): boolean {
	return COUPLES.spouseCouples({ index, key }).some((couple) => {
		const [from, to] = spanOf(index, couple)
		return from <= timeMs && timeMs <= to
	})
}

function childProposal({
	index,
	ruler,
	timeMs,
	sex,
	ordinal,
	side,
}: ProposeParams): Proposal | null {
	const window = COUPLES.kidsWindow({ index, parent: ruler.key })
	const range = {
		lo: Math.max(window.lo, timeMs - TIE_CHILD_MAX_AGE),
		hi: Math.min(window.hi, timeMs - ADULT),
	}
	if (range.lo > range.hi || sex === null) return null
	const birthMs = pick(index, `t:${ordinal}:${side}`, range)
	return {
		key: `A(t:${ordinal}:${side},c)`,
		commit: () => {
			const couple = kidsOf(index, ruler.key, birthMs)
			inject(index, {
				anchor: `t:${ordinal}:${side}`,
				role: "c",
				sex,
				birthMs,
				couple,
				survivesMs: timeMs,
			})
		},
	}
}

function siblingProposal({
	index,
	ruler,
	timeMs,
	sex,
	ordinal,
	side,
}: ProposeParams): Proposal | null {
	if (sex === null) return null
	const couple = parentsOf(index, ruler.key)
	const window = COUPLES.birthWindow({ index, couple })
	const [low, high] = sex === 1 ? ELIGIBLE.female : ELIGIBLE.male
	const range = {
		lo: Math.max(
			window.lo,
			ruler.birthMs - SIBLING_SPREAD,
			timeMs - high * YEAR,
		),
		hi: Math.min(
			window.hi,
			ruler.birthMs + SIBLING_SPREAD,
			timeMs - low * YEAR,
		),
	}
	if (range.lo > range.hi) return null
	const birthMs = pick(index, `t:${ordinal}:${side}`, range)
	return {
		key: `A(t:${ordinal}:${side},b)`,
		commit: () => {
			inject(index, {
				anchor: `t:${ordinal}:${side}`,
				role: "b",
				sex,
				birthMs,
				couple,
				survivesMs: timeMs,
			})
		},
	}
}

function propose(
	params: ProposeParams,
): { proposal: Proposal; rule: number; sex: number } | null {
	const { index, ruler, timeMs, ordinal } = params
	const rulerSex = COUPLES.sexOf({ index, key: ruler.key })
	if (
		(params.sex === null || rulerSex === params.sex) &&
		eligible(index, ruler.key, timeMs) &&
		!married(index, ruler.key, timeMs)
	)
		return {
			proposal: {
				key: ruler.key,
				commit: () => COUPLES.raiseSurvives({ index, key: ruler.key, timeMs }),
			},
			rule: 1,
			sex: rulerSex,
		}
	const sex =
		params.sex ??
		Math.round(
			COUPLES.unit({ index, id: `t:${ordinal}`, channel: CHANNEL.tieSex }),
		)
	const child = childProposal({ ...params, sex })
	if (child) return { proposal: child, rule: 2, sex }
	const sibling = siblingProposal({ ...params, sex })
	return sibling ? { proposal: sibling, rule: 3, sex } : null
}

function rulerAt(
	index: AnchorIndex,
	nationId: number,
	timeMs: number,
): RulerFact | null {
	const reigns = index.nationReigns.get(nationId) ?? []
	for (let at = reigns.length - 1; at >= 0; at--)
		if (reigns[at].startMs <= timeMs)
			return index.facts.get(reigns[at].rulerId) ?? null
	return null
}

function placeTie({ index, tie, ordinal }: PlaceTieParams): void {
	const [firstId, secondId] =
		tie.first < tie.second ? [tie.first, tie.second] : [tie.second, tie.first]
	const first = rulerAt(index, firstId, tie.timeMs)
	const second = rulerAt(index, secondId, tie.timeMs)
	const record = { timeMs: tie.timeMs, first: firstId, second: secondId }
	const unfilled = () => index.ties.push({ ...record, filled: false, rule: 0 })
	if (!first || !second || first.rulerId === second.rulerId)
		return void unfilled()
	const one = propose({
		index,
		ruler: first,
		timeMs: tie.timeMs,
		sex: null,
		ordinal,
		side: 0,
	})
	if (!one) return void unfilled()
	const two = propose({
		index,
		ruler: second,
		timeMs: tie.timeMs,
		sex: 1 - one.sex,
		ordinal,
		side: 1,
	})
	if (!two) return void unfilled()
	one.proposal.commit()
	two.proposal.commit()
	const [husband, wife] =
		one.sex === 0
			? [one.proposal.key, two.proposal.key]
			: [two.proposal.key, one.proposal.key]
	COUPLES.newCouple({
		index,
		id: `t:${ordinal}`,
		father: husband,
		mother: wife,
		tie: { startMs: tie.timeMs, endMs: tie.endMs },
	})
	index.ties.push({
		...record,
		filled: true,
		rule: Math.max(one.rule, two.rule),
	})
}

export const PLACEMENT = { place, placeTie }
