import type {
	OrbitalParams,
	StellarParams,
} from "@/model/climate/temperature/ebm/types"

export interface InsolationComputeParams {
	// [JUSTIFICATION] Reference runs use the integer number of rotations per orbit; world output defaults to 365 samples.
	sampleCount?: number
	// [JUSTIFICATION] Normal world output uses a January-like epoch; benchmarks specify theirs.
	startSolarLongitudeDegrees?: number
	lats: number[]
	orbital: OrbitalParams
	// [JUSTIFICATION] Defaults to the built-in stellar parameters.
	stellarOverride?: StellarParams
}

export interface EccentricAnomalyParams {
	trueAnomaly: number
	eccentricity: number
}
