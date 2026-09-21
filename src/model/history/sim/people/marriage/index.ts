import { PEOPLE } from "@/model/history/sim/people"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import type {
	EndMarriageParams,
	MarketParams,
	MarketResult,
	MarriageAtParams,
	MarriageCandidate,
	MarriageKind,
	MarryParams,
	Wedding,
} from "@/model/history/sim/people/marriage/types"
import type { MarriageTable } from "@/model/history/sim/people/types"
import { ARRAY } from "@/model/shared/array"

const RULER_SEEK_CHANCE = 0.5

const KINDS: Record<MarriageKind, number> = {
	primary: 0,
	secondary: 1,
	concubine: 2,
}

function activeMarriage({ people, person, time }: MarriageAtParams): number {
	const persons = people.persons
	const marriages = people.marriages
	if (person < 0 || person >= persons.count) return -1
	let row = persons.firstMarriage[person]
	while (row >= 0) {
		if (marriages.start[row] <= time && marriages.end[row] > time) return row
		row =
			persons.sex[person] === 0
				? marriages.nextOfHusband[row]
				: marriages.nextOfWife[row]
	}
	return -1
}

function canMarry({ people, person, time }: MarriageAtParams): boolean {
	return (
		PEOPLE.aliveAt({ people, person, time }) &&
		time - people.persons.birth[person] >= 16 &&
		(people.persons.sex[person] === 0 ||
			time - people.persons.birth[person] < 45) &&
		activeMarriage({ people, person, time }) < 0
	)
}

function growMarriages(table: MarriageTable): void {
	const capacity = Math.max(
		table.capacity + 1,
		Math.ceil(table.capacity * 1.25),
	)
	for (const key of [
		"husband",
		"wife",
		"kind",
		"start",
		"end",
		"endReason",
		"matrilineal",
		"nextOfHusband",
		"nextOfWife",
	] as const) {
		Object.assign(table, {
			[key]: ARRAY.growNumeric({ array: table[key], capacity }),
		})
	}
	table.capacity = capacity
	table.growths++
}

function marry({
	people,
	husband,
	wife,
	time,
	kind = "primary",
}: MarryParams): number {
	if (
		kind !== "primary" ||
		PEOPLE.closeKin({ people, a: husband, b: wife }) ||
		people.persons.sex[husband] !== 0 ||
		people.persons.sex[wife] !== 1 ||
		!canMarry({ people, person: husband, time }) ||
		!canMarry({ people, person: wife, time })
	)
		return -1
	const table = people.marriages
	const persons = people.persons
	if (table.count === table.capacity) growMarriages(table)
	const row = table.count++
	table.husband[row] = husband
	table.wife[row] = wife
	table.kind[row] = KINDS[kind]
	table.start[row] = time
	table.end[row] = Number.POSITIVE_INFINITY
	table.nextOfHusband[row] = persons.firstMarriage[husband]
	table.nextOfWife[row] = persons.firstMarriage[wife]
	persons.firstMarriage[husband] = row
	persons.firstMarriage[wife] = row
	persons.residence[wife] = persons.residence[husband]
	return row
}

function endMarriage({
	people,
	marriage,
	time,
	reason,
}: EndMarriageParams): void {
	const table = people.marriages
	if (marriage < 0 || marriage >= table.count || table.end[marriage] <= time)
		return
	table.end[marriage] = time
	table.endReason[marriage] = reason === "widowed" ? 0 : 1
}

