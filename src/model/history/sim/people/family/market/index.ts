import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import type { SearchObservation } from "@/model/history/sim/people/family/diagnostics/types"
import type {
	AcceptedPair,
	AdultParams,
	EvaluatePairParams,
	MarryParams,
	MatchInParams,
	MatchParams,
	MinorSeekersParams,
	OutsiderParams,
	PairEvaluation,
	Seeker,
	SeekMatchesParams,
} from "@/model/history/sim/people/family/market/types"
import { MATCH_SCORING } from "@/model/history/sim/people/family/match-scoring"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { PeopleMatches, Sex } from "@/model/history/sim/people/types"
import { HASH } from "@/model/shared/random/hash"

// Ruling houses of realms that marry for alliance mostly marry abroad and,
// while young, wait for a foreign match rather than wed at home.
const ROYAL_FOREIGN_CHANCE = 0.8

const FOREIGN_MATCH_CHANCE = 0.3

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
	draws,
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
			? Math.min(44, Math.max(16, partnerAge - rng.uniform(0, 8)))
			: Math.min(69, Math.max(18, partnerAge + rng.uniform(0, 8)))
	const spouse = PEOPLE.spawn({
		recordHealth: draws?.recordHealth ?? true,
		death: null,
		nameSeed: draws?.nameSeed ?? null,
		people,
		sex,
		birth: time - age,
		survives: time,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin,
		rng: draws?.rng ?? rng,
	})
	return spouse
}

function seeksSpouse({ people, person, time }: AdultParams): boolean {
	const table = people.persons
	const age = time - table.birth[person]
	const adult =
		table.sex[person] === 1 ? age >= 16 && age < 45 : age >= 18 && age < 70
	if (!adult || table.betrothed[person] >= 0) return false
	const spouse = table.spouse[person]
	return spouse < 0 || table.death[spouse] <= time
}

function evaluatePair({
	people,
	time,
	match,
	market,
	ancestry,
}: EvaluatePairParams): PairEvaluation | null {
	if (
		KINSHIP.prohibitedMatch({
			context: people.persons,
			a: match.a,
			b: match.b,
			cache: ancestry,
		})
	)
		return null
	const context = market.opinionContext()
	const params = {
		time,
		context,
		candidateOf: market.candidateOf,
		alliance: match.realmA !== match.realmB && market.alliable(match),
		allied: market.allied(match),
	}
	const first = MATCH_SCORING.score({
		...params,
		observer: match.a,
		target: match.b,
	})
	const second = MATCH_SCORING.score({
		...params,
		observer: match.b,
		target: match.a,
	})
	if (!first || !second) return null
	return {
		first,
		second,
		acceptable: first.total >= 0 && second.total >= 0,
		total: first.total + second.total,
	}
}

