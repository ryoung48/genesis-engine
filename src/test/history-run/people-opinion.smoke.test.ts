import { expect, it, vi } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { HistoryRecord } from "@/model/history/record/types"
import { DIPLOMACY } from "@/model/history/sim/engine/events/diplomacy"
import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { WAR } from "@/model/history/sim/engine/events/war"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { LIVE_OPINION_CONTEXT } from "@/model/history/sim/engine/opinion-context"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { War } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import { OPINION_MEMORY } from "@/model/history/sim/people/opinion/memory"
import type { OpinionPerson } from "@/model/history/sim/people/opinion/types"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { SharedRng } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"
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

const MEMORY_VALUES = {
	aid: 15,
	abandonment: -20,
	attack: -25,
	usurpation: -40,
	grant: 15,
} as const

function pair() {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	const toward = (observer: number, target: number, time: number) =>
		OPINION.of({ observer, target, time, context: fixture.context })!
	return { fixture, people: fixture.people, toward }
}

it("remembers each reason one way at full, half and no strength, replacing a repeat and summing different reasons", () => {
	for (const reason of OPINION_MEMORY.reasons) {
		const { people, toward } = pair()
		const value = MEMORY_VALUES[reason]
		const base = toward(0, 1, 100).unclamped
		expect(
			OPINION.remember({ people, observer: 0, target: 1, reason, time: 100 }),
		).toBe(true)
		expect(toward(0, 1, 99.99).memories).toBe(0)
		expect(toward(0, 1, 100)).toMatchObject({
			memories: value,
			unclamped: base + value,
			total: base + value,
		})
		expect(toward(0, 1, 105).memories).toBe(value / 2)
		expect(toward(0, 1, 110).memories).toBe(0)
		expect(toward(0, 1, 140).memories).toBe(0)
		expect(toward(1, 0, 100).memories).toBe(0)
	}
	const { people, toward } = pair()
	const remember = (reason: "attack" | "grant", time: number) =>
		OPINION.remember({ people, observer: 0, target: 1, reason, time })
	remember("attack", 100)
	remember("attack", 104)
	expect(people.memories.get(0)?.get(1)).toEqual([
		{ reason: "attack", start: 104 },
	])
	expect(toward(0, 1, 104).memories).toBe(-25)
	remember("grant", 104)
	expect(toward(0, 1, 104).memories).toBe(-10)
	expect(toward(0, 1, 109).memories).toBe(-5)
	expect(people.memoryCounts.refreshes).toEqual([0, 0, 2, 0, 1])
	expect(people.log.count).toBe(3)
})

it("saturates with memories once and remembers nothing for self, unknown, unborn or dead endpoints", () => {
	const { people, toward } = pair()
	const reputation = vi.spyOn(TRAITS, "reputation").mockReturnValue(-90)
	try {
		OPINION.remember({
			people,
			observer: 0,
			target: 1,
			reason: "usurpation",
			time: 100,
		})
		const breakdown = toward(0, 1, 100)
		expect(breakdown.memories).toBe(-40)
		expect(breakdown.unclamped).toBe(40 - 90 - 40)
		expect(breakdown.total).toBe(-90)
		reputation.mockReturnValue(-200)
		expect(toward(0, 1, 100)).toMatchObject({ unclamped: -200, total: -100 })
	} finally {
		reputation.mockRestore()
	}
	const rows = people.log.count
	const attempt = (observer: number, target: number, time: number) =>
		OPINION.remember({ people, observer, target, reason: "aid", time })
	expect(attempt(0, 0, 100)).toBe(false)
	expect(attempt(0, -1, 100)).toBe(false)
	expect(attempt(-1, 0, 100)).toBe(false)
	expect(attempt(0, 9, 100)).toBe(false)
	expect(attempt(1, 0, 60)).toBe(false)
	people.persons.death[1] = 103
	expect(attempt(1, 0, 103)).toBe(false)
	expect(attempt(0, 1, 103)).toBe(false)
	expect(attempt(1, 0, 102.9)).toBe(true)
	expect(people.log.count).toBe(rows + 1)
})

