import { expect, it, vi } from "vitest"
import { BACKFILL } from "@/model/history/sim/engine/backfill"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { DIPLOMACY } from "@/model/history/sim/engine/events/diplomacy"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { POPULATION } from "@/model/history/sim/engine/events/population"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { BACKFILL_MARRIAGE } from "@/model/history/sim/people/family/backfill"
import { STARTING_ANCHORS } from "@/model/history/sim/people/family/starting/anchors"
import { STARTING_RANDOM } from "@/model/history/sim/people/family/starting/random"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { SharedRng } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"
import { BACKFILL_FIXTURE } from "@/test/history-run/fixtures/backfill"

it("repeats keyed draws, separates world seeds and resolves every explicit name seed", () => {
	const params = { seed: 17, genderSystem: 0, age: 40, sovereign: true }
	const a = BACKFILL_FIXTURE.create(params)
	const b = BACKFILL_FIXTURE.create(params)
	expect(a.people.persons).toEqual(b.people.persons)
	expect(PEOPLE_LOG.seal({ people: a.people, sovereign: () => true })).toEqual(
		PEOPLE_LOG.seal({ people: b.people, sovereign: () => true }),
	)
	expect(
		BACKFILL_FIXTURE.create({ ...params, seed: 18 }).people.persons.nameSeed,
	).not.toEqual(a.people.persons.nameSeed)
	for (const [id, sex] of a.people.persons.sex.entries())
		expect(
			GENDER_SYSTEM.resolveLeaderGender({
				system: 0,
				seed: a.people.persons.nameSeed[id],
			}),
		).toBe(sex === 1 ? "female" : "male")
})

it("conditions all predecessor relations on fixed births, parent survival and final inherited draws", () => {
	const relations = new Set<string>()
	for (const genderSystem of [0, 1, 2])
		for (let seed = 0; seed < 40; seed++) {
			const { people, house } = BACKFILL_FIXTURE.create({
				seed,
				genderSystem,
				age: 40,
				sovereign: true,
			})
			const table = people.persons
			expect(house.holder.birth).toBe(60)
			expect(house.predecessor).not.toBeNull()
			if (!house.predecessor || !house.relation)
				throw new Error("Missing predecessor")
			relations.add(house.relation)
			expect(table.death[house.predecessor.person]).toBe(house.accession)
			expect(table.heldSeats[house.predecessor.person]).toEqual([])
			if (genderSystem !== 1)
				expect(house.predecessor.sex).toBe(genderSystem === 2 ? 1 : 0)
			if (house.relation === "unrelated") {
				expect(house.predecessor.father).toBeNull()
				expect(house.predecessor.mother).toBeNull()
				expect(table.dynasty[house.predecessor.person]).not.toBe(
					table.dynasty[house.holder.person],
				)
			}
			if (house.relation === "sibling" || house.relation === "extended kin")
				for (const parent of [house.holder.father, house.holder.mother]) {
					if (!parent) throw new Error("Missing parent")
					expect(table.death[parent.person]).toBeLessThanOrEqual(
						house.accession,
					)
				}
			for (let person = 0; person < table.sex.length; person++) {
				const father = table.father[person]
				const mother = table.mother[person]
				if (father >= 0) {
					expect(
						table.birth[person] - table.birth[father],
					).toBeGreaterThanOrEqual(16)
					expect(table.death[father]).toBeGreaterThan(
						table.birth[person] - 280 / 365,
					)
				}
				if (mother >= 0) {
					expect(
						table.birth[person] - table.birth[mother],
					).toBeGreaterThanOrEqual(16)
					expect(table.birth[person] - table.birth[mother]).toBeLessThan(45)
					expect(table.death[mother]).toBeGreaterThanOrEqual(
						table.birth[person],
					)
				}
				expect(table.bases[person]).toBe(
					ATTRIBUTES.draw({ table, person }).bases,
				)
				expect(table.carried[person]).toBe(
					TRAITS.draw({ table, person }).carried,
				)
			}
			const transmitting =
				genderSystem === 2 ? house.holder.mother : house.holder.father
			if (!transmitting) throw new Error("Missing transmitting parent")
			expect(table.dynasty[house.holder.person]).toBe(
				table.dynasty[transmitting.person],
			)
		}
	expect([...relations].sort()).toEqual([
		"child",
		"extended kin",
		"sibling",
		"unrelated",
	])
})

