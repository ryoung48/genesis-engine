import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { CreateRouteStateParams } from "@/model/society/infrastructure/trade/routing/types"
export interface InitRoadsParams extends CreateRouteStateParams {
	state: HistoryState
}
export interface AdvanceRoadsParams {
	state: HistoryState
}
