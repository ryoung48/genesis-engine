import type { CellRange } from "@/model/shared/parallel/types"

export interface DiurnalRangeCellsParams extends CellRange {
	isLand: Uint8Array
	rainMonthly: Float32Array
	oceanDist: Float32Array | null
	daylightHoursMonthly: Float32Array
	hoursPerDay: number
	monthly: Float32Array
	annual: Float32Array
}
