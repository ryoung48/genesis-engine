import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type { RasterVector } from "@/model/climate/ocean/currents/sverdrup/raster/types"

export type InterfaceVelocityParams = {
	mixedLayerDepthM: Float32Array
	previousMixedLayerDepthM: Float32Array
	dtSeconds: number
}

export type ComputeEffectiveLayerParams = {
	source: Float32Array
	couplingVelocityMS: Float32Array
	layerDepthM: Float32Array
	relaxationSeconds: Float32Array
	couplingTarget: Float32Array
}

export type EffectiveLayer = {
	source: Float32Array
	relaxationSeconds: Float32Array
}

export type StepLayerParams = {
	flow: RasterVector
	ocean: Uint8Array
	source: Float32Array
	planet: SverdrupPlanet
	relaxationSeconds: Float32Array
	previous: Float32Array
	dtSeconds: number
}
