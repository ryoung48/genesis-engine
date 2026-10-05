import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { HEALTH } from "@/model/history/sim/people/health"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
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
	VacateParams,
} from "@/model/history/sim/people/types"

function create(provinceCount: number): PeopleState {
	const ranks = new Uint8Array(provinceCount)
	return {
		startingFamilies: {
			sovereignsMs: 0,
			housesMs: 0,
			betrothalsMs: 0,
			weddingsAccepted: { parent: 0, founder: 0, descendant: 0, remarriage: 0 },
			weddingsRejected: { parent: 0, founder: 0, descendant: 0, remarriage: 0 },
			anchorCount: 0,
			predecessors: {},
			predecessorProposals: {},
			fallbacks: {},
			cousinCandidates: 0,
			cousinProposals: 0,
			cousinPairs: 0,
			cousinRejections: {},
			spouseCandidates: 0,
			rejectedCandidates: [],
			founderMarriages: 0,
			remarriages: 0,
			freshDistricts: 0,
			relativeGrants: 0,
			patricianHeads: 0,
		},
		household: {
			heritageOfCulture: () => -1,
			religionOfRealm: () => -1,
			realmOf: (province) => province,
			ranks: () => ranks,
			time: () => 0,
		},
		residenceHistory: {
			head: new Map(),
			length: 0,
			times: new Float64Array(1024),
			provinces: new Int32Array(1024),
			previous: new Int32Array(1024),
		},
		holdingsChanged: () => undefined,
		persons: {
			bases: [],

			personality: [],
			grades: [],
			congenital: [],
			carried: [],
			stress: [],
			sex: [],
			createdAt: [],
			birth: [],
			death: [],
			father: [],
			mother: [],
			spouse: [],
			dynasty: [],
			culture: [],
			nameSeed: [],
			residence: [],
			initialResidence: [],
			heldSeats: [],
			children: [],
			scopeYear: [],
			marriedAt: [],
			home: [],
			fertility: [],
			peak: [],
			nextBirth: [],
			betrothed: [],
			betrothedAt: [],
			baseHealth: [],
			infirmXp: [],
			cloudedEyesXp: [],
			fragileBonesXp: [],
			witheringMindXp: [],
			falteringHeartXp: [],
			healthFlags: [],
			healthAgeYear: [],
			healthIntervalEnd: [],
			ledYear: [],
		},
		alive: [],
		stressed: [],
		bereavements: new Map(),
		deliveries: {
			next: 0,
			byId: new Map(),
			byMother: new Map(),
			projected: new Map(),
			queued: 0,
		},
		rulerOf: new Int32Array(provinceCount).fill(-1),
		patricians: new Map(),
		unionGenerations: new Map(),
		marriageAlliances: new Map(),
		regencies: new Map(),
		deposed: new Map(),
		memories: new Map(),
		memoryCounts: OPINION.counts(),
		log: PEOPLE_LOG.create(),
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

	table.personality.push(0)
	table.grades.push(0)
	table.congenital.push(0)
	table.carried.push(0)
	table.stress.push(0)
	table.sex.push(sex)
	table.createdAt.push(birth)
	table.birth.push(birth)
	table.death.push(death)
	table.father.push(father)
	table.mother.push(mother)
	table.spouse.push(-1)
	table.dynasty.push(dynasty)
	table.culture.push(culture)
	table.nameSeed.push(nameSeed)
	const residence =
		mother >= 0
			? HOUSEHOLD.residenceAt({ people, person: mother, time: birth })
			: realm
	table.residence.push(residence)
	table.initialResidence.push(residence)
	table.heldSeats.push([])
	table.children.push([])
	table.scopeYear.push(-1)
	table.marriedAt.push(-1)
	table.home.push(realm)
	table.fertility.push(fertility)
	table.peak.push(0)
	table.nextBirth.push(birth)
	table.betrothed.push(-1)
	table.betrothedAt.push(-1)
	table.baseHealth.push(0)
	table.infirmXp.push(-1)
	table.cloudedEyesXp.push(-1)
	table.fragileBonesXp.push(-1)
	table.witheringMindXp.push(-1)
	table.falteringHeartXp.push(-1)
	table.healthFlags.push(0)
	table.healthAgeYear.push(0)
	table.healthIntervalEnd.push(birth)
	table.ledYear.push(-1)
	if (father >= 0) table.children[father].push(id)
	if (mother >= 0) table.children[mother].push(id)
	drawPerson({ people, person: id })
	people.alive.push(id)
	return id
}

// No death date is fixed at birth: health decides it year by year.
function spawn({
	recordHealth,
	death,
	nameSeed: explicitNameSeed,
	people,
	sex,
	birth,
	survives,
	father,
	mother,
	dynasty,
	origin,
	rng,
}: SpawnParams): number {
	const person = add({
		people,
		sex,
		birth,
		death: Infinity,
		father,
		mother,
		dynasty,
		culture: origin.culture,
		nameSeed:
			explicitNameSeed ??
			nameSeed({ sex, genderSystem: origin.genderSystem, rng }),
		realm: origin.realm,
		fertility: 0.5 + 0.1 * rng.random(),
	})
	HEALTH.replay({ people, person, survives, death, record: recordHealth })
	return person
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
	if (people.rulerOf[seat] === person) return
	const previous = people.rulerOf[seat]
	if (person < 0) HOLDINGS.detach({ people, seat, person: previous })
	else {
		people.household.ranks()[seat] = rank
		HOLDINGS.attach({ people, seat, person })
	}
	if (previous >= 0) people.holdingsChanged(previous)
	if (person >= 0) people.holdingsChanged(person)
	if (previous >= 0) HOUSEHOLD.seatChanged({ people, person: previous })
	if (person >= 0) HOUSEHOLD.seatChanged({ people, person })
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "seat", seat, person, reason },
	})
	if (person >= 0) raise({ people, person, rank })
}

function setRegent({ people, seat, person, ward }: SetRegentParams): void {
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "regent", seat, person, ward, reason: "unknown" },
	})
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
	for (let attempt = 0; attempt < 4096; attempt++) {
		if (
			GENDER_SYSTEM.resolveLeaderGender({ system: genderSystem, seed }) ===
			wanted
		)
			return seed
		seed = rng.randint(1, 0x7fffffff)
	}
	throw new Error("No name seed resolves to the requested sex")
}

function preference({ genderSystem }: PreferenceParams): GenderPreference {
	if (genderSystem === GENDER_SYSTEM.cultureGenderSystem.EQUAL) return "none"
	return genderSystem === GENDER_SYSTEM.cultureGenderSystem.MATRIARCHAL
		? "female"
		: "male"
}

function vacate({ people, seat, reason }: VacateParams): void {
	const person = people.rulerOf[seat]
	if (person < 0) return
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

// A death date only ever moves earlier.
function shortenLife({ people, person, time }: ShortenLifeParams): boolean {
	if (time >= people.persons.death[person]) return false
	people.persons.death[person] = time
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
	})
	table.bases[person] = attributes.bases
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
	setRuler,
	setRegent,
	family,
	tiedByMarriage,
	create,
	spawn,
	aliveAt,
	nameSeed,
	preference,
	vacate,
	raise,
	shortenLife,
}
