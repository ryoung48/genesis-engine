import { MATH } from "@/model/shared/math/core"

// Cold, dry air holds far less water vapor than warm air (Clausius-Clapeyron),
// and water vapor is the dominant greenhouse contributor -- so a column's
// LOCAL trapping strength should scale with its own temperature, not with a
// single planet-wide constant. Standard Budyko/North EBMs get away with one
// global A/B because they're fit against an all-latitude satellite OLR-vs-T
// regression; that single fit still has to average over both the moist
// tropics and the dry poles, and once a body's climate is disaggregated into
// separately-evolving columns (see energy-balance-model's land/ocean split),
// reusing that single average everywhere overstates the poles' own trapping
// and produces an ANTARCTICA-style warm bias. Moist-EBM literature (e.g. Roe
// & Baker's Snowball feedback analysis, moist-EBM polar amplification papers)
// instead ties the longwave feedback to local temperature.
//
// DRY_REF_K/MOIST_REF_K bracket where this transition happens: below
// DRY_REF_K (roughly Antarctic-interior-cold), a column keeps only DRY_FLOOR
// of the full greenhouse strength (the well-mixed-gas floor, e.g. CO2, that
// doesn't depend on local humidity); at/above MOIST_REF_K (a warm temperate
// day), it gets the full, water-vapor-saturated strength the planet's
// greenhouseFactor was fit against.
const DRY_REF_K = 230
const MOIST_REF_K = 288
const DRY_FLOOR = 0.5

function moistureGreenhouseMultiplier(temperatureK: number): number {
	const warmthFraction = MATH.smoothstep({
		edge0: DRY_REF_K,
		edge1: MOIST_REF_K,
		x: temperatureK,
	})
	return DRY_FLOOR + (1 - DRY_FLOOR) * warmthFraction
}

export const GREENHOUSE_MOISTURE = {
	moistureGreenhouseMultiplier,
}
