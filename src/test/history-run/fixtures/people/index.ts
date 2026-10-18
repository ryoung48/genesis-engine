import { HISTORY } from "@/model/history/record"
import { PEOPLE_STORE } from "@/model/people/store"
import type {
	PeopleFixture,
	PeopleFixtureParams,
} from "@/test/history-run/fixtures/people/types"
import { PEOPLE_INPUT } from "@/test/people-run/input"

function create({ years, points }: PeopleFixtureParams): PeopleFixture {
	const input = PEOPLE_INPUT.build({
		history: { seed: 14963991, era: "lateMedieval", numPoints: points },
		years,
		fresh: false,
	})
	return {
		...input,
		store: PEOPLE_STORE.of({ record: input.state.record }),
		frameAt: (timeMs) => HISTORY.frameAt({ state: input.state, timeMs }),
	}
}

export const PEOPLE_FIXTURE = { create }
