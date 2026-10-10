import type { RouteWorld } from "@/model/society/infrastructure/trade/routing/types"

export interface ComputeGroupIdsParams {
	state: RouteWorld
	landPassable: Uint8Array
	provinceClusters: Int32Array
}
