import { World } from "./model/types"
import { Dice } from "./model/utilities/dice"

declare global {
	interface Window {
		dice: Dice
		world: World
	}
}

export {}
