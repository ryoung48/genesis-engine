import type {
	Orientation,
	OrientationParams,
} from "@/model/history/sim/people/orientation/types"
import { HASH } from "@/model/shared/random/hash"

function of({ seed }: OrientationParams): Orientation {
	const roll = HASH.unit({ seed, channel: 420, salt: 0 })
	return roll < 0.89 ? 0 : roll < 0.94 ? 1 : roll < 0.99 ? 2 : 3
}
export const ORIENTATION = {
	of,
	names: ["Heterosexual", "Homosexual", "Bisexual", "Asexual"] as const,
}
