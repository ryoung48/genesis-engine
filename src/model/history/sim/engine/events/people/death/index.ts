import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import type {
	DeathEffectParams,
	KillParams,
	MarkParams,
	RunDeathParams,
} from "@/model/history/sim/engine/events/people/death/types"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"

// The death becomes fact: its row is written, the betrothal and marriage are
// released, and the dead mother's pending deliveries are dropped.
function before({ state, person, cause }: DeathEffectParams): void {
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	table.death[person] = Math.min(table.death[person], time)
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "death", person, time: table.death[person], cause },
	})
	BETROTHAL.release({ people, person, time, cause: "death" })
	for (const partner of table.consorts[person]) table.patron[partner] = -1
	table.consorts[person] = []
	const patron = table.patron[person]
	if (patron >= 0) {
		table.consorts[patron] = table.consorts[patron].filter(
			(partner) => partner !== person,
		)
		table.patron[person] = -1
	}
	const spouse = table.spouse[person]
	if (spouse >= 0) {
		if (table.spouse[spouse] === person) table.spouse[spouse] = -1
		table.spouse[person] = -1
	}
	state.lifecycle.cancelledDeliveries += FERTILITY.cancelForDeath({
		people,
		person,
	})
}

// A stale or replaced token does nothing; an accepted one applies the death
// once: its effects, the frozen seat walk, then the regencies the person held.
// A seat that reaches someone already dead only repeats the walk.
function run({ state, person, revision, rng }: RunDeathParams): void {
	const repeat = DEATH_SCHEDULE.applied({ state, person })
	const cause = DEATH_SCHEDULE.consume({ state, person, revision })
	if (cause === null) {
		state.lifecycle.staleDeaths++
		return
	}
	try {
		if (!repeat) {
			state.lifecycle.deaths++
			before({ state, person, cause })
		}
		// Most of the dead hold nothing and govern for nobody.
		if (state.people.persons.heldSeats[person].length > 0)
			SUCCESSION.succeedPerson({
				state,
				person,
				context: { accountedEdges: new Set(), cause },
				rng,
			})
		if (!repeat) REGENCY.regentDied({ state, regent: person })
	} finally {
		DEATH_SCHEDULE.finish({ state, person })
	}
}

// Moves the death to now and replaces the pending token; the queued one goes
// stale.
function mark({ state, person, cause }: MarkParams): void {
	PEOPLE.shortenLife({
		people: state.people,
		person,
		time: state.time / STATE.yearMs,
	})
	DEATH_SCHEDULE.ensure({ state, person, cause })
}

function kill({ state, person, cause, rng }: KillParams): void {
	mark({ state, person, cause })
	run({
		state,
		person,
		revision: DEATH_SCHEDULE.revisionOf({ state, person }),
		rng,
	})
}

export const PERSON_DEATH = {
	run: (params: RunDeathParams) =>
		MILITARY.mutate({ state: params.state, action: () => run(params) }),
	mark,
	kill: (params: KillParams) =>
		MILITARY.mutate({ state: params.state, action: () => kill(params) }),
}
