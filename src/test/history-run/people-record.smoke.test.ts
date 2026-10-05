import { expect, it } from "vitest"
import { DATE } from "@/model/history/earth/date"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { HistoryRecord } from "@/model/history/record/types"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import { SIM_RECORD } from "@/model/history/sim/record"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { BACKFILL_FIXTURE } from "@/test/history-run/fixtures/backfill"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"

it("folds initial known and unknown tenures before redundant installs and later replacements", () => {
	const { people, house } = BACKFILL_FIXTURE.create({
		seed: 1,
		genderSystem: 0,
		age: 40,
		sovereign: true,
	})
	if (!house.predecessor) throw new Error("Missing predecessor")
	const person = house.holder.person
	people.log.initialTenures.push(
		{
			person: house.predecessor.person,
			seat: 0,
			kind: "ruler",
			start: null,
			end: house.accession,
			startReason: "unknown",
			endReason: "succession",
		},
		{
			person,
			seat: 0,
			kind: "ruler",
			start: house.accession,
			end: Infinity,
			startReason: "succession",
			endReason: null,
		},
	)
	PEOPLE.setRuler({ people, person, seat: 0, rank: 2, reason: "unknown" })
	const record = PEOPLE_RECORD.create()
	PEOPLE_RECORD.append({
		record,
		packet: structuredClone(PEOPLE_LOG.seal({ people, sovereign: () => true })),
		timeMs: 100,
		recordTime: (time) => time,
	})
	expect(record.tenures).toHaveLength(2)
	expect(record.tenuresOf.get(person)).toHaveLength(1)
	expect(record.tenuresOfSeat.get(0)).toHaveLength(2)
	expect(record.tenures[1].startTimeMs).toBe(house.accession)
	expect(record.tenures[1].startReason).toBe("succession")
	expect(
		PERSON_QUERY.holder({
			people: record,
			seat: 0,
			timeMs: house.accession - 0.1,
		}),
	).toBe(-1)
	expect(
		PERSON_QUERY.holder({ people: record, seat: 0, timeMs: house.accession }),
	).toBe(person)
	const predecessor = PERSON_QUERY.view({
		people: record,
		id: house.predecessor.person,
		timeMs: 100,
	})
	expect(predecessor?.tenures[0].startTimeMs).toBeNull()
	expect(
		PERSON_QUERY.timeline({
			people: record,
			id: house.predecessor.person,
			timeMs: 100,
		}).filter((event) => event.kind === "took seat"),
	).toHaveLength(0)
	people.household.time = () => 101
	const successor = PEOPLE.spawn({
		recordHealth: true,
		people,
		sex: 0,
		birth: 70,
		survives: 101,
		father: -1,
		mother: -1,
		dynasty: -1,
		death: null,
		nameSeed: null,
		origin: house.holder.origin,
		rng: HISTORY_RNG.createHistoryRng(31),
	})
	PEOPLE.setRuler({
		people,
		person: successor,
		seat: 0,
		rank: 2,
		reason: "succession",
	})
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: () => true }),
		timeMs: 101,
		recordTime: (time) => time,
	})
	expect(record.tenures).toHaveLength(3)
	expect(record.tenures[1].endTimeMs).toBe(101)
	expect(PERSON_QUERY.holder({ people: record, seat: 0, timeMs: 101 })).toBe(
		successor,
	)
})

// Checked after each yearly pass. Both columns agree, no betrothed person has a living spouse, every pair was
// made between 12+ parties within the age gap with one under 16, is wed within
// a yearly pass of coming of age, and stands on a marriage alliance.
function expectBetrothals(engine: HistoryState): void {
	const people = engine.people
	const table = people.persons
	const time = engine.time / STATE.yearMs
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner < 0) continue
		expect(table.betrothed[partner]).toBe(person)
		expect(table.betrothedAt[partner]).toBe(table.betrothedAt[person])
		if (table.death[person] <= time || table.death[partner] <= time) continue
		const spouse = table.spouse[person]
		expect(spouse < 0 || table.death[spouse] <= time).toBe(true)
		const made = table.betrothedAt[person]
		const ages = [made - table.birth[person], made - table.birth[partner]]
		expect(Math.min(...ages)).toBeGreaterThanOrEqual(BETROTHAL.minAge)
		expect(Math.min(...ages)).toBeLessThan(BETROTHAL.adultAge)
		expect(Math.abs(ages[0] - ages[1])).toBeLessThanOrEqual(BETROTHAL.maxAgeGap)
		expect(
			Math.min(time - table.birth[person], time - table.birth[partner]),
		).toBeLessThan(BETROTHAL.adultAge + 1)
		const realmA = HOUSEHOLD.realmOf({ people, person: person })
		const realmB = HOUSEHOLD.realmOf({ people, person: partner })
		expect(STATE.getRelation({ state: engine, a: realmA, b: realmB })).not.toBe(
			STATE.rel.WAR,
		)
		expect(
			people.marriageAlliances.has(
				Math.min(realmA, realmB) * engine.P + Math.max(realmA, realmB),
			),
		).toBe(true)
	}
	for (const { first, second } of people.marriageAlliances.values()) {
		const rulerA = people.rulerOf[first]
		const rulerB = people.rulerOf[second]
		expect(
			rulerA >= 0 &&
				rulerB >= 0 &&
				PEOPLE.tiedByMarriage({ people, a: rulerA, b: rulerB, time }),
		).toBe(true)
	}
}

