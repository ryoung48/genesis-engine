import {
	createStringRng,
	type SharedRng,
	type WeightedValue as SharedWeightedValue,
} from "@/model/shared/rng"

export type WeightedValue<T> = SharedWeightedValue<T>

export interface LanguageRng {
	readonly random: number
	uniform(min?: number, max?: number): number
	randint(min: number, max: number): number
	choice<T>(arr: readonly T[]): T
	weightedChoice<T>(arr: readonly WeightedValue<T>[]): T
	shuffle<T>(arr: readonly T[]): T[]
	sample<T>(arr: readonly T[], count: number): T[]
	weightedSample<T>(
		arr: readonly WeightedValue<T>[],
		count: number,
		unique?: boolean,
	): T[]
}

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

export function createLanguageRng(seed: string): LanguageRng {
	return wrapSharedRng(
		createStringRng(seed, { nonPositiveWeightBehavior: "first" }),
	)
}
