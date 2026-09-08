export interface SeasonalSurfaceConfig {
	planckA: number
	planckB: number
	diffusion: number
	landAlbedo: number
	waterAlbedo: number
	iceAlbedo: number
	landHeatCapacity: number
	waterHeatCapacity: number
	iceDepositionRate: number
	ablationFactor: number
	iceResetYears: number
}

export interface SeasonalSurfaceStepParams {
	temperatureK: number
	iceMass: number
	dt: number
	snowball: boolean
	config: SeasonalSurfaceConfig
}

export interface SeasonalAlbedoParams {
	temperatureK: number
	iceMass: number
	baseAlbedo: number
	iceAlbedo: number
	zenithOffset: number
}
