import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type { RasterVector } from "@/model/climate/ocean/currents/sverdrup/raster/types"

export type TransportSurfaceHeatParams = {
	flow: RasterVector
	ocean: Uint8Array
	insolationWm2: Float32Array
	planet: SverdrupPlanet
	releaseSeconds: number
	albedo: number
	heatCapacityJm2K: number
	exportSpeedMps: number
}

export type SurfaceHeatTransport = {
	carrierC: Float32Array
	pickupCPerS: Float32Array
	releaseCPerS: Float32Array
	solverConservationError: number
	pickupPowerW: number
}
