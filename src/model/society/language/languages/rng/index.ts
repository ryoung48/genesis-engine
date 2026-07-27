import { createStringRng, type SharedRng } from "@/model/shared"
import type {
	LanguageRng,
	WeightedValue,
} from "@/model/society/language/languages/types"

function wrapSharedRng(rng: SharedRng): LanguageRng {
	return {
		get random() {
			return rng.random()
		},
		uniform: (min = 0, max = 1) => rng.uniform(min, max),
		randint: (min, max) => rng.randint(min, max),
		choice: <T>(arr: readonly T[]) => rng.choice(arr),
		weightedChoice: <T>(arr: readonly WeightedValue<T>[]) =>
			rng.weightedChoice(arr) as T,
		shuffle: <T>(arr: readonly T[]) => rng.shuffle(arr),
		sample: <T>(arr: readonly T[], count: number) => rng.sample(arr, count),
		weightedSample: <T>(
			arr: readonly WeightedValue<T>[],
			count: number,
			unique = true,
		) => rng.weightedSample(arr, count, unique),
	}
}

function createLanguageRng(seed: string): LanguageRng {
	return wrapSharedRng(
		createStringRng(seed, { nonPositiveWeightBehavior: "first" }),
	)
}

export const RNG = {
	createLanguageRng,
}
