import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	MagneticFieldComputeInput,
	MagneticFieldProfile,
} from "@/model/celestial/planet/magnetic-field/types"
import { MATH } from "@/model/shared/math/core"

// [DEVIATION] Not book-sourced -- the Handbook never rolls a magnetic-field
// stat (magnetism only shows up qualitatively, as one possible driver of the
// Radioactivity taint). This stands in for real planetary-dynamo scaling
// (Christensen/Aubert convective-power laws) using the attributes the book
// does generate as proxies: composition for "is there a metallic core at
// all", mass/density for how big that core is, rotation period for
// Coriolis-driven convective organization, and age against a mass-scaled
// cooling timescale for whether the dynamo has already shut off (Mars-style).
// It only models thermally-driven convection, so it under-predicts a real
// body whose weak field instead comes from compositional convection (e.g.
// real Mercury's inner-core crystallization, or an icy moon's subsurface
// ocean like real Ganymede's).
const METAL_WEIGHT: Record<string, number> = {
	"Mostly Rock": 0.3,
	"Rock and Metal": 1.0,
	"Mostly Metal": 1.3,
	"Compressed Metal": 1.6,
	Carbon: 0.3,
	"Hydrogen-Helium Envelope": 1.4,
}

const EARTH_AGE_GYR = 4.6
const EARTH_COOLING_TIMESCALE_GYR = 10
// Normalizes Earth's own inputs (mass/density/rotation ratio all 1, age
// EARTH_AGE_GYR) to a field index of exactly 1.0.
const CALIBRATION = 1 / (1 - EARTH_AGE_GYR / EARTH_COOLING_TIMESCALE_GYR)

function describeFieldIndex(fieldIndex: number): string {
	if (fieldIndex < 0.05) return "Negligible"
	if (fieldIndex < 0.3) return "Weak"
	if (fieldIndex < 0.7) return "Moderate"
	if (fieldIndex < 1.5) return "Earth-like"
	if (fieldIndex < 3) return "Strong"
	return "Extreme"
}

function computeMagneticField({
	densityDescription,
	densityEarthRelative,
	massKg,
	siderealDayHours,
	starAgeGyr,
}: MagneticFieldComputeInput): MagneticFieldProfile {
	const metalWeight = densityDescription
		? (METAL_WEIGHT[densityDescription] ?? 0)
		: 0
	const massEarths = massKg / ORBIT_BODY.earthMassKg
	if (metalWeight <= 0 || massEarths <= 0) {
		return { fieldIndex: 0, description: describeFieldIndex(0) }
	}
	const densityFactor = densityEarthRelative ?? 0
	const rotationHours = Math.max(Math.abs(siderealDayHours), 1)
	const rotationFactor = 24 / rotationHours
	const coolingTimescaleGyr = EARTH_COOLING_TIMESCALE_GYR * massEarths
	const coolingFactor = MATH.clamp({
		value: 1 - starAgeGyr / coolingTimescaleGyr,
		lo: 0,
		hi: 1,
	})
	const fieldIndex =
		CALIBRATION *
		metalWeight *
		Math.sqrt(massEarths) *
		Math.sqrt(densityFactor) *
		rotationFactor *
		coolingFactor
	return { fieldIndex, description: describeFieldIndex(fieldIndex) }
}

export const MAGNETIC_FIELD = { compute: computeMagneticField }
