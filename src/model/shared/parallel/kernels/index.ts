import { CLIMATE } from "@/model/climate/classification/climate"
import { HYDROLOGY } from "@/model/climate/classification/hydrology"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import { RAIN } from "@/model/climate/precipitation/rain"
import { CLOUD_COVER_TEMPERATURE_MODIFIER } from "@/model/climate/temperature/cloud-cover-modifier"
import { DTR } from "@/model/climate/temperature/dtr"

// Kernels a pool worker can run, keyed by the task name passed to PARALLEL.mapCells.
export const KERNELS: Record<string, (params: never) => void> = {
	cloudCoverCells: CLOUD_COVER_TEMPERATURE_MODIFIER.cloudCoverCells,
	diurnalRangeCells: DTR.diurnalRangeCells,
	hydrologyCells: HYDROLOGY.hydrologyCells,
	koppenCells: KOPPEN.koppenCells,
	monthlyRainCells: RAIN.monthlyRainCells,
	pastaZoneCells: PASTA.pastaZoneCells,
	smoothRainMonths: RAIN.smoothRainMonths,
	sstFlowMonths: SURFACE_FLOW.sstFlowMonths,
	zonalTemperatureCells: CLIMATE.zonalTemperatureCells,
}
