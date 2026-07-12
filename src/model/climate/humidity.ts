// August–Roche–Magnus saturation vapor pressure over water (kPa), T in °C.
// This keeps the observed-Earth RH overlay aligned with the project's
// liquid-water-relative convention; using ice below freezing raises polar RH.
function saturationVaporPressureKpa(tempC: number): number {
	return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

function clampRelativeHumidity(rh: number): number {
	if (rh <= 0) return 0
	if (rh >= 100) return 100
	return rh
}

export function relativeHumidityFromVaporPressure(
	meanTempC: number,
	vaporPressureKpa: number,
): number {
	return clampRelativeHumidity(
		100 * (vaporPressureKpa / saturationVaporPressureKpa(meanTempC)),
	)
}

// FAO-56 arid correction: in dry climates the night never reaches saturation,
// so Tmin overshoots the dewpoint. The correction is a linear ramp from −2 °C
// at the driest end to 0 °C at the humid threshold (ar ≥ 0.5).
function aridDewpointBiasC(aridity: number): number {
	if (aridity >= 0.5) return 0
	return -2 * (1 - aridity / 0.5)
}

// Moisture-source correction: in high-rainfall regions, evapotranspiration
// keeps the air loaded with vapor beyond what the DTR proxy captures. Ramps
// from 0 below 500 mm/yr to +2 °C at ~5000 mm/yr (coastal tropical rainforest
// can reach near-saturation; Amazon-typical ~3000 mm lands around +1.6 °C).
function precipMoistureBoostC(annualRainfallMm: number): number {
	const excess = annualRainfallMm - 500
	if (excess <= 0) return 0
	return 2 * (1 - Math.exp(-excess / 1500))
}

// Dry air-mass correction: in hot hyperarid regions the ambient dewpoint is
// driven by air-mass origin, not local temperature swings. Gates to zero at
// Tmean ≤ 0 °C (cold polar dryness is already handled by DTR) and reaches
// full strength at Tmean ≥ 30 °C. Ramps from 0 at 300 mm/yr to −13 °C at 0
// mm/yr, pushing hot desert RH below 30 %.
function dryAirDepressionC(
	annualRainfallMm: number,
	meanTempC: number,
): number {
	const deficit = 300 - annualRainfallMm
	if (deficit <= 0) return 0
	const tempGate = Math.max(0, Math.min(1, meanTempC / 30))
	return -13 * (1 - Math.exp(-deficit / 100)) * tempGate
}

// Continentality correction: maritime air carries more moisture than
// continental air regardless of local rainfall. Linear so extreme continental
// interiors accumulate enough dewpoint depression to push RH toward zero
// (~−3 °C at 1500 km, ~−6 °C at 3000 km, ~−20 °C at 10 000 km).
function continentalityDewpointC(distFromOceanKm: number): number {
	return -distFromOceanKm / 500
}

/**
 * Estimate mean relative humidity (%) from monthly mean temperature and the
 * diurnal temperature range, with an optional annual aridity ratio (AET/PET).
 *
 * We have no explicit humidity field, so this leans on the FAO-56 assumption
 * that the nighttime minimum cools to the dewpoint
 * (Tdew ≈ Tmin = Tmean − DTR/2). A large diurnal swing then implies dry air
 * (dewpoint well below the daytime temperature) and a small swing implies
 * humid air:
 *
 *   RH = 100 · e_s(Tdew) / e_s(Tmean)
 *
 * When `annualAridity` (AET/PET, 0–1) is provided, a FAO-56 correction biases
 * the dewpoint down by up to 2 °C in arid zones where the night never actually
 * reaches saturation.
 *
 * When `annualRainfallMm` is provided, two rainfall-driven corrections apply:
 * a moisture-source boost of up to +2 °C for high-rainfall zones, and a dry
 * air-mass depression of up to −13 °C for hot hyperarid zones (temperature-
 * gated so cold polar dryness is unaffected).
 *
 * When `distFromOceanKm` is provided, a continentality correction depresses the
 * dewpoint by up to −4 °C for deep continental interiors, capturing the drier
 * air-mass character of regions far from maritime moisture sources.
 *
 * Result is clamped to 0–100.
 */
export function relativeHumidityFromTempRange(
	meanTempC: number,
	dtrC: number,
	annualAridity?: number,
	annualRainfallMm?: number,
	distFromOceanKm?: number,
): number {
	const bias =
		annualAridity !== undefined ? aridDewpointBiasC(annualAridity) : 0
	const moistureBoost =
		annualRainfallMm !== undefined ? precipMoistureBoostC(annualRainfallMm) : 0
	const dryDepression =
		annualRainfallMm !== undefined
			? dryAirDepressionC(annualRainfallMm, meanTempC)
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
