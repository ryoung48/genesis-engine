import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PATRICIANS } from "@/model/history/sim/engine/events/people/patricians"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import { STRESS_EVENTS } from "@/model/history/sim/engine/events/people/stress"
import type {
	EndEarlyParams,
	PeopleEventParams,
	SettleMatchesParams,
	StateParams,
} from "@/model/history/sim/engine/events/people/types"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { SUCCESSION_SCHEDULE } from "@/model/history/sim/engine/events/succession/schedule"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { FAMILY } from "@/model/history/sim/people/family"
import type {
	CrossMatch,
	MarriageRealms,
} from "@/model/history/sim/people/types"

// Every royal child aged 12-15 at the start seeks a betrothal once. The start
// still holds about a third fewer standing betrothals than years 20-30.
const START_BETROTHAL_SHARE = 1

function nextYear({ state }: PeopleEventParams): void {
	state.heap.enqueue(
		state.time + STATE.deltaYear(1),
		EVENT_HEAP.evt.PEOPLE_YEAR,
		0,
		0,
	)
}

// A death moved earlier: the person's reigns end and their regencies pass on
// at the new date.
function endEarly({ state, person }: EndEarlyParams): void {
	const people = state.people
	for (const seat of people.persons.heldSeats[person]) {
		if (!STATE.isSovereign({ state, p: seat })) continue
		state.leaderRuntime.end[seat] = Math.max(
			state.time,
			people.persons.death[person] * STATE.yearMs,
		)
	}
	SUCCESSION_SCHEDULE.ensure({ state, person })
	for (const [realm, regency] of people.regencies)
		if (regency.regent === person)
			REGENCY.scheduleRegentDeath({ state, realm, regent: person })
}

function marriageRealms({ state }: StateParams): MarriageRealms {
	return {
		neighborsOf: (realm) =>
			STATE.isSovereign({ state, p: realm })
				? STATE.getNationNeighbors({ state, nation: realm })
				: [],
		originOf: (realm) => STATE.originOf({ state, realm }),
		royal: (realm) =>
			STATE.isSovereign({ state, p: realm }) &&
			GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm]),
		alliable: (match: CrossMatch) => ROYAL_MARRIAGES.alliable({ state, match }),
	}
}

function sovereignRulers({ state }: StateParams): number[] {
	const people = state.people
	const rulers: number[] = []
	for (let seat = 0; seat < state.P; seat++)
		if (people.rulerOf[seat] >= 0 && STATE.isSovereign({ state, p: seat }))
			rulers.push(people.rulerOf[seat])
	return rulers
}

// Marriage alliances from the year's matches, and heiress unions from its
// weddings. A betrothal whose alliance cannot hold is broken at once.
function settleMatches({ state, matches }: SettleMatchesParams): void {
	const people = state.people
	for (const match of matches.betrothals)
		if (!ROYAL_MARRIAGES.allianceFromMatch({ state, match }))
			BETROTHAL.release({
				people,
				person: match.a,
				time: state.time / STATE.yearMs,
				cause: "alliance",
			})
	for (const match of matches.weddings) {
		ROYAL_MARRIAGES.allianceFromMatch({ state, match })
		if (people.rulerOf[match.realmA] === match.a)
			STATE.uniteCouple({ state, p: match.realmA, person: match.a })
	}
}

function init({ state, rng }: PeopleEventParams): void {
	DISTRICTS.grant({ state, rng })
	ROYAL_MARRIAGES.seed({ state, rng })
	settleMatches({
		state,
		matches: FAMILY.seekMatches({
			people: state.people,
			time: state.time / STATE.yearMs,
			seekers: [],
			sovereigns: sovereignRulers({ state }),
			minorChance: START_BETROTHAL_SHARE,
			rng,
			...marriageRealms({ state }),
		}),
	})
	PATRICIANS.settle({ state, rng })
	nextYear({ state, rng })
}

function runYear({ state, rng }: PeopleEventParams): void {
	STRESS_EVENTS.runYear({ state })
	DISTRICTS.settle({ state, rng })
	DISTRICTS.grant({ state, rng })
	ROYAL_MARRIAGES.review({ state })
	PATRICIANS.settle({ state, rng })
	const people = state.people
	const rulers: number[] = []
	for (let seat = 0; seat < state.P; seat++)
		if (people.rulerOf[seat] >= 0) rulers.push(people.rulerOf[seat])
	for (const heads of people.patricians.values()) rulers.push(...heads)
	const { shortened, ...matches } = FAMILY.runYear({
		people,
		time: state.time / STATE.yearMs,
		rulers,
		sovereigns: sovereignRulers({ state }),
		rng,
		...marriageRealms({ state }),
	})
	for (const person of shortened) endEarly({ state, person })
	settleMatches({ state, matches })
	ROYAL_MARRIAGES.review({ state })
	nextYear({ state, rng })
}

export const PEOPLE_EVENTS = { init, runYear }
