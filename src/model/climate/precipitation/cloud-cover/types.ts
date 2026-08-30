export interface CloudCoverAetPetParams {
	aetMm: number
	petMm: number
}

export interface CloudCoverEstimateParams extends CloudCoverAetPetParams {
	rainfallMm: number
	dtrC: number
	temperatureC: number
	oceanDistanceKm: number
	/** A tidally-locked world's DTR reflects distance from the terminator, not
	 * maritime/desert dryness -- the inverse-DTR cloudiness proxy below (built
	 * for a rotating planet) doesn't apply, so this drops that term entirely
	 * instead of reading it backwards. */
	isTidallyLocked?: boolean
}
