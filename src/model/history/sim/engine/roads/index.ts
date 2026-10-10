import type {
	AdvanceRoadsParams,
	InitRoadsParams,
} from "@/model/history/sim/engine/roads/types"
import { STATE } from "@/model/history/sim/engine/state"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"
import { TRANSPORT } from "@/model/society/infrastructure/transport"

function build({ state }: AdvanceRoadsParams): void {
	if (!state.roads) return
	const batch = ROUTES.advance({
		state: state.roads,
		urbanPopulation: state.popUrbanCurrent,
	})
	state.roadsLastBatchTime = state.time
	if (batch.added.length || batch.released.length)
		state.pendingJournal.roads = {
			added: TRANSPORT.packRoutes(batch.added),
			released: TRANSPORT.packRoutes(batch.released),
		}
}
function init({ state, world, inputs }: InitRoadsParams): void {
	state.roads = ROUTES.createState({ world, inputs })
	build({ state })
}
function advance({ state }: AdvanceRoadsParams): void {
	if (
		state.roads &&
		state.time - state.roadsLastBatchTime >=
			ROUTE_TUNING.batchIntervalYears * STATE.yearMs
	)
		build({ state })
}
export const ROADS = { init, advance }
