import { CAST } from "@/model/people/cast"
import type { Cast, Kinship, Person } from "@/model/people/cast/types"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import type {
	BarParams,
	KinshipParams,
	KinshipResult,
} from "@/model/people/marriage/kinship/types"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const BAR_AGE = 25
const REQUIRED: Record<Kinship, number> = {
	sibling: 3,
	"half-sibling": 3,
	"uncle-niece": 2,
	cousin: 1,
}

function bar({ cast, person }: BarParams): number {
	const doctrine = cast.context?.doctrine
	const frame = CAST.snappedFrame({
		cast,
		timeMs: person.birthMs + BAR_AGE * YEAR,
	})
	if (!doctrine || !frame) return 0
	return RELIGION_DOCTRINE.consanguinity({
		doctrine,
		religion: frame.provinceReligion[person.home] ?? -1,
	})
}

function parentIds(cast: Cast, person: Person): number[] {
	const couple = CAST.parentsOf({ cast, person })
	return couple ? [couple[0].id, couple[1].id] : []
}

function shares(first: number[], second: number[]): number {
	let count = 0
	for (const id of first) if (second.includes(id)) count++
	return count
}

function of({ cast, first, second }: KinshipParams): KinshipResult {
	if (first.id === second.id) return "ancestor"
	const firstUp = CAST.ancestors({ cast, id: first.id, generations: 2 })
	const secondUp = CAST.ancestors({ cast, id: second.id, generations: 2 })
	if (firstUp.has(second.id) || secondUp.has(first.id)) return "ancestor"
	const firstParents = parentIds(cast, first)
	const secondParents = parentIds(cast, second)
	const common = shares(firstParents, secondParents)
	if (common === 2) return "sibling"
	if (common === 1) return "half-sibling"
	for (const parent of firstParents)
		if (shares(parentIds(cast, cast.persons[parent]), secondParents) > 0)
			return "uncle-niece"
	for (const parent of secondParents)
		if (shares(parentIds(cast, cast.persons[parent]), firstParents) > 0)
			return "uncle-niece"
	for (const id of firstUp) if (secondUp.has(id)) return "cousin"
	return null
}

function allowed({ cast, first, second }: KinshipParams): boolean {
	const kinship = of({ cast, first, second })
	if (kinship === null) return true
	if (kinship === "ancestor") return false
	return (
		bar({ cast, person: first }) >= REQUIRED[kinship] &&
		bar({ cast, person: second }) >= REQUIRED[kinship]
	)
}

function label({ cast, first, second }: KinshipParams): Kinship | null {
	const kinship = of({ cast, first, second })
	return kinship === "ancestor" ? null : kinship
}

export const KINSHIP = { of, allowed, label }