it("records rulers, their families and seat tenures consistently", () => {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = engine.time
	expectBetrothals(engine)
	expect(
		engine.people.alive.some(
			(person) => engine.people.persons.betrothed[person] >= 0,
		),
	).toBe(true)
	const runPeopleYear = PEOPLE_EVENTS.runYear
	let passes = 0
	PEOPLE_EVENTS.runYear = (params) => {
		runPeopleYear(params)
		expectBetrothals(params.state)
		passes++
	}
	for (let year = 1; year <= 30; year++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: start + STATE.deltaYear(year),
			rng,
			validate: false,
		})
		for (let seat = 0; seat < engine.P; seat++) {
			const ruler = engine.people.rulerOf[seat]
			if (ruler < 0 || !STATE.isSovereign({ state: engine, p: seat })) continue
			expect(
				PEOPLE.aliveAt({
					people: engine.people,
					person: ruler,
					time: engine.time / STATE.yearMs,
				}),
			).toBe(true)
		}
	}
	PEOPLE_EVENTS.runYear = runPeopleYear
	expect(passes).toBe(30)
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const people = state.record.people
	expect(people).not.toBeNull()
	if (!people) return

	for (const log of state.record.events.nationEvents)
		for (const event of log?.events ?? []) {
			if (event.kind !== "rulerChange") continue
			expect(
				PEOPLE_RECORD.has({ people, id: event.payload.person as number }),
			).toBe(true)
		}

	for (const tenures of [
		...people.tenuresOfSeat.values(),
		...people.regentsOfSeat.values(),
	])
		for (let i = 1; i < tenures.length; i++) {
			const previous = people.tenures[tenures[i - 1]]
			const next = people.tenures[tenures[i]]
			expect(previous.endTimeMs).toBeLessThanOrEqual(next.startTimeMs)
		}

	for (const marriage of people.marriages) {
		expect(PEOPLE_RECORD.has({ people, id: marriage.husband })).toBe(true)
		expect(PEOPLE_RECORD.has({ people, id: marriage.wife })).toBe(true)
	}

	const rootOf = new Map<number, number>()
	for (const [root, nationId] of translator.identityByRoot)
		rootOf.set(nationId, root)
	const activeMarriages = new Map<string, [number, number]>()
	for (const event of state.record.events.diplomacy) {
		if (!event.kind.startsWith("royalMarriage")) continue
		const key = `${Math.min(event.firstId, event.secondId)}:${Math.max(event.firstId, event.secondId)}`
		if (event.kind === "royalMarriageStart")
			activeMarriages.set(key, [event.firstId, event.secondId])
		else activeMarriages.delete(key)
	}
	for (const [first, second] of activeMarriages.values()) {
		const rulerA = engine.people.rulerOf[rootOf.get(first) ?? -1] ?? -1
		const rulerB = engine.people.rulerOf[rootOf.get(second) ?? -1] ?? -1
		expect(
			rulerA >= 0 &&
				rulerB >= 0 &&
				PEOPLE.tiedByMarriage({
					people: engine.people,
					a: rulerA,
					b: rulerB,
					time: engine.time / STATE.yearMs,
				}),
		).toBe(true)
	}

	const years = engine.time / STATE.yearMs
	const table = engine.people.persons
	for (let seat = 0; seat < engine.P; seat++) {
		const holder = engine.people.rulerOf[seat]
		if (holder < 0 || STATE.isSovereign({ state: engine, p: seat })) continue
		if (!table.heldSeats[holder].includes(seat)) continue
		// An absorbed realm's ruler, possibly a child, keeps the seat as a district.
		const granted = (people.tenuresOf.get(holder) ?? []).some(
			(index) =>
				people.tenures[index].seat === seat &&
				people.tenures[index].kind === "district",
		)
		if (!granted) continue
		expect(years - table.birth[holder]).toBeGreaterThanOrEqual(16)
	}
	for (const [realm, regency] of engine.people.regencies)
		if (regency.regent >= 0) {
			expect(PEOPLE_RECORD.has({ people, id: regency.regent })).toBe(true)
			expect(years - table.birth[regency.regent]).toBeGreaterThanOrEqual(16)
			if (engine.people.rulerOf[realm] === regency.ward)
				expect(table.death[regency.regent]).toBeGreaterThan(years)
		}
	for (const claim of engine.people.deposed.values()) {
		expect(claim.generation).toBeLessThan(2)
		expect(PEOPLE_RECORD.has({ people, id: claim.claimant })).toBe(true)
	}

	const offsetMs = DATE.earthHistoryStartYear * STATE.yearMs
	expect(PEOPLE_RECORD.count(people)).toBe(table.birth.length)
	for (let id = 0; id < PEOPLE_RECORD.count(people); id++)
		if (table.death[id] * STATE.yearMs > engine.time)
			expect(PEOPLE_RECORD.deathTimeMs({ people, id })).toBe(Infinity)
		else
			expect(
				Math.abs(
					PEOPLE_RECORD.deathTimeMs({ people, id }) +
						offsetMs -
						table.death[id] * STATE.yearMs,
				),
			).toBeLessThan(1)

	for (const note of engine.events)
		if (note.tag === "succession")
			expect(
				Math.abs(
					note.time - table.death[note.data.dying as number] * STATE.yearMs,
				),
			).toBeLessThan(1)

	const timelineKinds = new Set<string>()
	for (const mother of people.pregnanciesOf.keys())
		for (const event of PERSON_QUERY.timeline({
			people,
			id: mother,
			timeMs: state.record.maxTimeMs,
		}))
			timelineKinds.add(event.kind)
	for (const person of people.betrothalsOf.keys())
		for (const event of PERSON_QUERY.timeline({
			people,
			id: person,
			timeMs: state.record.maxTimeMs,
		}))
			timelineKinds.add(event.kind)
	for (const kind of [
		"miscarriage",
		"stillborn child",
		"died in childbirth",
		"betrothed",
		"betrothal broken",
	])
		expect(timelineKinds.has(kind)).toBe(true)

	const timeMs = state.record.maxTimeMs
	for (let seat = 0; seat < engine.P; seat++) {
		const ruler = engine.people.rulerOf[seat]
		if (ruler < 0 || !STATE.isSovereign({ state: engine, p: seat })) continue
		const view = PERSON_QUERY.view({ people, id: ruler, timeMs })
		expect(view?.tenures.some((tenure) => tenure.endTimeMs === null)).toBe(true)
		expect(PERSON_QUERY.health({ people, id: ruler, timeMs })).not.toBeNull()
		expect(PERSON_NAMES.person({ people, person: ruler })?.name).toBeTruthy()
	}
}, 600_000)

