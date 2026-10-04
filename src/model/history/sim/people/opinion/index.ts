import { KINSHIP } from "@/model/history/sim/people/kinship"
import type {
	OpinionBreakdown,
	OpinionParams,
} from "@/model/history/sim/people/opinion/types"
import { TRAITS } from "@/model/history/sim/people/traits"

function of({
	observer,
	target,
	time,
	context,
}: OpinionParams): OpinionBreakdown | null {
	const a = context.personOf(observer)
	const b = context.personOf(target)
	if (!a || !b || observer === target) return null
	const personality = TRAITS.compatibility({
		first: { character: a.character, age: a.age },
		second: { character: b.character, age: b.age },
	})
	const culture =
		a.culture >= 0 && b.culture >= 0
			? a.culture === b.culture
				? 10
				: a.heritage >= 0 && a.heritage === b.heritage
					? 5
					: 0
			: 0
	const religion = a.religion >= 0 && a.religion === b.religion ? 15 : 0
	const reputation = TRAITS.reputation({
		character: b.character,
		age: b.age,
		vassal: a.districtSovereigns.some((seat) =>
			b.sovereignSeats.includes(seat),
		),
	})
	const kin = KINSHIP.closeKin({
		context: context.kinship,
		a: observer,
		b: target,
	})
		? 10
		: 0
	const spouse = context.married({ a: observer, b: target, time }) ? 10 : 0
	const unclamped = personality + culture + religion + reputation + kin + spouse
	return {
		personality,
		culture,
		religion,
		reputation,
		kin,
		spouse,
		memories: 0,
		unclamped,
		total: Math.max(-100, Math.min(100, unclamped)),
	}
}

export const OPINION = { of }
