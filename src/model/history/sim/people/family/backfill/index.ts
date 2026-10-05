import { CHARACTER } from "@/model/history/sim/people/character"
import type { BackfillPairParams } from "@/model/history/sim/people/family/backfill/types"
import { MATCH_SCORING } from "@/model/history/sim/people/family/match-scoring"
import type { MarriageCandidateContext } from "@/model/history/sim/people/family/match-scoring/types"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import type {
	OpinionContext,
	OpinionPerson,
} from "@/model/history/sim/people/opinion/types"

function acceptable({ people, a, b, time }: BackfillPairParams): boolean {
	const table = people.persons
	if (KINSHIP.prohibitedMatch({ context: table, a, b, cache: null }))
		return false
	const context: OpinionContext = {
		personOf: (id): OpinionPerson | null => {
			if (id < 0 || id >= table.sex.length || table.birth[id] > time)
				return null
			return {
				id,
				character: CHARACTER.of({ people, person: id }),
				age: time - table.birth[id],
				culture: table.culture[id],
				heritage: people.household.heritageOfCulture(table.culture[id]),
				religion: people.household.religionOfRealm(
					HOUSEHOLD.realmOf({ people, person: id }),
				),
				sovereignSeats: [],
				districtSovereigns: [],
			}
		},
		kinship: table,
		married: () => false,
		memoriesOf: () => [],
	}
	const candidateOf = (person: number): MarriageCandidateContext => ({
		currentStanding: HOLDINGS.standing({
			people,
			person,
			ranks: people.household.ranks(),
		}),
		projectedStanding: 0,
		sovereignTiers: [],
		attractionModifier: 0,
	})
	const params = { time, context, candidateOf, alliance: false, allied: false }
	const first = MATCH_SCORING.score({ ...params, observer: a, target: b })
	const second = MATCH_SCORING.score({ ...params, observer: b, target: a })
	return (
		first !== null && second !== null && first.total >= 0 && second.total >= 0
	)
}

export const BACKFILL_MARRIAGE = { acceptable }
