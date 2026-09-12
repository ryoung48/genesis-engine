import type {
	OrbitalParams,
	StellarParams,
} from "@/model/climate/temperature/ebm/types"

export interface InsolationComputeParams {
	lats: number[]
	orbital: OrbitalParams
	// [JUSTIFICATION] Standard world generation uses the built-in 365-sample year.
	sampleCount?: number
	// [JUSTIFICATION] Standard world generation uses its existing calendar epoch.
	startSolarLongitudeDegrees?: number
	// [JUSTIFICATION] Defaults to the built-in stellar parameters.
	stellarOverride?: StellarParams
}
