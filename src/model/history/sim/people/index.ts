import { FERTILITY } from "@/model/history/sim/people/fertility"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { MARRIAGE } from "@/model/history/sim/people/marriage"
import type {
	AddPersonParams,
	ApplyDeathParams,
	AssignSeatParams,
	ChildrenOfParams,
	CompactAliveParams,
	CreatePeopleParams,
	EndLifeParams,
	KinPairParams,
	PeopleState,
	PeopleYearResult,
	PersonAtParams,
	PersonRefParams,
	PersonTable,
	RemoveSeatParams,
	RunPeopleYearParams,
	ScheduledDeath,
} from "@/model/history/sim/people/types"
import { ARRAY } from "@/model/shared/array"

const UNSET = -1

function createPeople({
	capacity,
	marriageCapacity,
	seatCount,
}: CreatePeopleParams): PeopleState {
	const size = Math.max(1, Math.ceil(capacity))
	const marriageSize = Math.max(1, Math.ceil(marriageCapacity))
	return {
		log: PEOPLE_LOG.create({ capacity: 64000 }),
		pendingPregnancies: new Map(),
		nextDynasty: 0,
		holderOfSeat: new Int32Array(seatCount).fill(UNSET),
		nextSeatOfHolder: new Int32Array(seatCount).fill(UNSET),
		persons: {
			count: 0,
			capacity: size,
			growths: 0,
			sex: new Uint8Array(size),
			birth: new Float32Array(size),
			death: new Float32Array(size),
			deathSerial: new Uint8Array(size),
			health: new Uint8Array(size),
			father: new Int32Array(size),
			mother: new Int32Array(size),
			dynasty: new Int32Array(size),
			culture: new Int16Array(size),
			residence: new Int32Array(size),
			firstMarriage: new Int32Array(size),
			fertility: new Float32Array(size),
			seat: new Int32Array(size),
			firstChild: new Int32Array(size),
			nextSiblingFather: new Int32Array(size),
			nextSiblingMother: new Int32Array(size),
			nextBirth: new Float32Array(size),
			peak: new Uint8Array(size),
			alive: new Int32Array(size),
			aliveCount: 0,
		},
		marriages: {
			count: 0,
			capacity: marriageSize,
			growths: 0,
			husband: new Int32Array(marriageSize),
			wife: new Int32Array(marriageSize),
			kind: new Uint8Array(marriageSize),
			start: new Float32Array(marriageSize),
			end: new Float32Array(marriageSize),
			endReason: new Uint8Array(marriageSize),
			matrilineal: new Uint8Array(marriageSize),
			nextOfHusband: new Int32Array(marriageSize),
			nextOfWife: new Int32Array(marriageSize),
		},
	}
}

function assignSeat({
	people,
	person,
	seat,
	seatRank,
}: AssignSeatParams): void {
	if (
		seat < 0 ||
		seat >= people.holderOfSeat.length ||
		people.holderOfSeat[seat] >= 0 ||
		person < 0 ||
		person >= people.persons.count
	)
		throw new Error("Invalid seat assignment")
	people.holderOfSeat[seat] = person
	const persons = people.persons
	persons.peak[person] = Math.max(persons.peak[person], seatRank[seat] + 1)
	let previous = UNSET
	let current = persons.seat[person]
	while (current >= 0 && seatRank[current] >= seatRank[seat]) {
		previous = current
		current = people.nextSeatOfHolder[current]
	}
	people.nextSeatOfHolder[seat] = current
	if (previous < 0) persons.seat[person] = seat
	else people.nextSeatOfHolder[previous] = seat
	persons.residence[person] = persons.seat[person]
}

function removeSeat({ people, seat }: RemoveSeatParams): void {
	if (seat < 0 || seat >= people.holderOfSeat.length) return
	const person = people.holderOfSeat[seat]
	if (person < 0) return
	let previous = UNSET
	let current = people.persons.seat[person]
	while (current >= 0 && current !== seat) {
		previous = current
		current = people.nextSeatOfHolder[current]
	}
	if (current < 0) throw new Error("Seat list is inconsistent")
	const next = people.nextSeatOfHolder[seat]
	if (previous < 0) people.persons.seat[person] = next
	else people.nextSeatOfHolder[previous] = next
	if (previous < 0 && next >= 0) people.persons.residence[person] = next
	people.holderOfSeat[seat] = UNSET
	people.nextSeatOfHolder[seat] = UNSET
}

