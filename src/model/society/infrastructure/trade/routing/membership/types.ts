import type { RouteState } from "@/model/society/infrastructure/trade/routing/types"
export interface MembershipParams {
	state: RouteState
	urbanPopulation: Float32Array
}
export interface MembershipChanges {
	land: Set<number>
	sea: Set<number>
	count: number
}