it("retains rejected candidates without weddings or children and scores every optional wedding", () => {
	const acceptance = vi
		.spyOn(BACKFILL_MARRIAGE, "acceptable")
		.mockReturnValue(false)
	const source = STARTING_RANDOM.source
	const participation = vi
		.spyOn(STARTING_RANDOM, "source")
		.mockImplementation((params) =>
			params.purpose === 5
				? { ...source(params), random: () => 0 }
				: source(params),
		)
	try {
		const { people, house } = BACKFILL_FIXTURE.create({
			seed: 17,
			genderSystem: 0,
			age: 55,
			sovereign: false,
		})
		expect(acceptance).toHaveBeenCalled()
		expect(people.persons.children[house.holder.person]).toEqual([])
		expect(people.startingFamilies.rejectedCandidates.length).toBeGreaterThan(0)
		for (const person of people.startingFamilies.rejectedCandidates) {
			expect(people.persons.spouse[person]).toBe(-1)
			expect(people.persons.children[person]).toEqual([])
		}
		const packet = PEOPLE_LOG.seal({ people, sovereign: () => false })
		expect(packet.sex.length).toBe(people.persons.sex.length)
		for (let index = 0; index < packet.count; index++)
			expect(PEOPLE_LOG.read({ rows: packet, index }).kind).not.toBe("wedding")
	} finally {
		acceptance.mockRestore()
		participation.mockRestore()
	}
})

it("links cousin anchors before inheritance and never overwrites established ancestry", () => {
	const seed = 5
	const create = (seat: number) =>
		STARTING_ANCHORS.house({
			seed,
			path: [0, seat],
			seat,
			origin: { realm: seat, culture: 0, genderSystem: 0 },
			time: 100,
			age: 40,
			rank: 2,
			sovereign: false,
		})
	const a = create(0)
	const b = create(1)
	if (!a.holder.father || !b.holder.father) throw new Error("Missing fathers")
	const older =
		a.holder.father.birth < b.holder.father.birth
			? a.holder.father
			: b.holder.father
	const younger = older === a.holder.father ? b.holder.father : a.holder.father
	const original = younger.birth
	younger.birth = older.birth + 4
	expect(
		STARTING_ANCHORS.bridge({
			path: [0, 0, 9],
			origin: a.holder.origin,
			older,
			younger,
		}),
	).toBe(true)
	const people = PEOPLE.create(8)
	people.household.time = () => 100
	STARTING_ANCHORS.materialize({ people, seed, anchors: [b.holder, a.holder] })
	expect(people.persons.father[a.holder.father.person]).toBe(
		people.persons.father[b.holder.father.person],
	)
	expect(
		KINSHIP.prohibitedMatch({
			context: people.persons,
			a: a.holder.person,
			b: b.holder.person,
			cache: null,
		}),
	).toBe(true)
	expect(
		STARTING_ANCHORS.bridge({
			path: [0, 0, 9],
			origin: a.holder.origin,
			older,
			younger,
		}),
	).toBe(false)
	expect(younger.birth).not.toBe(original)
})

it("keeps purpose sources independent of name retries", () => {
	const params = { seed: 1, path: [0, 1, 4, 0], purpose: 6 }
	const expected = STARTING_RANDOM.source(params).random()
	STARTING_RANDOM.draws({
		seed: 1,
		path: params.path,
		sex: 1,
		origin: { realm: 0, culture: 0, genderSystem: 0 },
	})
	expect(STARTING_RANDOM.source(params).random()).toBe(expected)
})

it("installs rulers before downstream passes, appends houses without changing IDs and uses no shared draws", () => {
	let active = 0
	let draws = 0
	let earlySeeds: number[] = []
	const create = HISTORY_RNG.createHistoryRng
	const rng = vi
		.spyOn(HISTORY_RNG, "createHistoryRng")
		.mockImplementation((seed) => {
			const source = create(seed)
			return new Proxy(source, {
				get(target, property) {
					const method = target[property as keyof SharedRng]
					return (...args: unknown[]) => {
						if (active) draws++
						return Reflect.apply(method, target, args)
					}
				},
			})
		})
	const early = BACKFILL.sovereigns
	const late = BACKFILL.houses
	const sovereigns = vi
		.spyOn(BACKFILL, "sovereigns")
		.mockImplementation((params) => {
			expect(params.seed).toBe(14963991)
			active++
			try {
				early(params)
				earlySeeds = [...params.state.people.persons.nameSeed]
			} finally {
				active--
			}
		})
	const houses = vi.spyOn(BACKFILL, "houses").mockImplementation((params) => {
		active++
		try {
			late(params)
			expect(
				params.state.people.persons.nameSeed.slice(0, earlySeeds.length),
			).toEqual(earlySeeds)
		} finally {
			active--
		}
	})
	const init = PEOPLE_EVENTS.init
	const peopleInit = vi
		.spyOn(PEOPLE_EVENTS, "init")
		.mockImplementation((params) => {
			active++
			try {
				init(params)
			} finally {
				active--
			}
		})
	const population = POPULATION.initPopulation
	const installed = vi
		.spyOn(POPULATION, "initPopulation")
		.mockImplementation((params) => {
			for (let seat = 0; seat < params.state.P; seat++) {
				if (
					!STATE.isSovereign({ state: params.state, p: seat }) ||
					params.state.desolate[seat] ||
					params.state.stateless[seat]
				)
					continue
				const person = params.state.people.rulerOf[seat]
				expect(person).toBeGreaterThanOrEqual(0)
				expect(params.state.people.persons.heldSeats[person]).toContain(seat)
				expect(params.state.people.persons.nameSeed[person]).toBeGreaterThan(0)
			}
			population(params)
		})
	const economy = ECONOMY.initEconomy
	const economyPass = vi
		.spyOn(ECONOMY, "initEconomy")
		.mockImplementation((params) => {
			expect(params.state.people.persons.nameSeed).toEqual(earlySeeds)
			economy(params)
		})
	const military = MILITARY.initialize
	const militaryPass = vi
		.spyOn(MILITARY, "initialize")
		.mockImplementation((params) => {
			expect(params.state.people.persons.nameSeed).toEqual(earlySeeds)
			military(params)
		})
	const diplomacy = DIPLOMACY.initDiplomacy
	const diplomacyPass = vi
		.spyOn(DIPLOMACY, "initDiplomacy")
		.mockImplementation((params) => {
			expect(params.state.people.persons.nameSeed).toEqual(earlySeeds)
			diplomacy(params)
		})
	try {
		const { engine } = HISTORY_RUN.createEngine({
			seed: 14963991,
			era: "lateMedieval",
			numPoints: 10000,
		})
		expect(draws).toBe(0)
		expect(installed).toHaveBeenCalledOnce()
		expect(diplomacyPass).toHaveBeenCalledOnce()
		expect(economyPass).toHaveBeenCalledOnce()
		expect(militaryPass).toHaveBeenCalledOnce()
		expect(engine.people.persons.nameSeed.length).toBeGreaterThan(
			earlySeeds.length,
		)
		for (const person of engine.people.alive) {
			const table = engine.people.persons
			if (table.spouse[person] >= 0)
				expect(table.death[table.spouse[person]]).toBeGreaterThan(
					engine.time / STATE.yearMs,
				)
		}
	} finally {
		peopleInit.mockRestore()
		rng.mockRestore()
		sovereigns.mockRestore()
		houses.mockRestore()
		installed.mockRestore()
		diplomacyPass.mockRestore()
		economyPass.mockRestore()
		militaryPass.mockRestore()
	}
})