it("prunes faded memories and those of the actually dead without touching the log or a scheduled death", () => {
	const { people, toward } = pair()
	const remember = (observer: number, target: number, time: number) =>
		OPINION.remember({ people, observer, target, reason: "attack", time })
	remember(0, 1, 90)
	remember(1, 0, 95)
	const rows = people.log.count
	people.persons.death[1] = 130
	OPINION.prune({ people, time: 99.99 })
	expect(people.memories.get(0)?.get(1)).toHaveLength(1)
	expect(people.memories.get(1)?.get(0)).toHaveLength(1)
	expect(people.memoryCounts).toMatchObject({
		expired: [0, 0, 0, 0, 0],
		died: [0, 0, 0, 0, 0],
		visited: 2,
	})
	people.persons.death[1] = 99
	OPINION.prune({ people, time: 100 })
	expect(people.memories.size).toBe(0)
	expect(people.memoryCounts).toMatchObject({
		expired: [0, 0, 1, 0, 0],
		died: [0, 0, 1, 0, 0],
		visited: 4,
	})
	expect(people.memoryCounts.pruneMs).toBeGreaterThanOrEqual(0)
	expect(people.log.count).toBe(rows)
	expect(toward(0, 1, 96).memories).toBe(0)
})

it("emits one memory per successful runtime occurrence and none at initialization or for failed, council and self endpoints", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	const rng = HISTORY_RNG.createHistoryRng(5)
	const refreshes = () => [...people.memoryCounts.refreshes]
	const held = (observer: number, target: number) =>
		(people.memories.get(observer)?.get(target) ?? []).map(
			(memory) => memory.reason,
		)
	expect(people.memories.size).toBe(0)
	expect(refreshes()).toEqual([0, 0, 0, 0, 0])
	expect(state.wars.length).toBeGreaterThan(0)
	expect(
		state.people.rulerOf.some(
			(holder, seat) =>
				holder >= 0 && STATE_TITLES.isDistrictSeat({ state, seat }),
		),
	).toBe(true)
	for (const { people: packet } of state.journal)
		for (let index = 0; index < (packet?.count ?? 0); index++)
			expect(packet?.kind[index]).not.toBe(11)

	const rulers = new Set<number>()
	const free: number[] = []
	for (let p = 0; p < state.P; p++) {
		const ruler = people.rulerOf[p]
		if (
			!STATE.isSovereign({ state, p }) ||
			state.desolate[p] ||
			ruler < 0 ||
			rulers.has(ruler) ||
			people.regencies.has(p) ||
			state.provinceWars[p].length > 0 ||
			STATE.getRulerRelation({ state, nation: p })
		)
			continue
		rulers.add(ruler)
		free.push(p)
	}
	expect(free.length).toBeGreaterThanOrEqual(12)
	const [a, b, c, d, e, f, g, h, vassal, overlord, other, usurped] = free
	const ruler = (realm: number) => people.rulerOf[realm]
	const outsider = () => {
		const person = PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex: 0,
			birth: time - 40,
			survives: time,
			father: -1,
			mother: -1,
			dynasty: -1,
			origin: STATE.originOf({ state, realm: a }),
			rng,
		})
		table.death[person] = time + 30
		return person
	}

	expect(
		STATE.startWar({ state, attacker: a, defender: b, rng, goal: "conquest" }),
	).not.toBeNull()
	expect(held(ruler(b), ruler(a))).toEqual(["attack"])
	expect(held(ruler(a), ruler(b))).toEqual([])
	expect(refreshes()).toEqual([0, 0, 1, 0, 0])
	expect(
		STATE.startWar({ state, attacker: b, defender: c, rng, goal: "conquest" }),
	).toBeNull()
	expect(refreshes()).toEqual([0, 0, 1, 0, 0])

	const regent = outsider()
	people.regencies.set(c, {
		ward: ruler(c),
		cause: "minority",
		regent,
		kind: "protector",
	})
	STATE.startWar({
		state,
		attacker: c,
		defender: d,
		rng,
		goal: "independence",
	})
	expect(held(ruler(d), regent)).toEqual(["attack"])
	expect(held(ruler(d), ruler(c))).toEqual([])
	expect(held(regent, ruler(d))).toEqual([])
	expect(refreshes()).toEqual([0, 0, 2, 0, 0])

	people.regencies.set(e, {
		ward: ruler(e),
		cause: "minority",
		regent: -1,
		kind: "council",
	})
	expect(
		STATE.startWar({ state, attacker: e, defender: f, rng, goal: "conquest" }),
	).not.toBeNull()
	people.regencies.set(h, {
		ward: ruler(h),
		cause: "minority",
		regent: ruler(g),
		kind: "relative",
	})
	expect(
		STATE.startWar({ state, attacker: g, defender: h, rng, goal: "conquest" }),
	).not.toBeNull()
	expect(refreshes()).toEqual([0, 0, 2, 0, 0])

	expect(VASSALAGE.bind({ state, vassal, overlord, cause: "seed" })).toBe(true)
	expect(STATE.diplomaticOverlord({ state, nation: vassal })).toBe(overlord)
	STATE.setDisposition({
		state,
		a: vassal,
		b: overlord,
		disposition: STATE.disp.TRUSTED,
	})
	const events = state.heap.size
	const war = { attacker: vassal, defender: other, allies: new Set([overlord]) }
	DISPOSITION.afterWar({ state, war: war as War, outcome: "regime change" })
	expect(refreshes()).toEqual([0, 0, 2, 0, 0])
	DISPOSITION.afterWar({ state, war: war as War, outcome: "peace" })
	expect(held(ruler(vassal), ruler(overlord))).toEqual(["aid"])
	expect(held(ruler(overlord), ruler(vassal))).toEqual([])
	expect(STATE.getDisposition({ state, a: vassal, b: overlord })).toBe(
		"TRUSTED",
	)
	war.allies.clear()
	DISPOSITION.afterWar({ state, war: war as War, outcome: "peace" })
	expect(held(ruler(vassal), ruler(overlord))).toEqual(["aid", "abandonment"])
	expect(STATE.getDisposition({ state, a: vassal, b: overlord })).toBe(
		"FRIENDLY",
	)
	expect(refreshes()).toEqual([1, 1, 2, 0, 0])
	OPINION.prune({ people, time })
	expect(state.heap.size).toBe(events)

	const seats = Array.from(people.rulerOf.keys()).filter(
		(seat) =>
			STATE_TITLES.isDistrictSeat({ state, seat }) &&
			people.rulerOf[seat] >= 0 &&
			free.includes(state.sovereignCurrent[seat]) &&
			![c, e, h].includes(state.sovereignCurrent[seat]),
	)
	expect(seats.length).toBeGreaterThanOrEqual(3)
	const grant = (recordOpinionMemory: boolean, dead: number | null) => {
		const before = Array.from(people.rulerOf)
		DISTRICTS.grant({
			state,
			rng,
			found: dead === null ? null : () => dead,
			randomOf: dead === null ? null : () => ({ ...rng, random: () => 1 }),
			recordOpinionMemory,
		})
		return Array.from(people.rulerOf.keys()).filter(
			(seat) => people.rulerOf[seat] !== before[seat],
		)
	}
	const corpse = outsider()
	table.death[corpse] = time - 1
	PEOPLE.vacate({ people, seat: seats[0], reason: "unknown" })
	expect(grant(true, corpse)).toEqual([])
	expect(
		DISTRICTS.install({
			state,
			seat: seats[0],
			person: corpse,
			reason: "partition",
		}),
	).toBe(false)
	expect(grant(false, null).length).toBeGreaterThanOrEqual(1)
	expect(refreshes()).toEqual([1, 1, 2, 0, 0])
	PEOPLE.vacate({ people, seat: seats[1], reason: "unknown" })
	const granted = grant(true, null).filter((seat) => {
		const grantor = GOVERNOR.of({ state, realm: state.sovereignCurrent[seat] })
		return grantor >= 0 && grantor !== people.rulerOf[seat]
	})
	expect(granted.length).toBeGreaterThanOrEqual(1)
	for (const seat of granted)
		expect(
			held(
				people.rulerOf[seat],
				GOVERNOR.of({ state, realm: state.sovereignCurrent[seat] }),
			),
		).toEqual(["grant"])
	expect(refreshes()).toEqual([1, 1, 2, 0, granted.length])
	DISTRICTS.succeed({ state, seat: seats[2], rng })
	const partitioned = outsider()
	PEOPLE.vacate({ people, seat: seats[2], reason: "unknown" })
	expect(
		DISTRICTS.install({
			state,
			seat: seats[2],
			person: partitioned,
			reason: "partition",
		}),
	).toBe(true)
	expect(refreshes()).toEqual([1, 1, 2, 0, granted.length])

	const usurper = outsider()
	const ward = ruler(usurped)
	people.regencies.set(usurped, {
		ward,
		cause: "minority",
		regent: usurper,
		kind: "relative",
	})
	const ambition = vi
		.spyOn(GOVERNOR, "has")
		.mockImplementation(({ trait }) => trait === "ambitious")
	const roll = vi.spyOn(rng, "random").mockReturnValue(0.999999)
	try {
		SUCCESSION.runYear({ state, rng })
		expect(refreshes()[3]).toBe(0)
		expect(ruler(usurped)).toBe(ward)
		roll.mockReturnValue(0)
		const notes = state.events.length
		SUCCESSION.runYear({ state, rng })
		expect(ruler(usurped)).toBe(usurper)
		expect(held(ward, usurper)).toEqual(["usurpation"])
		expect(held(usurper, ward)).toEqual([])
		expect(refreshes()[3]).toBe(
			state.events.slice(notes).filter((note) => note.tag === "usurpation")
				.length,
		)
	} finally {
		ambition.mockRestore()
		roll.mockRestore()
	}
	expect(Array.from(people.memories.get(ruler(b))?.keys() ?? [])).toEqual([
		ruler(a),
	])
}, 120_000)

