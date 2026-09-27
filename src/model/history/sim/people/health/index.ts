import type {
	BandParams,
	HealthBand,
} from "@/model/history/sim/people/health/types"

const GRAVE_YEARS = 0.5

// Health is read back from the fixed death date: a long life declines over
// its last years, while an early death comes on suddenly.
function band({ birth, death, time }: BandParams): HealthBand {
	const yearsLeft = death - time
	const ageAtDeath = death - birth
	if (yearsLeft < GRAVE_YEARS) return "Grave"
	if (yearsLeft < 2 && ageAtDeath >= 40) return "Poor"
	if (yearsLeft < 6 && ageAtDeath >= 50) return "Fair"
	return "Good"
}

export const HEALTH = { band }
