export interface DistrictRecipe {
	stretch: number
	alpha: number
	prov: number
	cross: number
	shear: number
}

export interface DistrictSystem {
	spacingKm: number
	share: number
	recipe: DistrictRecipe
	assoc: string | null
}

export interface DistrictCell {
	x: number
	y: number
	z: number
	psiB: number
	wB: number
	psiC: number
	wC: number
}

export interface WarpedPosition {
	wx: number
	wy: number
	wz: number
}

export interface DistrictShapes {
	cell: (params: DistrictCell) => void
	at: (system: number) => number
	warped: () => WarpedPosition
}

export interface CreateDistrictsParams {
	seed: number
	systems: DistrictSystem[]
	gridDeg: number
	radiusKm: number
}

export interface DistrictThresholds {
	key: string
	thresholds: number[][]
}

export interface CalibrateDistrictsParams {
	systems: DistrictSystem[]
	radiusKm: number
}

export interface Grain {
	f: number
	c: number
	off: number
}

export interface Octave {
	small: Grain
	medium: Grain
}

export interface SystemShape {
	outer: Octave
	inner: Octave
	shearOctave: Octave
	alpha: number
	prov: number
	cross: number
	shear: number
	share: number
	assoc: number
	maxShear: number
	t0: number
	t1: number
	tr: number
}

export interface LatticeParams {
	step: number
	per: number
	fill: (params: LatticeFill) => void
}

export interface LatticeFill {
	x: number
	y: number
	z: number
	data: Float32Array
	offset: number
}

export interface LatLon {
	lat: number
	lon: number
}

export interface Lattice {
	data: () => Float32Array
	corners: (at: LatLon) => void
	slots: Int32Array
	weights: Float64Array
}

export interface ThresholdKeyParams {
	systems: DistrictSystem[]
	radiusKm: number
}