it("falls back when a related predecessor has no parent-death window", () => {
	for (const genderSystem of [0, 1, 2]) {
		const { house } = BACKFILL_FIXTURE.create({
			seed: 17,
			genderSystem,
			age: 0,
			sovereign: true,
		})
		expect(house.accession).toBe(house.time)
		expect(house.relation).toBe("unrelated")
		expect(house.predecessor?.father).toBeNull()
		expect(house.predecessor?.mother).toBeNull()
	}
})

it("allocates the same identities when anchor enumeration is reversed", () => {
	const allocate = (reverse: boolean) => {
		const people = PEOPLE.create(8)
		const houses = [0, 1].map((seat) =>
			STARTING_ANCHORS.house({
				seed: 5,
				path: [0, seat],
				seat,
				origin: { realm: seat, culture: seat, genderSystem: 0 },
				time: 100,
				age: 40,
				rank: 2,
				sovereign: true,
			}),
		)
		const anchors = houses.flatMap((house) =>
			house.predecessor ? [house.holder, house.predecessor] : [house.holder],
		)
		STARTING_ANCHORS.materialize({
			people,
			seed: 5,
			anchors: reverse ? anchors.reverse() : anchors,
		})
		return people.persons
	}
	expect(allocate(true)).toEqual(allocate(false))
})

it("bounds completed marriages, delays widow remarriage and stops at grandchildren and nephews", () => {
	let remarriages = 0
	for (let seed = 0; seed < 24; seed++) {
		const { people, house } = BACKFILL_FIXTURE.create({
			seed,
			genderSystem: 0,
			age: 65,
			sovereign: false,
		})
		const table = people.persons
		const packet = PEOPLE_LOG.seal({ people, sovereign: () => false })
		const weddings = Array.from({ length: packet.count }, (...entry) =>
			PEOPLE_LOG.read({ rows: packet, index: entry[1] }),
		).filter((row) => row.kind === "wedding")
		const holder = house.holder.person
		const siblings = table.children[table.mother[holder]].filter(
			(person) =>
				person !== holder && table.father[person] === table.father[holder],
		)
		for (const person of [holder, ...siblings, ...table.children[holder]]) {
			const unions = weddings
				.filter((row) => row.husband === person || row.wife === person)
				.sort((a, b) => a.time - b.time)
			expect(unions.length).toBeLessThanOrEqual(2)
			if (unions.length === 2) {
				remarriages++
				const priorSpouse =
					unions[0].husband === person ? unions[0].wife : unions[0].husband
				expect(unions[1].time).toBeGreaterThanOrEqual(
					table.death[priorSpouse] + 1,
				)
			}
			for (const child of table.children[person]) {
				if (person === holder) continue
				expect(table.children[child]).toEqual([])
				expect(
					weddings.some((row) => row.husband === child || row.wife === child),
				).toBe(false)
			}
		}
	}
	expect(remarriages).toBeGreaterThan(0)
})
