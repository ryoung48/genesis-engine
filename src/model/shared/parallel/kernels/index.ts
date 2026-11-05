import { HYDROLOGY } from "@/model/climate/classification/hydrology"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import { DTR } from "@/model/climate/temperature/dtr"

// Kernels a pool worker can run, keyed by the task name passed to PARALLEL.mapCells.
export const KERNELS: Record<string, (params: never) => void> = {
	diurnalRangeCells: DTR.diurnalRangeCells,
	hydrologyCells: HYDROLOGY.hydrologyCells,
	koppenCells: KOPPEN.koppenCells,
	pastaZoneCells: PASTA.pastaZoneCells,
	sstFlowMonths: SURFACE_FLOW.sstFlowMonths,
}
