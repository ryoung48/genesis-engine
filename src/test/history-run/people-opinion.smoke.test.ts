import { expect, it, vi } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { HistoryRecord } from "@/model/history/record/types"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import type { OpinionPerson } from "@/model/history/sim/people/opinion/types"
import { TRAITS } from "@/model/history/sim/people/traits"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"

it("scores active shared and opposed personality, including both triple groups", () => {
	const character = {
		bases: 0,
		grades: 3 | (3 << 7) | (3 << 14),
		congenital: 0,
		carried: 0,
		personality: 0 | (30 << 6) | (33 << 12),
	}
	const opposite = { ...character, personality: 1 | (32 << 6) | (35 << 12) }
	expect(
		TRAITS.compatibility({
			first: { character, age: 13 },
			second: { character, age: 13 },
		}),
	).toBe(15)
	expect(
		TRAITS.compatibility({
			first: { character, age: 13 },
			second: { character: opposite, age: 13 },
		}),
	).toBe(-15)
	expect(
		TRAITS.compatibility({
			first: { character, age: 8 },
			second: { character, age: 13 },
		}),
	).toBe(0)
})

it("uses non-stacking known cultural affinity, current religion and directed seat reputation", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	const a = fixture.context.personOf(0) as OpinionPerson
	const b = fixture.context.personOf(1) as OpinionPerson
	fixture.persons.set(0, a)
	fixture.persons.set(1, b)
	b.character = {
		...b.character,
		personality: 7 | (32 << 6) | (16 << 12),
		congenital: (1 << 3) | (1 << 11) | (1 << 13),
	}
	const query = () =>
		OPINION.of({ observer: 0, target: 1, time: 100, context: fixture.context })!
	expect(query()).toMatchObject({
		culture: 10,
		religion: 15,
		reputation: -20,
		kin: 0,
		spouse: 0,
		memories: 0,
	})
	b.sovereignSeats = [3, 4]
	a.districtSovereigns = [2, 4, 4]
	expect(query().reputation).toBe(-45)
	expect(
		OPINION.of({ observer: 1, target: 0, time: 100, context: fixture.context })
			?.reputation,
	).toBe(0)
	b.culture = 1
	expect(query().culture).toBe(5)
	b.heritage = 1
	expect(query().culture).toBe(0)
	b.culture = 0
	b.heritage = -1
	expect(query().culture).toBe(10)
	a.culture = -1
	b.culture = -1
	a.religion = -1
	b.religion = -1
	expect(query()).toMatchObject({ culture: 0, religion: 0 })
	b.character.carried = 0x7fff
	b.character.congenital = 0
	expect(query().reputation).toBe(-15)
})

it("adds close kin and completed marriage once, ends spouse affinity at either death and handles unavailable people", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	const table = fixture.people.persons
	table.father[1] = 0
	table.spouse[0] = 1
	table.spouse[1] = 0
	table.marriedAt[0] = 100
	const query = (time: number) =>
		OPINION.of({ observer: 0, target: 1, time, context: fixture.context })!
	expect(query(99).spouse).toBe(0)
	expect(query(100)).toMatchObject({ spouse: 10, kin: 10 })
	table.death[1] = 101
	expect(query(101)).toMatchObject({ spouse: 0, kin: 10 })
	expect(
		OPINION.of({ observer: 0, target: 8, time: 100, context: fixture.context }),
	).toBeNull()
	expect(
		OPINION.of({ observer: 0, target: 0, time: 100, context: fixture.context }),
	).toBeNull()
})

it("blocks ancestry shared within four generations, unknown parents stay distinct, and cycles terminate", () => {
	const father = [-1, -1, 0, 0, 2, 3, 4, 6, 7, 8, 9, 5]
	const mother = father.map(() => -1)
	const context = { father, mother }
	for (const [a, b] of [
		[0, 0],
		[0, 2],
		[2, 3],
		[3, 4],
		[4, 5],
		[2, 8],
	])
		expect(KINSHIP.prohibitedMatch({ context, a, b, cache: new Map() })).toBe(
			true,
		)
	for (const [a, b] of [
		[2, 9],
		[10, 11],
	])
		expect(KINSHIP.prohibitedMatch({ context, a, b, cache: new Map() })).toBe(
			false,
		)
	expect(KINSHIP.prohibitedMatch({ context, a: 0, b: 1, cache: null })).toBe(
		false,
	)
	expect(KINSHIP.closeKin({ context, a: 2, b: 3 })).toBe(true)
	expect(KINSHIP.closeKin({ context, a: 0, b: 1 })).toBe(false)
	father[0] = 10
	expect(
		KINSHIP.prohibitedMatch({ context, a: 10, b: 11, cache: new Map() }),
	).toBe(true)
})

it("preserves runtime creation availability through packets and historical opinion queries", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	fixture.people.persons.createdAt[1] = 100
	const packet = PEOPLE_LOG.seal({
		people: fixture.people,
		sovereign: () => true,
	})
	const people = PEOPLE_RECORD.create()
	PEOPLE_RECORD.append({
		record: people,
		packet,
		timeMs: 1100,
		recordTime: (year) => year * 10 + 100,
	})
	const record = {
		people,
		heritageOfCulture: new Int32Array([7]),
		minTimeMs: 1100,
		maxTimeMs: 1200,
		origin: "procedural",
		events: { provinceEvents: new Map(), nationEvents: [] },
	} as unknown as HistoryRecord
	expect(PERSON_QUERY.view({ people, id: 1, timeMs: 1099 })).toBeNull()
	expect(
		PERSON_QUERY.opinion({ people, record, a: 0, b: 1, timeMs: 1099 }),
	).toBeNull()
	expect(
		PERSON_QUERY.opinion({ people, record, a: 0, b: 1, timeMs: 1100 }),
	).toMatchObject({ culture: 10, religion: 0 })
})

