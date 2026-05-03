import { createRng } from "@/model/shared/rng"

export type WeightedValue<T> = { v: T; w: number }

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

function seedStringToNumber(seed: string): number {
	const normalized = seed.trim().toLowerCase()
	if (/^[0-9a-z]+$/.test(normalized)) {
		const parsed = Number.parseInt(normalized, 36)
		if (Number.isFinite(parsed) && parsed !== 0) return parsed
	}

	let hash = 2166136261
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return Math.abs(hash) || 1
}

class SharedLanguageRng implements LanguageRng {
	private readonly rng

	constructor(seed: string) {
		this.rng = createRng(seedStringToNumber(seed))
	}

	get random(): number {
		return this.rng.random()
	}

	uniform(min = 0, max = 1): number {
		return this.random * (max - min) + min
	}

	randint(min: number, max: number): number {
		return this.rng.randint(min, max)
	}

	choice<T>(arr: readonly T[]): T {
		return arr[this.randint(0, Math.max(0, arr.length - 1))] as T
	}

	weightedChoice<T>(arr: readonly WeightedValue<T>[]): T {
		if (arr.length === 0) return undefined as T

		let total = 0
		for (const entry of arr) total += entry.w
		if (total <= 0) return arr[0]?.v as T

		let roll = this.uniform(0, total)
		for (const entry of arr) {
			roll -= entry.w
			if (roll <= 0) return entry.v
		}
		return arr[arr.length - 1]?.v as T
	}

	shuffle<T>(arr: readonly T[]): T[] {
		const result = [...arr]
		for (let i = result.length - 1; i > 0; i--) {
			const j = this.randint(0, i)
			const tmp = result[i]
			result[i] = result[j]
			result[j] = tmp
		}
		return result
	}

	sample<T>(arr: readonly T[], count: number): T[] {
		return this.shuffle(arr).slice(0, count)
	}

	weightedSample<T>(
		arr: readonly WeightedValue<T>[],
		count: number,
		unique = true,
	): T[] {
		let items = [...arr]
		const selected: T[] = []
		let remaining = count

		while (remaining-- > 0 && items.length > 0) {
			const chosen = this.weightedChoice(items)
			selected.push(chosen)
			if (unique) items = items.filter((entry) => entry.v !== chosen)
		}

		return selected
	}
}

export function createLanguageRng(seed: string): LanguageRng {
	return new SharedLanguageRng(seed)
}
