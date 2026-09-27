import type {
	AllianceMatchParams,
	BirthParents,
	BirthParentsParams,
	PairKeyParams,
	RehomeParams,
	ReviewParams,
	SeedRoyalMarriagesParams,
} from "@/model/history/sim/engine/events/people/royal-marriages/types"
import { type Relation, STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"

// Share of starting kings in alliance-marrying realms whose queen comes from a
// neighbouring ruling house.
const START_ROYAL_MARRIAGE_SHARE = 0.4

const UNALLIABLE = new Set<Relation>([
	STATE.rel.WAR,
	STATE.rel.OVERLORD,
	STATE.rel.VASSAL,
	STATE.rel.PU_SENIOR,
	STATE.rel.PU_JUNIOR,
	STATE.rel.COLONY,
])

function pairKey({ state, a, b }: PairKeyParams): number {
	return Math.min(a, b) * state.P + Math.max(a, b)
}

// A match between the ruling families of two realms that marry for alliance,
// neither at war nor in a subject or union bond, can ally them.
function alliable({ state, match }: AllianceMatchParams): boolean {
	const people = state.people
	const { a, b, realmA, realmB } = match
	if (!STATE.canAlly({ state, a: realmA, b: realmB })) return false
	for (const realm of [realmA, realmB]) {
		if (!STATE.isSovereign({ state, p: realm })) return false
		if (!GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm]))
			return false
	}
	const rulerA = people.rulerOf[realmA]
	const rulerB = people.rulerOf[realmB]
	if (rulerA < 0 || rulerB < 0) return false
	if (!PEOPLE.family({ people, person: rulerA }).includes(a)) return false
	if (!PEOPLE.family({ people, person: rulerB }).includes(b)) return false
	return !UNALLIABLE.has(STATE.getRelation({ state, a: realmA, b: realmB }))
}

// A marriage or betrothal between such families makes the realms allies, or
// binds an alliance they already have. Returns whether an alliance holds.
function allianceFromMatch({ state, match }: AllianceMatchParams): boolean {
	const people = state.people
	if (!alliable({ state, match })) return false
	const { a, b, realmA, realmB } = match
	const key = pairKey({ state, a: realmA, b: realmB })
	if (people.marriageAlliances.has(key)) return true
	STATE.setRelation({ state, a: realmA, b: realmB, rel: STATE.rel.ALLY })
	people.marriageAlliances.set(key, { first: realmA, second: realmB })
	state.events.push({
		tag: "marriage alliance",
		time: state.time,
		data: { first: realmA, second: realmB, spouses: [a, b] },
	})
	return true
}

// A marriage alliance ends once no living marriage or betrothal joins the two
// ruling families, or the realms stop being sovereign allies. The alliance
// itself stays and drifts like any other. A living betrothal with no marriage
// alliance between its realms is broken; one with a dead party is left for
// the death release.
function review({ state }: ReviewParams): void {
	const people = state.people
	const time = state.time / STATE.yearMs
	for (const [key, { first, second }] of people.marriageAlliances) {
		const rulerA = people.rulerOf[first]
		const rulerB = people.rulerOf[second]
		const holds =
			STATE.isSovereign({ state, p: first }) &&
			STATE.isSovereign({ state, p: second }) &&
			rulerA >= 0 &&
			rulerB >= 0 &&
			STATE.getRelation({ state, a: first, b: second }) === STATE.rel.ALLY &&
			PEOPLE.tiedByMarriage({ people, a: rulerA, b: rulerB, time })
		if (holds) continue
		people.marriageAlliances.delete(key)
		state.events.push({
			tag: "marriage alliance ended",
			time: state.time,
			data: { first, second },
		})
	}
	const table = people.persons
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner < person) continue
		if (
			!PEOPLE.aliveAt({ people, person, time }) ||
			!PEOPLE.aliveAt({ people, person: partner, time })
		)
			continue
		const key = pairKey({
			state,
			a: table.realm[person],
			b: table.realm[partner],
		})
		if (!people.marriageAlliances.has(key))
			BETROTHAL.release({ people, person, time, cause: "alliance" })
	}
}

// Parents the bride could plausibly have in another ruling house: as the
// ruler's sister (same parents), else as the ruler's daughter.
function birthParents({
	people,
	bride,
	house,
}: BirthParentsParams): BirthParents | null {
	const table = people.persons
	const born = table.birth[bride]
	const fits = (mother: number, father: number) =>
		mother >= 0 &&
		born - table.birth[mother] >= 16 &&
		born - table.birth[mother] < 45 &&
		table.death[mother] > born &&
		(father < 0 || table.death[father] > born - 0.75)
	const sister = { father: table.father[house], mother: table.mother[house] }
	if (fits(sister.mother, sister.father)) return sister
	if (table.sex[house] !== 0) return null
	const daughter = { father: house, mother: table.spouse[house] }
	return fits(daughter.mother, daughter.father) ? daughter : null
}

function rehome({
	people,
	person,
	parents,
	dynasty,
	origin,
	rng,
}: RehomeParams): void {
	const table = people.persons
	table.father[person] = parents.father
	table.mother[person] = parents.mother
	for (const parent of [parents.father, parents.mother])
		if (parent >= 0) table.children[parent].push(person)
	table.dynasty[person] = dynasty
	table.culture[person] = origin.culture
	table.home[person] = origin.realm
	table.nameSeed[person] = PEOPLE.nameSeed({
		sex: table.sex[person],
		genderSystem: origin.genderSystem,
		rng,
	})
}

// The founders' queens are generated as outsiders; some become daughters or
// sisters of a neighbouring ruler so the world opens with marriage ties.
function seed({ state, rng }: SeedRoyalMarriagesParams): void {
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	const allies = (realm: number) =>
		STATE.isSovereign({ state, p: realm }) &&
		people.rulerOf[realm] >= 0 &&
		GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm])
	for (let realm = 0; realm < state.P; realm++) {
		if (!allies(realm)) continue
		const king = people.rulerOf[realm]
		const queen = table.spouse[king]
		if (table.sex[king] !== 0 || queen < 0 || table.dynasty[queen] >= 0)
			continue
		if (!PEOPLE.aliveAt({ people, person: queen, time })) continue
		if (rng.random() >= START_ROYAL_MARRIAGE_SHARE) continue
		for (const other of rng.shuffle(
			STATE.getNationNeighbors({ state, nation: realm }).filter(allies),
		)) {
			const house = people.rulerOf[other]
			const parents = birthParents({ people, bride: queen, house })
			if (!parents) continue
			rehome({
				people,
				person: queen,
				parents,
				dynasty: table.dynasty[house],
				origin: STATE.originOf({ state, realm: other }),
				rng,
			})
			allianceFromMatch({
				state,
				match: { a: king, b: queen, realmA: realm, realmB: other },
			})
			break
		}
	}
}

export const ROYAL_MARRIAGES = { alliable, allianceFromMatch, seed, review }
