import type { LocalGreenhouseParams } from "@/model/climate/temperature/ebm/greenhouse-moisture/types"

// Cold, dry air holds far less water vapor than warm air (Clausius-Clapeyron),
// and water vapor is the dominant greenhouse contributor -- so a column's
// LOCAL trapping strength should scale with its own temperature, not with a
// single planet-wide constant. Standard Budyko/North EBMs get away with one
// global A/B because they're fit against an all-latitude satellite OLR-vs-T
// regression; that single fit still has to average over both the moist
// tropics and the dry poles, and once a body's climate is disaggregated into
// separately-evolving columns (see energy-balance-model's land/ocean split),
// reusing that single average everywhere overstates the poles' own trapping
// and produces an ANTARCTICA-style warm bias.
//
// Shaped directly after VPlanet POISE's default OLR model (Spiegel, Menou &
// Scharf 2009 -- see poise.c's fdOLRsms09): optical depth tau = 0.79*(T/
// 273.15)^3, OLR = sigma*T^4/(1+0.75*tau). Because tau grows as T^3, trapping
// falls off steeply at cold poles and rises smoothly into hot tropics from
// ONE continuous formula -- no hand-tuned floor/ceiling breakpoints needed to
// fake the same effect. Reparameterized here through the planet's own fitted
// greenhouseFactor (rather than SMS09's fixed 0.79 coefficient) so the cubic
// law is anchored at G_REFERENCE_TEMPERATURE_K -- Earth's actual global-mean
// surface temperature -- which is exactly where GREENHOUSE_FACTOR was fit
// (see CONSTANTS.embConstants.surface.GREENHOUSE_FACTOR), so the fit's
// meaning ("trapping strength at Earth's mean temperature") still holds.
const G_REFERENCE_TEMPERATURE_K = 288

function localGreenhouseFactor(params: LocalGreenhouseParams): number {
	const { temperatureK, baseGreenhouseFactor } = params
	const ratio = temperatureK / G_REFERENCE_TEMPERATURE_K
	return baseGreenhouseFactor * ratio * ratio * ratio
}

// d/dT of localGreenhouseFactor -- needed alongside the OLR value itself so
// energy-balance-model can Newton-linearize OLR(T) = sigma*T^4/(1+g(T))
// around each column's own current temperature every step (product rule:
// g depends on T too, not just the T^4 term).
function localGreenhouseFactorDerivative(
	params: LocalGreenhouseParams,
): number {
	const { temperatureK, baseGreenhouseFactor } = params
	return (
		(3 * baseGreenhouseFactor * temperatureK * temperatureK) /
		(G_REFERENCE_TEMPERATURE_K *
			G_REFERENCE_TEMPERATURE_K *
			G_REFERENCE_TEMPERATURE_K)
	)
}

export const GREENHOUSE_MOISTURE = {
	localGreenhouseFactor,
	localGreenhouseFactorDerivative,
}