it("retains culture heritage after world transfer and release without detaching the live engine mapping", () => {
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 20000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	if (!world.heritages || !world.cultures) throw new Error("Missing partitions")
	expect(engine.heritageOfCulture).toEqual(world.heritages.assignment)
	expect(engine.heritageOfCulture.buffer).not.toBe(
		world.heritages.assignment.buffer,
	)
	expect(world.cultures.count).toBeGreaterThanOrEqual(2)
	world.heritages.assignment[1] = world.heritages.assignment[0]
	engine.heritageOfCulture[1] = engine.heritageOfCulture[0]
	const received = structuredClone(world, {
		transfer: [world.heritages.assignment.buffer],
	})
	expect(world.heritages.assignment.byteLength).toBe(0)
	expect(engine.heritageOfCulture.byteLength).toBeGreaterThan(0)
	const state = SIM_RECORD.buildProceduralState({
		world: received,
		startTimeMs: engine.time,
	})
	const mapping = state.record.heritageOfCulture
	expect(mapping).toEqual(engine.heritageOfCulture)
	expect(mapping.buffer).not.toBe(received.heritages!.assignment.buffer)
	const time = engine.time / STATE.yearMs
	const ids = [0, 1].map((culture) =>
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people: engine.people,
			sex: culture as 0 | 1,
			birth: time - 30,
			survives: time,
			father: -1,
			mother: -1,
			dynasty: -1,
			origin: { realm: 0, culture, genderSystem: 0 },
			rng: HISTORY_RNG.createHistoryRng(101 + culture),
		}),
	)
	JOURNAL.flush({ state: engine, noteCursor: 0, census: false, initial: false })
	const transferred = structuredClone(engine.journal, {
		transfer: JOURNAL.transferList(engine.journal),
	})
	for (const transaction of transferred)
		if (transaction.people)
			PEOPLE_RECORD.append({
				record: state.record.people!,
				packet: transaction.people,
				timeMs: TRANSLATOR.recordTime(transaction.timeMs),
				recordTime: (year) => TRANSLATOR.recordTime(year * STATE.yearMs),
			})
	structuredClone(received.heritages!.assignment, {
		transfer: [received.heritages!.assignment.buffer],
	})
	expect(mapping[0]).toBe(mapping[1])
	const opinion = PERSON_QUERY.opinion({
		people: state.record.people!,
		record: state.record,
		a: ids[0],
		b: ids[1],
		timeMs: state.record.maxTimeMs,
	})
	expect(opinion?.culture).toBe(5)
	const absent: SerializedGenesisWorld = { ...received }
	delete absent.heritages
	const unknown = SIM_RECORD.buildProceduralState({
		world: absent,
		startTimeMs: engine.time,
	})
	expect([...unknown.record.heritageOfCulture]).toEqual(
		Array(world.cultures.count).fill(-1),
	)
})

