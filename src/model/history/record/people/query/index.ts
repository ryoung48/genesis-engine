import type {
	PersonAtParams,
	PersonEvent,
	PersonHealth,
	PersonView,
	SeatAtParams,
	SpouseView,
	TenureView,
} from "@/model/history/record/people/query/types"
import { yearMs } from "@/model/history/sim/engine/state/time"

function until(time: number, timeMs: number): number | null {
	return time <= timeMs ? time : null
}

function view({ people, id, timeMs }: PersonAtParams): PersonView | null {
	const person = people.persons.get(id)
	if (!person || person.birthTimeMs > timeMs) return null
	const bornBy = (other: number) =>
		(people.persons.get(other)?.birthTimeMs ?? Infinity) <= timeMs
	const spouses: SpouseView[] = []
	for (const index of people.marriagesOf.get(id) ?? []) {
		const marriage = people.marriages[index]
		if (marriage.startTimeMs > timeMs) continue
		const partner = marriage.husband === id ? marriage.wife : marriage.husband
		const partnerDeath = people.persons.get(partner)?.deathTimeMs ?? Infinity
		spouses.push({
			person: partner,
			startTimeMs: marriage.startTimeMs,
			endTimeMs: until(Math.min(person.deathTimeMs, partnerDeath), timeMs),
		})
	}
	const tenures: TenureView[] = []
	for (const index of people.tenuresOf.get(id) ?? []) {
		const tenure = people.tenures[index]
		if (tenure.startTimeMs > timeMs) continue
		tenures.push({
			seat: tenure.seat,
			sovereign: tenure.sovereign,
			startTimeMs: tenure.startTimeMs,
			endTimeMs: until(tenure.endTimeMs, timeMs),
		})
	}
	return {
		...person,
		father: people.persons.has(person.father) ? person.father : -1,
		mother: people.persons.has(person.mother) ? person.mother : -1,
		deathTimeMs: until(person.deathTimeMs, timeMs),
		spouses,
		children: (people.childrenOf.get(id) ?? []).filter(bornBy),
		siblings: [
			...new Set(
				[person.father, person.mother].flatMap(
					(parent) => people.childrenOf.get(parent) ?? [],
				),
			),
		].filter((sibling) => sibling !== id && bornBy(sibling)),
		tenures,
	}
}

function timeline(params: PersonAtParams): PersonEvent[] {
	const person = view(params)
	if (!person) return []
	const events: PersonEvent[] = [
		{ timeMs: person.birthTimeMs, kind: "born", other: -1 },
	]
	for (const spouse of person.spouses)
		events.push({
			timeMs: spouse.startTimeMs,
			kind: "married",
			other: spouse.person,
		})
	for (const child of person.children)
		events.push({
			timeMs: params.people.persons.get(child)?.birthTimeMs ?? 0,
			kind: "child born",
			other: child,
		})
	for (const tenure of person.tenures) {
		events.push({
			timeMs: tenure.startTimeMs,
			kind: "took seat",
			other: tenure.seat,
		})
		if (tenure.endTimeMs !== null && tenure.endTimeMs !== person.deathTimeMs)
			events.push({
				timeMs: tenure.endTimeMs,
				kind: "left seat",
				other: tenure.seat,
			})
	}
	if (person.deathTimeMs !== null)
		events.push({ timeMs: person.deathTimeMs, kind: "died", other: -1 })
	return events.sort((a, b) => a.timeMs - b.timeMs)
}

// Health is read back from the fixed death date: a long life declines over
// its last years, while an early death comes on suddenly.
function health({ people, id, timeMs }: PersonAtParams): PersonHealth | null {
	const person = people.persons.get(id)
	if (!person || person.birthTimeMs > timeMs || person.deathTimeMs <= timeMs)
		return null
	const yearsLeft = (person.deathTimeMs - timeMs) / yearMs
	const ageAtDeath = (person.deathTimeMs - person.birthTimeMs) / yearMs
	if (yearsLeft < 0.5) return "Grave"
	if (yearsLeft < 2 && ageAtDeath >= 40) return "Poor"
	if (yearsLeft < 6 && ageAtDeath >= 50) return "Fair"
	return "Good"
}

function holder({ people, seat, timeMs }: SeatAtParams): number {
	const tenures = people.tenuresOfSeat.get(seat) ?? []
	for (let i = tenures.length - 1; i >= 0; i--) {
		const tenure = people.tenures[tenures[i]]
		if (tenure.startTimeMs <= timeMs)
			return tenure.endTimeMs > timeMs ? tenure.person : -1
	}
	return -1
}

export const PERSON_QUERY = { view, timeline, holder, health }
