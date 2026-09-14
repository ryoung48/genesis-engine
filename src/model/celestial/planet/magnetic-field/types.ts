export interface MagneticFieldComputeInput {
	/** DensityProfile.description -- an unrecognized or absent value (e.g. an
	 * asteroid belt's null density) is treated as "no metallic core". */
	densityDescription?: string
	densityEarthRelative?: number
	massKg: number
	siderealDayHours: number
	starAgeGyr: number
}

export interface MagneticFieldProfile {
	/** 1.0 == Earth's own field strength, under this module's calibration. */
	fieldIndex: number
	description: string
}
