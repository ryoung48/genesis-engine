import type { DeathAtParams } from "@/model/history/sim/people/lifespan/types"

const MAX_AGE = 100

// Annual death chance for the pre-modern nobility: heavy child mortality,
// then Gompertz ageing from 40. Childbirth deaths come from pregnancies.
function hazard(age: number): number {
	if (age < 1) return 0.1
	if (age < 5) return 0.03
	if (age < 16) return 0.005
	if (age < 40) return 0.012
	return Math.min(1, 0.012 * Math.exp(0.09 * (age - 40)))
}

function deathAt({ birth, from, rng }: DeathAtParams): number {
	for (let age = Math.floor(from - birth); age < MAX_AGE; age++) {
		if (rng.random() < hazard(age))
			return Math.max(from, birth + age + rng.random())
	}
	return birth + MAX_AGE
}

export const LIFESPAN = { deathAt }
