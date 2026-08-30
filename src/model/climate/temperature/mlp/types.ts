export type TemperatureMlpFeatures = {
	latDeg: number
	month: number
	elevationKm: number
	distCoastKm: number
	landmassExtentKm: number
	distCoastWestKm: number
	distCoastEastKm: number
	nearbyMaxElevKm: number
	terrainRoughnessKm: number
}

export type MlpLayer = {
	inDim: number
	outDim: number
	weights: Float32Array
	bias: Float32Array
}

export type MlpModel = {
	featureCount: number
	scalerMean: Float32Array
	scalerScale: Float32Array
	layers: MlpLayer[]
}

export type MlpWeightsLayer = {
	inDim: number
	outDim: number
	weightsB64: string
	biasB64: string
}

export type MlpWeights = {
	features: string[]
	arch: number[]
	scalerMeanB64: string
	scalerScaleB64: string
	layers: MlpWeightsLayer[]
}
