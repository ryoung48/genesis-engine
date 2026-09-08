import type { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type { SeasonalSurfaceConfig } from "@/model/climate/temperature/ebm/seasonal-surface/types"

export interface EBMDiscretization {
	latitudeCount: number
	latitudeGrid: "equal-area" | "equal-angle"
	samplesPerYear: number
	insolationDays: number
	startSolarLongitudeDegrees: number
}

export interface EBMConfig {
	discretization: EBMDiscretization
	seasonalSurface: SeasonalSurfaceConfig
	orbital: typeof CONSTANTS.embConstants.orbital
	landWaterCoupling: number
	// [JUSTIFICATION] Uses solar parameters when no stellar override is supplied.
	stellar?: typeof CONSTANTS.embConstants.stellar
	// [JUSTIFICATION] Worlds without measured geography use a uniform 0.34 land fraction.
	landFraction?: number[]
	// [JUSTIFICATION] Unspecified bodies use Earth's radius for diffusion scaling.
	radius?: number
	// [JUSTIFICATION] Unspecified atmospheres use one bar.
	pressure?: number
	// [JUSTIFICATION] Uses Earth-like orbital and rotational periods without an override.
	time?: {
		// [JUSTIFICATION] The orbital period defaults to 365 terrestrial days.
		YEAR_LENGTH_DAYS?: number
		// [JUSTIFICATION] The rotation period defaults to 24 hours.
		HOURS_PER_DAY?: number
	}
}
