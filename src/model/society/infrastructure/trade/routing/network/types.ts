import type { RouteState } from "@/model/society/infrastructure/trade/routing/types"
import type { Route } from "@/model/society/infrastructure/transport/types"
export interface RecordUsageParams {
	state: RouteState
	route: Route
	delta: number
}
