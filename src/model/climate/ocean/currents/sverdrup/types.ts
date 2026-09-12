import type {
	SverdrupPlanet,
	SverdrupWind,
} from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import type { RasterIndex } from "@/model/climate/ocean/currents/sverdrup/raster/types"
import type { StommelOperator } from "@/model/climate/ocean/currents/sverdrup/stommel/types"
import type { GenesisClimate } from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type SverdrupParams = Pick<
	GenesisParams,
	| "obliquity"
	| "hoursPerDay"
	| "planetRadiusKm"
	| "tideLock"
	| "substellarLon"
	| "eccentricity"
	| "perihelion"
	| "pressure"
	| "daysPerYear"
>

export type ComputeSverdrupSSTParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	elevation_km: Float32Array
	isLand: Uint8Array
	landmarks: GenesisLandmarks
	sstSaturationC: number
	params: SverdrupParams
}

export type MonthSolveParams = {
	index: RasterIndex
	wind: SverdrupWind
	isOcean: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	temperature: Float32Array
	planet: SverdrupPlanet
	sstSaturationC: number
	operator: StommelOperator
	// [JUSTIFICATION] Successive months differ only in the forcing, so each
	// solve starts from the previous month's answer; null on the first.
	guess: Float64Array | null
}

export type MonthSolve = {
	sst: Float32Array
	flowU: Float32Array
	flowV: Float32Array
	state: Float64Array
	iterations: number
	residual: number
}
