import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import type {
	AdultParams,
	MarryParams,
	MatchInParams,
	MatchParams,
	MinorSeekersParams,
	OutsiderParams,
	ScopeParams,
	Seeker,
	SeekMatchesParams,
} from "@/model/history/sim/people/family/types"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type {
	CrossMatch,
	FoundHouseParams,
	PeopleMatches,
	ProjectYearParams,
	RunPeopleYearParams,
	Sex,
} from "@/model/history/sim/people/types"

const MARRIAGE_CHANCE = 0.35
// Ruling houses of realms that marry for alliance mostly marry abroad and,
// while young, wait for a foreign match rather than wed at home.
const ROYAL_FOREIGN_CHANCE = 0.8
const FOREIGN_MATCH_CHANCE = 0.3
const ROYAL_WAIT_AGE = 25
const MARRIED_FOUNDER_CHANCE = 0.85

function marry({ people, a, b, time }: MarryParams): void {
	const table = people.persons
	table.spouse[a] = b
	table.spouse[b] = a
	table.marriedAt[a] = time
	table.marriedAt[b] = time
	PEOPLE_LOG.append({
		log: people.log,
		row: {
			kind: "wedding",
			husband: table.sex[a] === 0 ? a : b,
			wife: table.sex[a] === 0 ? b : a,
			time,
		},
	})
	HOUSEHOLD.weddingResidence({ people, a, b, time })
}

function outsider({
	people,
	partner,
	time,
	origin,
	rng,
}: OutsiderParams): number {
	const table = people.persons
	const sex: Sex = table.sex[partner] === 0 ? 1 : 0
	const partnerAge = time - table.birth[partner]
	const age =
		sex === 1
			? Math.max(15, partnerAge - rng.uniform(0, 8))
			: partnerAge + rng.uniform(0, 8)
	const spouse = PEOPLE.spawn({
		people,
		sex,
		birth: time - age,
		survives: time,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin,
		rng,
	})
	marry({ people, a: partner, b: spouse, time })
	return spouse
}

function found({
	people,
	origin,
	time,
	age,
	rank,
	rng,
}: FoundHouseParams): number {
	const table = people.persons
	const dynasty = people.nextDynasty++
	const birth = time - age
	const sex: Sex =
		GENDER_SYSTEM.resolveLeaderGender({
			system: origin.genderSystem,
			seed: rng.randint(1, 0x7fffffff),
		}) === "female"
			? 1
			: 0
	const father = PEOPLE.spawn({
		people,
		sex: 0,
		birth: birth - rng.uniform(20, 40),
		survives: birth,
		father: -1,
		mother: -1,
		dynasty,
		origin,
		rng,
	})
	table.death[father] = Math.max(
		birth,
		time - rng.uniform(0, Math.min(age, 30)),
	)
	PEOPLE.raise({ people, person: father, rank })
	const mother = PEOPLE.spawn({
		people,
		sex: 1,
		birth: birth - rng.uniform(17, 32),
		survives: birth,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin,
		rng,
	})
	marry({ people, a: father, b: mother, time: birth - 1 })
	const founder = PEOPLE.spawn({
		people,
		sex,
		birth,
		survives: time,
		father,
		mother,
		dynasty,
		origin,
		rng,
	})
	PEOPLE.raise({ people, person: founder, rank })
	FERTILITY.siblings({ people, child: founder, until: time, origin, rng })
	if (age >= 18 && rng.random() < MARRIED_FOUNDER_CHANCE) {
		const wedding = Math.min(time, birth + rng.uniform(16, 25))
		const spouse = outsider({
			people,
			partner: founder,
			time: wedding,
			origin,
			rng,
		})
		const [wife, husband] = sex === 1 ? [founder, spouse] : [spouse, founder]
		FERTILITY.bear({
			people,
			mother: wife,
			father: husband,
			from: wedding,
			until: time,
			survives: wife === founder ? time : wedding,
			now: time,
			origin,
			rng,
		})
	}
	return founder
}

