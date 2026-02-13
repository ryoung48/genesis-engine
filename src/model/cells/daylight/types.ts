import { Cell } from "../types"

export interface DailyDaylightParams {
	cell: Cell
	dayIdx: number
}

export interface MonthlyDaylightParams {
	cell: Cell
	month: number
}
