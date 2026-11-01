export type RelativeHumidityFromTempRangeParams = {
	meanTempC: number
	dtrC: number
	// [JUSTIFICATION] Callers without a land water balance cannot supply an AET/PET ratio.
	annualAridity?: number
	// [JUSTIFICATION] Rainfall is unavailable to temperature-only callers.
	annualRainfallMm?: number
	// [JUSTIFICATION] Point estimates can lack coast-distance data.
	distFromOceanKm?: number
}
