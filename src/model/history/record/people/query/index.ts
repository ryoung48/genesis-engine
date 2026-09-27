import type {
	PersonAtParams,
	PersonEvent,
	PersonView,
	SeatAtParams,
	SpouseView,
	TenureView,
} from "@/model/history/record/people/query/types"
import { yearMs } from "@/model/history/sim/engine/state/time"
import { HEALTH } from "@/model/history/sim/people/health"
import type { HealthBand } from "@/model/history/sim/people/health/types"

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
	const tenureViews = (indices: number[]) =>
		indices.flatMap((index): TenureView[] => {
			const tenure = people.tenures[index]
			if (tenure.startTimeMs > timeMs) return []
			return [
				{
					seat: tenure.seat,
					kind: tenure.kind,
					ward: tenure.ward,
					startTimeMs: tenure.startTimeMs,
					endTimeMs: until(tenure.endTimeMs, timeMs),
					person: tenure.person,
				},
			]
		})
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
		tenures: tenureViews(people.tenuresOf.get(id) ?? []),
		regents: tenureViews(people.regentsOfWard.get(id) ?? []),
	}
}

function timeline(params: PersonAtParams): PersonEvent[] {
	const person = view(params)
	if (!person) return []
	const events: PersonEvent[] = [
		{ timeMs: person.birthTimeMs, kind: "born", other: -1, tenure: -1 },
	]
	for (const spouse of person.spouses)
		events.push({
			timeMs: spouse.startTimeMs,
			kind: "married",
			other: spouse.person,
			tenure: -1,
		})
	for (const child of person.children)
		events.push({
			timeMs: params.people.persons.get(child)?.birthTimeMs ?? 0,
			kind: "child born",
			other: child,
			tenure: -1,
		})
	for (const [index, tenure] of person.tenures.entries()) {
		const regent = tenure.kind === "regent"
		events.push({
			timeMs: tenure.startTimeMs,
			kind: regent ? "became regent" : "took seat",
			other: tenure.seat,
			tenure: index,
		})
		if (tenure.endTimeMs !== null && tenure.endTimeMs !== person.deathTimeMs)
			events.push({
				timeMs: tenure.endTimeMs,
				kind: regent ? "left regency" : "left seat",
				other: tenure.seat,
				tenure: index,
			})
	}
	for (const [index, regency] of person.regents.entries())
		events.push({
			timeMs: regency.startTimeMs,
			kind: "regent appointed",
			other: regency.person,
			tenure: index,
		})
	let childbirth = false
	for (const pregnancy of params.people.pregnanciesOf.get(params.id) ?? []) {
		if (pregnancy.timeMs > params.timeMs) continue
		if (pregnancy.outcome === "childbirth death") {
			childbirth = true
			continue
		}
		events.push({
			timeMs: pregnancy.timeMs,
			kind:
				pregnancy.outcome === "miscarriage" ? "miscarriage" : "stillborn child",
			other: pregnancy.father,
			tenure: -1,
		})
	}
	if (person.deathTimeMs !== null)
		events.push({
			timeMs: person.deathTimeMs,
			kind: childbirth ? "died in childbirth" : "died",
			other: -1,
			tenure: -1,
		})
	return events.sort((a, b) => a.timeMs - b.timeMs)
}

function health({ people, id, timeMs }: PersonAtParams): HealthBand | null {
	const person = people.persons.get(id)
	if (!person || person.birthTimeMs > timeMs || person.deathTimeMs <= timeMs)
		return null
	return HEALTH.band({
		birth: person.birthTimeMs / yearMs,
		death: person.deathTimeMs / yearMs,
		time: timeMs / yearMs,
	})
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
