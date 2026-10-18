import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { NOBILITY } from "@/model/people/nobility"
import { PEOPLE_STORE } from "@/model/people/store"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import type {
	PeopleFixture,
	PeopleFixtureParams,
} from "@/test/history-run/fixtures/people/types"

const SEED = 14963991

function create({ years, points }: PeopleFixtureParams): PeopleFixture {
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed: SEED,
		era: "lateMedieval",
		numPoints: points,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const startTimeMs = engine.time
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: startTimeMs + STATE.deltaYear(years),
		rng: HISTORY_RNG.createHistoryRng(SEED + 99999),
		validate: false,
	})
	const state = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	return {
		state,
		store: PEOPLE_STORE.of({ record: state.record }),
		frameAt: (timeMs) => HISTORY.frameAt({ state, timeMs }),
		seed: SEED,
		geography:
			world.provinces && world.locations
				? NOBILITY.geographyOf({
						provinceAdjOffset: world.provinces.adjOffset,
						provinceAdjList: world.provinces.adjList,
						locationProvince: world.locations.locationProvince,
						locationCount: world.locations.count,
					})
				: null,
		doctrine:
			world.religionTypes && world.religionFamilies
				? RELIGION_DOCTRINE.of({
						religionTypes: world.religionTypes,
						religionFamilies: world.religionFamilies,
						seed: SEED,
					})
				: null,
	}
}

export const PEOPLE_FIXTURE = { create }
