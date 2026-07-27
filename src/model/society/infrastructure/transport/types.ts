import { SerializedNetwork } from "@/model/worker-protocol/types"

export type SerializedRouteKind = 0 | 1 | 2

export interface Route {
	fromProvince: number
	toProvince: number
	kind: SerializedRouteKind
	pathRegions: number[]
}

export interface RouteEdge {
	fromRegion: number
	toRegion: number
	kind: SerializedRouteKind
	usage: number
	weight: number
}

export interface SerializedRoutes {
	fromProvince: Int32Array
	toProvince: Int32Array
	kind: Uint8Array
	pathOffsets: Int32Array
	pathRegions: Int32Array
}

export interface ForEachRouteParams {
	routes: SerializedRoutes | null | undefined
	callback: (route: {
		fromProvince: number
		toProvince: number
		kind: SerializedRouteKind
		pathRegions: Int32Array
		index: number
	}) => void
}

export interface ForEachEdgeParams {
	network: SerializedNetwork | null | undefined
	callback: (edge: {
		fromRegion: number
		toRegion: number
		kind: SerializedRouteKind
		usage: number
		weight: number
		index: number
	}) => void
}
