import type { EmptyOrbitRollInput } from "@/model/celestial/system/generation/empty-orbits/types"
import { DICE } from "@/model/shared/random/dice"

function roll({ rng, normalWorldCount }: EmptyOrbitRollInput): number {
	if (normalWorldCount <= 1) return 0
	const result = DICE.roll2d6(rng)
	if (result <= 9) return 0
	if (result === 10) return 1
	if (result === 11) return 2
	return 3
}

export const EMPTY_ORBITS = {
	roll,
}
