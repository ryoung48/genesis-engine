import type {
	Circulation,
	SverdrupPlanet,
} from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type {
	RasterIndex,
	RasterVector,
} from "@/model/climate/ocean/currents/sverdrup/raster/types"

export type ZonalGradientParams = {
	index: RasterIndex
	temperature: Float32Array
	isOcean: Uint8Array
	planet: SverdrupPlanet
}

export type HeatSourceParams = {
	circulation: Circulation
	ocean: Uint8Array
	temperatureGradient: Float64Array
}

export type AnomalySolveParams = {
	flow: RasterVector
	ocean: Uint8Array
	source: Float32Array
	planet: SverdrupPlanet
}

export type ZonalMeanParams = {
	field: Float32Array
	ocean: Uint8Array
}

export type SolveSstAnomalyParams = {
	index: RasterIndex
	circulation: Circulation
	temperature: Float32Array
	isOcean: Uint8Array
	planet: SverdrupPlanet
}
