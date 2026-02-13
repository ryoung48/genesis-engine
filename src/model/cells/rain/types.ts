import { Cell } from "../types"

/**
 * Parameters for calculating monthly rainfall
 */
export type GetMonthlyRainParams = {
	/** The cell to calculate rainfall for */
	readonly cell: Cell
	/** The month index (0-11) */
	readonly month: number
}
