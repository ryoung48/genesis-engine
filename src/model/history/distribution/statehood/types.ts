import type { DistributionEngine } from "@/model/history/distribution/engine/types"
import type { Territory } from "@/model/history/distribution/territory/types"

export interface StatehoodParams {
	engine: DistributionEngine
}
export interface Foundings {
	projected: number
	firstInComponent: number
	inStatedComponent: number
}
export interface NeighborParams {
	territory: Territory
	province: number
}
export interface Candidate {
	countryId: number
	province: number
}
