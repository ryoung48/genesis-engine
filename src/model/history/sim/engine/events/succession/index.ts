import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import { ACCESSION } from "@/model/history/sim/engine/events/succession/accession"
import { CORONATION } from "@/model/history/sim/engine/events/succession/coronation"
import { INTERREGNUM } from "@/model/history/sim/engine/events/succession/interregnum"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type {
	ForeignClaimParams,
	PretenderRevoltParams,
	RealmRngParams,
	RunSuccessionParams,
	RunYearParams,
	Successor,
	SuccessorParams,
	WeakCrownParams,
} from "@/model/history/sim/engine/events/succession/types"
import { WAR } from "@/model/history/sim/engine/events/war"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_GOVERNMENT } from "@/model/history/sim/engine/state/government"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { GOVERNMENT } from "@/model/history/sim/nations/government"

const MAX_CLAIM = 3
const WEAK_CLAIM_LAXITY = 0.05
// Yearly chance that a regency council's protector seizes the throne: 57
// usurpations over 8,798 regency-years on the person model.
const USURP_CHANCE = 0.0065
// 53 of those 57 usurpers were kinsmen of the ward.
const USURPER_KINSMAN_SHARE = 0.93
// A usurping kinsman keeps the house's claim; a lord protector has none.
const KINSMAN_USURPER_CLAIM = 1
const PRETENDER_CLAIM = 3
// A daughter's line takes the throne of a marriage partner's ruler in 20 of
// every 100 such successions: 78 unions standing at 6.1 union juniors on
// average over 933 years, less 8 from claim wars, over about 350 daughter-line
// successions with a tie.
const UNION_INHERIT_CHANCE = 0.2

// A pretender takes the most populous district out of the realm, with the
// districts that back it, and fights for the throne.
function pretenderRevolt({
	state,
	realm,
	dynasty,
	supporters,
	rng,
}: PretenderRevoltParams): void {
	const seats = SUCCESSION_SYSTEMS.districts({ state, realm })
		.map((seat) => ({
			seat,
			population: STATE.getNationPopulation({ state, root: seat }),
		}))
		.sort((a, b) => b.population - a.population || a.seat - b.seat)
		.map(({ seat }) => seat)
	const [leader, ...others] = seats
	if (leader === undefined) return
	STATE.releaseFaction({
		state,
		p: leader,
		supporters: others.filter(() => rng.random() < supporters),
		ruler: { dynasty, age: "fresh", claim: PRETENDER_CLAIM },
		rng,
	})
	state.events.push({
		tag: "rebellion",
		time: state.time,
		data: {
			overlord: realm,
			subject: leader,
			goal: "throne",
			succession: true,
			pretender: true,
			...STATE_RULERS.noteFields({
				prefix: "pretender",
				ref: STATE_RULERS.ref({
					state,
					ruler: STATE_RULERS.read({ state, p: leader }),
				}),
			}),
		},
	})
	WAR.start({ state, attacker: leader, defender: realm, rng, goal: "throne" })
	STATE.fixConnections({ state, nation: realm, rng })
}

// Each district re-tests its rebellion threat when the crown changes hands; the
// bar drops for a weak crown or a weak claim. At most one district breaks away.
function weakCrownRevolt({ state, realm, claim, rng }: WeakCrownParams): void {
	const laxity =
		WEAK_CLAIM_LAXITY * (MAX_CLAIM - claim) +
		(REGENCY.weak({ state, realm }) ? REGENCY.laxity : 0)
	for (const subject of rng.shuffle(
		SUCCESSION_SYSTEMS.districts({ state, realm }),
	))
		if (
			WAR.rebel({
				state,
				overlord: realm,
				subject,
				laxity,
				succession: true,
				rng,
			})
		)
			break
	STATE.fixConnections({ state, nation: realm, rng })
}