it("resolves historical direct roles, residence religion, holder changes, weddings and deaths at their exact boundaries", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1, 0] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 1 })
	const table = fixture.people.persons
	table.congenital[1] = (1 << 3) | (1 << 11)
	table.congenital[2] = 1 << 3
	PEOPLE.setRuler({
		people: fixture.people,
		person: 0,
		seat: 1,
		rank: 1,
		reason: "unknown",
	})
	PEOPLE.setRuler({
		people: fixture.people,
		person: 1,
		seat: 0,
		rank: 2,
		reason: "unknown",
	})
	PEOPLE.setRuler({
		people: fixture.people,
		person: 2,
		seat: 2,
		rank: 2,
		reason: "unknown",
	})
	const people = PEOPLE_RECORD.create()
	const record = {
		people,
		heritageOfCulture: new Int32Array([7]),
		minTimeMs: 100 * STATE.yearMs,
		maxTimeMs: 110 * STATE.yearMs,
		origin: "procedural",
		events: {
			provinceEvents: new Map([
				[
					0,
					{
						base: { ownerId: 0, parentId: -1, religionId: 0 },
						events: [
							{
								kind: "religion",
								timeMs: 102.5 * STATE.yearMs,
								payload: { religionId: 1 },
							},
						],
					},
				],
				[
					1,
					{
						base: { ownerId: 0, parentId: 0, religionId: 0 },
						events: [
							{
								kind: "parent",
								timeMs: 101 * STATE.yearMs,
								payload: { parentId: 2 },
							},
						],
					},
				],
				[2, { base: { ownerId: 2, parentId: -1, religionId: 1 }, events: [] }],
			]),
			nationEvents: [
				{ base: { capitalProvinceId: 0 } },
				undefined,
				{ base: { capitalProvinceId: 2 } },
			],
		},
	} as unknown as HistoryRecord
	const flush = (time: number) =>
		PEOPLE_RECORD.append({
			record: people,
			packet: PEOPLE_LOG.seal({
				people: fixture.people,
				sovereign: (seat) => seat !== 1,
			}),
			timeMs: time * STATE.yearMs,
			recordTime: (year) => year * STATE.yearMs,
		})
	flush(100)
	const query = (timeMs: number) =>
		PERSON_QUERY.opinion({ people, record, a: 0, b: 1, timeMs })!
	const a = fixture.context.personOf(0) as OpinionPerson
	const b = fixture.context.personOf(1) as OpinionPerson
	a.districtSovereigns = [0]
	b.sovereignSeats = [0]
	fixture.persons.set(0, a)
	fixture.persons.set(1, b)
	expect(query(100 * STATE.yearMs)).toEqual(
		OPINION.of({ observer: 0, target: 1, time: 100, context: fixture.context }),
	)
	expect(query(101 * STATE.yearMs - 1).reputation).toBe(-20)
	expect(query(101 * STATE.yearMs)).toMatchObject({
		reputation: -10,
		religion: 0,
		culture: 10,
	})
	HOUSEHOLD.relocate({
		people: fixture.people,
		person: 0,
		province: 0,
		time: 101.5,
	})
	flush(101.5)
	expect(query(101.5 * STATE.yearMs - 1).religion).toBe(0)
	expect(query(101.5 * STATE.yearMs)).toMatchObject({
		religion: 15,
		culture: 10,
	})
	const towardThird = (at: number) =>
		PERSON_QUERY.opinion({ people, record, a: 0, b: 2, timeMs: at })!
	expect(towardThird(102.5 * STATE.yearMs - 1).religion).toBe(0)
	expect(towardThird(102.5 * STATE.yearMs)).toMatchObject({
		religion: 15,
		reputation: -10,
		culture: 10,
	})
	PEOPLE_LOG.append({
		log: fixture.people.log,
		row: { kind: "wedding", husband: 0, wife: 1, time: 102 },
	})
	flush(102)
	expect(query(102 * STATE.yearMs - 1).spouse).toBe(0)
	expect(query(102 * STATE.yearMs).spouse).toBe(10)
	PEOPLE_LOG.append({
		log: fixture.people.log,
		row: { kind: "death", person: 1, time: 103, cause: "natural" },
	})
	flush(103)
	expect(query(103 * STATE.yearMs - 1).spouse).toBe(10)
	expect(query(103 * STATE.yearMs)).toMatchObject({
		spouse: 0,
		reputation: -10,
		culture: 10,
	})
	PEOPLE.vacate({ people: fixture.people, seat: 2, reason: "unknown" })
	flush(104)
	expect(towardThird(104 * STATE.yearMs - 1).reputation).toBe(-10)
	expect(towardThird(104 * STATE.yearMs)).toMatchObject({
		reputation: 0,
		culture: 10,
		religion: 15,
	})

	expect(
		PERSON_QUERY.opinion({
			people,
			record,
			a: 1,
			b: 0,
			timeMs: 103 * STATE.yearMs,
		}),
	).not.toBeNull()
})

it("preserves the unclamped explanation when directed opinion saturates either bound", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	const reputation = vi.spyOn(TRAITS, "reputation")
	try {
		for (const amount of [1000, -1000]) {
			reputation.mockReturnValue(amount)
			expect(
				OPINION.of({
					observer: 0,
					target: 1,
					time: 100,
					context: fixture.context,
				}),
			).toMatchObject({
				reputation: amount,
				unclamped: 40 + amount,
				total: amount > 0 ? 100 : -100,
			})
		}
	} finally {
		reputation.mockRestore()
	}
})
