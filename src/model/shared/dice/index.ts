import type { SharedRng } from "@/model/shared/rng"
import type { RollDiceInput } from "@/model/shared/dice/types"

function rollDice({ rng, count, sides }: RollDiceInput): number {
	let total = 0
	for (let i = 0; i < count; i++) total += rng.randint(1, sides)
	return total
}

function roll2d6(rng: Pick<SharedRng, "randint">): number {
	return rollDice({ rng, count: 2, sides: 6 })
}

function roll2d5(rng: Pick<SharedRng, "randint">): number {
	return rollDice({ rng, count: 2, sides: 5 })
}

function roll3d6(rng: Pick<SharedRng, "randint">): number {
	return rollDice({ rng, count: 3, sides: 6 })
}

export const DICE = {
	rollDice,
	roll2d6,
	roll2d5,
	roll3d6,
}
