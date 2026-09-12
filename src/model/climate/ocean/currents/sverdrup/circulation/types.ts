import type {
	RasterIndex,
	RasterVector,
} from "@/model/climate/ocean/currents/sverdrup/raster/types"

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

export type BarrierMaskParams = {
	ocean: Uint8Array
	continent: Float32Array
}

export type StreamfunctionParams = {
	curl: Float32Array
	ocean: Uint8Array
	barrier: Uint8Array
	planet: SverdrupPlanet
}

export type StreamfunctionResult = {
	psi: Float32Array
	interior: Float32Array
	channel: Float32Array
}

export type ChannelJetParams = {
	tau: RasterVector
	ocean: Uint8Array
	channel: Float32Array
	planet: SverdrupPlanet
}

export type WesternBoundaryParams = {
	segment: number[]
	boundary: Float32Array
	widthCells: number
	channelWeight: number
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
	jet: Float32Array
	ocean: Uint8Array
}

export type SolveCirculationParams = {
	index: RasterIndex
	barrier: Uint8Array
	wind: SverdrupWind
	planet: SverdrupPlanet
}

export type Circulation = {
	flow: RasterVector
	interior: Float32Array
	divergence: Float32Array
	thermoclineDepth: Float32Array
}
