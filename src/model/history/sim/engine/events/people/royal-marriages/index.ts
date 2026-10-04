import type {
	AllianceMatchParams,
	PairKeyParams,
	ReviewParams,
} from "@/model/history/sim/engine/events/people/royal-marriages/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { Relation } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { HOUSEHOLD } from "@/model/history/sim/people/household"

const UNALLIABLE = new Set<Relation>([
	STATE.rel.WAR,
	STATE.rel.OVERLORD,
	STATE.rel.VASSAL,
	STATE.rel.PU_SENIOR,
	STATE.rel.PU_JUNIOR,
	STATE.rel.COLONY,
])

function pairKey({ state, a, b }: PairKeyParams): number {
	return Math.min(a, b) * state.P + Math.max(a, b)
}

// A match between the ruling families of two realms that marry for alliance,
// neither at war nor in a subject or union bond, can ally them.
function alliable({ state, match }: AllianceMatchParams): boolean {
	const people = state.people
	const { a, b, realmA, realmB } = match
	if (!STATE.canAlly({ state, a: realmA, b: realmB })) return false
	for (const realm of [realmA, realmB]) {
		if (!STATE.isSovereign({ state, p: realm })) return false
		if (!GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm]))
			return false
	}
	const rulerA = people.rulerOf[realmA]
	const rulerB = people.rulerOf[realmB]
	if (rulerA < 0 || rulerB < 0) return false
	if (!PEOPLE.family({ people, person: rulerA }).includes(a)) return false
	if (!PEOPLE.family({ people, person: rulerB }).includes(b)) return false
	return !UNALLIABLE.has(STATE.getRelation({ state, a: realmA, b: realmB }))
}

// A marriage or betrothal between such families makes the realms allies, or
// binds an alliance they already have. Returns whether an alliance holds.
function allianceFromMatch({ state, match }: AllianceMatchParams): boolean {
	const people = state.people
	if (!alliable({ state, match })) return false
	const { a, b, realmA, realmB } = match
	const key = pairKey({ state, a: realmA, b: realmB })
	if (people.marriageAlliances.has(key)) return true
	STATE.setRelation({ state, a: realmA, b: realmB, rel: STATE.rel.ALLY })
	STATE.setDisposition({
		state,
		a: realmA,
		b: realmB,
		disposition: STATE.disp.TRUSTED,
	})
	people.marriageAlliances.set(key, { first: realmA, second: realmB })
	state.events.push({
		tag: "marriage alliance",
		time: state.time,
		data: { first: realmA, second: realmB, spouses: [a, b] },
	})
	return true
}

// A marriage alliance ends once no living marriage or betrothal joins the two
// ruling families, or the realms stop being sovereign allies. The alliance
// itself stays and drifts like any other. A living betrothal with no marriage
// alliance between its realms is broken; one with a dead party is left for
// the death release.
function reviewAlliances({ state }: ReviewParams): void {
	const people = state.people
	const time = state.time / STATE.yearMs
	for (const [key, { first, second }] of people.marriageAlliances) {
		const rulerA = people.rulerOf[first]
		const rulerB = people.rulerOf[second]
		const holds =
			STATE.isSovereign({ state, p: first }) &&
			STATE.isSovereign({ state, p: second }) &&
			rulerA >= 0 &&
			rulerB >= 0 &&
			STATE.getRelation({ state, a: first, b: second }) === STATE.rel.ALLY &&
			PEOPLE.tiedByMarriage({ people, a: rulerA, b: rulerB, time })
		if (holds) continue
		people.marriageAlliances.delete(key)
		state.events.push({
			tag: "marriage alliance ended",
			time: state.time,
			data: { first, second },
		})
	}
}

function review({ state }: ReviewParams): void {
	const people = state.people
	const time = state.time / STATE.yearMs
	reviewAlliances({ state })
	const table = people.persons
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner < person) continue
		if (
			!PEOPLE.aliveAt({ people, person, time }) ||
			!PEOPLE.aliveAt({ people, person: partner, time })
		)
			continue
		const key = pairKey({
			state,
			a: HOUSEHOLD.realmOf({ people, person: person }),
			b: HOUSEHOLD.realmOf({ people, person: partner }),
		})
		if (!people.marriageAlliances.has(key))
			BETROTHAL.release({ people, person, time, cause: "alliance" })
	}
	reviewAlliances({ state })
}

export const ROYAL_MARRIAGES = { alliable, allianceFromMatch, review }
