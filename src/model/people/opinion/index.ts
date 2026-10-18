import { CHARACTER } from "@/model/people/character"
import type {
	OpinionBreakdown,
	OpinionParams,
} from "@/model/people/opinion/types"

const SAME_CULTURE = 10
const SAME_HERITAGE = 5
const SAME_RELIGION = 15
const KIN = 10
const SPOUSE = 10
const LIMIT = 100

function of({
	observer,
	target,
	kin,
	spouse,
}: OpinionParams): OpinionBreakdown {
	const personality = CHARACTER.compatibility({
		first: { character: observer.character, age: observer.age },
		second: { character: target.character, age: target.age },
	})
	const culture =
		observer.culture >= 0 && target.culture >= 0
			? observer.culture === target.culture
				? SAME_CULTURE
				: observer.heritage >= 0 && observer.heritage === target.heritage
					? SAME_HERITAGE
					: 0
			: 0
	const religion =
		observer.religion >= 0 && observer.religion === target.religion
			? SAME_RELIGION
			: 0
	const reputation = CHARACTER.reputation({
		character: target.character,
		age: target.age,
	})
	const unclamped =
		personality +
		culture +
		religion +
		reputation +
		(kin ? KIN : 0) +
		(spouse ? SPOUSE : 0)
	return {
		personality,
		culture,
		religion,
		reputation,
		kin: kin ? KIN : 0,
		spouse: spouse ? SPOUSE : 0,
		unclamped,
		total: Math.max(-LIMIT, Math.min(LIMIT, unclamped)),
	}
}

export const OPINION = { of }