function market({
	people,
	from,
	sovereignOfResidence,
	cultureOfResidence,
	standing,
	neighbors,
	rng,
}: MarketParams): MarketResult {
	const persons = people.persons
	const womenByRealm = new Map<number, number[]>()
	const men: number[] = []
	const seekers: number[] = []
	for (let i = 0; i < persons.aliveCount; i++) {
		const person = persons.alive[i]
		if (!canMarry({ people, person, time: from })) continue
		const age = Math.floor(from - persons.birth[person])
		const ruler = PEOPLE.isRuler({ people, person })
		const neverSeek = (Math.imul(person + 1, 2654435761) >>> 0) % 10 === 0
		if (neverSeek && !ruler) continue
		const chance =
			ruler && age >= 18
				? RULER_SEEK_CHANCE
				: persons.sex[person] === 0
					? age < 18
						? 0.04
						: age < 22
							? 0.12
							: age < 30
								? 0.2
								: 0.1
					: age < 18
						? 0.15
						: age < 22
							? 0.25
							: age < 30
								? 0.15
								: 0.06
		if (rng.random() >= chance) continue
		seekers.push(person)
		if (persons.sex[person] === 0) men.push(person)
		else {
			const realm = sovereignOfResidence[persons.residence[person]]
			const bucket = womenByRealm.get(realm) ?? []
			bucket.push(person)
			womenByRealm.set(realm, bucket)
		}
	}
	const candidates: MarriageCandidate[] = []
	for (const husband of men) {
		const realm = sovereignOfResidence[persons.residence[husband]]
		for (const otherRealm of [realm, ...(neighbors.get(realm) ?? [])]) {
			for (const wife of womenByRealm.get(otherRealm) ?? []) {
				if (PEOPLE.closeKin({ people, a: husband, b: wife })) continue
				const husbandAge = from - persons.birth[husband]
				const wifeAge = from - persons.birth[wife]
				if (wifeAge >= 45) continue
				const gap = standing[husband] - standing[wife]
				const husbandAlliance =
					gap < 0 ? 700 : gap === 0 ? 250 : gap === 1 ? 100 : gap === 2 ? 33 : 0
				const wifeAlliance =
					gap > 0
						? 700
						: gap === 0
							? 250
							: gap === -1
								? 100
								: gap === -2
									? 33
									: 0
				const score =
					husbandAlliance +
					wifeAlliance -
					Math.max(0, husbandAge - 50) * 10 -
					Math.max(0, wifeAge - 30) * 50 -
					Math.max(0, Math.abs(husbandAge - wifeAge) - 5) * 10
				if (score >= 0) candidates.push({ husband, wife, score })
			}
		}
	}
	candidates.sort(
		(a, b) => b.score - a.score || a.husband - b.husband || a.wife - b.wife,
	)
	const matched = new Set<number>()
	const weddings: Wedding[] = []
	const arrivals: number[] = []
	for (const candidate of candidates) {
		if (matched.has(candidate.husband) || matched.has(candidate.wife)) continue
		const time = from + rng.random()
		if (
			persons.death[candidate.husband] <= time ||
			persons.death[candidate.wife] <= time
		)
			continue
		matched.add(candidate.husband)
		matched.add(candidate.wife)
		weddings.push({ husband: candidate.husband, wife: candidate.wife, time })
	}
	for (const person of seekers) {
		if (matched.has(person)) continue
		const age = from - persons.birth[person]
		const desperation = Math.max(0, 50 * (age - 25))
		if (rng.random() >= Math.min(0.5, desperation / 1000)) continue
		const time = from + rng.random()
		if (persons.death[person] <= time) continue
		const realm = sovereignOfResidence[persons.residence[person]]
		const nearby = neighbors.get(realm) ?? []
		const residence =
			nearby.length > 0
				? nearby[Math.floor(rng.random() * nearby.length)]
				: persons.residence[person]
		const sex = persons.sex[person] === 0 ? 1 : 0
		const spouseAge =
			sex === 1 ? Math.min(40, Math.max(16, age - 4)) : Math.min(70, age + 4)
		const birth = from - spouseAge
		const life = LIFESPAN.trajectory({
			birth,
			until: from,
			sex,
			rng,
			requireAlive: true,
			initialHealth: null,
		})
		const outsider = PEOPLE.addPerson({
			people,
			sex,
			birth,
			health: life.health,
			dynasty: people.nextDynasty++,
			culture:
				cultureOfResidence[residence] >= 0
					? cultureOfResidence[residence]
					: persons.culture[person],
			residence,
			rng,
		})
		arrivals.push(outsider)
		weddings.push({
			husband: sex === 1 ? person : outsider,
			wife: sex === 1 ? outsider : person,
			time,
		})
		matched.add(person)
	}
	return { weddings, arrivals }
}

export const MARRIAGE = { activeMarriage, canMarry, marry, endMarriage, market }
