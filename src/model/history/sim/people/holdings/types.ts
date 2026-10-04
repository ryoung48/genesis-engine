import type { PeopleState } from "@/model/history/sim/people/types"

export interface HoldingParams {
	people: PeopleState
	seat: number
	person: number
}

export interface RankedHoldingsParams {
	people: PeopleState
	person: number
	ranks: ArrayLike<number>
}

export interface OrderSeatsParams {
	seats: readonly number[]
	ranks: ArrayLike<number>
}
