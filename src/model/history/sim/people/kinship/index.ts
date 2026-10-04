import type {
	KinshipParams,
	ProhibitedMatchParams,
} from "@/model/history/sim/people/kinship/types"

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
		const pending = [person]
		while (pending.length > 0) {
			const current = pending.pop() as number
			if (current < 0 || current >= context.father.length || seen.has(current))
				continue
			seen.add(current)
			pending.push(context.father[current], context.mother[current])
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