function seeksSpouse({ people, person, time }: AdultParams): boolean {
	const table = people.persons
	const age = time - table.birth[person]
	const adult =
		table.sex[person] === 1 ? age >= 16 && age < 40 : age >= 18 && age < 50
	if (!adult || table.betrothed[person] >= 0) return false
	const spouse = table.spouse[person]
	return spouse < 0 || table.death[spouse] <= time
}

function matchIn({
	people,
	seeker,
	pool,
	matched,
	realms,
	royalOnly,
	fits,
}: MatchInParams): number {
	const table = people.persons
	for (const realm of realms) {
		if (realm === seeker.realm) continue
		for (const other of pool.get(realm) ?? []) {
			if (matched.has(other.person)) continue
			if (royalOnly && !other.royalBlood) continue
			if (table.sex[other.person] === table.sex[seeker.person]) continue
			if (!fits(other.person)) continue
			return other.person
		}
	}
	return -1
}

// Neighbouring realms first, then their neighbours; royal blood looks for
// royal blood across both rings before settling for a lesser house.
function foreignMatch({
	people,
	seeker,
	pool,
	matched,
	neighborsOf,
	fits,
	rng,
}: MatchParams): number {
	const near = rng.shuffle([...neighborsOf(seeker.realm)])
	const far = new Set<number>()
	for (const realm of near) for (const next of neighborsOf(realm)) far.add(next)
	const rings = [near, [...far]]
	const passes = seeker.royalBlood ? [true, false] : [false]
	for (const royalOnly of passes)
		for (const realms of rings) {
			const found = matchIn({
				people,
				seeker,
				pool,
				matched,
				realms,
				royalOnly,
				fits,
			})
			if (found >= 0) return found
		}
	return -1
}

// Royal children of alliance-marrying realms seek a betrothal from 12, as the
// CK3 AI does.
function minorSeekers({
	people,
	time,
	sovereigns,
	royal,
	chance,
	rng,
}: MinorSeekersParams): number[] {
	const table = people.persons
	const seen = new Set<number>()
	const minors: number[] = []
	for (const ruler of sovereigns)
		for (const person of PEOPLE.family({ people, person: ruler })) {
			if (seen.has(person)) continue
			seen.add(person)
			const age = time - table.birth[person]
			if (age < BETROTHAL.minAge || age >= BETROTHAL.adultAge) continue
			if (!PEOPLE.aliveAt({ people, person, time })) continue
			if (table.spouse[person] >= 0 || table.betrothed[person] >= 0) continue
			if (!royal(HOUSEHOLD.realmOf({ people, person: person }))) continue
			if (rng.random() < chance) minors.push(person)
		}
	return minors
}

// A match with a minor is a betrothal, made only between ruling families that
// it allies and within the age gap; a match of two adults is a wedding.
function seekMatches({
	people,
	time,
	seekers,
	sovereigns,
	minorChance,
	neighborsOf,
	originOf,
	royal,
	alliable,
	rng,
}: SeekMatchesParams): PeopleMatches {
	const table = people.persons
	const crowned = new Set(sovereigns)
	const pool = new Map<number, Seeker[]>()
	const all: Seeker[] = [
		...seekers,
		...minorSeekers({
			people,
			time,
			sovereigns,
			royal,
			chance: minorChance,
			rng,
		}),
	].map((person) => ({
		person,
		realm: HOUSEHOLD.realmOf({ people, person: person }),
		royalBlood:
			crowned.has(person) ||
			crowned.has(table.father[person]) ||
			crowned.has(table.mother[person]),
	}))
	for (const seeker of all) {
		const list = pool.get(seeker.realm)
		if (list) list.push(seeker)
		else pool.set(seeker.realm, [seeker])
	}
	const ageOf = (person: number) => time - table.birth[person]
	const matched = new Set<number>()
	const matches: PeopleMatches = { weddings: [], betrothals: [] }
	for (const seeker of all) {
		if (matched.has(seeker.person)) continue
		matched.add(seeker.person)
		const age = ageOf(seeker.person)
		const fits = (partner: number) => {
			const other = ageOf(partner)
			if (Math.min(age, other) >= BETROTHAL.adultAge) return true
			return (
				Math.min(age, other) >= BETROTHAL.minAge &&
				Math.abs(age - other) <= BETROTHAL.maxAgeGap &&
				alliable({
					a: seeker.person,
					b: partner,
					realmA: seeker.realm,
					realmB: HOUSEHOLD.realmOf({ people, person: partner }),
				})
			)
		}
		const isRoyal = royal(seeker.realm)
		const partner =
			rng.random() < (isRoyal ? ROYAL_FOREIGN_CHANCE : FOREIGN_MATCH_CHANCE)
				? foreignMatch({
						people,
						seeker,
						pool,
						matched,
						neighborsOf,
						fits,
						rng,
					})
				: -1
		if (partner >= 0) {
			matched.add(partner)
			const match = {
				a: seeker.person,
				b: partner,
				realmA: seeker.realm,
				realmB: HOUSEHOLD.realmOf({ people, person: partner }),
			}
			if (Math.min(age, ageOf(partner)) < BETROTHAL.adultAge) {
				BETROTHAL.betroth({ people, a: seeker.person, b: partner, time })
				matches.betrothals.push(match)
			} else {
				matches.weddings.push(match)
				marry({ people, a: seeker.person, b: partner, time })
			}
			continue
		}
		if (isRoyal && age < ROYAL_WAIT_AGE) {
			matched.delete(seeker.person)
			continue
		}
		outsider({
			people,
			partner: seeker.person,
			time,
			origin: originOf(table.residence[seeker.person]),
			rng,
		})
	}
	return matches
}

