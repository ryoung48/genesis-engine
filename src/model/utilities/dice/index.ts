import { MATH } from "../math"
import { WeightedDistribution } from "./types"

interface Shuffler<T> {
	r: number
	e: T
}

export class Dice {
	private seed: number
	private spare?: number
	constructor(seed: string) {
		this.seed = parseInt(seed, 36)
		this.spare = 0
	}
	// https://gist.github.com/blixt/f17b47c62508be59987b
	get random() {
		this.seed = Math.imul(16807, this.seed) | (0 % 2147483647)
		return (this.seed & 2147483647) / 2147483648
	}
	/**
	 *
	 * @param min
	 * @param max excluding max
	 */
	public uniform(min = 0, max = 1) {
		return this.random * (max - min) + min
	}
	/**
	 *
	 * @param min
	 * @param max including max
	 */
	public randint(min: number, max: number) {
		min = Math.ceil(min)
		max = Math.floor(max)
		return Math.floor(this.random * (max - min + 1)) + min
	}
	// https://en.wikipedia.org/wiki/Marsaglia_arctic_method
	public norm(mean: number, dev: number) {
		if (this.spare) {
			const spare = this.spare
			delete this.spare
			return spare * dev + mean
		}
		let s, u, v
		do {
			u = this.uniform(-1, 1)
			v = this.uniform(-1, 1)
			s = u * u + v * v
		} while (s >= 1)
		s = Math.sqrt((-2 * Math.log(s)) / s)
		this.spare = s * v
		return s * u * dev + mean
	}
	/**
	 * Pick a random item from an array
	 * @param arr arbitrary array
	 */
	public choice<T>(arr: T[]) {
		return arr[~~(this.random * arr.length)]
	}

	public weightedChoice<T>(arr: WeightedDistribution<T>) {
		const keys = arr.map(({ v }) => v)
		const weights = arr.map(({ w }) => w)
		const rng = this.random
		const scaled = MATH.normalize(weights)
		let acc = 0
		for (let i = 0; i < scaled.length; i++) {
			acc += scaled[i]
			if (rng <= acc) return keys[i]
		}
	}

	public shuffle<T>(arr: T[]) {
		return arr
			.map((a) => ({ r: this.random, e: a }) as Shuffler<T>)
			.sort((a: Shuffler<T>, b: Shuffler<T>) => a.r - b.r)
			.map((a) => a.e)
	}

	public sample<T>(arr: T[], cnt: number) {
		return this.shuffle(arr).slice(0, cnt)
	}
	public weightedSample<T>(
		arr: { v: T; w: number }[],
		num: number,
		unique = true,
	) {
		let items = [...arr]
		const selected: T[] = []
		let count = num
		while (count-- > 0 && items.length > 0) {
			const chosen = this.weightedChoice(items)
			if (chosen === undefined) {
				throw new Error(
					`Could not find weighted choice in ${JSON.stringify(items)}`,
				)
			}
			selected.push(chosen)
			if (unique) items = items.filter(({ v }) => v !== chosen)
		}
		return selected
	}
	public generateId() {
		return DICE.id(this.random)
	}
	public color(target?: [number, number]) {
		const space = target ?? [0, 360]
		const hue = this.randint(...space)
		const saturation = this.randint(20, 80)
		const lum = this.randint(20, 60)
		return `hsl(${hue}, ${saturation}%, ${lum}%)`
	}
	public roll(dice: number, sides: number, drops = 0, advantage = true) {
		const rolls = Array(dice)
			.fill(0)
			.map(() => this.randint(1, sides))
			.sort((a, b) => (advantage ? b - a : a - b))
			.slice(0, dice - drops)
		return rolls.reduce((sum, i) => sum + i, 0)
	}
}

export const DICE = {
	id: (seed = Math.random()) => {
		return Math.floor(seed * Number.MAX_SAFE_INTEGER).toString(36)
	},
	spawn: (seed: string) => {
		window.dice = new Dice(seed)
		return window.dice
	},
	swap: <T>(seed: string, f: () => T) => {
		const old = window.dice
		window.dice = new Dice(seed)
		const result = f()
		window.dice = old
		return result
	},
}
