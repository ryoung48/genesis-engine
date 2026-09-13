import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type { RasterVector } from "@/model/climate/ocean/currents/sverdrup/raster/types"

export type TemperatureDrivenOverturningParams = {
	ocean: Uint8Array
	temperatureC: Float32Array
	planet: SverdrupPlanet
	turnoverSeconds: number
}

export type OverturningCell = {
	upperLimb: RasterVector
	deepReturn: RasterVector
	maxUpperSpeedMps: number
}
