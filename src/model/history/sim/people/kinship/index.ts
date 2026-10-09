import type {
	AncestorsParams,
	KinshipParams,
	KinshipRelation,
	RelationParams,
} from "@/model/history/sim/people/kinship/types"

const KIN_DEPTH = 4
function ancestors({
	context,
	person,
	cache,
}: AncestorsParams): Map<number, number> {
	const cached = cache?.get(person)
	if (cached) return cached
	const seen = new Map<number, number>()
	let generation = [person]
	for (let depth = 0; depth <= KIN_DEPTH; depth++) {
		const parents: number[] = []
		for (const current of generation) {
			if (current < 0 || current >= context.father.length || seen.has(current))
				continue
			seen.set(current, depth)
			parents.push(context.father[current], context.mother[current])
		}
		generation = parents
	}
	cache?.set(person, seen)
	return seen
}
function relation({ context, a, b, cache }: RelationParams): KinshipRelation {
	if (a < 0 || b < 0) return { kind: "none", relatedness: 0 }
	const first = ancestors({ context, person: a, cache })
	const second = ancestors({ context, person: b, cache })
	const common = [...first.keys()].filter((id) => second.has(id))
	const older = new Set<number>()
	for (const person of common)
		for (const ancestor of ancestors({ context, person, cache }).keys())
			if (ancestor !== person) older.add(ancestor)
	let kind: KinshipRelation["kind"] = common.length ? "distant" : "none"
	let relatedness = 0
	for (const person of common) {
		if (older.has(person)) continue
		const da = first.get(person)!,
			db = second.get(person)!
		relatedness += 0.5 ** (da + db)
		if (da === 0 || db === 0 || (da === 1 && db === 1)) kind = "close"
		else if (
			kind !== "close" &&
			((da === 1 && db === 2) || (da === 2 && db === 1))
		)
			kind = "uncleNiece"
		else if (kind === "distant" && da === 2 && db === 2) kind = "cousin"
	}
	return { kind, relatedness }
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
export const KINSHIP = { relation, closeKin }
