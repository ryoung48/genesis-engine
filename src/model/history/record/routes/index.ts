import type {
	ApplyRouteJournalParams,
	RouteEndpoint,
	RouteLog,
	RoutesAtParams,
} from "@/model/history/record/routes/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type {
	Route,
	SerializedRoutes,
} from "@/model/society/infrastructure/transport/types"

function key(route: Route): string {
	return `${route.kind}:${Math.min(route.fromProvince, route.toProvince)}:${Math.max(route.fromProvince, route.toProvince)}`
}
function create(): RouteLog {
	return { entries: [], active: new Map() }
}
function apply({ log, roads, timeMs }: ApplyRouteJournalParams): void {
	for (const route of TRANSPORT.unpackRoutes(roads.released)) {
		const id = key(route)
		const entry = log.active.get(id)
		if (entry) entry.endTimeMs = timeMs
		log.active.delete(id)
	}
	for (const route of TRANSPORT.unpackRoutes(roads.added)) {
		const entry = { ...route, startTimeMs: timeMs, endTimeMs: Infinity }
		log.entries.push(entry)
		log.active.set(key(route), entry)
	}
}
function at({ log, timeMs }: RoutesAtParams): Route[] {
	return log.entries
		.filter((entry) => entry.startTimeMs <= timeMs && timeMs < entry.endTimeMs)
		.map(({ fromProvince, toProvince, kind, pathRegions }) => ({
			fromProvince,
			toProvince,
			kind,
			pathRegions,
		}))
}
function endpoints(routes: readonly RouteEndpoint[]): Set<number> {
	const result = new Set<number>()
	for (const route of routes) {
		result.add(route.fromProvince)
		result.add(route.toProvince)
	}
	return result
}
function packedEndpoints(
	routes: SerializedRoutes | null | undefined,
): Set<number> {
	return endpoints(
		routes
			? Array.from(routes.fromProvince, (fromProvince, i) => ({
					fromProvince,
					toProvince: routes.toProvince[i],
				}))
			: [],
	)
}
export const RECORD_ROUTES = { create, apply, at, endpoints, packedEndpoints }
