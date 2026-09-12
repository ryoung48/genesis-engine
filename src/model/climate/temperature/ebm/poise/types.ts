import type { SeasonalSurfaceConfig } from "@/model/climate/temperature/ebm/seasonal-surface/types"
import type {
	OrbitalParams,
	StellarParams,
} from "@/model/climate/temperature/ebm/types"

export interface PoiseDiscretization {
	latitudeCount: number
	latitudeGrid: "equal-area" | "equal-angle"
	samplesPerYear: number
	insolationDays: number
	startSolarLongitudeDegrees: number
}

export interface PoiseConfig {
	discretization: PoiseDiscretization
	seasonalSurface: SeasonalSurfaceConfig
	orbital: OrbitalParams
	landWaterCoupling: number
	// [JUSTIFICATION] Uses the built-in solar parameters when not overridden.
	stellar?: StellarParams
	// [JUSTIFICATION] Worlds without measured geography use uniform 34% land coverage.
	landFraction?: number[]
	// [JUSTIFICATION] Defaults to Earth's radius when diffusion is not rescaled.
	radius?: number
	// [JUSTIFICATION] Defaults to one bar when pressure is not supplied.
	pressure?: number
	// [JUSTIFICATION] Defaults to an Earth-length orbit and day.
	time?: {
		// [JUSTIFICATION] Defaults to 365 terrestrial days.
		YEAR_LENGTH_DAYS?: number
		// [JUSTIFICATION] Defaults to 24 hours.
		HOURS_PER_DAY?: number
	}
}

export interface PoiseRunParams {
	config: PoiseConfig
	years: number
	dtDays: number
}

export interface PoiseColumnTermsParams {
	tIdx: number
	dt: number
	heatCapacity: readonly number[]
	temperature: number[]
	albedo: number[][]
	olr: number[][]
}

export interface PoiseColumnTerms {
	diagSelf: number[]
	rhs: number[]
}

export interface PoiseResult {
	latsDeg: number[]
	temperature: number[][]
	temperatureAvg: number[]
	insolation: number[][]
	declination: number[]
	converged: boolean
	yearsRun: number
}
