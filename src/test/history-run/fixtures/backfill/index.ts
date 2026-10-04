import { PEOPLE } from "@/model/history/sim/people"
import { STARTING_FAMILY } from "@/model/history/sim/people/family/starting"
import { STARTING_ANCHORS } from "@/model/history/sim/people/family/starting/anchors"
import type {
	BackfillFixture,
	BackfillFixtureParams,
} from "@/test/history-run/fixtures/backfill/types"

function create({
	seed,
	genderSystem,
	age,
	sovereign,
}: BackfillFixtureParams): BackfillFixture {
	const people = PEOPLE.create(8)
	people.household.time = () => 100
	const house = STARTING_ANCHORS.house({
		seed,
		path: [0, 0],
		seat: 0,
		origin: { realm: 0, culture: 0, genderSystem },
		time: 100,
		age,
		rank: 2,
		sovereign,
	})
	STARTING_ANCHORS.materialize({
		people,
		seed,
		anchors: house.predecessor
			? [house.holder, house.predecessor]
			: [house.holder],
	})
	STARTING_FAMILY.materialize({ people, house })
	return { people, house }
}

export const BACKFILL_FIXTURE = { create }