function breakdownOf(unclamped: number, religion: number) {
	return {
		personality: 0,
		culture: 0,
		religion,
		reputation: unclamped - religion,
		kin: 0,
		spouse: 0,
		memories: 0,
		unclamped,
		total: Math.max(-100, Math.min(100, unclamped)),
	}
}

it("takes religion out of the unclamped opinion before clamping loyalty and gives nothing for an unavailable opinion", () => {
	expect(OPINION.loyaltyOf({ breakdown: null })).toBe(0)
	for (const [unclamped, religion, expected] of [
		[65, 15, 50],
		[-35, 15, -50],
		[130, 15, 100],
		[110, 15, 95],
		[-90, 15, -100],
		[-200, 0, -100],
		[40, 0, 40],
	])
		expect(
			OPINION.loyaltyOf({ breakdown: breakdownOf(unclamped, religion) }),
		).toBe(expected)
	expect(
		[-100, -50.01, -50, -0.01, 0, 49.99, 50, 100].map(OPINION.band),
	).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
})

it("averages each living holder's loyalty once, whatever their religion, and reports no holders as empty", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1, 0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	const { people, context } = fixture
	const second = context.personOf(2) as OpinionPerson
	second.culture = 1
	fixture.persons.set(2, second)
	const third = context.personOf(3) as OpinionPerson
	third.religion = 5
	fixture.persons.set(3, third)
	const popularity = (ruler: number, holders: number[]) =>
		OPINION.popularity({ ruler, holders, time: 100, context })
	expect(popularity(0, [1, 2, 2, 3, 0, 99, -1])).toEqual({
		value: (25 + 20 + 25) / 3,
		count: 3,
		bands: [0, 0, 3, 0],
	})
	OPINION.remember({
		people,
		observer: 3,
		target: 0,
		reason: "attack",
		time: 100,
	})
	expect(popularity(0, [3, 1, 3, 2])).toEqual({
		value: 15,
		count: 3,
		bands: [0, 0, 3, 0],
	})
	const empty = { value: 0, count: 0, bands: [0, 0, 0, 0] }
	expect(popularity(0, [])).toEqual(empty)
	expect(popularity(0, [0])).toEqual(empty)
	expect(popularity(-1, [1, 2])).toEqual(empty)
	const reputation = vi.spyOn(TRAITS, "reputation")
	try {
		for (const amount of [200, -200]) {
			reputation.mockReturnValue(amount)
			const holders = [1, 2, 3]
			const loyalties = holders.map((observer) =>
				OPINION.loyaltyOf({
					breakdown: OPINION.of({ observer, target: 0, time: 100, context }),
				}),
			)
			expect(loyalties).toEqual(holders.map(() => (amount > 0 ? 100 : -100)))
			expect(popularity(0, holders)).toEqual({
				value: amount > 0 ? 100 : -100,
				count: 3,
				bands: amount > 0 ? [0, 0, 0, 3] : [3, 0, 0, 0],
			})
		}
	} finally {
		reputation.mockRestore()
	}
})

