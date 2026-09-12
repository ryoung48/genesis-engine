import type {
	RasterIndex,
	RasterVector,
} from "@/model/climate/ocean/currents/sverdrup/raster/types"
import type {
	StommelOperator,
	StommelSolution,
} from "@/model/climate/ocean/currents/sverdrup/stommel/types"

export type SverdrupWind = {
	windU: Float32Array
	windV: Float32Array
	windSpeed: Float32Array
}

export type SverdrupPlanet = {
	coriolisSign: number
	rotationRateRadS: number
	radiusM: number
	airDensityKgM3: number
	seawaterDensityKgM3: number
	gyreStrength: number
}

export type WindStressParams = {
	index: RasterIndex
	wind: SverdrupWind
	planet: SverdrupPlanet
}

export type CurlParams = {
	tau: RasterVector
	planet: SverdrupPlanet
}

export type GeostrophicParams = {
	psi: Float32Array
	ocean: Uint8Array
	depth: Float32Array
	planet: SverdrupPlanet
}

export type EkmanParams = {
	tau: RasterVector
	ocean: Uint8Array
	planet: SverdrupPlanet
}

export type EkmanResult = {
	drift: RasterVector
	divergence: Float32Array
}

export type SurfaceCurrentParams = {
	geostrophic: RasterVector
	drift: RasterVector
	ocean: Uint8Array
}

export type SolveCirculationParams = {
	index: RasterIndex
	wind: SverdrupWind
	planet: SverdrupPlanet
	operator: StommelOperator
	// [JUSTIFICATION] Successive months differ only in the forcing, so each
	// solve starts from the previous month's answer; null on the first.
	guess: Float64Array | null
}

export type Circulation = {
	flow: RasterVector
	divergence: Float32Array
	thermoclineDepth: Float32Array
	solution: StommelSolution
}