// The ruling line: each ruler with their children and siblings stay in scope
// for marriage, and the rulers and their children for births.
function scope({ people, time, rulers }: ScopeParams): Set<number> {
	const table = people.persons
	const stamp = Math.floor(time)
	const line = new Set<number>()
	for (const ruler of rulers) {
		table.scopeYear[ruler] = stamp
		line.add(ruler)
		for (const child of table.children[ruler]) {
			table.scopeYear[child] = stamp
			line.add(child)
		}
		for (const parent of [table.father[ruler], table.mother[ruler]]) {
			if (parent < 0) continue
			for (const sibling of table.children[parent])
				table.scopeYear[sibling] = stamp
		}
	}
	return line
}

// The year's betrothal fulfilments and matches; every wedding is complete,
// with its household moved, when this returns.
function runYear({
	people,
	time,
	rulers,
	sovereigns,
	rng,
	...realms
}: RunPeopleYearParams): PeopleMatches {
	const table = people.persons
	people.alive = people.alive.filter((person) => table.death[person] > time)
	const stamp = Math.floor(time)
	scope({ people, time, rulers })

	const weddings: CrossMatch[] = []
	for (const { a, b } of BETROTHAL.fulfil({ people, time })) {
		weddings.push({
			a,
			b,
			realmA: HOUSEHOLD.realmOf({ people, person: a }),
			realmB: HOUSEHOLD.realmOf({ people, person: b }),
		})
		marry({ people, a, b, time })
	}
	const seekers: number[] = []
	for (const person of people.alive) {
		if (table.scopeYear[person] !== stamp) continue
		if (!PEOPLE.aliveAt({ people, person, time })) continue
		if (!seeksSpouse({ people, person, time })) continue
		if (rng.random() < MARRIAGE_CHANCE) seekers.push(person)
	}
	const matches = seekMatches({
		people,
		time,
		seekers,
		sovereigns,
		minorChance: MARRIAGE_CHANCE,
		rng,
		...realms,
	})
	weddings.push(...matches.weddings)
	return { weddings, betrothals: matches.betrothals }
}

// Conceptions of the coming year for each married couple of the ruling line,
// in person order.
function project({
	people,
	time,
	rulers,
	originOf,
	rng,
}: ProjectYearParams): void {
	const table = people.persons
	const line = scope({ people, time, rulers })
	for (const mother of people.alive) {
		if (table.sex[mother] !== 1) continue
		const father = table.spouse[mother]
		if (father < 0) continue
		if (!line.has(mother) && !line.has(father)) continue
		if (!PEOPLE.aliveAt({ people, person: mother, time })) continue
		FERTILITY.project({
			people,
			mother,
			father,
			from: time,
			until: time + 1,
			origin: originOf(table.residence[mother]),
			rng,
		})
	}
}

export const FAMILY = { found, seekMatches, runYear, project }
