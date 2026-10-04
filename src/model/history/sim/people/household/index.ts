import { HOLDINGS } from "@/model/history/sim/people/holdings"
import type {
	HouseholdPersonParams,
	InitialResidenceParams,
	RelocateParams,
	ResidenceAtParams,
	WeddingResidenceParams,
} from "@/model/history/sim/people/household/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { EFFECTIVE_TIME } from "@/model/shared/time/effective"

function realmOf({ people, person }: HouseholdPersonParams): number {
	return people.household.realmOf(people.persons.residence[person])
}

function residenceAt({ people, person, time }: ResidenceAtParams): number {
	if (time < people.persons.birth[person]) return -1
	const history = people.residenceHistory.get(person)
	const index = history
		? EFFECTIVE_TIME.latest({
				times: history.times,
				length: history.length,
				time,
			})
		: -1
	return history && index >= 0
		? history.provinces[index]
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
	let history = people.residenceHistory.get(person)
	if (!history) {
		history = {
			length: 0,
			times: new Float64Array(4),
			provinces: new Int32Array(4),
		}
		people.residenceHistory.set(person, history)
	}
	if (history.length === history.times.length) {
		const times = new Float64Array(history.length * 2)
		const provinces = new Int32Array(history.length * 2)
		times.set(history.times)
		provinces.set(history.provinces)
		history.times = times
		history.provinces = provinces
	}
	history.times[history.length] = time
	history.provinces[history.length++] = province
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "residence", person, province, time },
	})
	table.residence[person] = residenceAt({
		people,
		person,
		time: Math.max(people.household.time(), table.birth[person]),
	})
	correctUnborn({ people, person })
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

function correctUnborn({ people, person }: HouseholdPersonParams): void {
	for (const child of people.persons.children[person])
		if (
			people.persons.mother[child] === person &&
			people.persons.birth[child] > people.household.time()
		)
			amendInitial({
				people,
				person: child,
				province: residenceAt({
					people,
					person,
					time: people.persons.birth[child],
				}),
			})
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