it("adds each district holder's opinion of the actual ruler to rebellion laxity once, beside the existing terms", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = state.people
	const subjects = Array.from(people.rulerOf.keys()).filter((seat) => {
		const overlord = state.sovereignCurrent[seat]
		return (
			people.rulerOf[seat] >= 0 &&
			STATE_TITLES.isDistrictSeat({ state, seat }) &&
			people.rulerOf[overlord] >= 0 &&
			!people.regencies.has(overlord) &&
			state.provinceWars[overlord].length === 0
		)
	})
	const subject = subjects[0]
	const overlord = state.sovereignCurrent[subject]
	const sibling = subjects.find(
		(seat) => seat !== subject && state.sovereignCurrent[seat] === overlord,
	)
	if (sibling === undefined) throw new Error("Missing second district")
	const ruler = people.rulerOf[overlord]
	const rng = HISTORY_RNG.createHistoryRng(3)
	vi.spyOn(rng, "random").mockReturnValue(1)
	const evaluate = (seat: number, laxity: number) => {
		const before = state.events.length
		expect(
			WAR.rebel({
				state,
				overlord,
				subject: seat,
				laxity,
				succession: false,
				rng,
			}),
		).toBe(false)
		const note = state.events
			.slice(before)
			.find((entry) => entry.tag === "rebellion evaluated")
		if (!note) throw new Error("Missing evaluation")
		return note.data
	}
	const existing = (seat: number) =>
		GOVERNOR.factor({
			attribute: "diplomacy",
			value: GOVERNOR.attribute({
				state,
				realm: overlord,
				attribute: "diplomacy",
			}),
		}) +
		(GOVERNOR.personHas({
			state,
			person: people.rulerOf[seat],
			trait: "ambitious",
		})
			? 0.02
			: GOVERNOR.personHas({
						state,
						person: people.rulerOf[seat],
						trait: "content",
					})
				? -0.02
				: 0)
	const opinion = vi.spyOn(OPINION, "of")
	try {
		opinion.mockReturnValue(null)
		const none = evaluate(subject, 0)
		expect(none.laxity).toBe(existing(subject))
		expect(none.holderOpinion).toBeUndefined()
		expect(opinion).toHaveBeenCalledTimes(1)
		expect(opinion.mock.calls[0][0]).toMatchObject({
			observer: people.rulerOf[subject],
			target: ruler,
			time: state.time / STATE.yearMs,
		})
		for (const [unclamped, religion, loyalty, term] of [
			[65, 15, 50, -0.1],
			[-35, 15, -50, 0.1],
			[130, 15, 100, -0.2],
			[110, 15, 95, -0.19],
			[-300, 15, -100, 0.2],
		]) {
			opinion.mockReturnValue(breakdownOf(unclamped, religion))
			const data = evaluate(subject, 0)
			expect(data.holderOpinion).toBe(loyalty)
			expect(data.laxity).toBeCloseTo(existing(subject) + term, 12)
			expect(data.threshold).toBeCloseTo(0.45 - (data.laxity as number), 12)
		}
		opinion.mockReturnValue(breakdownOf(65, 15))
		expect(evaluate(subject, 0.1).laxity).toBeCloseTo(existing(subject), 12)
		opinion.mockClear()
		expect(evaluate(sibling, 0).laxity).toBeCloseTo(existing(sibling) - 0.1, 12)
		expect(opinion.mock.calls[0][0]).toMatchObject({
			observer: people.rulerOf[sibling],
			target: ruler,
		})
		people.regencies.set(overlord, {
			ward: ruler,
			cause: "minority",
			regent: people.rulerOf[sibling],
			kind: "protector",
		})
		opinion.mockClear()
		expect(evaluate(subject, 0).laxity).toBeCloseTo(existing(subject) - 0.1, 12)
		expect(opinion.mock.calls[0][0]).toMatchObject({
			observer: people.rulerOf[subject],
			target: ruler,
		})
		expect(opinion).toHaveBeenCalledTimes(1)
	} finally {
		opinion.mockRestore()
	}
	expect(state.opinionPolitics.loyaltyEvaluations).toBe(9)
	expect(state.opinionPolitics.loyaltyMs).toBeGreaterThanOrEqual(0)
}, 120_000)

