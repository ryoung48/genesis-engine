import type { HostStarAttributes } from "@/model/celestial/star/types"
import type { WorldTypeAllocation } from "@/model/celestial/system/generation/world-type-allocation/types"

export interface SingleStarBudgetInput {
	seed: number
	hostStar: HostStarAttributes
}

export interface SingleStarBudget {
	worldTypeAllocation: WorldTypeAllocation
}