function matchIn({
	people,
	seeker,
	pool,
	matched,
	realms,
	royalOnly,
	fits,
	time,
	market,
	ancestry,
}: MatchInParams): number {
	const table = people.persons
	let firstFit = -1
	let firstAcceptable = false
	const observation: SearchObservation = {
		kind: "search",
		time,
		group:
			realms.length === 1 && realms[0] === seeker.realm
				? "domestic"
				: "foreign",
		visited: 0,
		hardEligible: 0,
		kinship: 0,
		evaluated: 0,
		observerOnly: 0,
		candidateOnly: 0,
		bothNegative: 0,
		firstFit: "empty",
		scoringMs: 0,
	}
	let best = -1
	let score = -Infinity
	const visited = new Set<number>()
	for (const realm of realms) {
		if (visited.has(realm)) continue
		visited.add(realm)
		for (const other of pool.get(realm) ?? []) {
			observation.visited++
			if (other.person === seeker.person || matched.has(other.person)) continue
			if (royalOnly && !other.royalBlood) continue
			if (table.sex[other.person] === table.sex[seeker.person]) continue
			if (!fits(other.person)) continue
			observation.hardEligible++
			if (
				KINSHIP.prohibitedMatch({
					context: table,
					a: seeker.person,
					b: other.person,
					cache: ancestry,
				})
			) {
				observation.kinship++
				continue
			}
			const started = performance.now()
			const pair = evaluatePair({
				people,
				time,
				match: {
					a: seeker.person,
					b: other.person,
					realmA: seeker.realm,
					realmB: realm,
				},
				market,
				ancestry,
			})
			observation.scoringMs += performance.now() - started
			if (!pair) continue
			observation.evaluated++
			if (firstFit < 0) {
				firstFit = other.person
				firstAcceptable = pair.acceptable
			}
			if (pair.first.total < 0 && pair.second.total < 0)
				observation.bothNegative++
			else if (pair.first.total < 0) observation.observerOnly++
			else if (pair.second.total < 0) observation.candidateOnly++
			if (!pair.acceptable) continue
			if (pair.total > score || (pair.total === score && other.person < best)) {
				best = other.person
				score = pair.total
			}
		}
	}
	observation.firstFit =
		firstFit < 0
			? "empty"
			: firstFit === best
				? "unchanged"
				: firstAcceptable
					? "ranking"
					: "rejection"
	market.observe(observation)
	return best
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
	time,
	market,
	ancestry,
}: MatchParams): number {
	const near = rng.shuffle([...neighborsOf(seeker.realm)].sort((a, b) => a - b))
	const adjacent = new Set(near)
	const far = new Set<number>()
	for (const realm of near) for (const next of neighborsOf(realm)) far.add(next)
	const rings = [
		near.filter((realm) => realm !== seeker.realm),
		[...far].filter((realm) => realm !== seeker.realm && !adjacent.has(realm)),
	]
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
				time,
				market,
				ancestry,
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
		for (const person of PEOPLE.family({ people, person: ruler }).sort(
			(a, b) => a - b,
		)) {
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
	rng,
	...market
}: SeekMatchesParams): PeopleMatches {
	const table = people.persons
	const ids = [
		...seekers,
		...minorSeekers({
			people,
			time,
			sovereigns,
			royal: market.royal,
			chance: minorChance,
			rng,
		}),
	]
	const matched = new Set<number>()
	const ancestry = new Map<number, Set<number>>()
	const matches: PeopleMatches = { weddings: [], betrothals: [] }
	const ageOf = (person: number) => time - table.birth[person]
	const eligible = (person: number) =>
		PEOPLE.aliveAt({ people, person, time }) &&
		table.spouse[person] < 0 &&
		table.betrothed[person] < 0 &&
		(ageOf(person) < BETROTHAL.adultAge ||
			seeksSpouse({ people, person, time }))
	const seekerOf = (person: number): Seeker => ({
		person,
		realm: HOUSEHOLD.realmOf({ people, person }),
		royalBlood: [person, table.father[person], table.mother[person]].some(
			(relative) =>
				relative >= 0 &&
				table.heldSeats[relative].some(
					(seat) => people.rulerOf[seat] === relative && market.royal(seat),
				),
		),
	})
	// Only an accepted pair removes candidates or moves a household, so the
	// realm groups stand until the next one, and nobody else stops being
	// eligible or changes blood within the pass.
	let candidates = ids.filter(eligible).map(seekerOf)
	const waiting = new Map(candidates.map((other) => [other.person, other]))
	const order = new Map(candidates.map((other, index) => [other.person, index]))
	let groups: Map<number, Seeker[]> | null = null
	const grouped = () => {
		const pool = new Map<number, Seeker[]>()
		for (const other of candidates) {
			other.realm = HOUSEHOLD.realmOf({ people, person: other.person })
			const list = pool.get(other.realm)
			if (list) list.push(other)
			else pool.set(other.realm, [other])
		}
		return pool
	}
	const leave = (other: Seeker) => {
		const list = groups?.get(other.realm)
		const index = list ? list.indexOf(other) : -1
		if (list && index >= 0) list.splice(index, 1)
	}
	// A wedding moves the unlanded spouse and their young children; everyone
	// else stays in the group they were in, unless the match redrew realms.
	const regroup = (pair: number[], redrawn: boolean) => {
		if (redrawn) {
			for (const person of pair) waiting.delete(person)
			candidates = candidates.filter((other) => waiting.has(other.person))
			groups = null
		}
		if (!groups) return
		for (const person of pair) {
			const other = waiting.get(person)
			if (!other) continue
			leave(other)
			waiting.delete(person)
		}
		for (const person of pair)
			for (const child of table.children[person]) {
				const other = waiting.get(child)
				if (!other) continue
				const realm = HOUSEHOLD.realmOf({ people, person: child })
				if (realm === other.realm) continue
				leave(other)
				other.realm = realm
				const list = groups.get(realm)
				const rank = order.get(child) as number
				const at = list
					? list.findIndex(
							(entry) => (order.get(entry.person) as number) > rank,
						)
					: -1
				if (!list) groups.set(realm, [other])
				else if (at < 0) list.push(other)
				else list.splice(at, 0, other)
			}
	}
	const accept = (selection: AcceptedPair) => {
		const { match, outsider: fallback } = selection
		const pair = evaluatePair({ people, time, match, market, ancestry })
		const context = market.opinionContext()
		const a = context.personOf(match.a)
		const b = context.personOf(match.b)
		if (!pair || !a || !b) return
		const first = market.candidateOf(match.a)
		const second = market.candidateOf(match.b)
		market.observe({
			kind: "selection",
			time,
			group:
				Math.min(a.age, b.age) < BETROTHAL.adultAge
					? "betrothal"
					: fallback
						? "outsider"
						: match.realmA === match.realmB
							? "domestic"
							: "foreign",
			first: pair.first,
			second: pair.second,
			a,
			b,
			current: [first.currentStanding, second.currentStanding],
			projected: [first.projectedStanding, second.projectedStanding],
			tiers: [
				...new Set(first.sovereignTiers),
				...new Set(second.sovereignTiers),
			],
		})
		matched.add(match.a)
		matched.add(match.b)
		const betrothal =
			Math.min(ageOf(match.a), ageOf(match.b)) < BETROTHAL.adultAge
		if (betrothal) {
			BETROTHAL.betroth({ people, a: match.a, b: match.b, time })
			matches.betrothals.push(match)
		} else {
			marry({ people, a: match.a, b: match.b, time })
			matches.weddings.push(match)
		}
		const redrawn = market.settle({ match, betrothal })
		market.refresh()
		regroup([match.a, match.b], redrawn)
	}
	market.refresh()
	for (const person of ids) {
		if (matched.has(person) || !eligible(person)) continue
		const seeker = seekerOf(person)
		const age = ageOf(person)
		groups ??= grouped()
		const pool = groups
		const fits = (partner: number) => {
			const other = ageOf(partner)
			if (Math.min(age, other) >= BETROTHAL.adultAge) return true
			const realmB = HOUSEHOLD.realmOf({ people, person: partner })
			return (
				realmB !== seeker.realm &&
				market.royal(seeker.realm) &&
				market.royal(realmB) &&
				Math.min(age, other) >= BETROTHAL.minAge &&
				Math.abs(age - other) <= BETROTHAL.maxAgeGap &&
				market.alliable({ a: person, b: partner, realmA: seeker.realm, realmB })
			)
		}
		let partner =
			rng.random() <
			(market.royal(seeker.realm) ? ROYAL_FOREIGN_CHANCE : FOREIGN_MATCH_CHANCE)
				? foreignMatch({
						people,
						seeker,
						pool,
						matched,
						neighborsOf: market.neighborsOf,
						fits,
						rng,
						time,
						market,
						ancestry,
					})
				: -1
		if (partner < 0 && age >= BETROTHAL.adultAge)
			for (const royalOnly of seeker.royalBlood ? [true, false] : [false]) {
				partner = matchIn({
					people,
					seeker,
					pool,
					matched,
					realms: [seeker.realm],
					royalOnly,
					fits: (other) => ageOf(other) >= BETROTHAL.adultAge && fits(other),
					time,
					market,
					ancestry,
				})
				if (partner >= 0) break
			}
		if (partner >= 0) {
			accept({
				match: {
					a: person,
					b: partner,
					realmA: seeker.realm,
					realmB: HOUSEHOLD.realmOf({ people, person: partner }),
				},
				outsider: false,
			})
			continue
		}
		if (age < BETROTHAL.adultAge) continue
		const fallback = {
			kind: "fallback" as const,
			time,
			age,
			attempt:
				HASH.unit({
					seed: table.nameSeed[person],
					channel: 140,
					salt: Math.floor(age),
				}) < Math.min(0.5, Math.max(0, age - 25) / 20),
			accepted: false,
		}
		if (!fallback.attempt) {
			market.observe(fallback)
			continue
		}
		partner = outsider({
			draws: null,
			people,
			partner: person,
			time,
			origin: market.originOf(table.residence[person]),
			rng,
		})
		market.onboard(partner)
		if (!eligible(partner)) {
			market.observe(fallback)
			continue
		}
		const match = {
			a: person,
			b: partner,
			realmA: seeker.realm,
			realmB: HOUSEHOLD.realmOf({ people, person: partner }),
		}
		fallback.accepted =
			evaluatePair({ people, time, match, market, ancestry })?.acceptable ??
			false
		market.observe(fallback)
		if (fallback.accepted) accept({ match, outsider: true })
	}
	market.observe({
		kind: "ancestry",
		time,
		sets: ancestry.size,
		memberships: [...ancestry.values()].reduce((sum, set) => sum + set.size, 0),
	})
	return matches
}

export const MARRIAGE_MARKET = {
	marry,
	outsider,
	seeksSpouse,
	evaluatePair,
	seekMatches,
}
