import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"

export interface EBMConfig {
	orbital: typeof CONSTANTS.embConstants.orbital
	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	stellar?: typeof CONSTANTS.embConstants.stellar
	landFraction?: number[]
	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	radius?: number
	pressure?: number

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	albedo?: number

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	iceAlbedo?: number

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	greenhouseFactor?: number

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	internalHeatTempK?: number
	time?: {
		// [JUSTIFICATION] Omission uses the historical EBM default for this input.
		YEAR_LENGTH_DAYS?: number
		HOURS_PER_DAY?: number
	}

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	iceAlbedoFeedback?: boolean

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	seismologyTotalHeatingK?: number

	// [JUSTIFICATION] Omission uses the historical EBM default for this input.
	landWaterCoupling?: number
}
