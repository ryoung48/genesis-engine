import { DTR } from "@/model/climate/temperature/dtr"

// Kernels a pool worker can run, keyed by the task name passed to PARALLEL.mapCells.
export const KERNELS: Record<string, (params: never) => void> = {
	diurnalRangeCells: DTR.diurnalRangeCells,
}