it("folds memory refreshes by observer, target and reason and answers each time from the refreshes made by then", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1, 0] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	const { people } = fixture
	const record = PEOPLE_RECORD.create()
	const history = {
		people: record,
		heritageOfCulture: new Int32Array([7]),
		minTimeMs: 100 * STATE.yearMs,
		maxTimeMs: 120 * STATE.yearMs,
		origin: "procedural",
		events: { provinceEvents: new Map(), nationEvents: [] },
	} as unknown as HistoryRecord
	const flush = (time: number) =>
		PEOPLE_RECORD.append({
			record,
			packet: structuredClone(
				PEOPLE_LOG.seal({ people, sovereign: () => true }),
			),
			timeMs: time * STATE.yearMs,
			recordTime: (year) => year * STATE.yearMs,
		})
	const remember = (reason: "attack" | "grant", time: number, target: number) =>
		OPINION.remember({ people, observer: 0, target, reason, time })
	remember("attack", 100, 1)
	flush(100)
	remember("attack", 103, 1)
	remember("grant", 103, 1)
	remember("grant", 103, 1)
	remember("attack", 103, 2)
	flush(103)
	expect(record.memoriesOf.get(0)?.get(1)).toHaveLength(4)
	expect(record.memoriesOf.get(0)?.get(2)).toHaveLength(1)
	expect(record.memoriesOf.has(1)).toBe(false)
	const at = (years: number, target: number) =>
		PERSON_QUERY.memories({
			people: record,
			a: 0,
			b: target,
			timeMs: years * STATE.yearMs,
		})
	expect(at(99.5, 1)).toEqual([])
	expect(at(102, 1)).toEqual([
		{ reason: "attack", startTimeMs: 100 * STATE.yearMs, strength: -20 },
	])
	expect(at(103, 1)).toEqual([
		{ reason: "attack", startTimeMs: 103 * STATE.yearMs, strength: -25 },
		{ reason: "grant", startTimeMs: 103 * STATE.yearMs, strength: 15 },
	])
	expect(
		PERSON_QUERY.memories({
			people: record,
			a: 0,
			b: 1,
			timeMs: 103 * STATE.yearMs - 1,
		}).map((memory) => memory.startTimeMs),
	).toEqual([100 * STATE.yearMs])
	expect(at(113, 1).map((memory) => Math.abs(memory.strength))).toEqual([0, 0])
	expect(at(108, 2)).toEqual([
		{ reason: "attack", startTimeMs: 103 * STATE.yearMs, strength: -12.5 },
	])
	expect(
		PERSON_QUERY.memories({
			people: record,
			a: 1,
			b: 0,
			timeMs: 103 * STATE.yearMs,
		}),
	).toEqual([])
	const opinion = (years: number) =>
		PERSON_QUERY.opinion({
			people: record,
			record: history,
			a: 0,
			b: 1,
			timeMs: years * STATE.yearMs,
		})!
	expect(opinion(102).memories).toBe(-20)
	expect(opinion(103).memories).toBe(-10)
	expect(opinion(108)).toMatchObject({
		memories: -5,
		unclamped: opinion(113).unclamped - 5,
	})
	OPINION.prune({ people, time: 120 })
	expect(people.memories.size).toBe(0)
	expect(opinion(103).memories).toBe(-10)

	PEOPLE_LOG.append({
		log: people.log,
		row: {
			kind: "opinion_memory",
			time: 104,
			observer: 0,
			target: 40,
			reason: "aid",
		},
	})
	expect(() => flush(104)).toThrow()
})
