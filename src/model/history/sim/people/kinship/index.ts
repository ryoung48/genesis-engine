import type {
	KinshipParams,
	ProhibitedMatchParams,
} from "@/model/history/sim/people/kinship/types"

// Generations of ancestry that bar a match: the fourth degree of the Fourth
// Lateran Council (1215, canon 50), so third cousins and closer are kin.
const KIN_DEPTH = 4

function prohibitedMatch({
	context,
	a,
	b,
	cache,
}: ProhibitedMatchParams): boolean {
	const ancestors = (person: number) => {
		const cached = cache?.get(person)
		if (cached) return cached
		const seen = new Set<number>()
		let generation = [person]
		for (let depth = 0; depth <= KIN_DEPTH; depth++) {
			const parents: number[] = []
			for (const current of generation) {
				if (
					current < 0 ||
					current >= context.father.length ||
					seen.has(current)
				)
					continue
				seen.add(current)
				parents.push(context.father[current], context.mother[current])
			}
			generation = parents
		}
		cache?.set(person, seen)
		return seen
	}
	const first = ancestors(a)
	const second = ancestors(b)
	const [fewer, more] =
		first.size < second.size ? [first, second] : [second, first]
	for (const ancestor of fewer) if (more.has(ancestor)) return true
	return false
}

function closeKin({ context, a, b }: KinshipParams): boolean {
	if (a < 0 || b < 0 || a === b) return false
	const first = [context.father[a], context.mother[a]].filter((id) => id >= 0)
	const second = [context.father[b], context.mother[b]].filter((id) => id >= 0)
	return (
		first.includes(b) ||
		second.includes(a) ||
		first.some((id) => second.includes(id))
	)
}

export const KINSHIP = { prohibitedMatch, closeKin }
