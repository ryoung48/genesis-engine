import { RNG } from "@/model/shared/rng"
import type { BuildIdentitySeedsParams } from "@/model/shared/identity-seeds/types"

function buildIdentitySeeds({
	count,
	seed,
}: BuildIdentitySeedsParams): Int32Array {
	const rng = RNG.createRng({ seed: seed + 6197 })
	const seeds = new Int32Array(count)
	for (let i = 0; i < count; i++) {
		seeds[i] = rng.randint(1, 0x7fffffff)
	}
	return seeds
}

export const IDENTITY_SEEDS = {
	buildIdentitySeeds,
}
