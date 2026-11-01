import type { StageContext } from "@/model/climatev2/vendor/core.js"
import type { LatLonGrid } from "@/model/climatev2/vendor/grid.js"
import type { ClimateOrbit } from "@/model/climatev2/vendor/insolation.js"

export interface LockedDeck {
	deck: Float32Array
}

export interface LockedDeckParams {
	ctx: StageContext
	temperatureMonthly: Float32Array
}

export interface LockedDeckRadiationParams {
	core: LatLonGrid
	grid: LatLonGrid
	ratio: number
	orbit: ClimateOrbit
	clouds: LockedDeck
}

export interface LockedDeckRadiation {
	land: Float64Array
	sea: Float64Array
	landLongwave: Float64Array
	seaLongwave: Float64Array
}
