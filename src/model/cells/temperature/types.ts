import { Cell } from "../types"

export interface TemperatureParams {
	cell: Cell
}

export interface MonthlyTemperatureParams extends TemperatureParams {
	month: number
}

export interface DailyTemperatureParams extends TemperatureParams {
	day: number
	h?: number
}
