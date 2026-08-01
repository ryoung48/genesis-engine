export type RelativeHumidityFromTempRangeParams = {
	meanTempC: number
	dtrC: number
	/** Optional AET/PET aridity ratio used to bias the dewpoint in dry climates. */
	annualAridity?: number
	/** Optional annual rainfall used for moisture-source and dry-air corrections. */
	annualRainfallMm?: number
	/** Optional distance from the ocean used for continentality correction. */
	distFromOceanKm?: number
}
