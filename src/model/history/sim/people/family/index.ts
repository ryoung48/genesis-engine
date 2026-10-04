import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { BACKFILL_MARRIAGE } from "@/model/history/sim/people/family/backfill"
import { MARRIAGE_MARKET } from "@/model/history/sim/people/family/market"
import type { ScopeParams } from "@/model/history/sim/people/family/types"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
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
const MARRIED_FOUNDER_CHANCE = 0.85

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
		recordHealth: true,
		death: null,
		nameSeed: null,
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
		recordHealth: true,
		death: null,
		nameSeed: null,
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
	MARRIAGE_MARKET.marry({ people, a: father, b: mother, time: birth - 1 })
	const founder = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
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
	FERTILITY.siblings({
		survives: null,
		birthDraws: null,
		people,
		child: founder,
		until: time,
		origin,
		rng,
	})
	if (age >= 18 && rng.random() < MARRIED_FOUNDER_CHANCE) {
		const wedding = Math.min(time, birth + rng.uniform(16, 25))
		const spouse = MARRIAGE_MARKET.outsider({
			draws: null,
			people,
			partner: founder,
			time: wedding,
			origin,
			rng,
		})
		if (
			!BACKFILL_MARRIAGE.acceptable({
				people,
				a: founder,
				b: spouse,
				time: wedding,
			})
		)
			return founder
		MARRIAGE_MARKET.marry({ people, a: founder, b: spouse, time: wedding })
		const [wife, husband] = sex === 1 ? [founder, spouse] : [spouse, founder]
		FERTILITY.bear({
			birthDraws: null,
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
	scope({ people, time, rulers })

	const weddings: CrossMatch[] = []
	for (const { a, b } of BETROTHAL.fulfil({
		people,
		time,
		onKinship: () => realms.observe({ kind: "kinship release", time }),
	})) {
		weddings.push({
			a,
			b,
			realmA: HOUSEHOLD.realmOf({ people, person: a }),
			realmB: HOUSEHOLD.realmOf({ people, person: b }),
		})
		MARRIAGE_MARKET.marry({ people, a, b, time })
		realms.settle({ match: weddings[weddings.length - 1], betrothal: false })
		realms.refresh()
	}
	const seekers: number[] = []
	for (const person of people.alive) {
		if (!PEOPLE.aliveAt({ people, person, time })) continue
		if (!MARRIAGE_MARKET.seeksSpouse({ people, person, time })) continue
		if (rng.random() < MARRIAGE_CHANCE) seekers.push(person)
	}
	const matches = MARRIAGE_MARKET.seekMatches({
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

export const FAMILY = {
	found,
	seekMatches: MARRIAGE_MARKET.seekMatches,
	runYear,
	project,
	evaluatePair: MARRIAGE_MARKET.evaluatePair,
}
