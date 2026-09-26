import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import type {
	AdultParams,
	BearParams,
	ChildDynastyParams,
	MarryParams,
	MatchInParams,
	MatchParams,
	NewPersonParams,
	OutsiderParams,
	Seeker,
} from "@/model/history/sim/people/family/types"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import type {
	CrossWedding,
	FoundHouseParams,
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

function fertility(age: number): number {
	if (age < 16 || age >= 45) return 0
	if (age < 20) return 0.3
	if (age < 30) return 0.35
	if (age < 35) return 0.28
	if (age < 40) return 0.18
	return 0.07
}

function newPerson({
	people,
	sex,
	birth,
	father,
	mother,
	dynasty,
	origin,
	rng,
}: NewPersonParams): number {
	return PEOPLE.add({
		people,
		sex,
		birth,
		death: LIFESPAN.deathAt({ sex, birth, from: birth, rng }),
		father,
		mother,
		dynasty,
		culture: origin.culture,
		nameSeed: PEOPLE.nameSeed({
			sex,
			genderSystem: origin.genderSystem,
			rng,
		}),
		realm: origin.realm,
	})
}

function childDynasty({
	people,
	mother,
	father,
	origin,
}: ChildDynastyParams): number {
	const table = people.persons
	const [first, second] =
		origin.genderSystem === GENDER_SYSTEM.cultureGenderSystem.MATRIARCHAL
			? [mother, father]
			: [father, mother]
	return table.dynasty[first] >= 0
		? table.dynasty[first]
		: table.dynasty[second]
}

function bear({
	people,
	mother,
	father,
	from,
	until,
	origin,
	rng,
}: BearParams): void {
	const table = people.persons
	for (let t = from; t < until; t++) {
		if (table.death[mother] <= t || table.death[father] <= t) return
		if (rng.random() >= fertility(t - table.birth[mother])) continue
		newPerson({
			people,
			sex: rng.random() < 0.5 ? 0 : 1,
			birth: t + rng.random() * Math.min(1, until - t),
			father,
			mother,
			dynasty: childDynasty({ people, mother, father, origin }),
			origin,
			rng,
		})
	}
}

function marry({ people, a, b, time }: MarryParams): void {
	const table = people.persons
	table.spouse[a] = b
	table.spouse[b] = a
	table.marriedAt[a] = time
	table.marriedAt[b] = time
	if (table.recorded[a] && table.recorded[b])
		people.log.marriages.push({
			husband: table.sex[a] === 0 ? a : b,
			wife: table.sex[a] === 0 ? b : a,
			start: time,
		})
	else if (table.throne[a] >= 0) PEOPLE.record({ people, person: b })
	else if (table.throne[b] >= 0) PEOPLE.record({ people, person: a })
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
	const spouse = newPerson({
		people,
		sex,
		birth: time - age,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin,
		rng,
	})
	table.death[spouse] = LIFESPAN.deathAt({
		sex,
		birth: time - age,
		from: time,
		rng,
	})
	table.realm[spouse] = table.realm[partner]
	marry({ people, a: partner, b: spouse, time })
	return spouse
}

function found({ people, origin, time, age, rng }: FoundHouseParams): number {
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
	const father = newPerson({
		people,
		sex: 0,
		birth: birth - rng.uniform(20, 40),
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
	const mother = newPerson({
		people,
		sex: 1,
		birth: birth - rng.uniform(17, 32),
		father: -1,
		mother: -1,
		dynasty: -1,
		origin,
		rng,
	})
	table.death[mother] = LIFESPAN.deathAt({
		sex: 1,
		birth: table.birth[mother],
		from: birth,
		rng,
	})
	marry({ people, a: father, b: mother, time: birth - 1 })
	const founder = newPerson({
		people,
		sex,
		birth,
		father,
		mother,
		dynasty,
		origin,
		rng,
	})
	table.death[founder] = LIFESPAN.deathAt({ sex, birth, from: time, rng })
	bear({
		people,
		mother,
		father,
		from: table.birth[mother] + 17,
		until: time,
		origin,
		rng,
	})
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
		bear({
			people,
			mother: wife,
			father: husband,
			from: wedding,
			until: time,
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
	if (!adult) return false
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
}: MatchInParams): number {
	const table = people.persons
	for (const realm of realms) {
		if (realm === seeker.realm) continue
		for (const other of pool.get(realm) ?? []) {
			if (matched.has(other.person)) continue
			if (royalOnly && !other.royalBlood) continue
			if (table.sex[other.person] === table.sex[seeker.person]) continue
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
			})
			if (found >= 0) return found
		}
	return -1
}

function wed({ people, a, b, time }: MarryParams): void {
	const table = people.persons
	const host =
		table.throne[a] >= 0
			? a
			: table.throne[b] >= 0
				? b
				: table.sex[a] === 0
					? a
					: b
	const guest = host === a ? b : a
	if (table.throne[guest] < 0) table.realm[guest] = table.realm[host]
	marry({ people, a, b, time })
}

function runYear({
	people,
	time,
	rulers,
	neighborsOf,
	originOf,
	royal,
	sovereigns,
	rng,
}: RunPeopleYearParams): CrossWedding[] {
	const table = people.persons
	const crowned = new Set(sovereigns)
	people.alive = people.alive.filter((person) => table.death[person] > time)
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

	const seekers: Seeker[] = []
	const pool = new Map<number, Seeker[]>()
	for (const person of people.alive) {
		if (table.scopeYear[person] !== stamp) continue
		if (!PEOPLE.aliveAt({ people, person, time })) continue
		if (!seeksSpouse({ people, person, time })) continue
		if (rng.random() >= MARRIAGE_CHANCE) continue
		const seeker = {
			person,
			realm: table.realm[person],
			royalBlood:
				crowned.has(person) ||
				crowned.has(table.father[person]) ||
				crowned.has(table.mother[person]),
		}
		seekers.push(seeker)
		const list = pool.get(seeker.realm)
		if (list) list.push(seeker)
		else pool.set(seeker.realm, [seeker])
	}
	const matched = new Set<number>()
	const weddings: CrossWedding[] = []
	for (const seeker of seekers) {
		if (matched.has(seeker.person)) continue
		matched.add(seeker.person)
		const isRoyal = royal(seeker.realm)
		const partner =
			rng.random() < (isRoyal ? ROYAL_FOREIGN_CHANCE : FOREIGN_MATCH_CHANCE)
				? foreignMatch({ people, seeker, pool, matched, neighborsOf, rng })
				: -1
		if (partner >= 0) {
			matched.add(partner)
			weddings.push({
				a: seeker.person,
				b: partner,
				realmA: seeker.realm,
				realmB: table.realm[partner],
			})
			wed({ people, a: seeker.person, b: partner, time })
			continue
		}
		if (isRoyal && time - table.birth[seeker.person] < ROYAL_WAIT_AGE) {
			matched.delete(seeker.person)
			continue
		}
		outsider({
			people,
			partner: seeker.person,
			time,
			origin: originOf(seeker.realm),
			rng,
		})
	}

	for (const mother of [...people.alive]) {
		if (table.sex[mother] !== 1) continue
		const father = table.spouse[mother]
		if (father < 0) continue
		if (!line.has(mother) && !line.has(father)) continue
		if (!PEOPLE.aliveAt({ people, person: mother, time })) continue
		bear({
			people,
			mother,
			father,
			from: time,
			until: time + 1,
			origin: originOf(table.realm[mother]),
			rng,
		})
	}
	return weddings
}

export const FAMILY = { found, runYear }
