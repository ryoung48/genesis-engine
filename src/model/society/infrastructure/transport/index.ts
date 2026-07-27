import type {
	ForEachEdgeParams,
	ForEachRouteParams,
	Route,
	RouteEdge,
	SerializedRouteKind,
	SerializedRoutes,
} from "@/model/society/infrastructure/transport/types"
import type { SerializedNetwork } from "@/model/worker-protocol/types"

const ROUTE_LAND_MAJOR = 0
const ROUTE_LAND_MINOR = 1
const ROUTE_SEA = 2

function packRoutes(
	routes: readonly Route[] | null | undefined,
): SerializedRoutes {
	const routeList = routes ?? []
	const fromProvince = new Int32Array(routeList.length)
	const toProvince = new Int32Array(routeList.length)
	const kind = new Uint8Array(routeList.length)
	const pathOffsets = new Int32Array(routeList.length + 1)
	let totalPathLength = 0
	for (let i = 0; i < routeList.length; i++) {
		const route = routeList[i]
		fromProvince[i] = route.fromProvince
		toProvince[i] = route.toProvince
		kind[i] = route.kind
		totalPathLength += route.pathRegions.length
		pathOffsets[i + 1] = totalPathLength
	}
	const pathRegions = new Int32Array(totalPathLength)
	let cursor = 0
	for (const route of routeList) {
		pathRegions.set(route.pathRegions, cursor)
		cursor += route.pathRegions.length
	}
	return {
		fromProvince,
		toProvince,
		kind,
		pathOffsets,
		pathRegions,
	}
}

function packNetwork(
	edges: readonly RouteEdge[] | null | undefined,
): SerializedNetwork {
	const edgeList = edges ?? []
	const fromRegion = new Int32Array(edgeList.length)
	const toRegion = new Int32Array(edgeList.length)
	const kind = new Uint8Array(edgeList.length)
	const usage = new Int32Array(edgeList.length)
	const weight = new Float32Array(edgeList.length)
	for (let i = 0; i < edgeList.length; i++) {
		const edge = edgeList[i]
		fromRegion[i] = edge.fromRegion
		toRegion[i] = edge.toRegion
		kind[i] = edge.kind
		usage[i] = edge.usage
		weight[i] = edge.weight
	}
	return {
		fromRegion,
		toRegion,
		kind,
		usage,
		weight,
	}
}

function networkCount(network: SerializedNetwork | null | undefined): number {
	return network?.kind.length ?? 0
}

function forEachRoute({ routes, callback }: ForEachRouteParams): void {
	if (!routes) return
	for (let i = 0; i < routes.kind.length; i++) {
		callback({
			fromProvince: routes.fromProvince[i],
			toProvince: routes.toProvince[i],
			kind: routes.kind[i] as SerializedRouteKind,
			pathRegions: routes.pathRegions.subarray(
				routes.pathOffsets[i],
				routes.pathOffsets[i + 1],
			),
			index: i,
		})
	}
}

function forEachEdge({ network, callback }: ForEachEdgeParams): void {
	if (!network) return
	for (let i = 0; i < network.kind.length; i++) {
		callback({
			fromRegion: network.fromRegion[i],
			toRegion: network.toRegion[i],
			kind: network.kind[i] as SerializedRouteKind,
			usage: network.usage[i],
			weight: network.weight[i],
			index: i,
		})
	}
}

export const TRANSPORT = {
	packRoutes,
	packNetwork,
	networkCount,
	forEachRoute,
	forEachEdge,
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
} as const