// The marriage partner whose ruler's realm still stands as it was presses the
// claim of a minor's crown.
function pressForeignClaim({
	state,
	realm,
	claimant,
	rng,
}: ForeignClaimParams): void {
	if (
		!STATE.isSovereign({ state, p: claimant.realm }) ||
		state.leaderRuntime.rulerId[claimant.realm] !== claimant.ruler.rulerId ||
		STATE.isPressing({ state, p: claimant.realm }) ||
		STATE.isPressing({ state, p: realm }) ||
		!STATE.canUnite({ state, a: realm, b: claimant.realm })
	)
		return
	WAR.pressClaim({ state, attacker: claimant.realm, defender: realm, rng })
}

// Who takes the throne. A daughter's line brings the crown through a marriage:
// the partner's own ruler, forming a union, or a ruler of the partner's house.
function successorOf({
	state,
	realm,
	late,
	partners,
	choice,
	rng,
}: SuccessorParams): Successor {
	if (choice.house === "other" && partners.length > 0) {
		const partner = rng.choice(partners)
		if (
			rng.random() < UNION_INHERIT_CHANCE &&
			!STATE.isPressing({ state, p: partner.realm }) &&
			!STATE.isPressing({ state, p: realm }) &&
			STATE.canUnite({ state, a: realm, b: partner.realm })
		)
			return { ruler: partner.ruler, union: partner }
		return {
			ruler: STATE_RULERS.draw({
				state,
				p: realm,
				dynasty: partner.ruler.dynasty,
				age: choice.age,
				rng,
			}),
			union: null,
		}
	}
	return {
		ruler: STATE_RULERS.draw({
			state,
			p: realm,
			dynasty: choice.house === "same" ? late.dynasty : -1,
			age: choice.age,
			rng,
		}),
		union: null,
	}
}

function runSuccession({
	state,
	realm,
	leaderIdx,
	rng,
}: RunSuccessionParams): void {
	if (
		state.leaderRuntime.idx[realm] !== leaderIdx ||
		!STATE.isSovereign({ state, p: realm }) ||
		STATE.isUnionJunior({ state, p: realm }) ||
		!STATE_RULERS.has({ state, p: realm })
	)
		return
	STATE_RULERS.endRegency({ state, realm, cause: "death" })
	const late = STATE_RULERS.read({ state, p: realm })
	const lateRef = STATE_RULERS.ref({ state, ruler: late })
	const partners = ROYAL_MARRIAGE.partnersOf({ state, realm })
	const choice = SUCCESSION_SYSTEMS.choose({ state, realm, rng })
	const successor = successorOf({ state, realm, late, partners, choice, rng })
	const interregnum = choice.interregnum
		? INTERREGNUM.begin({ state, realm, late: lateRef, rng })
		: null
	STATE.seatRuler({
		state,
		p: realm,
		ruler: successor.ruler,
		claim: choice.claim,
		natural: true,
		rng,
	})
	if (successor.union)
		STATE.unite({
			state,
			a: realm,
			b: successor.union.realm,
			ruler: successor.ruler,
			claim: choice.claim,
			rng,
		})
	const successorRef = STATE_RULERS.ref({ state, ruler: successor.ruler })
	state.events.push({
		tag: "succession",
		time: state.time,
		data: {
			nation: realm,
			leader: leaderIdx,
			successor: state.leaderRuntime.idx[realm],
			claim: choice.claim,
			system: choice.system,
			house: choice.house,
			interregnum: choice.interregnum,
			minor: state.regency[realm] === 1,
			cause: "natural",
			...STATE_RULERS.noteFields({ prefix: "dying", ref: lateRef }),
			...STATE_RULERS.noteFields({ prefix: "heir", ref: successorRef }),
		},
	})
	if (interregnum) INTERREGNUM.finish({ run: interregnum, ruler: successorRef })
	const divided =
		PARTITION.divide({
			state,
			realm,
			juniors: choice.juniors,
			late: lateRef,
			primary: successorRef,
			rng,
		}) > 0 || interregnum !== null
	if (!divided) {
		const minor = state.regency[realm] === 1
		const pretender = SUCCESSION_SYSTEMS.pretender({
			state,
			realm,
			system: choice.system,
			disputed: minor || choice.daughterLine,
		})
		if (
			SUCCESSION_SYSTEMS.districts({ state, realm }).length > 0 &&
			rng.random() < pretender.chance
		)
			pretenderRevolt({
				state,
				realm,
				dynasty: choice.system === "election" ? -1 : late.dynasty,
				supporters: pretender.supporters,
				rng,
			})
		else weakCrownRevolt({ state, realm, claim: choice.claim, rng })
		if (minor && partners.length > 0)
			pressForeignClaim({ state, realm, claimant: rng.choice(partners), rng })
	}
	ACCESSION.settle({
		state,
		realm,
		rng,
		elected: choice.system === "election",
		previousHouse: late.dynasty,
	})
}

