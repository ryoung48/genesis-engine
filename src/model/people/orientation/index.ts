import type {
	Orientation,
	OrientationParams,
} from "@/model/people/orientation/types"
import { HASH } from "@/model/shared/random/hash"

const ADULT_AGE = 18
const CHANNEL = 420
const SHARES: readonly (readonly [Orientation, number])[] = [
	["Heterosexual", 0.89],
	["Homosexual", 0.05],
	["Bisexual", 0.05],
	["Asexual", 0.01],
]

function of({ seed }: OrientationParams): Orientation {
	let roll = HASH.unit({ seed, channel: CHANNEL, salt: 0 })
	for (const [orientation, share] of SHARES) {
		roll -= share
		if (roll < 0) return orientation
	}
	return "Asexual"
}

export const ORIENTATION = { of, adultAge: ADULT_AGE }
