import type { CloudFields } from "@/model/climatev2/clouds/types"
import type { CirculationResult } from "@/model/climatev2/vendor/circulation.js"
import type { LatLonGrid } from "@/model/climatev2/vendor/grid.js"

export interface CloudRadiation {
	land: Float64Array
	sea: Float64Array
	landLongwave: Float64Array
	seaLongwave: Float64Array
}

export interface CloudRadiationParams {
	core: LatLonGrid
	grid: LatLonGrid
	ratio: number
	clouds: CloudFields
	landFrac: Float64Array
	winds: CirculationResult
	albedo: number
	longwaveCancellation: number
	lowAlbedo: number
	longwaveWindow: number
}
