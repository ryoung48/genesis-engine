import type {
	RelativeHumidityFromVaporPressureParams,
	RelativeHumidityFromTempRangeParams,
} from "@/model/climate/humidity/types"

function saturationVaporPressureKpa(tempC: number): number {
	return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

function clampRelativeHumidity(rh: number): number {
	if (rh <= 0) return 0
	if (rh >= 100) return 100
	return rh
}

function relativeHumidityFromVaporPressure({
	meanTempC,
	vaporPressureKpa,
}: RelativeHumidityFromVaporPressureParams): number {
	return clampRelativeHumidity(
		100 * (vaporPressureKpa / saturationVaporPressureKpa(meanTempC)),
	)
}

function aridDewpointBiasC(aridity: number): number {
	if (aridity >= 0.5) return 0
	return -2 * (1 - aridity / 0.5)
}

function precipMoistureBoostC(annualRainfallMm: number): number {
	const excess = annualRainfallMm - 500
	if (excess <= 0) return 0
	return 2 * (1 - Math.exp(-excess / 1500))
}

function dryAirDepressionC({
	annualRainfallMm,
	meanTempC,
}: Pick<
	RelativeHumidityFromTempRangeParams,
	"annualRainfallMm" | "meanTempC"
>): number {
	const deficit = 300 - annualRainfallMm
	if (deficit <= 0) return 0
	const tempGate = Math.max(0, Math.min(1, meanTempC / 30))
	return -13 * (1 - Math.exp(-deficit / 100)) * tempGate
}

function continentalityDewpointC(distFromOceanKm: number): number {
	return -distFromOceanKm / 500
}

function relativeHumidityFromTempRange({
	meanTempC,
	dtrC,
	annualAridity,
	annualRainfallMm,
	distFromOceanKm,
}: RelativeHumidityFromTempRangeParams): number {
	const bias =
		annualAridity !== undefined ? aridDewpointBiasC(annualAridity) : 0
	const moistureBoost =
		annualRainfallMm !== undefined ? precipMoistureBoostC(annualRainfallMm) : 0
	const dryDepression =
		annualRainfallMm !== undefined
			? dryAirDepressionC({ annualRainfallMm, meanTempC })
			: 0
	const continentality =
		distFromOceanKm !== undefined ? continentalityDewpointC(distFromOceanKm) : 0
	const dewC =
		meanTempC - dtrC / 2 + bias + moistureBoost + dryDepression + continentality
	const rh =
		100 *
		(saturationVaporPressureKpa(dewC) / saturationVaporPressureKpa(meanTempC))
	if (rh <= 0) return 0
	// Soft compression above 80 %: each additional raw point yields diminishing
	// returns, asymptoting near 92. Makes 90+ achievable only in the most
	// persistently humid conditions rather than any high-rainfall tropical cell.
	if (rh >= 80)
		return clampRelativeHumidity(80 + 12 * (1 - Math.exp(-(rh - 80) / 4)))
	return clampRelativeHumidity(rh)
}

export const HUMIDITY = {
	relativeHumidityFromVaporPressure,
	relativeHumidityFromTempRange,
}
