import { PEOPLE } from "@/model/history/sim/people"
import { CHARACTER } from "@/model/history/sim/people/character"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import type {
	OpinionMemoryQueryParams,
	OpinionPair,
	OpinionPerson,
} from "@/model/history/sim/people/opinion/types"
import { RNG } from "@/model/shared/random/rng"
import type {
	AddMarriagePersonParams,
	MarriageFixture,
} from "@/test/history-run/fixtures/marriage/types"

function create(): MarriageFixture {
	const people = PEOPLE.create(6)
	const time = 100
	people.household.time = () => time
	const persons = new Map<number, OpinionPerson>()
	const candidates: MarriageFixture["candidates"] = new Map()
	const observations: MarriageFixture["observations"] = []
	const personOf = (id: number): OpinionPerson | null => {
		const cached = persons.get(id)
		if (cached) return cached
		if (id < 0 || id >= people.persons.sex.length) return null
		const table = people.persons
		return {
			id,
			character: CHARACTER.of({ people, person: id }),
			age: time - table.birth[id],
			culture: table.culture[id],
			heritage: 0,
			religion: 0,
			sovereignSeats: [],
			districtSovereigns: [],
		}
	}
	const context = {
		personOf,
		kinship: people.persons,
		married: ({ a, b, time: at }: OpinionPair) =>
			people.persons.spouse[a] === b &&
			people.persons.marriedAt[a] <= at &&
			people.persons.death[a] > at &&
			people.persons.death[b] > at,
		memoriesOf: ({ observer, target }: OpinionMemoryQueryParams) =>
			people.memories.get(observer)?.get(target) ?? [],
	}
	const market: MarriageFixture["market"] = {
		opinionContext: () => context,
		candidateOf: (id) =>
			candidates.get(id) ?? {
				currentStanding: 0,
				projectedStanding: 0,
				sovereignTiers: [],
				attractionModifier: 0,
			},
		allied: () => false,
		alliable: () => false,
		royal: () => false,
		neighborsOf: () => [],
		originOf: (realm) => ({ realm, culture: 0, genderSystem: 0 }),
		onboard: (id) => {
			people.persons.createdAt[id] = time
		},
		settle: () => undefined,
		refresh: () => undefined,
		observe: (row) => observations.push(row),
	}
	return {
		people,
		time,
		rng: RNG.createRng({ seed: 17 }),
		market,
		context,
		persons,
		candidates,
		observations,
	}
}

function add({ fixture, age, sex, realm }: AddMarriagePersonParams): number {
	const { people, time } = fixture
	const id = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people,
		sex,
		birth: time - age,
		survives: time,
		father: -1,
		mother: -1,
		dynasty: 0,
		origin: { realm, culture: 0, genderSystem: 0 },
		rng: fixture.rng,
	})
	people.persons.personality[id] = 6 | (8 << 6) | (16 << 12)
	people.persons.grades[id] = 3 | (3 << 7) | (3 << 14)
	people.persons.congenital[id] = 0
	people.persons.carried[id] = 0
	HOUSEHOLD.amendInitial({ people, person: id, province: realm })
	return id
}

export const MARRIAGE_FIXTURE = { create, add }
