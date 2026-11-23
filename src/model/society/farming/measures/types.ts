import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface MeasuresParams {
	provinces: GenesisProvinces
	landGraph: GenesisProvinces
	mesh: Pick<SphereMesh, "numRegions" | "regionArea">
	planetRadiusKm: number
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
	petMonthly: Float32Array
	elevationKm: Float32Array
	gdd: Float32Array
	topography: Uint8Array
	vegetation: Uint8Array
	riverVisible: Uint8Array
}

export interface ProvinceMeasures {
	count: number
	areaKm2: Float64Array
	T: Float64Array
	P: Float64Array
	arid: Float64Array
	seas: Float64Array
	range: Float64Array
	Tc: Float64Array
	relief: Float64Array
	npp: Float64Array
	gdd: Float64Array
	forager: Float64Array
	floodShare: Float64Array
	pasture: Float64Array
}

export interface NppParams {
	T: number
	P: number
}

export interface SeasonParams {
	gdd: number
}

export interface MoistureParams {
	npp: number
	floodShare: number
}