const LADDER = [
	"RIVAL",
	"SUSPICIOUS",
	"NEUTRAL",
	"FRIENDLY",
	"TRUSTED",
] as const
const MATRIX = {
	RIVAL: [0.65, 0.25, 0.08, 0.02, 0],
	SUSPICIOUS: [0.18, 0.5, 0.22, 0.05, 0.05],
	NEUTRAL: [0.05, 0.18, 0.5, 0.15, 0.12],
	FRIENDLY: [0.02, 0.1, 0.2, 0.45, 0.23],
	TRUSTED: [0.01, 0.04, 0.1, 0.2, 0.65],
}

it("leaves an unbiased drift row and its choices untouched and tilts a biased row within its bounds", () => {
	for (const [index, current] of LADDER.entries()) {
		const row = MATRIX[current]
		expect(DISPOSITION.weights({ current, bias: 0 })).toBe(
			DISPOSITION.weights({ current, bias: 0 }),
		)
		expect(DISPOSITION.weights({ current, bias: 0 })).toEqual(row)
		const draws = [0, 0.999999, 1]
		let cumulative = 0
		for (const weight of row) {
			cumulative += weight
			draws.push(cumulative - 1e-12, cumulative, cumulative + 1e-12)
		}
		for (const draw of draws) {
			let choice = draw
			let expected: string = "TRUSTED"
			for (let step = 0; step < 5; step++) {
				choice -= row[step]
				if (choice <= 0) {
					expected = LADDER[step]
					break
				}
			}
			expect(
				DISPOSITION.roll({
					current,
					rng: { random: () => draw } as SharedRng,
					bias: 0,
				}),
			).toBe(expected)
		}
		for (const bias of [1, -1, 0.3, -0.125]) {
			const tilted = DISPOSITION.weights({ current, bias })
			expect(tilted.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12)
			for (let step = 0; step < 5; step++) {
				const multiplier = 1 + (0.5 * bias * (step - index)) / 4
				expect(multiplier).toBeGreaterThanOrEqual(0.5)
				expect(multiplier).toBeLessThanOrEqual(1.5)
				if (row[step] === 0) expect(tilted[step]).toBe(0)
				else
					expect(
						tilted[step] / row[step] / (tilted[index] / row[index]),
					).toBeCloseTo(multiplier, 12)
			}
		}
	}
	const attacked = DISPOSITION.weights({ current: "NEUTRAL", bias: -0.125 })
	const scale = attacked[2] / MATRIX.NEUTRAL[2]
	expect(attacked[3] / MATRIX.NEUTRAL[3] / scale).toBeCloseTo(0.984375, 12)
	expect(attacked[1] / MATRIX.NEUTRAL[1] / scale).toBeCloseTo(1.015625, 12)
	expect(DISPOSITION.weights({ current: "RIVAL", bias: 1 })[4]).toBe(0)
	expect(
		DISPOSITION.roll({
			current: "NEUTRAL",
			rng: { random: () => 0.74 } as SharedRng,
			bias: 0,
		}),
	).toBe("FRIENDLY")
	expect(
		DISPOSITION.roll({
			current: "NEUTRAL",
			rng: { random: () => 0.74 } as SharedRng,
			bias: -1,
		}),
	).toBe("NEUTRAL")
})

