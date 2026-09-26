import { PEOPLE } from "@/model/history/sim/people"
import type {
	AmongParams,
	HeirResult,
	HeirsOfParams,
	LineParams,
	OrderedParams,
	SiblingsParams,
} from "@/model/history/sim/people/heirs/types"

function ordered({ people, persons, preference }: OrderedParams): number[] {
	const table = people.persons
	const preferred = preference === "male" ? 0 : preference === "female" ? 1 : -1
	return persons.sort((a, b) => {
		if (preferred >= 0 && table.sex[a] !== table.sex[b])
			return table.sex[a] === preferred ? -1 : 1
		return table.birth[a] - table.birth[b] || a - b
	})
}

function siblings({ people, person, preference }: SiblingsParams): number[] {
	const table = people.persons
	const found = new Set<number>()
	for (const parent of [table.father[person], table.mother[person]]) {
		if (parent < 0) continue
		for (const child of table.children[parent])
			if (child !== person) found.add(child)
	}
	return ordered({ people, persons: [...found], preference })
}

// Primogeniture with representation: a dead heir's line comes before the
// next sibling.
function firstInLine({ person, ...line }: LineParams): number {
	const { people, time, eligible, seen } = line
	if (seen.has(person)) return -1
	seen.add(person)
	if (PEOPLE.aliveAt({ people, person, time }))
		return eligible(person) ? person : -1
	if (people.persons.birth[person] > time) return -1
	return firstAmong({ ...line, persons: people.persons.children[person] })
}

function firstAmong({ persons, ...line }: AmongParams): number {
	for (const candidate of ordered({
		people: line.people,
		persons: [...persons],
		preference: line.preference,
	})) {
		const heir = firstInLine({ ...line, person: candidate })
		if (heir >= 0) return heir
	}
	return -1
}

function of({
	people,
	dying,
	time,
	preference,
	eligible,
}: HeirsOfParams): HeirResult {
	const seen = new Set<number>([dying])
	const line = { people, time, preference, eligible, seen }
	const table = people.persons
	const child = firstAmong({ ...line, persons: table.children[dying] })
	if (child >= 0) return { heir: child, relation: "child" }
	const sibling = firstAmong({
		...line,
		persons: siblings({ people, person: dying, preference }),
	})
	if (sibling >= 0) return { heir: sibling, relation: "sibling" }
	for (const parent of [table.father[dying], table.mother[dying]]) {
		if (parent < 0) continue
		const relative = firstAmong({
			...line,
			persons: siblings({ people, person: parent, preference }),
		})
		if (relative >= 0) return { heir: relative, relation: "relative" }
	}
	return { heir: -1, relation: "none" }
}

export const HEIRS = { of }
