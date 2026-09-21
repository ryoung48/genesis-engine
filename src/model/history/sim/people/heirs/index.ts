import { PEOPLE } from "@/model/history/sim/people"
import type {
	HeirResult,
	HeirsOfParams,
	KinGroupParams,
	LineParams,
	OrderedParams,
} from "@/model/history/sim/people/heirs/types"
import { KIN } from "@/model/history/sim/people/kin"

function siblings({ people, person, gender }: KinGroupParams): number[] {
	const persons = people.persons
	const found = new Set<number>()
	for (const parent of [persons.father[person], persons.mother[person]]) {
		if (parent < 0) continue
		for (const child of KIN.childrenOf({ kin: people.persons, parent })) {
			if (child !== person) found.add(child)
		}
	}
	return ordered({ people, persons: [...found], gender })
}

function ordered({ people, persons, gender }: OrderedParams): number[] {
	const table = people.persons
	const eligible = persons.filter(
		(person) =>
			(gender !== "male_only" && gender !== "female_only") ||
			(gender === "male_only"
				? table.sex[person] === 0
				: table.sex[person] === 1),
	)
	const preferred =
		gender === "male_preference" ? 0 : gender === "female_preference" ? 1 : -1
	return eligible.sort((a, b) => {
		if (preferred >= 0 && table.sex[a] !== table.sex[b])
			return table.sex[a] === preferred ? -1 : 1
		return table.birth[a] - table.birth[b] || a - b
	})
}

function descendants({
	people,
	person,
	gender,
	time,
	seen,
}: LineParams): number[] {
	const result: number[] = []
	const children = ordered({
		people,
		persons: KIN.childrenOf({ kin: people.persons, parent: person }),
		gender,
	})
	for (const child of children) {
		if (seen.has(child)) continue
		seen.add(child)
		if (PEOPLE.aliveAt({ people, person: child, time })) result.push(child)
		else
			result.push(...descendants({ people, person: child, gender, time, seen }))
	}
	return result
}

function of({ people, dying, time, law, gender }: HeirsOfParams): HeirResult {
	const seen = new Set<number>([dying])
	const order = descendants({ people, person: dying, gender, time, seen })
	const fromChildren = order.length > 0
	if (order.length === 0) {
		for (const sibling of siblings({ people, person: dying, gender })) {
			if (PEOPLE.aliveAt({ people, person: sibling, time })) order.push(sibling)
			else
				order.push(
					...descendants({ people, person: sibling, gender, time, seen }),
				)
		}
	}
	if (order.length === 0) {
		const table = people.persons
		const relatives = new Set<number>()
		for (const parent of [table.father[dying], table.mother[dying]]) {
			if (parent < 0) continue
			for (const relative of siblings({ people, person: parent, gender }))
				relatives.add(relative)
		}
		for (const relative of ordered({
			people,
			persons: [...relatives],
			gender,
		})) {
			if (PEOPLE.aliveAt({ people, person: relative, time }))
				order.push(relative)
			else
				order.push(
					...descendants({ people, person: relative, gender, time, seen }),
				)
		}
	}
	const primary = order[0] ?? -1
	const juniors =
		law === "single_heir" || !fromChildren
			? []
			: ordered({
					people,
					persons: KIN.childrenOf({ kin: people.persons, parent: dying }),
					gender,
				}).filter(
					(child) =>
						child !== primary &&
						PEOPLE.aliveAt({ people, person: child, time }),
				)
	return { primary, juniors, order }
}

export const HEIRS = { of }