// The regency council's protector takes the throne. A kinsman of the ward keeps
// the house's claim; any other protector founds a house with none.
function usurp({ state, realm, rng }: RealmRngParams): void {
	const ward = STATE_RULERS.read({ state, p: realm })
	const wardRef = STATE_RULERS.ref({ state, ruler: ward })
	const kinsman = rng.random() < USURPER_KINSMAN_SHARE
	STATE_RULERS.endRegency({ state, realm, cause: "usurpation" })
	const usurper = STATE_RULERS.draw({
		state,
		p: realm,
		dynasty: kinsman ? ward.dynasty : -1,
		age: "fresh",
		rng,
	})
	const claim = kinsman ? KINSMAN_USURPER_CLAIM : 0
	state.events.push({
		tag: "usurpation",
		time: state.time,
		data: {
			nation: realm,
			kinsman,
			...STATE_RULERS.noteFields({ prefix: "ward", ref: wardRef }),
			...STATE_RULERS.noteFields({
				prefix: "usurper",
				ref: STATE_RULERS.ref({ state, ruler: usurper }),
			}),
		},
	})
	STATE.seatRuler({
		state,
		p: realm,
		ruler: usurper,
		claim,
		natural: false,
		rng,
	})
	if (!kinsman) weakCrownRevolt({ state, realm, claim, rng })
	ACCESSION.settle({
		state,
		realm,
		rng,
		elected: false,
		previousHouse: ward.dynasty,
	})
}

function runYear({ state, rng }: RunYearParams): void {
	for (let realm = 0; realm < state.P; realm++)
		if (
			state.regency[realm] &&
			STATE.isSovereign({ state, p: realm }) &&
			rng.random() < USURP_CHANCE
		)
			usurp({ state, realm, rng })
	for (const realm of state.electionStreaks.keys()) {
		if (!STATE.isSovereign({ state, p: realm }))
			state.electionStreaks.delete(realm)
	}
	for (let realm = 0; realm < state.P; realm++) {
		if (
			state.desolate[realm] ||
			state.stateless[realm] ||
			!STATE.isSovereign({ state, p: realm })
		)
			continue
		const government = state.governmentType[realm]
		if (
			government !== GOVERNMENT.getGovIdx().feudal_monarchy &&
			government !== GOVERNMENT.getGovIdx().elective_monarchy
		)
			continue
		const transition = STATE_GOVERNMENT.yearly({
			state,
			realm,
			provinces: STATE.getNationProvinces({ state, root: realm }),
			rng,
		})
		if (transition) STATE.reconcileGovernment({ state, realm, transition, rng })
	}
	CORONATION.elevate({ state, rng })
}

export const SUCCESSION = {
	runSuccession: (params: RunSuccessionParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => runSuccession(params),
		}),
	runYear: (params: RunYearParams) =>
		MILITARY.mutate({ state: params.state, action: () => runYear(params) }),
}
