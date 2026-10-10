import type { RoadJournal } from "@/model/history/sim/engine/journal/types"
import type { Route } from "@/model/society/infrastructure/transport/types"
export interface RouteLifetime extends Route {
	startTimeMs: number
	endTimeMs: number
}
export interface RouteLog {
	entries: RouteLifetime[]
	active: Map<string, RouteLifetime>
}
export interface ApplyRouteJournalParams {
	log: RouteLog
	roads: RoadJournal
	timeMs: number
}
export interface RoutesAtParams {
	log: RouteLog
	timeMs: number
}

export type RouteEndpoint = Pick<Route, "fromProvince" | "toProvince">
