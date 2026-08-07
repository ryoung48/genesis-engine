export interface CloudCoverAetPetParams {
	aetMm: number
	petMm: number
}

export interface CloudCoverEstimateParams extends CloudCoverAetPetParams {
	rainfallMm: number
	dtrC: number
	temperatureC: number
	oceanDistanceKm: number
}
