import type { GenesisOceanCurrents } from "@/model/climate/types"
import type { WindVectors } from "@/model/climate/weather/wind/types"
import type { DiurnalCells } from "@/model/climatev2/diurnal/types"
import type { ClimateOrbit } from "@/model/climatev2/vendor/insolation.js"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface ClimateV2Input {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	orbit: ClimateOrbit
	seed: number
	diagnostics: boolean
}

export interface ClimateV2IceDiagnostics {
	seaIceMonthly: Float32Array
	snowIceShare: Float32Array
}

export interface ClimateV2Cells {
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
	rainfallAnnual: Float32Array
	wind: WindVectors
	windUMonthly: Float32Array
	windVMonthly: Float32Array
	oceanCurrents: GenesisOceanCurrents
	diagnostics: ClimateV2IceDiagnostics | null
	diurnalRange: DiurnalCells
	koppen: Uint8Array
	timing: { stage: string; ms: number }[]
}

export interface ClimateV2WorldParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	params: GenesisParams
}

export interface ClimateV2ClimateParams {
	mesh: SphereMesh
	params: GenesisParams
	v2: ClimateV2Cells
}

export interface ZonalSeaAnomalyParams {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureMonthly: Float32Array
}
