import { PEOPLE_RECORD } from "@/model/history/record/people"
import type {
	InitializeNamesParams,
	NameContext,
	NamedPerson,
	PersonCommentParams,
	PersonNames,
	PersonNamesParams,
	PersonPayloadParams,
} from "@/model/history/record/people/names/types"
import type { PeopleRecord } from "@/model/history/record/people/types"
import type { Ruler } from "@/model/history/world-frame/types"

const contexts = new WeakMap<PeopleRecord, NameContext>()

function initialize({ people, generator }: InitializeNamesParams): void {
	contexts.set(people, { generator, cache: new Map() })
}

function context(people: PeopleRecord): NameContext {
	const result = contexts.get(people)
	if (!result) throw new Error("Person names have no world context")
	return result
}

function house({ people, person }: PersonNamesParams): string | null {
	const row = people ? PEOPLE_RECORD.person({ people, id: person }) : null
	if (!people || !row || row.dynasty < 0) return null
	return context(people).generator.dynasty({
		dynastyIdx: row.dynasty,
		province: people.dynastyHome.get(row.dynasty) ?? row.home,
	})
}

function names(params: PersonNamesParams): PersonNames | null {
	const { people, person } = params
	const row = people ? PEOPLE_RECORD.person({ people, id: person }) : null
	if (!people || !row) return null
	const resolved = context(people)
	const cached = resolved.cache.get(person)
	if (cached) return cached
	const named = resolved.generator.ruler({
		province: row.home,
		nameSeed: row.nameSeed,
	})
	const result = {
		name: named.name,
		female: named.female,
		house: house(params),
	}
	resolved.cache.set(person, result)
	return result
}

function person(params: PersonNamesParams): NamedPerson | null {
	const named = names(params)
	const row = params.people
		? PEOPLE_RECORD.person({ people: params.people, id: params.person })
		: null
	return row && named ? { ...row, ...named } : null
}

function payload({
	people,
	payload,
}: PersonPayloadParams): Record<string, unknown> {
	if (typeof payload.person !== "number") return payload
	const named = names({ people, person: payload.person })
	if (!named) return payload
	return {
		...payload,
		name: named.name,
		dynasty: named.house,
		female: named.female,
		regentName:
			typeof payload.regent === "number"
				? (names({ people, person: payload.regent })?.name ?? null)
				: null,
	}
}

function ruler({ people, payload }: PersonPayloadParams): Ruler {
	if (!people || typeof payload.person !== "number")
		return {
			name: payload.name as string,
			dynasty: (payload.dynasty as string | undefined) ?? null,
		}
	const params = { people, person: payload.person }
	let name: string | null = null
	let dynasty: string | null = null
	let dynastyResolved = false
	return {
		get name() {
			name ??= names(params)?.name ?? "Unknown ruler"
			return name
		},
		get dynasty() {
			if (!dynastyResolved) {
				dynasty = house(params)
				dynastyResolved = true
			}
			return dynasty
		},
	}
}

function comment({ people, comment }: PersonCommentParams): string | null {
	if (typeof comment === "string") return comment
	if (comment === null) return null
	if (comment.cause === "partition") {
		const late = names({ people, person: comment.late })?.name
		const heir = names({ people, person: comment.person })?.name
		return `Split from ${comment.nation} in the partition of ${late ? `${late}'s` : "the late ruler's"} realm${heir ? `, under ${heir}` : ""}`
	}
	const pretender = names({ people, person: comment.person })?.name
	return `Revolted against ${comment.nation} (${comment.cause}${pretender ? `, for ${pretender}` : ""})${comment.throne ? " to seize the throne" : ""}`
}

export const PERSON_NAMES = { initialize, person, payload, ruler, comment }