function growPersons(table: PersonTable): void {
	const capacity = Math.max(
		table.capacity + 1,
		Math.ceil(table.capacity * 1.25),
	)
	for (const key of [
		"sex",
		"birth",
		"death",
		"deathSerial",
		"health",
		"father",
		"mother",
		"dynasty",
		"culture",
		"residence",
		"firstMarriage",
		"fertility",
		"seat",
		"firstChild",
		"nextSiblingFather",
		"nextSiblingMother",
		"nextBirth",
		"peak",
		"alive",
	] as const) {
		Object.assign(table, {
			[key]: ARRAY.growNumeric({ array: table[key], capacity }),
		})
	}
	table.capacity = capacity
	table.growths++
}

function addPerson({
	people,
	sex,
	birth,
	death = Number.POSITIVE_INFINITY,
	father = UNSET,
	mother = UNSET,
	dynasty,
	culture,
	residence,
	health = 36,
	fertility,
	rng,
}: AddPersonParams): number {
	const table = people.persons
	if (
		(father >= 0 &&
			(father >= table.count ||
				table.sex[father] !== 0 ||
				birth - table.birth[father] < 16)) ||
		(mother >= 0 &&
			(mother >= table.count ||
				table.sex[mother] !== 1 ||
				birth - table.birth[mother] < 16 ||
				birth - table.birth[mother] > 45))
	) {
		throw new Error("Invalid parents for person")
	}
	if (culture < 0 || culture > 1023 || dynasty < 0 || dynasty > 1048575) {
		throw new Error("Person culture or dynasty exceeds record limit")
	}
	if (table.count === table.capacity) growPersons(table)
	const id = table.count++
	table.sex[id] = sex
	table.birth[id] = birth
	table.death[id] = death
	table.health[id] = health
	table.father[id] = father
	table.mother[id] = mother
	table.dynasty[id] = dynasty
	people.nextDynasty = Math.max(people.nextDynasty, dynasty + 1)
	table.culture[id] = culture
	table.residence[id] = residence
	table.firstMarriage[id] = UNSET
	table.fertility[id] = fertility ?? 0.5 + 0.1 * (rng?.random() ?? 0.5)
	table.seat[id] = UNSET
	table.firstChild[id] = UNSET
	table.nextSiblingFather[id] = UNSET
	table.nextSiblingMother[id] = UNSET
	table.nextBirth[id] = Number.NEGATIVE_INFINITY
	table.peak[id] = 0
	if (father >= 0) {
		table.nextSiblingFather[id] = table.firstChild[father]
		table.firstChild[father] = id
	}
	if (mother >= 0) {
		table.nextSiblingMother[id] = table.firstChild[mother]
		table.firstChild[mother] = id
	}
	if (death === Number.POSITIVE_INFINITY) table.alive[table.aliveCount++] = id
	return id
}

function standingOf({ people, person }: PersonRefParams): number {
	const persons = people.persons
	let standing = persons.peak[person]
	for (const parent of [persons.father[person], persons.mother[person]])
		if (parent >= 0) standing = Math.max(standing, persons.peak[parent])
	return standing
}

function isRuler({ people, person }: PersonRefParams): boolean {
	return people.persons.seat[person] >= 0
}

function aliveAt({ people, person, time }: PersonAtParams): boolean {
	const table = people.persons
	return (
		person >= 0 &&
		person < table.count &&
		table.birth[person] <= time &&
		table.death[person] > time
	)
}

function childrenOf({ people, parent }: ChildrenOfParams): number[] {
	const table = people.persons
	const children: number[] = []
	if (parent < 0 || parent >= table.count) return children
	let child = table.firstChild[parent]
	while (child >= 0) {
		children.push(child)
		child =
			table.sex[parent] === 0
				? table.nextSiblingFather[child]
				: table.nextSiblingMother[child]
	}
	return children
}

