import type { Circulation } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type { RasterIndex } from "@/model/climate/ocean/currents/sverdrup/raster/types"
import type { SverdrupParams } from "@/model/climate/ocean/currents/sverdrup/types"
import type { GenesisClimate } from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"

export type SeasonalMixedLayerDepthParams = {
	index: RasterIndex
	temperature: Float32Array
	temperatureAnnualMax: Float32Array
	isOcean: Uint8Array
}

export type TwoLayerHeatSourceParams = {
	circulation: Circulation
	ocean: Uint8Array
	temperatureGradient: Float64Array
	upwelledDeficitC: number
	mixedLayerDepthM: Float32Array
}

export type TwoLayerSourceTerms = {
	advective: Float32Array
	vertical: Float32Array
}

export type ComputeTwoLayerCurrentsParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	landmarks: GenesisLandmarks
	sstSaturationC: number
	params: SverdrupParams
	// Required, not optional: this model exists specifically to isolate
	// ocean-model error from wind-model error (see src/test/earth/
	// ocean-currents.md), so it is always driven by real GODAS/NCEP wind,
	// never procedural.
	observedWind: {
		real_u_monthly?: Float32Array
		real_v_monthly?: Float32Array
	}
}
