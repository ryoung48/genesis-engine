import type {
	DeathAtParams,
	HazardParams,
} from "@/model/history/sim/people/lifespan/types"

const MAX_AGE = 100

// Annual death chance for the pre-modern nobility: heavy infant mortality,
// childbirth risk for women, then Gompertz ageing from 40.
function hazard({ age, sex }: HazardParams): number {
	if (age < 1) return 0.12
	if (age < 5) return 0.025
	if (age < 16) return 0.007
	if (age < 40) return sex === 1 ? 0.02 : 0.012
	return Math.min(1, 0.012 * Math.exp(0.09 * (age - 40)))
}

function deathAt({ sex, birth, from, rng }: DeathAtParams): number {
	for (let age = Math.floor(from - birth); age < MAX_AGE; age++) {
		if (rng.random() < hazard({ age, sex }))
			return Math.max(from, birth + age + rng.random())
	}
	return birth + MAX_AGE
}

export const LIFESPAN = { deathAt }