function closeKin({ people, a, b }: KinPairParams): boolean {
	if (a === b) return true
	const table = people.persons
	const ancestors = (person: number): Set<number> => {
		const found = new Set<number>([person])
		for (const parent of [table.father[person], table.mother[person]]) {
			if (parent < 0) continue
			found.add(parent)
			if (table.father[parent] >= 0) found.add(table.father[parent])
			if (table.mother[parent] >= 0) found.add(table.mother[parent])
		}
		return found
	}
	const left = ancestors(a)
	for (const person of ancestors(b)) if (left.has(person)) return true
	return false
}

function endLife({ people, person, time }: EndLifeParams): void {
	const table = people.persons
	if (!aliveAt({ people, person, time })) return
	table.death[person] = time
	table.deathSerial[person]++
}

function applyDeath({
	people,
	person,
	time,
	serial,
}: ApplyDeathParams): boolean {
	const persons = people.persons
	if (
		persons.deathSerial[person] !== serial ||
		Math.abs(persons.death[person] - time) > 0.001
	)
		return false
	const marriage = MARRIAGE.activeMarriage({
		people,
		person,
		time: time - 0.001,
	})
	if (marriage >= 0)
		MARRIAGE.endMarriage({ people, marriage, time, reason: "widowed" })
	return true
}

function compactAlive({ people, time }: CompactAliveParams): void {
	const table = people.persons
	let kept = 0
	for (let i = 0; i < table.aliveCount; i++) {
		const person = table.alive[i]
		if (table.death[person] >= time) table.alive[kept++] = person
	}
	table.aliveCount = kept
}

function runYear({
	people,
	from,
	sovereignOfResidence,
	cultureOfResidence,
	neighbors,
	rng,
}: RunPeopleYearParams): PeopleYearResult {
	compactAlive({ people, time: from })
	const persons = people.persons
	const standing = new Uint8Array(persons.count)
	for (let person = 0; person < persons.count; person++)
		standing[person] = standingOf({ people, person })
	const deaths: ScheduledDeath[] = []
	for (let i = 0; i < persons.aliveCount; i++) {
		const person = persons.alive[i]
		if (persons.death[person] < from + 1) continue
		const result = LIFESPAN.checkYear({ people, person, from, rng })
		if (result.death === undefined) continue
		endLife({ people, person, time: result.death })
		deaths.push({
			person,
			time: result.death,
			serial: persons.deathSerial[person],
		})
	}
	const weddings = MARRIAGE.market({
		people,
		from,
		sovereignOfResidence,
		cultureOfResidence,
		standing,
		neighbors,
		rng,
	})
	const pregnancies = [] as PeopleYearResult["pregnancies"]
	const scheduled = new Set<number>()
	for (let i = 0; i < persons.aliveCount; i++) {
		const mother = persons.alive[i]
		if (persons.sex[mother] !== 1 || persons.death[mother] <= from) continue
		const marriage = MARRIAGE.activeMarriage({
			people,
			person: mother,
			time: from,
		})
		if (marriage < 0) continue
		const father = people.marriages.husband[marriage]
		pregnancies.push(
			...FERTILITY.familyBetween({
				people,
				mother,
				father,
				from,
				to: from + 1,
				standing: Math.max(standing[mother], standing[father]),
				ruler:
					isRuler({ people, person: mother }) ||
					isRuler({ people, person: father }),
				rng,
			}),
		)
		scheduled.add(mother)
	}
	for (const wedding of weddings) {
		if (scheduled.has(wedding.wife)) continue
		pregnancies.push(
			...FERTILITY.familyBetween({
				people,
				mother: wedding.wife,
				father: wedding.husband,
				from: wedding.time,
				to: from + 1,
				standing: Math.max(standing[wedding.wife], standing[wedding.husband]),
				ruler:
					isRuler({ people, person: wedding.wife }) ||
					isRuler({ people, person: wedding.husband }),
				rng,
			}),
		)
	}
	for (const pregnancy of pregnancies)
		people.pendingPregnancies.set(pregnancy.mother, pregnancy)
	return { deaths, weddings, pregnancies }
}

export const PEOPLE = {
	createPeople,
	assignSeat,
	removeSeat,
	addPerson,
	aliveAt,
	childrenOf,
	closeKin,
	standingOf,
	isRuler,
	endLife,
	applyDeath,
	compactAlive,
	runYear,
}
