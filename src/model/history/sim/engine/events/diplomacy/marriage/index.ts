import { DIPLOMATIC_FORMATION } from "@/model/history/sim/engine/events/diplomacy/formation"
import type {
	FormYearParams,
	MarriagePartner,
	PairParams,
	RealmParams,
	RunYearParams,
	StateParams,
} from "@/model/history/sim/engine/events/diplomacy/marriage/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import type {
	Disposition,
	Relation,
} from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"

const MARRIAGE_CHANCE = DIPLOMATIC_FORMATION.chance({ base: 0.055 })
// Each tie a realm already holds halves its chance of another, and a partner's
// chance of accepting one. An assumption: monogamous rulers rarely take further
// royal marriages, but kings did marry again across generations.
const TIE_RETURN = 0.5
// Keep the three-pass warm-up; the formation scale also applies here.
const SEED_YEARS = 3
// The half-formation report still seeded 107 tied realms against a target
// near 90; this init-only factor compensates for newly eligible free realms.
const SEED_FORMATION_SCALE = 0.8

const UNALLIABLE = new Set<Relation>([
	STATE.rel.WAR,
	STATE.rel.OVERLORD,
	STATE.rel.VASSAL,
	STATE.rel.PU_SENIOR,
	STATE.rel.PU_JUNIOR,
	STATE.rel.COLONY,
])
const DISPOSITION_RANK: Record<Disposition, number> = {
	RIVAL: 0,
	SUSPICIOUS: 1,
	NEUTRAL: 2,
	FRIENDLY: 3,
	TRUSTED: 4,
}

function pairKey({ state, a, b }: PairParams): number {
	return Math.min(a, b) * state.P + Math.max(a, b)
}

function marries({ state, realm }: RealmParams): boolean {
	return (
		STATE.isSovereign({ state, p: realm }) &&
		GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm])
	)
}

function bound({ state, a, b }: PairParams): boolean {
	return state.marriageTies.has(pairKey({ state, a, b }))
}

function held({ state, realm }: RealmParams): number {
	let count = 0
	for (const tie of state.marriageTies.values())
		if (tie.first === realm || tie.second === realm) count++
	return count
}

// Two sovereign realms that marry for alliance, neither at war nor in a
// subject or union bond, can be tied.
function eligible({ state, a, b }: PairParams): boolean {
	if (a === b || !marries({ state, realm: a }) || !marries({ state, realm: b }))
		return false
	if (!STATE_RULERS.has({ state, p: a }) || !STATE_RULERS.has({ state, p: b }))
		return false
	if (!STATE.canAlly({ state, a, b })) return false
	return !UNALLIABLE.has(STATE.getRelation({ state, a, b }))
}

// The realms tied to this one by a marriage that still holds, with the rulers
// they have now.
function partnersOf({ state, realm }: RealmParams): MarriagePartner[] {
	const partners: MarriagePartner[] = []
	for (const tie of state.marriageTies.values()) {
		const other =
			tie.first === realm ? tie.second : tie.second === realm ? tie.first : -1
		if (other < 0 || !STATE.isSovereign({ state, p: other })) continue
		if (!STATE_RULERS.has({ state, p: other })) continue
		partners.push({
			realm: other,
			ruler: STATE_RULERS.read({ state, p: other }),
			claim: state.leaderClaimCurrent[other],
		})
	}
	return partners.sort((x, y) => x.realm - y.realm)
}

function form({ state, a, b }: PairParams): void {
	STATE.setRelation({ state, a, b, rel: STATE.rel.ALLY })
	STATE.setDisposition({ state, a, b, disposition: STATE.disp.TRUSTED })
	state.marriageTies.set(pairKey({ state, a, b }), { first: a, second: b })
	state.events.push({
		tag: "marriage alliance",
		time: state.time,
		data: { first: a, second: b },
	})
}

// The chance a realm takes another tie: its base chance, halved for each tie
// it already holds.
function chance({ state, realm }: RealmParams): number {
	return MARRIAGE_CHANCE * acceptance({ state, realm })
}

// The chance a realm accepts a tie, halved for each tie it already holds.
function acceptance({ state, realm }: RealmParams): number {
	return TIE_RETURN ** held({ state, realm })
}

// A tie ends once either realm stops being a sovereign that marries for
// alliance, or the two stop being allies. The alliance itself stays and drifts
// like any other.
function review({ state }: StateParams): void {
	for (const [key, { first, second }] of [...state.marriageTies])
		if (
			!marries({ state, realm: first }) ||
			!marries({ state, realm: second }) ||
			STATE.getRelation({ state, a: first, b: second }) !== STATE.rel.ALLY
		)
			STATE.endMarriageAlliance({ state, key })
}

function formYear({ state, rng, formationScale }: FormYearParams): void {
	for (let realm = 0; realm < state.P; realm++) {
		if (state.desolate[realm] || !marries({ state, realm })) continue
		const partners = [
			...new Set(STATE.getNationNeighbors({ state, nation: realm })),
		]
			.filter(
				(other) =>
					eligible({ state, a: realm, b: other }) &&
					!bound({ state, a: realm, b: other }),
			)
			.sort((x, y) => x - y)
		if (partners.length === 0) continue
		if (rng.random() >= chance({ state, realm }) * formationScale) continue
		let best = partners[0]
		for (const other of partners)
			if (
				DISPOSITION_RANK[STATE.getDisposition({ state, a: realm, b: other })] >
				DISPOSITION_RANK[STATE.getDisposition({ state, a: realm, b: best })]
			)
				best = other
		if (rng.random() >= acceptance({ state, realm: best })) continue
		form({ state, a: realm, b: best })
	}
}

function runYear({ state, rng }: RunYearParams): void {
	review({ state })
	formYear({ state, rng, formationScale: 1 })
}

function seed({ state, rng }: RunYearParams): void {
	for (let year = 0; year < SEED_YEARS; year++)
		formYear({ state, rng, formationScale: SEED_FORMATION_SCALE })
}

export const ROYAL_MARRIAGE = {
	runYear,
	seed,
	review,
	partnersOf,
	bound,
	eligible,
	form,
	marries,
	chance,
	acceptance,
}
