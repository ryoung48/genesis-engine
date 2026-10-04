import type { StressFactorsParams } from "@/model/history/sim/people/traits/types"
export interface StressStepParams extends StressFactorsParams {
	value: number
	war: boolean
	attacking: boolean
	revolt: boolean
	debt: boolean
	paying: boolean
	bereavements: number
}
