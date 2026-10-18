import { RULER_RELATIONS } from "@/model/history/record/rulers/relations"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE_CLOCK } from "@/model/history/sim/engine/state/clock"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import type {
	DrawJuniorsParams,
	EnsureParams,
	FulfillParams,
	HeirOutcome,
	HeirPlan,
	HeirPlanStats,
	OutcomeRngParams,
	PlanParams,
	PrunePending,
	ReadPlanParams,
	RecordLeadsParams,
	RetainedParams,
	RollParams,
} from "@/model/history/sim/engine/state/rulers/heirs/types"
import type { Ruler } from "@/model/history/sim/engine/state/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

const { yearMs } = STATE_CLOCK

const ADULT_AGE = 16
const GESTATION_YEARS = 280 / 365
const LAST_BIRTH_AGE = 45

// Who inherits a single-heir throne, which fixes the house and the legitimacy
// of the new ruler (it feeds title founding). The chances assume a sovereign's
// sons and daughters are independent Poisson counts with mean ln 4, so that a
// quarter of reigns leave no surviving son, the failure fraction McFarlane
// finds for peerage families per generation; the collateral lines repeat that
// proxy. Rounded to sum to 1. They are an assumption, not a measurement. The
// direct-child row ("son") keeps this male-line calibration for children of
// either sex.
const HEIR: readonly HeirOutcome[] = [
	{ chance: 0.75, house: "same", claim: 3, daughterLine: false, son: true },
	{ chance: 0.19, house: "other", claim: 3, daughterLine: true, son: false },
	{ chance: 0.035, house: "same", claim: 2, daughterLine: false, son: false },
	{ chance: 0.015, house: "same", claim: 1, daughterLine: false, son: false },
	{ chance: 0.01, house: "new", claim: 0, daughterLine: false, son: false },
]
// A second surviving son given a first, from the same Poisson counts.
const JUNIOR_HEIR_CHANCE = 0.54
// Poisson(ln 4) probabilities of 2, 3, 4, 5 and 6+ sons, each over P(2+ sons)
// and scaled to 1,000.
const JUNIOR_COUNT: readonly { v: number; w: number }[] = [
	{ v: 1, w: 594 },
	{ v: 2, w: 275 },
	{ v: 3, w: 96 },
	{ v: 4, w: 27 },
	{ v: 5, w: 8 },
]

function stats(): HeirPlanStats {
	return {
		rolled: 0,
		sonRolls: 0,
		fertilityRejections: 0,
		cancelledUnused: 0,
		cancelledUnreachable: 0,
		retainedPeak: 0,
		accessionAges: [],
		leads: [],
		seatedCohorts: new Map(),
		missingPlans: 0,
		unreachablePlans: 0,
		biologyViolations: 0,
		identityViolations: 0,
	}
}

function heirOutcome({ rng }: OutcomeRngParams): HeirOutcome {
	let roll = rng.random()
	for (const outcome of HEIR) {
		roll -= outcome.chance
		if (roll < 0) return outcome
	}
	return HEIR[HEIR.length - 1]
}

function rejectedOutcome({ rng }: OutcomeRngParams): HeirOutcome {
	return (
		rng.weightedChoice(
			HEIR.filter((outcome) => !outcome.son).map((outcome) => ({
				v: outcome,
				w: outcome.chance,
			})),
		) ?? HEIR[HEIR.length - 1]
	)
}

function drawJuniors({
	state,
	parent,
	primary,
	p,
	rng,
}: DrawJuniorsParams): Ruler[] {
	if (rng.random() >= JUNIOR_HEIR_CHANCE) return []
	const count = rng.weightedChoice(JUNIOR_COUNT) ?? 1
	const juniors: Ruler[] = []
	for (let index = 0; index < count; index++) {
		const junior = STATE_RULERS.drawHeir({
			state,
			parent,
			p,
			olderBirthMs: primary.birthMs,
			rng,
		})
		if (junior) juniors.push(junior)
	}
	return juniors.sort((a, b) => a.birthMs - b.birthMs)
}

function recordLeads({ state, plan }: RecordLeadsParams): void {
	const children = plan.primary ? [plan.primary, ...plan.juniors] : []
	for (const [index, child] of children.entries())
		state.heirPlanStats.leads.push({
			ownerId: plan.owner.rulerId,
			primary: index === 0,
			years: (child.birthMs - state.time) / yearMs,
		})
}

function checkBiology({ state, plan }: PlanParams): void {
	const { owner, primary } = plan
	if (!primary) return
	const earliest = owner.birthMs + (ADULT_AGE + GESTATION_YEARS) * yearMs
	for (const child of [primary, ...plan.juniors])
		if (
			child.birthMs < earliest - 1 ||
			child.birthMs > owner.deathMs ||
			child.deathMs <= owner.deathMs ||
			(owner.sex === 1 &&
				child.birthMs >= owner.birthMs + LAST_BIRTH_AGE * yearMs)
		)
			state.heirPlanStats.biologyViolations++
	for (const junior of plan.juniors)
		if (junior.birthMs <= primary.birthMs)
			state.heirPlanStats.biologyViolations++
}

