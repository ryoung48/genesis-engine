import type { RouteWorld } from "@/model/society/infrastructure/trade/routing/types"
import type {
	Route,
	SerializedRouteKind,
} from "@/model/society/infrastructure/transport/types"
export interface NetworkParams {
	routes: Route[]
	state: Pick<RouteWorld, "regionProvince">
	urbanPopulation: Float32Array
}
export interface EdgeKeyParams {
	a: number
	b: number
	kind: SerializedRouteKind
	span: number
}
export interface MergeNetworkKindParams {
	current: SerializedRouteKind
	next: SerializedRouteKind
}
