import type { SharedRng } from "./rng"

export interface RollDiceInput {
	rng: Pick<SharedRng, "randint">
	count: number
	sides: number
}

export function rollDice({ rng, count, sides }: RollDiceInput): number {
	let total = 0
	for (let i = 0; i < count; i++) total += rng.randint(1, sides)
	return total
}

export function roll2d6(rng: Pick<SharedRng, "randint">): number {
	return rollDice({ rng, count: 2, sides: 6 })
}

export function roll2d5(rng: Pick<SharedRng, "randint">): number {
	return rollDice({ rng, count: 2, sides: 5 })
}

export function roll3d6(rng: Pick<SharedRng, "randint">): number {
	return rollDice({ rng, count: 3, sides: 6 })
}
