/**
 * Standalone seeded RNG for the history simulation.
 * Same LCG algorithm as src/model/orogen/util/rng.ts and src/model/utilities/dice,
 * extended with the sampling methods history events need.
 */

export interface HistoryRng {
	/** [0, 1) uniform random */
	random(): number
	/** [min, max) uniform float */
	uniform(min: number, max: number): number
	/** [min, max] inclusive random integer */
	randint(min: number, max: number): number
	/** Pick a random element from an array */
	choice<T>(arr: readonly T[]): T
	/** Weighted choice from {v, w}[] */
	weightedChoice<T>(arr: readonly { v: T; w: number }[]): T | undefined
	/** Fisher-Yates shuffle (returns new array) */
	shuffle<T>(arr: readonly T[]): T[]
}

export function createHistoryRng(seed: number): HistoryRng {
	let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1

	function random(): number {
		s = (s * 16807) % 2147483647
		return (s - 1) / 2147483646
	}

	function uniform(min: number, max: number): number {
		return random() * (max - min) + min
	}

	function randint(min: number, max: number): number {
		return (
			Math.floor(random() * (Math.floor(max) - Math.ceil(min) + 1)) +
			Math.ceil(min)
		)
	}

	function choice<T>(arr: readonly T[]): T {
		return arr[Math.floor(random() * arr.length)]
	}

	function weightedChoice<T>(
		arr: readonly { v: T; w: number }[],
	): T | undefined {
		let total = 0
		for (let i = 0; i < arr.length; i++) total += arr[i].w
		if (total <= 0) return undefined
		let roll = random() * total
		for (let i = 0; i < arr.length; i++) {
			roll -= arr[i].w
			if (roll <= 0) return arr[i].v
		}
		return arr[arr.length - 1].v
	}

	function shuffle<T>(arr: readonly T[]): T[] {
		const result = arr.slice()
		for (let i = result.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1))
			const tmp = result[i]
			result[i] = result[j]
			result[j] = tmp
		}
		return result
	}

	return { random, uniform, randint, choice, weightedChoice, shuffle }
}
