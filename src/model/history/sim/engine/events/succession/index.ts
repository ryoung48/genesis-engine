import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type {
	InitSuccessionParams,
	PretenderParams,
	RegencyParams,
	RunSuccessionParams,
	WeakCrownParams,
} from "@/model/history/sim/engine/events/succession/types"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"

const MAX_CLAIM = 3
const WEAK_CLAIM_LAXITY = 0.05
const MINOR_LAXITY = 0.1

function initSuccession({ state }: InitSuccessionParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (!STATE.isSovereign({ state, p })) continue
		// Schedule succession at leader's death
		state.heap.enqueue(
			state.leaderRuntime.end[p],
			EVENT_HEAP.evt.SUCCESSION,
			p,
			state.leaderRuntime.idx[p],
		)
	}
}

function regency({ state, p }: RegencyParams): void {
	const age = STATE.diffYears({
		a: state.time,
		b: state.leaderRuntime.birth[p],
	})
	if (age < 16 && STATE.isSovereign({ state, p })) {
		state.events.push({
			tag: "regency started",
			time: state.time,
			data: {
				nation: p,
				leader: state.leaderRuntime.idx[p],
				age: Math.round(age),
			},
		})
		const regencyEndTime = state.leaderRuntime.birth[p] + STATE.deltaYear(16)
		if (regencyEndTime < state.leaderRuntime.end[p]) {
			state.heap.enqueue(
				regencyEndTime,
				EVENT_HEAP.evt.REGENCY,
				p,
				state.leaderRuntime.idx[p],
			)
		}
	}
}

// A passed-over claimant holding a district takes it out of the realm and fights
// for the throne.
function pretenderRevolt({ state, realm, seat, rng }: PretenderParams): void {
	if (seat < 0 || FIELDS.prov.parent.get({ state, p: seat }) !== realm) return
	const pretender = state.people.rulerOf[seat]
	state.events.push({
		tag: "rebellion",
		time: state.time,
		data: { overlord: realm, subject: seat, succession: true, pretender },
	})
	STATE.releaseProvince({ state, p: seat, rng })
	STATE.startWar({ state, attacker: realm, defender: seat, rng, rebel: true })
	STATE.fixConnections({ state, nation: realm, rng })
}

// Each district re-tests its rebellion threat when the crown changes hands; the
// bar drops for a child ruler or a weak claim. At most one district breaks away.
function weakCrownRevolt({ state, realm, claim, rng }: WeakCrownParams): void {
	const age = STATE.diffYears({
		a: state.time,
		b: state.leaderRuntime.birth[realm],
	})
	const laxity =
		WEAK_CLAIM_LAXITY * (MAX_CLAIM - claim) + (age < 16 ? MINOR_LAXITY : 0)
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
	if (!STATE.isSovereign({ state, p: province })) {
		PEOPLE.vacate({ people: state.people, seat: province })
		return
	}

	const choice = SUCCESSION_SYSTEMS.choose({
		state,
		realm: province,
		dying: state.people.rulerOf[province],
		rng,
	})
	if (choice.heir >= 0)
		STATE.installRuler({
			state,
			p: province,
			person: choice.heir,
			claim: choice.claim,
		})
	else
		STATE.foundRuler({
			state,
			p: province,
			age: rng.uniform(20, 50),
			claim: choice.claim,
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
		},
	})

	// Schedule next succession
	state.heap.enqueue(
		state.leaderRuntime.end[province],
		EVENT_HEAP.evt.SUCCESSION,
		province,
		state.leaderRuntime.idx[province],
	)

	// Regency check
	regency({ state, p: province })

	if (choice.pretenderSeat >= 0)
		pretenderRevolt({ state, realm: province, seat: choice.pretenderSeat, rng })
	else weakCrownRevolt({ state, realm: province, claim: choice.claim, rng })

	STATE.considerTitles({
		state,
		nation: province,
		rng,
		revenueOf: (nation) => ECONOMY.revenue({ state, p: nation }),
	})
}

export const SUCCESSION = {
	initSuccession,
	runSuccession,
}
