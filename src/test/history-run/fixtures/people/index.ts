import type {
	PeopleFixture,
	PeopleFixtureParams,
} from "@/test/history-run/fixtures/people/types"
import { PEOPLE_INPUT } from "@/test/people-run/input"

function create({ years, points }: PeopleFixtureParams): PeopleFixture {
	return PEOPLE_INPUT.build({
		history: { seed: 14963991, era: "lateMedieval", numPoints: points },
		years,
		fresh: false,
	})
}

export const PEOPLE_FIXTURE = { create }
