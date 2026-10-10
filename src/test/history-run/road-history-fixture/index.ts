import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_RECORD } from "@/model/history/sim/record"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import type {
	CanonicalRoute,
	CanonicalRoutesParams,
} from "@/test/history-run/road-history-fixture/types"

function create() {
	const created = HISTORY_RUN.createEngine({
		seed: 42,
		era: "lateMedieval",
		numPoints: 12000,
	})
	const { generated, engine } = created
	const world = {
		...generated,
		routes: TRANSPORT.packRoutes(generated.routes?.routes),
		network: TRANSPORT.packNetwork(generated.routes?.network),
	} as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.consumeJournal({ translator, transactions: engine.journal })
	JOURNAL.releaseSent(engine)
	return {
		...created,
		world,
		state,
		translator,
		rng: HISTORY_RNG.createHistoryRng(42 + 99999),
	}
}
function canonical({ routes }: CanonicalRoutesParams): CanonicalRoute[] {
	return routes
		.map((route) => ({
			from: Math.min(route.fromProvince, route.toProvince),
			to: Math.max(route.fromProvince, route.toProvince),
			kind: route.kind,
			path: Array.from(route.pathRegions),
		}))
		.sort((a, b) => a.kind - b.kind || a.from - b.from || a.to - b.to)
}
export const ROAD_HISTORY_FIXTURE = { create, canonical }
