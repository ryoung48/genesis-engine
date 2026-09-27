import type {
	BetrothalPassParams,
	BetrothedPair,
	BetrothParams,
	ReleaseParams,
} from "@/model/history/sim/people/betrothal/types"

// CK3: the AI betroths no one under 12, and the betrothed marry as adults at
// 16. Its age-gap penalty in the spouse finder starts past 5 years.
const MIN_AGE = 12
const ADULT_AGE = 16
const MAX_AGE_GAP = 5

function betroth({ people, a, b, time }: BetrothParams): void {
	const table = people.persons
	table.betrothed[a] = b
	table.betrothed[b] = a
	table.betrothedAt[a] = time
	table.betrothedAt[b] = time
	if (table.recorded[a] && table.recorded[b])
		people.log.betrothals.push({ a, b, time })
}

function release({ people, person, time, cause }: ReleaseParams): void {
	const table = people.persons
	const partner = table.betrothed[person]
	if (partner < 0) return
	table.betrothed[person] = -1
	table.betrothed[partner] = -1
	table.betrothedAt[person] = -1
	table.betrothedAt[partner] = -1
	if (table.recorded[person] && table.recorded[partner])
		people.log.betrothalEnds.push({ a: person, b: partner, time, cause })
}

// A betrothal lapses at the first yearly pass after either party's death.
function releaseDead({ people, time }: BetrothalPassParams): void {
	const table = people.persons
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner < 0) continue
		const death = Math.min(table.death[person], table.death[partner])
		if (death <= time) release({ people, person, time: death, cause: "death" })
	}
}

// Pairs whose younger party has come of age; their columns are cleared for
// the wedding.
function fulfil({ people, time }: BetrothalPassParams): BetrothedPair[] {
	const table = people.persons
	const pairs: BetrothedPair[] = []
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner < person) continue
		if (
			time - table.birth[person] < ADULT_AGE ||
			time - table.birth[partner] < ADULT_AGE
		)
			continue
		for (const party of [person, partner]) {
			table.betrothed[party] = -1
			table.betrothedAt[party] = -1
		}
		pairs.push({ a: person, b: partner })
	}
	return pairs
}

export const BETROTHAL = {
	minAge: MIN_AGE,
	adultAge: ADULT_AGE,
	maxAgeGap: MAX_AGE_GAP,
	betroth,
	release,
	releaseDead,
	fulfil,
}