function roll({ state, ruler, p, rng }: RollParams): HeirPlan {
	const counters = state.heirPlanStats
	let outcome = heirOutcome({ rng })
	let primary: Ruler | null = null
	if (outcome.son) {
		counters.sonRolls++
		primary = STATE_RULERS.drawHeir({
			state,
			parent: ruler,
			p,
			olderBirthMs: null,
			rng,
		})
		if (!primary) {
			counters.fertilityRejections++
			outcome = rejectedOutcome({ rng })
		}
	}
	const juniors = primary
		? drawJuniors({ state, parent: ruler, primary, p, rng })
		: []
	const plan: HeirPlan = {
		root: p,
		owner: ruler,
		outcome,
		primary,
		juniors,
		fulfilled: false,
	}
	counters.rolled++
	checkBiology({ state, plan })
	recordLeads({ state, plan })
	JOURNAL.heirPlan({
		state,
		root: p,
		owner: ruler,
		relation: RULER_RELATIONS.ofOutcome(outcome),
		primary,
		juniors,
	})
	return plan
}

function ensureOne(params: EnsureParams): HeirPlan {
	const { state, ruler } = params
	const existing = state.heirPlans.get(ruler.rulerId)
	if (existing) {
		const promised = existing.owner
		if (
			promised.birthMs !== ruler.birthMs ||
			promised.nameSeed !== ruler.nameSeed ||
			promised.nameOrigin !== ruler.nameOrigin ||
			promised.sex !== ruler.sex ||
			promised.dynasty !== ruler.dynasty
		)
			state.heirPlanStats.identityViolations++
		return existing
	}
	const plan = roll(params)
	state.heirPlans.set(ruler.rulerId, plan)
	if (plan.primary)
		state.heirPrimaryOwner.set(plan.primary.rulerId, ruler.rulerId)
	state.changedRulers.add(ruler.rulerId)
	return plan
}

// A seated ruler and the child planned to follow them each hold a plan. The
// child's own children are planned only once the child is seated.
function ensure({ state, ruler, p, rng }: EnsureParams): void {
	if (!state.heirPlanStats.seatedCohorts.has(ruler.rulerId))
		state.heirPlanStats.seatedCohorts.set(
			ruler.rulerId,
			state.heirPrimaryOwner.has(ruler.rulerId) ? "primary" : "seated",
		)
	const { primary } = ensureOne({ state, ruler, p, rng })
	if (primary) ensureOne({ state, ruler: primary, p, rng })
}

function read({ state, rulerId }: ReadPlanParams): HeirPlan | null {
	return state.heirPlans.get(rulerId) ?? null
}

function fulfill({
	state,
	plan,
	house,
	claim,
	successor,
}: FulfillParams): void {
	plan.fulfilled = true
	if (plan.primary?.rulerId === successor.rulerId)
		state.heirPlanStats.accessionAges.push(
			(state.time - successor.birthMs) / yearMs,
		)
	JOURNAL.heirFulfilled({
		state,
		root: plan.root,
		rulerId: plan.owner.rulerId,
		relation: RULER_RELATIONS.ofOutcome({ house, claim }),
		house,
		claim,
		successor,
	})
}

function retained({ state, id }: RetainedParams): boolean {
	if (state.rulerRealmCounts.has(id)) return true
	const owner = state.heirPrimaryOwner.get(id)
	return owner !== undefined && state.rulerRealmCounts.has(owner)
}

// Drops the promises nobody can reach any more and journals the ones that were
// never kept. Runs once per transaction, since a ruler moved between realms
// or regrouped in a union is briefly in none.
function reconcile(state: HistoryState): void {
	const counters = state.heirPlanStats
	const queue: PrunePending[] = []
	for (const id of state.changedRulers) {
		queue.push({
			id,
			reason:
				state.heirPrimaryOwner.has(id) && !counters.seatedCohorts.has(id)
					? "unreachable"
					: "unused",
		})
		if (!state.rulerRealmCounts.has(id)) continue
		const plan = state.heirPlans.get(id)
		if (!plan || (plan.primary && !state.heirPlans.has(plan.primary.rulerId)))
			counters.missingPlans++
	}
	state.changedRulers.clear()
	for (let head = 0; head < queue.length; head++) {
		const { id, reason } = queue[head]
		const plan = state.heirPlans.get(id)
		if (!plan || retained({ state, id })) continue
		state.heirPlans.delete(id)
		if (plan.primary) {
			state.heirPrimaryOwner.delete(plan.primary.rulerId)
			queue.push({ id: plan.primary.rulerId, reason: "unreachable" })
		}
		if (plan.fulfilled) continue
		if (reason === "unused") counters.cancelledUnused++
		else counters.cancelledUnreachable++
		JOURNAL.heirCancelled({ state, root: plan.root, rulerId: id, reason })
	}
	for (const { id } of queue)
		if (state.heirPlans.has(id) && !retained({ state, id }))
			counters.unreachablePlans++
	counters.retainedPeak = Math.max(counters.retainedPeak, state.heirPlans.size)
	if (state.heirPlans.size > 2 * state.rulerRealmCounts.size)
		counters.unreachablePlans++
}

export const HEIR_PLAN = {
	stats,
	ensure,
	read,
	fulfill,
	reconcile,
}
