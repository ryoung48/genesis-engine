import type {
	LiveOpinionContextParams,
	OpinionPoliticsTotals,
} from "@/model/history/sim/engine/opinion-context/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { CHARACTER } from "@/model/history/sim/people/character"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import type { OpinionMemory } from "@/model/history/sim/people/opinion/memory/types"
import type {
	OpinionContext,
	OpinionPerson,
} from "@/model/history/sim/people/opinion/types"

const NO_MEMORIES: readonly OpinionMemory[] = []

function totals(): OpinionPoliticsTotals {
	return {
		contextBuilds: 0,
		marriageCacheMisses: 0,
		loyaltyEvaluations: 0,
		loyaltyMs: 0,
		driftCalls: 0,
		driftBiased: 0,
		driftMs: 0,
		driftBands: [0, 0, 0, 0, 0],
		driftBias: 0,
		driftOriginalStep: 0,
		driftTiltedStep: 0,
	}
}

// People as the live state has them at `time`. Nothing is cached: a caller
// that asks twice across a change of roles sees the change.
function of({ state, time }: LiveOpinionContextParams): OpinionContext {
	const people = state.people
	const table = people.persons
	const personOf = (person: number): OpinionPerson | null => {
		if (
			person < 0 ||
			person >= table.sex.length ||
			table.createdAt[person] > time ||
			table.birth[person] > time
		)
			return null
		state.opinionPolitics.contextBuilds++
		const realm = HOUSEHOLD.realmOf({ people, person })
		const culture = table.culture[person]
		const seats = table.heldSeats[person].filter(
			(seat) => people.rulerOf[seat] === person,
		)
		return {
			id: person,
			character: CHARACTER.of({ people, person }),
			age: time - table.birth[person],
			culture,
			heritage: people.household.heritageOfCulture(culture),
			religion: people.household.religionOfRealm(realm),
			sovereignSeats: seats.filter((seat) =>
				STATE.isSovereign({ state, p: seat }),
			),
			districtSovereigns: seats
				.filter((seat) => STATE_TITLES.isDistrictSeat({ state, seat }))
				.map((seat) => state.parentCurrent[seat]),
		}
	}
	return {
		personOf,
		kinship: table,
		married: ({ a, b, time: at }) =>
			table.spouse[a] === b &&
			table.marriedAt[a] <= at &&
			table.death[a] > at &&
			table.death[b] > at,
		memoriesOf: ({ observer, target }) =>
			people.memories.get(observer)?.get(target) ?? NO_MEMORIES,
	}
}

export const LIVE_OPINION_CONTEXT = { of, totals }
