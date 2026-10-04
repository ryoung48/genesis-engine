import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { TRAITS } from "@/model/history/sim/people/traits"
import type {
	AddPersonParams,
	GenderPreference,
	MarriageTieParams,
	NameSeedParams,
	PeopleState,
	PersonAtParams,
	PersonRefParams,
	PreferenceParams,
	RaiseParams,
	SetRegentParams,
	SetRulerParams,
	ShortenLifeParams,
	SpawnParams,
	ThroneParams,
	VacateParams,
} from "@/model/history/sim/people/types"

function create(provinceCount: number): PeopleState {
	return {
		persons: {
			bases: [],
			education: [],
			personality: [],
			grades: [],
			congenital: [],
			carried: [],
			stress: [],
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
			fertility: [],
			peak: [],
			nextBirth: [],
			betrothed: [],
			betrothedAt: [],
		},
		alive: [],
		stressed: [],
		rulerOf: new Int32Array(provinceCount).fill(-1),
		patricians: new Map(),
		unionGenerations: new Map(),
		marriageAlliances: new Map(),
		regencies: new Map(),
		deposed: new Map(),
		log: {
			stress: [],
			persons: [],
			marriages: [],
			seats: [],
			deaths: [],
			pregnancies: [],
			betrothals: [],
			betrothalEnds: [],
		},
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
	fertility,
}: AddPersonParams): number {
	const table = people.persons
	const id = table.sex.length
	table.bases.push(0)
	table.education.push(0)
	table.personality.push(0)
	table.grades.push(0)
	table.congenital.push(0)
	table.carried.push(0)
	table.stress.push(0)
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
	table.fertility.push(fertility)
	table.peak.push(0)
	table.nextBirth.push(0)
	table.betrothed.push(-1)
	table.betrothedAt.push(-1)
	if (father >= 0) table.children[father].push(id)
	if (mother >= 0) table.children[mother].push(id)
	drawPerson({ people, person: id })
	people.alive.push(id)
	if (
		(father >= 0 && table.throne[father] >= 0) ||
		(mother >= 0 && table.throne[mother] >= 0)
	)
		record({ people, person: id })
	return id
}

function spawn({
	people,
	sex,
	birth,
	father,
	mother,
	dynasty,
	origin,
	rng,
}: SpawnParams): number {
	return add({
		people,
		sex,
		birth,
		death: LIFESPAN.deathAt({ birth, from: birth, rng }),
		father,
		mother,
		dynasty,
		culture: origin.culture,
		nameSeed: nameSeed({ sex, genderSystem: origin.genderSystem, rng }),
		realm: origin.realm,
		fertility: 0.5 + 0.1 * rng.random(),
	})
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

// A seat's standing is its title tier plus one: 1 for a county seat, up to 5
// for a hegemony. Family size follows the highest standing ever held.
function raise({ people, person, rank }: RaiseParams): void {
	people.persons.peak[person] = Math.max(people.persons.peak[person], rank + 1)
}

function setRuler({
	people,
	seat,
	person,
	rank,
	reason,
}: SetRulerParams): void {
	people.rulerOf[seat] = person
	people.log.seats.push({ seat, person, ward: -1, reason })
	if (person < 0) return
	raise({ people, person, rank })
	recordFamily({ people, person })
}

function setRegent({ people, seat, person, ward }: SetRegentParams): void {
	people.log.seats.push({ seat, person, ward, reason: "unknown" })
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

function enthrone({
	people,
	person,
	seat,
	realm,
	rank,
	reason,
}: ThroneParams): void {
	const table = people.persons
	table.throne[person] = seat
	table.realm[person] = realm
	const spouse = table.spouse[person]
	if (spouse >= 0 && table.throne[spouse] < 0) table.realm[spouse] = realm
	setRuler({ people, seat, person, rank, reason })
}

function vacate({ people, seat, reason }: VacateParams): void {
	const person = people.rulerOf[seat]
	if (person < 0) return
	if (people.persons.throne[person] === seat) people.persons.throne[person] = -1
	setRuler({ people, seat, person: -1, rank: 0, reason })
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

// Only childbirth moves a death date, and only earlier.
function shortenLife({ people, person, time }: ShortenLifeParams): boolean {
	if (time >= people.persons.death[person]) return false
	people.persons.death[person] = time
	if (people.persons.recorded[person])
		people.log.deaths.push({ person, death: time })
	return true
}

// A living marriage or betrothal joins the two rulers' families.
function tiedByMarriage({ people, a, b, time }: MarriageTieParams): boolean {
	const table = people.persons
	const other = new Set(family({ people, person: b }))
	for (const member of family({ people, person: a }))
		for (const partner of [table.spouse[member], table.betrothed[member]])
			if (
				partner >= 0 &&
				other.has(partner) &&
				aliveAt({ people, person: member, time }) &&
				aliveAt({ people, person: partner, time })
			)
				return true
	return false
}

function drawPerson({ people, person }: PersonRefParams): void {
	const table = people.persons
	const traits = TRAITS.draw({ table, person })
	const attributes = ATTRIBUTES.draw({
		table,
		person,
		character: { ...traits, bases: 0, education: 0 },
	})
	for (const key of ["bases", "education"] as const)
		table[key][person] = attributes[key]
	for (const key of ["personality", "grades", "congenital", "carried"] as const)
		table[key][person] = traits[key]
}
function redraw({ people, person }: PersonRefParams): void {
	const descendants = new Set([person])
	const queue = [person]
	for (let i = 0; i < queue.length; i++)
		for (const child of people.persons.children[queue[i]])
			if (!descendants.has(child)) {
				descendants.add(child)
				queue.push(child)
			}
	queue.sort((a, b) => people.persons.birth[a] - people.persons.birth[b])
	for (const person of queue) drawPerson({ people, person })
}
export const PEOPLE = {
	redraw,
	record,
	recordFamily,
	setRuler,
	setRegent,
	family,
	tiedByMarriage,
	create,
	spawn,
	aliveAt,
	nameSeed,
	preference,
	enthrone,
	vacate,
	raise,
	shortenLife,
}