it("biases drift by the two current governors' mean opinion with one draw, keeping the bound and the war skip", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = state.people
	const time = state.time / STATE.yearMs
	const rulers = new Set<number>()
	const free: number[] = []
	for (let p = 0; p < state.P; p++) {
		const ruler = people.rulerOf[p]
		if (
			!STATE.isSovereign({ state, p }) ||
			state.desolate[p] ||
			ruler < 0 ||
			rulers.has(ruler) ||
			people.regencies.has(p) ||
			people.persons.death[ruler] <= time + 1
		)
			continue
		rulers.add(ruler)
		free.push(p)
	}
	const [a, b, c] = free
	const first = people.rulerOf[a]
	const second = people.rulerOf[b]
	const third = people.rulerOf[c]
	const bias = () => DISPOSITION.bias({ state, a, b })
	const opinion = vi.spyOn(OPINION, "of")
	try {
		opinion.mockImplementation(({ observer }) =>
			breakdownOf(observer === first ? 40 : -20, 0),
		)
		expect(bias()).toBeCloseTo(0.1, 12)
		expect(
			opinion.mock.calls.map(([call]) => [call.observer, call.target]),
		).toEqual([
			[first, second],
			[second, first],
		])
		opinion.mockImplementation(({ observer }) =>
			observer === first ? breakdownOf(40, 0) : null,
		)
		expect(bias()).toBe(0)
		opinion.mockImplementation(() => breakdownOf(300, 0))
		expect(bias()).toBe(1)
		people.regencies.set(a, {
			ward: first,
			cause: "minority",
			regent: -1,
			kind: "council",
		})
		opinion.mockClear()
		expect(bias()).toBe(0)
		people.regencies.set(a, {
			ward: first,
			cause: "minority",
			regent: second,
			kind: "relative",
		})
		expect(bias()).toBe(0)
		expect(opinion).not.toHaveBeenCalled()
		people.regencies.set(a, {
			ward: first,
			cause: "minority",
			regent: third,
			kind: "relative",
		})
		expect(bias()).toBe(1)
		expect(opinion.mock.calls[0][0]).toMatchObject({
			observer: third,
			target: second,
			time,
		})
		people.regencies.delete(a)
	} finally {
		opinion.mockRestore()
	}

	const context = () => LIVE_OPINION_CONTEXT.of({ state, time })
	const mean = (x: number, y: number) =>
		((OPINION.of({ observer: x, target: y, time, context: context() })?.total ??
			0) +
			(OPINION.of({ observer: y, target: x, time, context: context() })
				?.total ?? 0)) /
		200
	const before = bias()
	expect(before).toBe(mean(first, second))
	OPINION.remember({
		people,
		observer: second,
		target: first,
		reason: "attack",
		time,
	})
	expect(bias()).toBeCloseTo(before - 0.125, 12)
	people.regencies.set(a, {
		ward: first,
		cause: "minority",
		regent: third,
		kind: "relative",
	})
	expect(bias()).toBe(mean(third, second))
	people.regencies.delete(a)

	const rng = HISTORY_RNG.createHistoryRng(11)
	const draw = vi.spyOn(rng, "random")
	const totals = state.opinionPolitics
	const calls = totals.driftCalls
	STATE.setDisposition({ state, a, b, disposition: "FRIENDLY" })
	draw.mockReturnValue(0)
	DISPOSITION.drift({ state, a, b, rng, bound: true })
	expect(STATE.getDisposition({ state, a, b })).toBe("FRIENDLY")
	expect(draw).toHaveBeenCalledTimes(1)
	DISPOSITION.drift({ state, a, b, rng, bound: false })
	expect(STATE.getDisposition({ state, a, b })).toBe("RIVAL")
	expect(draw).toHaveBeenCalledTimes(2)
	const biased = bias() === 0 ? 0 : 2
	expect(totals.driftCalls).toBe(calls + 2)
	expect(totals.driftBiased).toBe(biased)
	expect(totals.driftBands.reduce((sum, count) => sum + count, 0)).toBe(2)
	expect(totals.driftBias).toBeCloseTo(2 * bias(), 12)
	expect(Math.sign(totals.driftTiltedStep - totals.driftOriginalStep)).toBe(
		Math.sign(bias()),
	)
	people.regencies.set(a, {
		ward: first,
		cause: "minority",
		regent: -1,
		kind: "council",
	})
	const steps = [totals.driftOriginalStep, totals.driftTiltedStep]
	DISPOSITION.drift({ state, a, b, rng, bound: false })
	expect(totals.driftBiased).toBe(biased)
	expect(totals.driftBands[2]).toBe(3 - biased)
	expect(totals.driftTiltedStep - steps[1]).toBeCloseTo(
		totals.driftOriginalStep - steps[0],
		12,
	)
	draw.mockRestore()

	const war = state.wars.find(
		(entry) =>
			entry.endTime === undefined &&
			STATE.isSovereign({ state, p: entry.attacker }) &&
			STATE.isSovereign({ state, p: entry.defender }),
	)
	if (!war) throw new Error("Missing active war")
	const drift = vi.spyOn(DISPOSITION, "drift")
	try {
		DIPLOMACY.runDiplomacy({ state, nation: war.attacker, rng })
		expect(
			drift.mock.calls.some(
				([call]) => call.a === war.attacker && call.b === war.defender,
			),
		).toBe(false)
		for (const [call] of drift.mock.calls)
			expect(
				STATE.getRelation({ state, a: call.a, b: call.b }) === STATE.rel.WAR,
			).toBe(false)
	} finally {
		drift.mockRestore()
	}
}, 120_000)
