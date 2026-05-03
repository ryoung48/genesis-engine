import { createRng } from "./rng"

export function buildIdentitySeeds(count: number, seed: number): Int32Array {
	const rng = createRng(seed + 6197)
	const seeds = new Int32Array(count)
	for (let i = 0; i < count; i++) {
		seeds[i] = rng.randint(1, 0x7fffffff)
	}
	return seeds
}
