import { HYDROLOGY } from "@/model/climate/classification/hydrology"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import { RAIN } from "@/model/climate/precipitation/rain"
import { CLOUD_COVER_TEMPERATURE_MODIFIER } from "@/model/climate/temperature/cloud-cover-modifier"
import { DTR } from "@/model/climate/temperature/dtr"
import { CLIMATE_V1 } from "@/model/climate/temperature/legacy"

// Kernels a pool worker can run, keyed by the task name passed to PARALLEL.mapCells.
export const KERNELS: Record<string, (params: never) => void> = {
	legacyZonalTemperatureCells: CLIMATE_V1.zonalTemperatureCells,
	cloudCoverCells: CLOUD_COVER_TEMPERATURE_MODIFIER.cloudCoverCells,
	diurnalRangeCells: DTR.diurnalRangeCells,
	monthlyRainCells: RAIN.monthlyRainCells,
	smoothRainMonths: RAIN.smoothRainMonths,
	hydrologyCells: HYDROLOGY.hydrologyCells,
	koppenCells: KOPPEN.koppenCells,
	pastaZoneCells: PASTA.pastaZoneCells,
	sstFlowMonths: SURFACE_FLOW.sstFlowMonths,
}
