// August–Roche–Magnus saturation vapor pressure over water (kPa), T in °C.
function saturationVaporPressureKpa(tempC: number): number {
	return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

// FAO-56 arid correction: in dry climates the night never reaches saturation,
// so Tmin overshoots the dewpoint. The correction is a linear ramp from −2 °C
// at the driest end to 0 °C at the humid threshold (ar ≥ 0.5).
function aridDewpointBiasC(aridity: number): number {
	if (aridity >= 0.5) return 0
	return -2 * (1 - aridity / 0.5)
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
 * Result is clamped to 0–100.
 */
export function relativeHumidityFromTempRange(
	meanTempC: number,
	dtrC: number,
	annualAridity?: number,
): number {
	const bias =
		annualAridity !== undefined ? aridDewpointBiasC(annualAridity) : 0
	const dewC = meanTempC - dtrC / 2 + bias
	const rh =
		100 *
		(saturationVaporPressureKpa(dewC) / saturationVaporPressureKpa(meanTempC))
	return rh < 0 ? 0 : rh > 100 ? 100 : rh
}
