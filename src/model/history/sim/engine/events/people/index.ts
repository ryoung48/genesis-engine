import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PATRICIANS } from "@/model/history/sim/engine/events/people/patricians"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import type {
	EndEarlyParams,
	PeopleEventParams,
} from "@/model/history/sim/engine/events/people/types"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { FAMILY } from "@/model/history/sim/people/family"

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
	for (let seat = 0; seat < state.P; seat++) {
		if (people.rulerOf[seat] !== person) continue
		if (!STATE.isSovereign({ state, p: seat })) continue
		state.leaderRuntime.end[seat] = Math.max(
			state.time,
			people.persons.death[person] * STATE.yearMs,
		)
		STATE.scheduleSuccession({ state, p: seat })
	}
	for (const [realm, regency] of people.regencies)
		if (regency.regent === person)
			REGENCY.scheduleRegentDeath({ state, realm, regent: person })
}

function init({ state, rng }: PeopleEventParams): void {
	DISTRICTS.grant({ state, rng })
	ROYAL_MARRIAGES.seed({ state, rng })
	PATRICIANS.settle({ state, rng })
	nextYear({ state, rng })
}

function runYear({ state, rng }: PeopleEventParams): void {
	DISTRICTS.settle({ state, rng })
	DISTRICTS.grant({ state, rng })
	ROYAL_MARRIAGES.review({ state })
	PATRICIANS.settle({ state, rng })
	const people = state.people
	const rulers: number[] = []
	const sovereigns: number[] = []
	for (let seat = 0; seat < state.P; seat++) {
		if (people.rulerOf[seat] < 0) continue
		rulers.push(people.rulerOf[seat])
		if (STATE.isSovereign({ state, p: seat }))
			sovereigns.push(people.rulerOf[seat])
	}
	for (const heads of people.patricians.values()) rulers.push(...heads)
	const { weddings, shortened } = FAMILY.runYear({
		people,
		time: state.time / STATE.yearMs,
		rulers,
		sovereigns,
		neighborsOf: (realm) =>
			STATE.isSovereign({ state, p: realm })
				? STATE.getNationNeighbors({ state, nation: realm })
				: [],
		originOf: (realm) => STATE.originOf({ state, realm }),
		royal: (realm) =>
			STATE.isSovereign({ state, p: realm }) &&
			GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm]),
		rng,
	})
	for (const person of shortened) endEarly({ state, person })
	for (const wedding of weddings) {
		ROYAL_MARRIAGES.allianceFromWedding({ state, wedding })
		if (people.rulerOf[wedding.realmA] === wedding.a)
			STATE.uniteCouple({ state, p: wedding.realmA, person: wedding.a })
	}
	nextYear({ state, rng })
}

export const PEOPLE_EVENTS = { init, runYear }
