import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { NOBILITY } from "@/model/people/nobility"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import type {
	PeopleInput,
	PeopleInputParams,
} from "@/test/people-run/input/types"

function build({ history, years, fresh }: PeopleInputParams): PeopleInput {
	const { generated, engine, generationMs, engineMs } = fresh
		? HISTORY_RUN.createFreshEngine(history)
		: HISTORY_RUN.createEngine(history)
	const started = performance.now()
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	const consume = () => {
		SIM_RECORD.consumeJournal({ translator, transactions: engine.journal })
		JOURNAL.releaseSent(engine)
	}
	consume()
	const rng = HISTORY_RNG.createHistoryRng(history.seed + 99999)
	const start = engine.time
	for (let year = 1; year <= years; year++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: start + STATE.deltaYear(year),
			rng,
			validate: false,
		})
		consume()
	}
	return {
		state,
		seed: history.seed,
		startYear: Math.round(start / STATE.yearMs),
		generationMs,
		historyMs: engineMs + performance.now() - started,
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
						seed: history.seed,
					})
				: null,
	}
}

export const PEOPLE_INPUT = { build }
