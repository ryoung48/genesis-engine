import { HOLDINGS } from "@/model/history/sim/people/holdings"
import type {
	HouseholdPersonParams,
	InitialResidenceParams,
	RelocateParams,
	ResidenceAtParams,
	WeddingResidenceParams,
} from "@/model/history/sim/people/household/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"

function realmOf({ people, person }: HouseholdPersonParams): number {
	return people.household.realmOf(people.persons.residence[person])
}

function residenceAt({ people, person, time }: ResidenceAtParams): number {
	if (time < people.persons.birth[person]) return -1
	const history = people.residenceHistory
	let best = -1
	// Latest rows come first, so a strict comparison keeps the last append
	// among equal times.
	for (
		let row = history.head.get(person) ?? -1;
		row >= 0;
		row = history.previous[row]
	)
		if (
			history.times[row] <= time &&
			(best < 0 || history.times[row] > history.times[best])
		)
			best = row
	return best >= 0
		? history.provinces[best]
		: people.persons.initialResidence[person]
}

function write({ people, person, province, time }: RelocateParams): boolean {
	const table = people.persons
	if (
		!Number.isInteger(province) ||
		province < 0 ||
		province >= people.rulerOf.length ||
		!Number.isFinite(time) ||
		time < table.birth[person]
	)
		throw new Error("Invalid residence change")
	if (residenceAt({ people, person, time }) === province) return false
	const history = people.residenceHistory
	if (history.length === history.times.length) {
		const times = new Float64Array(history.length * 2)
		const provinces = new Int32Array(history.length * 2)
		const previous = new Int32Array(history.length * 2)
		times.set(history.times)
		provinces.set(history.provinces)
		previous.set(history.previous)
		history.times = times
		history.provinces = provinces
		history.previous = previous
	}
	history.times[history.length] = time
	history.provinces[history.length] = province
	history.previous[history.length] = history.head.get(person) ?? -1
	history.head.set(person, history.length++)
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "residence", person, province, time },
	})
	table.residence[person] = residenceAt({
		people,
		person,
		time: Math.max(people.household.time(), table.birth[person]),
	})
	return true
}

function amendInitial({
	people,
	person,
	province,
}: InitialResidenceParams): void {
	if (person >= people.log.emitted) {
		people.persons.initialResidence[person] = province
		people.persons.residence[person] = residenceAt({
			people,
			person,
			time: Math.max(people.household.time(), people.persons.birth[person]),
		})
	} else write({ people, person, province, time: people.persons.birth[person] })
}

function relocate(params: RelocateParams): void {
	const { people, person, time } = params
	const table = people.persons
	const old = residenceAt({ people, person, time })
	if (!write(params)) return
	const spouse = table.spouse[person]
	if (
		spouse >= 0 &&
		table.heldSeats[spouse].length === 0 &&
		residenceAt({ people, person: spouse, time }) === old &&
		table.death[spouse] > time
	)
		write({ ...params, person: spouse })
	for (const child of table.children[person]) {
		if (
			table.birth[child] <= time &&
			time - table.birth[child] < 16 &&
			table.death[child] > time &&
			table.heldSeats[child].length === 0 &&
			residenceAt({ people, person: child, time }) === old
		)
			write({ ...params, person: child })
	}
}

function seatChanged({ people, person }: HouseholdPersonParams): void {
	const primary = HOLDINGS.primary({
		people,
		person,
		ranks: people.household.ranks(),
	})
	if (primary >= 0)
		relocate({
			people,
			person,
			province: primary,
			time: Math.max(people.household.time(), people.persons.birth[person]),
		})
}

function weddingResidence({
	people,
	a,
	b,
	time,
}: WeddingResidenceParams): void {
	const table = people.persons
	const host =
		table.heldSeats[a].length > 0
			? a
			: table.heldSeats[b].length > 0
				? b
				: table.sex[a] === 0
					? a
					: b
	const guest = host === a ? b : a
	if (table.heldSeats[guest].length === 0)
		relocate({
			people,
			person: guest,
			province: residenceAt({ people, person: host, time }),
			time,
		})
}

export const HOUSEHOLD = {
	realmOf,
	residenceAt,
	relocate,
	amendInitial,
	seatChanged,
	weddingResidence,
}
