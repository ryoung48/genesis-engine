import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import type {
	AddPersonParams,
	GenderPreference,
	MarriageTieParams,
	NameSeedParams,
	PeopleState,
	PersonAtParams,
	PersonRefParams,
	PreferenceParams,
	SetRegentParams,
	SetRulerParams,
	ThroneParams,
	VacateParams,
} from "@/model/history/sim/people/types"

function create(provinceCount: number): PeopleState {
	return {
		persons: {
			sex: [],
			birth: [],
			death: [],
			father: [],
			mother: [],
			spouse: [],
			dynasty: [],
			culture: [],
			nameSeed: [],
			realm: [],
			throne: [],
			children: [],
			scopeYear: [],
			marriedAt: [],
			home: [],
			recorded: [],
		},
		alive: [],
		rulerOf: new Int32Array(provinceCount).fill(-1),
		patricians: new Map(),
		unionGenerations: new Map(),
		marriageAlliances: new Map(),
		regencies: new Map(),
		deposed: new Map(),
		log: { persons: [], marriages: [], seats: [] },
		nextDynasty: 0,
	}
}

function add({
	people,
	sex,
	birth,
	death,
	father,
	mother,
	dynasty,
	culture,
	nameSeed,
	realm,
}: AddPersonParams): number {
	const table = people.persons
	const id = table.sex.length
	table.sex.push(sex)
	table.birth.push(birth)
	table.death.push(death)
	table.father.push(father)
	table.mother.push(mother)
	table.spouse.push(-1)
	table.dynasty.push(dynasty)
	table.culture.push(culture)
	table.nameSeed.push(nameSeed)
	table.realm.push(realm)
	table.throne.push(-1)
	table.children.push([])
	table.scopeYear.push(-1)
	table.marriedAt.push(-1)
	table.home.push(realm)
	table.recorded.push(false)
	if (father >= 0) table.children[father].push(id)
	if (mother >= 0) table.children[mother].push(id)
	people.alive.push(id)
	if (
		(father >= 0 && table.throne[father] >= 0) ||
		(mother >= 0 && table.throne[mother] >= 0)
	)
		record({ people, person: id })
	return id
}

// Only seat holders and their close family reach the history record.
function record({ people, person }: PersonRefParams): void {
	const table = people.persons
	if (person < 0 || table.recorded[person]) return
	table.recorded[person] = true
	people.log.persons.push(person)
	const spouse = table.spouse[person]
	if (spouse >= 0 && table.recorded[spouse])
		people.log.marriages.push({
			husband: table.sex[person] === 0 ? person : spouse,
			wife: table.sex[person] === 0 ? spouse : person,
			start: table.marriedAt[person],
		})
}

function recordFamily({ people, person }: PersonRefParams): void {
	const table = people.persons
	const siblings = [table.father[person], table.mother[person]].flatMap(
		(parent) => (parent >= 0 ? table.children[parent] : []),
	)
	for (const member of [
		person,
		table.father[person],
		table.mother[person],
		table.spouse[person],
		...table.children[person],
		...siblings,
	])
		record({ people, person: member })
}

function setRuler({ people, seat, person }: SetRulerParams): void {
	people.rulerOf[seat] = person
	people.log.seats.push({ seat, person, ward: -1 })
	if (person >= 0) recordFamily({ people, person })
}

function setRegent({ people, seat, person, ward }: SetRegentParams): void {
	people.log.seats.push({ seat, person, ward })
	record({ people, person })
}

function aliveAt({ people, person, time }: PersonAtParams): boolean {
	const table = people.persons
	return table.birth[person] <= time && table.death[person] > time
}

// The UI derives a ruler's gender from the name seed and culture, so the seed
// is drawn until it agrees with the person's sex.
function nameSeed({ sex, genderSystem, rng }: NameSeedParams): number {
	const wanted = sex === 1 ? "female" : "male"
	let seed = rng.randint(1, 0x7fffffff)
	for (let attempt = 0; attempt < 200; attempt++) {
		if (
			GENDER_SYSTEM.resolveLeaderGender({ system: genderSystem, seed }) ===
			wanted
		)
			return seed
		seed = rng.randint(1, 0x7fffffff)
	}
	return seed
}

function preference({ genderSystem }: PreferenceParams): GenderPreference {
	if (genderSystem === GENDER_SYSTEM.cultureGenderSystem.EQUAL) return "none"
	return genderSystem === GENDER_SYSTEM.cultureGenderSystem.MATRIARCHAL
		? "female"
		: "male"
}

function enthrone({ people, person, seat, realm }: ThroneParams): void {
	const table = people.persons
	table.throne[person] = seat
	table.realm[person] = realm
	const spouse = table.spouse[person]
	if (spouse >= 0 && table.throne[spouse] < 0) table.realm[spouse] = realm
	setRuler({ people, seat, person })
}

function vacate({ people, seat }: VacateParams): void {
	const person = people.rulerOf[seat]
	if (person < 0) return
	if (people.persons.throne[person] === seat) people.persons.throne[person] = -1
	setRuler({ people, seat, person: -1 })
}

// A ruler with their children and siblings: the house whose marriages bind
// the realm.
function family({ people, person }: PersonRefParams): number[] {
	const table = people.persons
	const members = [person, ...table.children[person]]
	for (const parent of [table.father[person], table.mother[person]])
		if (parent >= 0)
			for (const sibling of table.children[parent])
				if (sibling !== person) members.push(sibling)
	return members
}

function tiedByMarriage({ people, a, b, time }: MarriageTieParams): boolean {
	const table = people.persons
	const other = new Set(family({ people, person: b }))
	for (const member of family({ people, person: a })) {
		const spouse = table.spouse[member]
		if (
			spouse >= 0 &&
			other.has(spouse) &&
			aliveAt({ people, person: member, time }) &&
			aliveAt({ people, person: spouse, time })
		)
			return true
	}
	return false
}

export const PEOPLE = {
	record,
	recordFamily,
	setRuler,
	setRegent,
	family,
	tiedByMarriage,
	create,
	add,
	aliveAt,
	nameSeed,
	preference,
	enthrone,
	vacate,
}
