import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import type {
	EdgeKeyParams,
	MergeNetworkKindParams,
	NetworkParams,
} from "@/model/society/infrastructure/trade/routing/network/edges/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type {
	RouteEdge,
	SerializedRouteKind,
} from "@/model/society/infrastructure/transport/types"

function buildRouteNetwork({
	routes,
	state,
	urbanPopulation,
}: NetworkParams): RouteEdge[] {
	const regionPairSpan = state.regionProvince.length
	const edgeMap = new Map<number, RouteEdge>()
	for (const route of routes) {
		const weight =
			((urbanPopulation[route.fromProvince] ?? 0) +
				(urbanPopulation[route.toProvince] ?? 0)) /
			2
		for (let i = 1; i < route.pathRegions.length; i++) {
			const fromRegion = route.pathRegions[i - 1]
			const toRegion = route.pathRegions[i]
			if (fromRegion === toRegion) continue
			const key = edgeKey({
				a: fromRegion,
				b: toRegion,
				kind: networkKindForRouteKind(route.kind),
				span: regionPairSpan,
			})
			const existing = edgeMap.get(key)
			if (existing) {
				existing.kind = mergeNetworkKind({
					current: existing.kind,
					next: route.kind,
				})
				existing.usage++
				existing.weight += weight
				continue
			}
			edgeMap.set(key, {
				fromRegion: Math.min(fromRegion, toRegion),
				toRegion: Math.max(fromRegion, toRegion),
				kind: route.kind,
				usage: 1,
				weight,
			})
		}
	}
	return [...edgeMap.values()].sort(
		(a, b) => a.kind - b.kind || b.usage - a.usage || b.weight - a.weight,
	)
}

function edgeKey({ a, b, kind, span }: EdgeKeyParams): number {
	return kind * span * span + PATHFIND.pairKey({ a, b, span })
}

function networkKindForRouteKind(
	kind: SerializedRouteKind,
): SerializedRouteKind {
	return kind === TRANSPORT.ROUTE_SEA ? kind : TRANSPORT.ROUTE_LAND_MINOR
}

function mergeNetworkKind({
	current,
	next,
}: MergeNetworkKindParams): SerializedRouteKind {
	if (current === TRANSPORT.ROUTE_SEA || next === TRANSPORT.ROUTE_SEA) {
		return TRANSPORT.ROUTE_SEA
	}
	return current === TRANSPORT.ROUTE_LAND_MAJOR ||
		next === TRANSPORT.ROUTE_LAND_MAJOR
		? TRANSPORT.ROUTE_LAND_MAJOR
		: TRANSPORT.ROUTE_LAND_MINOR
}

export const ROUTE_EDGES = { network: buildRouteNetwork }
