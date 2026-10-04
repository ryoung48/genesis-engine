import type {
	MatchScore,
	MatchScoreParams,
} from "@/model/history/sim/people/family/match-scoring/types"
import { OPINION } from "@/model/history/sim/people/opinion"
import { TRAITS } from "@/model/history/sim/people/traits"

function score({
	observer,
	target,
	time,
	context,
	candidateOf,
	alliance: eligible,
	allied,
}: MatchScoreParams): MatchScore | null {
	const a = context.personOf(observer)
	const b = context.personOf(target)
	const breakdown = OPINION.of({ observer, target, time, context })
	if (!a || !b || !breakdown) return null
	const candidate = candidateOf(target)
	const self = candidateOf(observer)
	const attraction =
		TRAITS.attraction({ character: b.character, age: b.age }) +
		candidate.attractionModifier
	const opinion = breakdown.total
	const age = -2 * Math.min(Math.abs(a.age - b.age), 15)
	const standing =
		10 * Math.max(candidate.currentStanding, candidate.projectedStanding)
	const gap = candidate.currentStanding - self.currentStanding
	const alliance = eligible
		? (gap > 0
				? 70
				: gap === 0
					? 25
					: gap === -1
						? 10
						: gap === -2
							? 10 / 3
							: 0) / (allied ? 1.5 : 1)
		: 0
	const desperation = 5 * Math.max(0, a.age - 25)
	return {
		attraction,
		opinion,
		age,
		standing,
		alliance,
		desperation,
		breakdown,
		total: attraction + opinion + age + standing + alliance + desperation,
	}
}

export const MATCH_SCORING = { score }
