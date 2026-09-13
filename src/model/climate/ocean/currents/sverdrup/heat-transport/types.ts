import type {
	Circulation,
	SverdrupPlanet,
} from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type {
	RasterIndex,
	RasterVector,
} from "@/model/climate/ocean/currents/sverdrup/raster/types"

export type SolveHeatTransportParams = {
	index: RasterIndex
	circulation: Circulation
	psi: Float32Array
	additionalTransport: RasterVector
	temperature: Float32Array
	isOcean: Uint8Array
	planet: SverdrupPlanet
	layerDepthM: Float32Array
	upwelledDeficitC: number
}

export type BuildTransportStencilParams = Omit<
	SolveHeatTransportParams,
	"upwelledDeficitC"
>

export type TransportStencil = {
	west: Float32Array
	east: Float32Array
	south: Float32Array
	north: Float32Array
	diagonal: Float32Array
	backgroundSource: Float32Array
}
