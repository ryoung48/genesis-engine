import { ECONOMY } from "@/model/history/sim/engine/economy"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { RESTORATION } from "@/model/history/sim/engine/events/succession/restoration"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type {
	InitSuccessionParams,
	PretenderParams,
	RealmParams,
	RealmRngParams,
	RunSuccessionParams,
	RunYearParams,
	WeakCrownParams,
} from "@/model/history/sim/engine/events/succession/types"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"

const MAX_CLAIM = 3
const WEAK_CLAIM_LAXITY = 0.05
// Yearly chance that an ambitious regent seizes the throne, doubled for a
// kinsman who holds a district of the realm.
const USURP_CHANCE = 0.03
// A usurping kinsman keeps the house's claim; a lord protector has none.
const KINSMAN_USURPER_CLAIM = 1
const RESTORED_CLAIM = 3

function initSuccession({ state }: InitSuccessionParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (!STATE.isSovereign({ state, p })) continue
		STATE.scheduleSuccession({ state, p })
		REGENCY.startMinority({ state, realm: p })
	}
}

// A passed-over claimant, or a deposed ruler's line, takes a district out of
// the realm and fights for the throne. The claimant rules the rebel realm even
// when the district was a backer's.
function pretenderRevolt({
	state,
	realm,
	seat,
	supportingSeats,
	pretender,
	restoration,
	rng,
}: PretenderParams): void {
	if (seat < 0 || FIELDS.prov.parent.get({ state, p: seat }) !== realm) return
	state.events.push({
		tag: "rebellion",
		time: state.time,
		data: {
			overlord: realm,
			subject: seat,
			goal: "throne",
			succession: true,
			pretender,
			restoration,
		},
	})
	STATE.releaseFaction({
		state,
		p: seat,
		supporters: supportingSeats,
		rng,
		reason: restoration ? "restoration" : "rebellion",
	})
	if (state.people.rulerOf[seat] !== pretender) {
		STATE.installRuler({
			state,
			p: seat,
			person: pretender,
			claim: RESTORED_CLAIM,
			reason: restoration ? "restoration" : "rebellion",
		})
		STATE.scheduleSuccession({ state, p: seat })
	}
	WAR.start({ state, attacker: seat, defender: realm, rng, goal: "throne" })
	STATE.fixConnections({ state, nation: realm, rng })
}

function restore({ state, realm, rng }: RealmRngParams): void {
	const revolt = RESTORATION.attempt({ state, realm, rng })
	if (revolt)
		pretenderRevolt({
			state,
			realm,
			seat: revolt.seat,
			supportingSeats: revolt.supportingSeats,
			pretender: revolt.claimant,
			restoration: true,
			rng,
		})
}

// Each district re-tests its rebellion threat when the crown changes hands; the
// bar drops for a weak crown or a weak claim. At most one district breaks away.
function weakCrownRevolt({ state, realm, claim, rng }: WeakCrownParams): void {
	const laxity =
		WEAK_CLAIM_LAXITY * (MAX_CLAIM - claim) +
		(REGENCY.weak({ state, realm }) ? REGENCY.laxity : 0)
	const districts = rng
		.shuffle(STATE.getChildren({ state, p: realm }))
		.filter(
			(seat) => state.seatRank[seat] > 0 && state.people.rulerOf[seat] >= 0,
		)
	for (const subject of districts)
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

function runSuccession({
	state,
	province,
	leaderIdx,
	rng,
}: RunSuccessionParams): void {
	if (state.leaderRuntime.idx[province] !== leaderIdx) return
	REGENCY.end({ state, realm: province, cause: "death" })
	if (!STATE.isSovereign({ state, p: province })) {
		PEOPLE.vacate({
			people: state.people,
			seat: province,
			reason: "succession",
		})
		return
	}

	const dying = state.people.rulerOf[province]
	const choice = SUCCESSION_SYSTEMS.choose({
		state,
		realm: province,
		dying,
		rng,
	})
	if (choice.heir >= 0)
		STATE.installRuler({
			state,
			p: province,
			person: choice.heir,
			claim: choice.claim,
			reason: "succession",
		})
	else
		STATE.foundRuler({
			state,
			p: province,
			age: rng.uniform(20, 50),
			claim: choice.claim,
			reason: "succession",
			rng,
		})
	// A union junior can merge into its senior while taking the new ruler.
	if (!STATE.isSovereign({ state, p: province })) return

	state.events.push({
		tag: "succession",
		time: state.time,
		data: {
			nation: province,
			leader: leaderIdx,
			successor: state.leaderRuntime.idx[province],
			dying,
			claim: choice.claim,
		},
	})

	STATE.scheduleSuccession({ state, p: province })
	REGENCY.startMinority({ state, realm: province })

	if (choice.pretenderSeat >= 0)
		pretenderRevolt({
			state,
			realm: province,
			seat: choice.pretenderSeat,
			supportingSeats: choice.supportingSeats,
			pretender: state.people.rulerOf[choice.pretenderSeat],
			restoration: false,
			rng,
		})
	else weakCrownRevolt({ state, realm: province, claim: choice.claim, rng })
	restore({ state, realm: province, rng })

	STATE.considerTitles({
		state,
		nation: province,
		rng,
		revenueOf: (nation) => ECONOMY.revenue({ state, p: nation }),
	})
}

function usurpChance({ state, realm }: RealmParams): number {
	const regency = REGENCY.active({ state, realm })
	if (!regency) return 0
	if (regency.kind === "protector") return USURP_CHANCE
	if (regency.kind !== "relative") return 0
	const seat = state.people.persons.throne[regency.regent]
	return seat >= 0 && state.parentCurrent[seat] === realm
		? 2 * USURP_CHANCE
		: USURP_CHANCE
}

// The regent takes the throne and the child lives on as the realm's deposed
// claimant. A lord protector's own house takes the crown, and their district
// passes to it.
function usurp({ state, realm, rng }: RealmRngParams): void {
	const regency = REGENCY.active({ state, realm })
	if (!regency) return
	const { regent, ward, kind } = regency
	const people = state.people
	const district = people.persons.throne[regent]
	REGENCY.end({ state, realm, cause: "usurpation" })
	state.events.push({
		tag: "usurpation",
		time: state.time,
		data: { nation: realm, regent, ward, kind },
	})
	if (kind === "protector" && district >= 0)
		PEOPLE.vacate({ people, seat: district, reason: "usurpation" })
	const claim = kind === "relative" ? KINSMAN_USURPER_CLAIM : 0
	OVERTHROW.seize({
		state,
		realm,
		person: regent,
		claim,
		deposed: ward,
		reason: "usurpation",
	})
	if (kind === "protector") weakCrownRevolt({ state, realm, claim, rng })
	STATE.considerTitles({
		state,
		nation: realm,
		rng,
		revenueOf: (nation) => ECONOMY.revenue({ state, p: nation }),
	})
}

function runYear({ state, rng }: RunYearParams): void {
	REGENCY.review({ state })
	for (const realm of [...state.people.regencies.keys()]) {
		const chance = usurpChance({ state, realm })
		if (chance > 0 && rng.random() < chance) usurp({ state, realm, rng })
	}
	for (const realm of RESTORATION.due({ state })) restore({ state, realm, rng })
}

export const SUCCESSION = {
	initSuccession,
	runSuccession,
	runYear,
}
