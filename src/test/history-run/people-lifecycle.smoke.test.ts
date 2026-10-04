import { expect, it, vi } from "vitest"
import { EVENT_HEAP, EventHeap } from "@/model/history/sim/engine/event-heap"
import { COMMAND } from "@/model/history/sim/engine/events/battle/command"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { STRESS_EVENTS } from "@/model/history/sim/engine/events/people/stress"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type { SuccessionContext } from "@/model/history/sim/engine/events/succession/types"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { PeopleRow } from "@/model/history/sim/people/log/types"
import { STRESS } from "@/model/history/sim/people/stress"
import type { PeopleState } from "@/model/history/sim/people/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

const ORIGIN = { realm: 0, culture: 0, genderSystem: 0 }
const GESTATION = 280 / 365
// Outcome weights with a healthy first-time mother: 215 smooth, then losses.
const TOTAL = 232

function couple(): { people: PeopleState; mother: number; father: number } {
	const people = PEOPLE.create(4)
	const spawn = (sex: 0 | 1) =>
		PEOPLE.spawn({
			people,
			sex,
			birth: 80,
			survives: 80,
			father: -1,
			mother: -1,
			dynasty: sex,
			origin: ORIGIN,
			rng: RNG.createRng({ seed: sex + 1 }),
		})
	const father = spawn(0)
	const mother = spawn(1)
	for (const person of [father, mother]) {
		people.persons.death[person] = 150
		people.persons.peak[person] = 3
	}
	people.persons.spouse[father] = mother
	people.persons.spouse[mother] = father
	people.persons.marriedAt[father] = 99
	people.persons.marriedAt[mother] = 99
	return { people, mother, father }
}

function rolls(values: number[]) {
	const rng = RNG.createRng({ seed: 5 })
	const random = vi.spyOn(rng, "random")
	for (const value of values) random.mockReturnValueOnce(value)
	random.mockReturnValue(0.999)
	return rng
}

function rowsOf(state: HistoryState): PeopleRow[] {
	return state.journal.flatMap(({ people: packet }) =>
		packet
			? Array.from({ length: packet.count }, (...entry) =>
					PEOPLE_LOG.read({ rows: packet, index: entry[1] }),
				)
			: [],
	)
}

it("orders same-time events by death, birth, others and the yearly pass, then by enqueue", () => {
	const heap = new EventHeap(2)
	const { evt } = EVENT_HEAP
	heap.enqueue(5, evt.PEOPLE_YEAR, 0)
	heap.enqueue(5, evt.WAR, 1)
	heap.enqueue(5, evt.BIRTH, 2)
	heap.enqueue(5, evt.TAX, 3)
	heap.enqueue(5, evt.DEATH, 4)
	heap.enqueue(5, evt.WAR, 5)
	heap.enqueue(5, evt.DEATH, 6)
	heap.enqueue(4, evt.PEOPLE_YEAR, 7)
	heap.enqueue(6, evt.DEATH, 8)
	const order: number[] = []
	const data = new Int32Array(4)
	while (!heap.isEmpty()) {
		heap.peekData(data)
		order.push(data[0])
		heap.dequeue()
	}
	expect(order).toEqual([7, 4, 6, 2, 1, 3, 5, 0, 8])
})

it("queues a year's pregnancies without creating children and projects a couple once", () => {
	const { people, mother, father } = couple()
	const project = (from: number, until: number, values: number[]) =>
		FERTILITY.project({
			people,
			mother,
			father,
			from,
			until,
			origin: ORIGIN,
			rng: rolls(values),
		})
	const first = project(100, 101, [0, 0, 0])
	expect(first).toEqual([0])
	expect(people.persons.children[mother]).toEqual([])
	expect(people.persons.sex.length).toBe(2)
	const twins = people.deliveries.byId.get(0)
	expect(twins).toMatchObject({
		mother,
		father,
		conception: 100,
		outcome: "birth",
		twins: true,
	})
	expect(twins?.due).toBeCloseTo(100 + GESTATION, 9)
	expect(people.persons.nextBirth[mother]).toBeCloseTo(
		100 + GESTATION + 0.25,
		9,
	)
	expect(project(100, 101, [0, 0, 0])).toEqual([])

	// A miscarriage ends early enough for a second conception in the interval.
	const again = couple()
	const early = FERTILITY.project({
		people: again.people,
		mother: again.mother,
		father: again.father,
		from: 100,
		until: 101,
		origin: ORIGIN,
		rng: rolls([0, 216 / TOTAL, 0, 0, 0, 0.5]),
	})
	expect(
		early.map((id) => again.people.deliveries.byId.get(id)?.outcome),
	).toEqual(["miscarriage", "birth"])
	const [loss, birth] = early.map((id) => again.people.deliveries.byId.get(id))
	expect(loss?.due).toBeCloseTo(100 + 80 / 365, 9)
	expect(birth?.conception).toBeGreaterThanOrEqual((loss?.due ?? 0) + 0.25)
	expect(birth?.twins).toBe(false)
})

it("decides every outcome at conception and stops projecting behind a fatal one", () => {
	const outcomes = [
		[0.5, "birth"],
		[216 / TOTAL, "miscarriage"],
		[226 / TOTAL, "stillbirth"],
		[228.5 / TOTAL, "mother dies"],
		[231 / TOTAL, "mother and child die"],
	] as const
	for (const [roll, outcome] of outcomes) {
		const { people, mother, father } = couple()
		const [id] = FERTILITY.project({
			people,
			mother,
			father,
			from: 100.9,
			until: 101,
			origin: ORIGIN,
			rng: rolls([0, roll, 0.5, 0.5]),
		})
		const delivery = people.deliveries.byId.get(id)
		expect(delivery?.outcome).toBe(outcome)
		const fatal =
			outcome === "mother dies" || outcome === "mother and child die"
		expect(people.persons.death[mother]).toBe(150)
		const later = FERTILITY.project({
			people,
			mother,
			father,
			from: 101,
			until: 102,
			origin: ORIGIN,
			rng: rolls([0, 0, 0]),
		})
		if (fatal) expect(later).toEqual([])
		const time = delivery?.due ?? 0
		const taken = FERTILITY.finishDelivery({ people, id, time })
		if (!taken) throw new Error("Missing delivery")
		expect(FERTILITY.finishDelivery({ people, id, time })).toBeNull()
		expect(
			FERTILITY.deliver({
				people,
				pregnancy: taken,
				time,
				rng: RNG.createRng({ seed: 3 }),
			}),
		).toBe(fatal)
		const children = people.persons.children[mother]
		expect(children.length).toBe(
			outcome === "birth" || outcome === "mother dies" ? 1 : 0,
		)
		for (const child of children) {
			expect(people.persons.birth[child]).toBe(time)
			expect(people.persons.father[child]).toBe(father)
		}
		const packet = PEOPLE_LOG.seal({ people, sovereign: () => true })
		const losses = Array.from({ length: packet.count }, (...entry) =>
			PEOPLE_LOG.read({ rows: packet, index: entry[1] }),
		).filter((row) => row.kind === "pregnancy")
		expect(losses).toEqual(
			outcome === "birth"
				? []
				: [
						{
							kind: "pregnancy",
							time,
							mother,
							father,
							outcome: fatal ? "childbirth death" : outcome,
						},
					],
		)
	}
})

it("keeps a pregnancy after the father dies, rejects one he never fathered and drops a dead mother's", () => {
	const widow = couple()
	const [kept] = FERTILITY.project({
		people: widow.people,
		mother: widow.mother,
		father: widow.father,
		from: 100,
		until: 101,
		origin: ORIGIN,
		rng: rolls([0, 0.5, 0.5]),
	})
	widow.people.persons.death[widow.father] = 100.3
	expect(
		FERTILITY.finishDelivery({
			people: widow.people,
			id: kept,
			time: 100 + GESTATION,
		}),
	).not.toBeNull()

	const rejected = couple()
	const [never] = FERTILITY.project({
		people: rejected.people,
		mother: rejected.mother,
		father: rejected.father,
		from: 100.5,
		until: 101,
		origin: ORIGIN,
		rng: rolls([0, 0.5, 0.5]),
	})
	rejected.people.persons.death[rejected.father] = 100.5
	expect(
		FERTILITY.finishDelivery({
			people: rejected.people,
			id: never,
			time: 100.5 + GESTATION,
		}),
	).toBeNull()
	expect(rejected.people.persons.nextBirth[rejected.mother]).toBe(100.5)
	expect(rejected.people.deliveries.byMother.has(rejected.mother)).toBe(false)

	const dead = couple()
	const [dropped] = FERTILITY.project({
		people: dead.people,
		mother: dead.mother,
		father: dead.father,
		from: 100,
		until: 101,
		origin: ORIGIN,
		rng: rolls([0, 0.5, 0.5]),
	})
	expect(
		FERTILITY.cancelForDeath({ people: dead.people, person: dead.mother }),
	).toBe(1)
	expect(
		FERTILITY.cancelForDeath({ people: dead.people, person: dead.mother }),
	).toBe(0)
	expect(
		FERTILITY.finishDelivery({
			people: dead.people,
			id: dropped,
			time: 100 + GESTATION,
		}),
	).toBeNull()
	expect(dead.people.deliveries.byId.size).toBe(0)
})

it("applies an immediate death once, leaves its queued token stale and gives each walk its own context", () => {
	const seed = 14963991
	const { engine: state } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const table = state.people.persons
	const realms = Array.from(state.people.rulerOf.keys()).filter(
		(p) => STATE.isSovereign({ state, p }) && state.people.rulerOf[p] >= 0,
	)
	const [realm, other] = realms
	const ruler = state.people.rulerOf[realm]
	expect(table.death[ruler]).toBe(Infinity)
	expect(DEATH_SCHEDULE.revisionOf({ state, person: ruler })).toBe(-1)
	table.death[ruler] = state.time / STATE.yearMs + 5
	DEATH_SCHEDULE.ensure({ state, person: ruler, cause: "natural" })
	const queued = DEATH_SCHEDULE.revisionOf({ state, person: ruler })
	expect(queued).toBeGreaterThan(0)
	const contexts: SuccessionContext[] = []
	const succeed = SUCCESSION.succeedPerson
	const walk = vi
		.spyOn(SUCCESSION, "succeedPerson")
		.mockImplementation((params) => {
			contexts.push(params.context)
			succeed(params)
		})
	JOURNAL.releaseSent(state)
	const noteCursor = state.events.length
	state.time += STATE.deltaYear(0.25)
	const stale = state.lifecycle.staleDeaths
	PERSON_DEATH.kill({ state, person: ruler, cause: "battle", rng })
	expect(table.death[ruler]).toBe(state.time / STATE.yearMs)
	expect(DEATH_SCHEDULE.applied({ state, person: ruler })).toBe(true)
	expect(state.people.rulerOf[realm]).not.toBe(ruler)
	expect(table.heldSeats[ruler]).toEqual([])
	expect(
		state.events
			.slice(noteCursor)
			.filter((note) => note.tag === "succession" && note.data.dying === ruler)
			.length,
	).toBe(1)
	PERSON_DEATH.run({ state, person: ruler, revision: queued, rng })
	PERSON_DEATH.kill({ state, person: ruler, cause: "natural", rng })
	expect(state.lifecycle.staleDeaths).toBe(stale + 2)
	expect(contexts.length).toBe(1)
	const second = state.people.rulerOf[other]
	PERSON_DEATH.kill({ state, person: second, cause: "childbirth", rng })
	expect(contexts.length).toBe(2)
	expect(contexts[1].accountedEdges).not.toBe(contexts[0].accountedEdges)
	expect(state.successionContext).toBeNull()
	walk.mockRestore()
	const diedAt = state.time / STATE.yearMs
	// An immediate death applies whatever the clock's rounding: these people
	// have no death date and so no token until they are killed.
	const unscheduled = state.people.alive
		.filter(
			(person) =>
				table.death[person] === Infinity &&
				table.heldSeats[person].length === 0,
		)
		.slice(0, 40)
	expect(unscheduled.length).toBe(40)
	for (const person of unscheduled) {
		// A battle time that does not survive the round trip through years:
		// the death, stored in years, converts back to just before now.
		// Such times cluster: around year 1100 about one in four fails.
		let time = Math.max(Math.floor(state.time), 1100 * STATE.yearMs) + 7919
		for (let tries = 0; tries < 1000; tries++) {
			if ((time / STATE.yearMs) * STATE.yearMs < time) break
			time += 7919
		}
		expect((time / STATE.yearMs) * STATE.yearMs).toBeLessThan(time)
		state.time = time
		PERSON_DEATH.kill({ state, person, cause: "childbirth", rng })
		expect(table.death[person]).toBe(state.time / STATE.yearMs)
		expect(DEATH_SCHEDULE.applied({ state, person })).toBe(true)
	}
	expect(state.people.rulerOf[realm]).toBeGreaterThanOrEqual(0)
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	const deaths = rowsOf(state).filter(
		(row) => row.kind === "death" && !unscheduled.includes(row.person),
	)
	expect(
		rowsOf(state).filter(
			(row) => row.kind === "death" && unscheduled.includes(row.person),
		),
	).toHaveLength(unscheduled.length)
	expect(deaths).toEqual([
		{
			kind: "death",
			time: diedAt,
			person: ruler,
			cause: "battle",
		},
		{
			kind: "death",
			time: diedAt,
			person: second,
			cause: "childbirth",
		},
	])
}, 120000)

it("schedules landless deaths, never an unknown one, and writes no future rows", () => {
	const seed = 14963991
	const { engine: state } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const table = state.people.persons
	const start = state.time
	const landless = state.people.alive.find(
		(person) =>
			table.heldSeats[person].length === 0 && table.death[person] === Infinity,
	)
	if (landless === undefined) throw new Error("Missing landless person")
	expect(DEATH_SCHEDULE.revisionOf({ state, person: landless })).toBe(-1)
	const size = state.heap.size
	const revision = state.deathSchedule.revision
	DEATH_SCHEDULE.ensure({ state, person: landless, cause: "natural" })
	expect(state.deathSchedule.pending.has(landless)).toBe(false)
	expect(state.heap.size).toBe(size)
	table.death[landless] = start / STATE.yearMs + 30
	DEATH_SCHEDULE.ensure({ state, person: landless, cause: "natural" })
	expect(state.deathSchedule.revision).toBe(revision + 1)
	expect(state.heap.size).toBe(size + 1)
	table.death[landless] = Infinity
	DEATH_SCHEDULE.ensure({ state, person: landless, cause: "natural" })
	expect(state.deathSchedule.pending.has(landless)).toBe(false)

	const died = new Set<number>()
	const deadAtCreation = new Set<number>()
	const births = new Map<number, number>()
	let last = -Infinity
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	for (let year = 1; year <= 12; year++) {
		SIM_ENGINE.simulateUntil({
			state,
			targetTimeMs: start + STATE.deltaYear(year),
			rng,
			validate: false,
		})
		for (const transaction of state.journal) {
			expect(transaction.timeMs).toBeGreaterThanOrEqual(last)
			last = transaction.timeMs
			const now = transaction.timeMs / STATE.yearMs + 1e-9
			const packet = transaction.people
			if (!packet) continue
			for (let index = 0; index < packet.count; index++) {
				const row = PEOPLE_LOG.read({ rows: packet, index })
				if (row.kind === "creation") {
					expect(row.time).toBeLessThanOrEqual(now)
					births.set(row.person, row.time)
					const death = packet.death[row.snapshot]
					expect(death === Infinity || death <= now).toBe(true)
					if (death !== Infinity) deadAtCreation.add(row.person)
				} else if (row.kind === "death") {
					expect(row.time).toBeLessThanOrEqual(now)
					expect(died.has(row.person)).toBe(false)
					died.add(row.person)
				} else if (row.kind === "wedding" || row.kind === "pregnancy")
					expect(row.time).toBeLessThanOrEqual(now)
			}
		}
		JOURNAL.releaseSent(state)
		for (let seat = 0; seat < state.P; seat++) {
			const ruler = state.people.rulerOf[seat]
			if (ruler >= 0 && STATE.isSovereign({ state, p: seat }))
				expect(table.death[ruler] * STATE.yearMs).toBeGreaterThan(state.time)
		}
	}
	expect(died.size).toBe(state.lifecycle.deaths)
	expect(state.lifecycle.births).toBeGreaterThan(0)
	for (const person of died) {
		expect(DEATH_SCHEDULE.applied({ state, person })).toBe(true)
		expect(table.spouse[person]).toBe(-1)
		expect(table.betrothed[person]).toBe(-1)
		expect(state.people.deliveries.byMother.has(person)).toBe(false)
	}
	for (let person = 0; person < table.sex.length; person++) {
		if (table.death[person] * STATE.yearMs > state.time) {
			expect(DEATH_SCHEDULE.revisionOf({ state, person }) > 0).toBe(
				table.death[person] !== Infinity,
			)
			continue
		}
		if (births.has(person))
			expect(died.has(person) !== deadAtCreation.has(person)).toBe(true)
		const spouse = table.spouse[person]
		expect(spouse).toBe(died.has(person) ? -1 : spouse)
	}
	for (const delivery of state.people.deliveries.byId.values()) {
		expect(delivery.due * STATE.yearMs).toBeGreaterThanOrEqual(state.time)
		expect(table.death[delivery.mother]).toBeGreaterThan(delivery.conception)
	}
	for (const child of births.keys()) {
		const mother = table.mother[child]
		if (mother < 0 || table.birth[child] * STATE.yearMs < start) continue
		expect(table.death[mother]).toBeGreaterThanOrEqual(table.birth[child])
	}
}, 300000)

// Brave, wrathful and lustful: no stress modifier and none of the stressor
// traits.
const CALM_TRAITS = 0 | (4 << 6) | (12 << 12)

function sovereignAdults(state: HistoryState): number[] {
	const table = state.people.persons
	const time = state.time / STATE.yearMs
	const seen = new Set<number>()
	const realms: number[] = []
	for (let realm = 0; realm < state.P; realm++) {
		const ruler = state.people.rulerOf[realm]
		if (ruler < 0 || !STATE.isSovereign({ state, p: realm })) continue
		if (seen.has(ruler) || time - table.birth[ruler] < 30) continue
		if (table.heldSeats[ruler].length !== 1) continue
		if (state.people.regencies.has(realm)) continue
		seen.add(ruler)
		realms.push(realm)
	}
	return realms
}

it("fails every stressed heart after the whole stress loop, dating all deaths before any succession", () => {
	const seed = 14963991
	const { engine: state } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const people = state.people
	const table = people.persons
	const realms = sovereignAdults(state).slice(0, 3)
	const [first, second, calm] = realms.map((realm) => people.rulerOf[realm])
	for (const ruler of [first, second, calm]) {
		table.personality[ruler] = CALM_TRAITS
		table.stress[ruler] = 90
		people.bereavements.set(ruler, 2)
	}
	// Three mental breaks behind them; the calm ruler has no heart condition.
	table.falteringHeartXp[first] = 75
	table.falteringHeartXp[second] = 75
	people.stressed = [first, second, calm]
	JOURNAL.releaseSent(state)
	state.time += STATE.yearMs
	const snapshot = new Set<number>()
	for (let realm = 0; realm < state.P; realm++)
		if (people.rulerOf[realm] >= 0 && STATE.isSovereign({ state, p: realm }))
			snapshot.add(people.rulerOf[realm])
	const walks: number[] = []
	const marked: boolean[] = []
	const succeed = SUCCESSION.succeedPerson
	const walk = vi
		.spyOn(SUCCESSION, "succeedPerson")
		.mockImplementation((params) => {
			walks.push(params.person)
			marked.push(
				[first, second].every(
					(ruler) => table.death[ruler] === state.time / STATE.yearMs,
				),
			)
			succeed(params)
		})
	const stress = vi.spyOn(STRESS, "step")
	PEOPLE_EVENTS.runYear({ state, rng })
	walk.mockRestore()
	const stepped = stress.mock.calls.length
	stress.mockRestore()
	expect(walks.slice(0, 2)).toEqual([first, second].sort((a, b) => a - b))
	expect(marked.slice(0, 2)).toEqual([true, true])
	expect(table.falteringHeartXp[first]).toBe(100)
	expect(table.falteringHeartXp[calm]).toBe(-1)
	expect(STRESS.level(table.stress[calm])).toBe(1)
	expect(table.death[calm]).toBeGreaterThan(state.time / STATE.yearMs)
	for (const [index, ruler] of [first, second].entries()) {
		expect(DEATH_SCHEDULE.applied({ state, person: ruler })).toBe(true)
		const heir = people.rulerOf[realms[index]]
		expect(heir).toBeGreaterThanOrEqual(0)
		expect([first, second]).not.toContain(heir)
		expect(people.stressed).not.toContain(ruler)
	}
	// Each ruler of the snapshot was stepped once; no new heir was.
	expect(stepped).toBe(snapshot.size)
	JOURNAL.flush({ state, noteCursor: 0, census: false, initial: false })
	const rows = rowsOf(state)
	expect(
		rows.filter(
			(row) => row.kind === "death" && [first, second].includes(row.person),
		),
	).toEqual(
		[first, second]
			.sort((a, b) => a - b)
			.map((person) => ({
				kind: "death",
				time: state.time / STATE.yearMs,
				person,
				cause: "heart",
			})),
	)
	const hearts = rows.filter(
		(row) => row.kind === "condition" && row.condition === "faltering_heart",
	)
	expect(hearts).toHaveLength(2)
	for (const row of hearts) expect(row).toMatchObject({ before: 3, after: 4 })
	// The stress row precedes the heart row it caused.
	for (const ruler of [first, second]) {
		const stressAt = rows.findIndex(
			(row) => row.kind === "stress" && row.person === ruler,
		)
		const heartAt = rows.findIndex(
			(row) => row.kind === "condition" && row.person === ruler,
		)
		expect(stressAt).toBeGreaterThanOrEqual(0)
		expect(heartAt).toBeGreaterThan(stressAt)
	}
}, 120000)

it("advances a heart only on a rise after onset, by one step however far the level jumps", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = state.people
	const table = people.persons
	const [realm] = sovereignAdults(state)
	const ruler = people.rulerOf[realm]
	table.personality[ruler] = CALM_TRAITS
	const pass = (stress: number, bereavements: number) => {
		table.stress[ruler] = stress
		people.stressed = [ruler]
		if (bereavements > 0) people.bereavements.set(ruler, bereavements)
		state.time += STATE.yearMs
		return STRESS_EVENTS.runYear({ state })
	}
	// No condition: a rise changes nothing.
	expect(pass(90, 2)).toEqual([])
	expect(table.falteringHeartXp[ruler]).toBe(-1)
	table.falteringHeartXp[ruler] = 0
	// Level 1 held, then a fall: no XP.
	pass(150, 2)
	expect(table.falteringHeartXp[ruler]).toBe(0)
	pass(110, 0)
	expect(STRESS.level(table.stress[ruler])).toBe(0)
	expect(table.falteringHeartXp[ruler]).toBe(0)
	// A jump from level 0 to level 3 is one mental break.
	pass(0, 20)
	expect(STRESS.level(table.stress[ruler])).toBe(3)
	expect(table.falteringHeartXp[ruler]).toBe(25)
	// Held at level 3: nothing.
	pass(400, 20)
	expect(table.falteringHeartXp[ruler]).toBe(25)
	// A fall to 2 and a rise back to 3 is another break.
	pass(290, 0)
	expect(STRESS.level(table.stress[ruler])).toBe(2)
	expect(pass(290, 2)).toEqual([])
	expect(STRESS.level(table.stress[ruler])).toBe(3)
	expect(table.falteringHeartXp[ruler]).toBe(50)
	// A ruler who is no longer sovereign is reset without a break.
	state.people.rulerOf[realm] = -1
	table.stress[ruler] = 250
	people.stressed = [ruler]
	expect(STRESS_EVENTS.runYear({ state })).toEqual([])
	expect(table.stress[ruler]).toBe(0)
	expect(table.falteringHeartXp[ruler]).toBe(50)
}, 120000)

it("governs for an incapable sovereign through a regent until death, spouse first", () => {
	const seed = 14963991
	const { generated, engine: state } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const procedural = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: procedural, world })
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })
	JOURNAL.releaseSent(state)
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const people = state.people
	const table = people.persons
	const realm = sovereignAdults(state).find((candidate) => {
		const spouse = table.spouse[people.rulerOf[candidate]]
		return (
			spouse >= 0 &&
			SUCCESSION_SYSTEMS.adultAvailable({ state, person: spouse })
		)
	})
	if (realm === undefined) throw new Error("Missing married sovereign")
	const ruler = people.rulerOf[realm]
	const spouse = table.spouse[ruler]
	// One more year of a withering mind takes it past its last level; no
	// death is projected for the ruler meanwhile.
	table.witheringMindXp[ruler] = 99
	table.healthIntervalEnd[ruler] = Infinity
	table.baseHealth[ruler] = 9
	expect(SUCCESSION_SYSTEMS.adultAvailable({ state, person: ruler })).toBe(
		false,
	)
	expect(GOVERNOR.of({ state, realm })).toBe(ruler)
	state.time += STATE.yearMs
	const before = state.events.length
	PEOPLE_EVENTS.runYear({ state, rng })
	expect(AGEING.incapable({ people, person: ruler })).toBe(true)
	const started = state.events
		.slice(before)
		.filter(
			(note) => note.tag === "regency started" && note.data.ward === ruler,
		)
	expect(started).toHaveLength(1)
	expect(started[0]).toMatchObject({
		time: state.time,
		data: {
			nation: realm,
			ward: ruler,
			regent: spouse,
			kind: "spouse",
			regencyCause: "incapacity",
		},
	})
	expect(people.regencies.get(realm)).toEqual({
		ward: ruler,
		cause: "incapacity",
		regent: spouse,
		kind: "spouse",
	})
	expect(GOVERNOR.of({ state, realm })).toBe(spouse)
	expect(REGENCY.weak({ state, realm })).toBe(true)
	expect(GOVERNOR.attribute({ state, realm, attribute: "martial" })).toBe(
		GOVERNOR.personAttribute({ state, person: spouse, attribute: "martial" }),
	)
	expect(
		GOVERNOR.personAttribute({ state, person: ruler, attribute: "martial" }),
	).toBe(0)
	expect(SUCCESSION_SYSTEMS.available({ state, person: ruler })).toBe(false)
	// The end-of-minority callback leaves an incapacity regency alone.
	REGENCY.comeOfAge({ state, realm, leader: state.leaderRuntime.idx[realm] })
	expect(people.regencies.has(realm)).toBe(true)
	// The regent dies: the next in order takes over, the cause unchanged.
	PERSON_DEATH.kill({ state, person: spouse, cause: "natural", rng })
	const replacement = people.regencies.get(realm)
	expect(replacement?.cause).toBe("incapacity")
	expect(replacement?.regent).not.toBe(spouse)
	expect(replacement?.kind).not.toBe("spouse")
	const changed = state.events.findLast((note) => note.tag === "regent changed")
	expect(changed?.data).toMatchObject({
		nation: realm,
		ward: ruler,
		regencyCause: "incapacity",
	})
	// The ward dies: the regency ends with their reign.
	PERSON_DEATH.kill({ state, person: ruler, cause: "natural", rng })
	expect(people.regencies.get(realm)?.ward).not.toBe(ruler)
	const ended = state.events.findLast(
		(note) => note.tag === "regency ended" && note.data.ward === ruler,
	)
	expect(ended?.data).toMatchObject({
		nation: realm,
		regencyCause: "incapacity",
		cause: "death",
	})
	JOURNAL.flush({ state, noteCursor: before, census: false, initial: false })
	const conditions = rowsOf(state).filter(
		(row) => row.kind === "condition" && row.person === ruler,
	)
	expect(conditions).toEqual([
		{
			kind: "condition",
			time: state.time / STATE.yearMs,
			person: ruler,
			condition: "withering_mind",
			before: 3,
			after: 4,
		},
		{
			kind: "condition",
			time: state.time / STATE.yearMs,
			person: ruler,
			condition: "incapable",
			before: -1,
			after: 0,
		},
	])
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })
	const nationId = translator.identityByRoot.get(realm)
	if (nationId === undefined) throw new Error("Missing nation identity")
	const regencies = procedural.record.events.nationEvents[nationId].events
		.filter((event) => event.kind === "regency")
		.map((event) => event.payload)
	expect(regencies.slice(-2)).toMatchObject([
		{
			event: "started",
			ward: ruler,
			regent: spouse,
			regencyCause: "incapacity",
		},
		{ event: "changed", ward: ruler, regencyCause: "incapacity" },
	])
}, 120000)

const NO_TRAITS = 63 | (63 << 6) | (63 << 12)
const NEUTRAL_GRADES = 3 | (3 << 7) | (3 << 14)
const XP_COLUMNS = [
	"infirmXp",
	"cloudedEyesXp",
	"fragileBonesXp",
	"witheringMindXp",
	"falteringHeartXp",
] as const

// A healthy adult with no traits or conditions and every base attribute at 6.
function fit(state: HistoryState, person: number): void {
	const table = state.people.persons
	table.personality[person] = NO_TRAITS
	table.grades[person] = NEUTRAL_GRADES
	table.congenital[person] = 0
	table.bases[person] = 0x666666
	table.baseHealth[person] = 6
	table.healthFlags[person] = 0
	table.ledYear[person] = -1
	for (const column of XP_COLUMNS) table[column][person] = -1
}

it("lets a fit ruler lead one battle a year, keeping the governor's martial in every battle", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = state.people
	const table = people.persons
	const [realm, other] = sovereignAdults(state)
	const ruler = people.rulerOf[realm]
	const year = Math.floor(state.time / STATE.yearMs)
	fit(state, ruler)
	const governor = COMMAND.multiplier({ state, realm })
	expect(governor).toBeCloseTo(1 + 0.025 * (6 - 5.4), 12)
	const refused = (change: () => void, restore: () => void) => {
		change()
		expect(COMMAND.lead({ state, realm })).toBeNull()
		expect(table.ledYear[ruler]).toBe(-1)
		expect(table.healthFlags[ruler] & 32).toBe(0)
		restore()
	}
	const birth = table.birth[ruler]
	refused(
		() => {
			table.birth[ruler] = state.time / STATE.yearMs - 15.9
		},
		() => {
			table.birth[ruler] = birth
		},
	)
	refused(
		() =>
			people.regencies.set(realm, {
				cause: "incapacity",
				ward: ruler,
				regent: people.rulerOf[other],
				kind: "relative",
			}),
		() => people.regencies.delete(realm),
	)
	refused(
		() => {
			table.infirmXp[ruler] = 0
		},
		() => {
			table.infirmXp[ruler] = -1
		},
	)
	for (const flag of [8, 16])
		refused(
			() => {
				table.healthFlags[ruler] = flag
				table.baseHealth[ruler] = 9
			},
			() => {
				table.healthFlags[ruler] = 0
				table.baseHealth[ruler] = 6
			},
		)
	refused(
		() => {
			table.baseHealth[ruler] = 3
		},
		() => {
			table.baseHealth[ruler] = 6
		},
	)
	// A regent's martial governs the army; the ward adds nothing in person.
	table.bases[people.rulerOf[other]] = 0
	people.regencies.set(realm, {
		cause: "minority",
		ward: ruler,
		regent: people.rulerOf[other],
		kind: "relative",
	})
	expect(COMMAND.multiplier({ state, realm })).toBeLessThan(governor)
	people.regencies.delete(realm)

	table.baseHealth[ruler] = 3.01
	expect(COMMAND.lead({ state, realm })).toEqual({ person: ruler, penalty: 1 })
	expect(table.ledYear[ruler]).toBe(year)
	expect(table.healthFlags[ruler] & 32).toBe(32)
	// Already led this year: no second battle, and the governor still counts.
	expect(COMMAND.lead({ state, realm })).toBeNull()
	expect(COMMAND.multiplier({ state, realm })).toBe(governor)
	table.bases[ruler] = 0
	expect(COMMAND.multiplier({ state, realm })).toBe(0.87)
	table.bases[ruler] = 0x666666

	// The next yearly pulse consumes the led year once.
	table.fragileBonesXp[ruler] = 0
	table.healthIntervalEnd[ruler] = Infinity
	table.baseHealth[ruler] = 9
	people.alive = [ruler]
	state.time += STATE.yearMs
	HEALTH.runYear({ people, time: state.time / STATE.yearMs })
	expect(table.healthFlags[ruler] & 32).toBe(0)
	expect([3, 6, 12]).toContain(table.fragileBonesXp[ruler])

	// Fragile Bones weakens only the army its sufferer leads, within bounds.
	const penalties = [0, 25, 50, 75, 100].map((xp) => {
		table.fragileBonesXp[ruler] = xp
		table.ledYear[ruler] = -1
		return COMMAND.lead({ state, realm })?.penalty
	})
	expect(penalties[0]).toBeCloseTo(0.97, 12)
	expect(penalties[1]).toBeCloseTo(0.94, 12)
	expect(penalties[2]).toBeCloseTo(0.91, 12)
	expect(penalties[3]).toBeCloseTo(0.86, 12)
	expect(penalties[4]).toBeCloseTo(0.76, 12)
	expect(COMMAND.multiplier({ state, realm })).toBe(governor)
}, 120000)

it("kills a leading ruler at CK3's rate, by prowess, temper and odds", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const table = state.people.persons
	const [realm] = sovereignAdults(state)
	const ruler = state.people.rulerOf[realm]
	fit(state, ruler)
	const leader = { person: ruler, penalty: 1 }
	const seeds = 400000
	const rate = (own: number, enemy: number) => {
		let killed = 0
		for (let seed = 1; seed <= seeds; seed++) {
			table.nameSeed[ruler] = seed
			if (COMMAND.fatal({ state, leader, own, enemy })) killed++
		}
		return killed / seeds
	}
	const base = 5 / 1040
	const neutral = base * (24 / 30)
	expect(Math.abs(rate(1000, 1000) - neutral)).toBeLessThan(0.0005)
	expect(Math.abs(rate(1000, 3000) - neutral)).toBeLessThan(0.0005)
	expect(Math.abs(rate(2000, 1000) - neutral * 0.7)).toBeLessThan(0.0005)
	expect(Math.abs(rate(1400, 1000) - neutral)).toBeLessThan(0.0005)
	// Brave adds 3 prowess and doubles the risk; craven loses 3 and halves it.
	table.personality[ruler] = 0 | (63 << 6) | (63 << 12)
	expect(Math.abs(rate(1000, 1000) - base * (21 / 30) * 2)).toBeLessThan(0.0007)
	table.personality[ruler] = 1 | (63 << 6) | (63 << 12)
	expect(Math.abs(rate(1000, 1000) - base * (27 / 30) * 0.5)).toBeLessThan(
		0.0004,
	)
	// The roll is fixed for one leader at one battle time.
	table.nameSeed[ruler] = 77
	const first = COMMAND.fatal({ state, leader, own: 1000, enemy: 1000 })
	expect(COMMAND.fatal({ state, leader, own: 1000, enemy: 1000 })).toBe(first)
}, 300000)

it("carries a battle death to the nation timeline and never lets a ruler lead twice in a year", () => {
	const seed = 14963991
	const { generated, engine: state } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const procedural = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: procedural, world })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = state.time
	SIM_ENGINE.simulateUntil({
		state,
		targetTimeMs: start + STATE.deltaYear(20),
		rng,
		validate: false,
	})
	const led = new Set<string>()
	let battles = 0
	let ledBattles = 0
	for (const note of state.events) {
		if (note.tag !== "battle") continue
		battles++
		const year = Math.floor(note.time / STATE.yearMs)
		for (const side of ["attacker", "defender"] as const) {
			const leader = note.data[`${side}Leader`] as number
			if (leader < 0) {
				expect(note.data[`${side}LeaderKilled`]).toBe(false)
				continue
			}
			ledBattles++
			expect(led.has(`${leader}:${year}`)).toBe(false)
			led.add(`${leader}:${year}`)
			if (note.data[`${side}LeaderKilled`])
				expect(state.people.persons.death[leader]).toBe(
					note.time / STATE.yearMs,
				)
		}
	}
	expect(battles).toBeGreaterThan(0)
	expect(ledBattles).toBeGreaterThan(0)
	for (let seat = 0; seat < state.P; seat++) {
		const ruler = state.people.rulerOf[seat]
		if (ruler >= 0 && STATE.isSovereign({ state, p: seat }))
			expect(state.people.persons.death[ruler] * STATE.yearMs).toBeGreaterThan(
				state.time,
			)
	}
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })
	JOURNAL.releaseSent(state)

	// A forced battle death: one death row, one successor entry naming the
	// cause, and the queued natural token left stale.
	const [realm] = sovereignAdults(state)
	const ruler = state.people.rulerOf[realm]
	state.people.persons.death[ruler] = state.time / STATE.yearMs + 3
	DEATH_SCHEDULE.ensure({ state, person: ruler, cause: "natural" })
	const queued = DEATH_SCHEDULE.revisionOf({ state, person: ruler })
	state.time += STATE.deltaYear(0.5)
	const noteCursor = state.events.length
	const stale = state.lifecycle.staleDeaths
	PERSON_DEATH.kill({ state, person: ruler, cause: "battle", rng })
	PERSON_DEATH.run({ state, person: ruler, revision: queued, rng })
	expect(state.lifecycle.staleDeaths).toBe(stale + 1)
	const succession = state.events
		.slice(noteCursor)
		.filter((note) => note.tag === "succession" && note.data.dying === ruler)
	expect(succession).toHaveLength(1)
	expect(succession[0].data.cause).toBe("battle")
	const successor = state.people.rulerOf[realm]
	expect(successor).not.toBe(ruler)
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	expect(
		rowsOf(state).filter((row) => row.kind === "death" && row.person === ruler),
	).toEqual([
		{
			kind: "death",
			time: state.time / STATE.yearMs,
			person: ruler,
			cause: "battle",
		},
	])
	const delta = state.journal
		.flatMap((transaction) => transaction.rulers)
		.filter((entry) => entry.root === realm)
	expect(delta).toHaveLength(1)
	expect(delta[0]).toMatchObject({
		person: successor,
		deceased: ruler,
		deathCause: "battle",
	})
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })
	const nationId = translator.identityByRoot.get(realm)
	if (nationId === undefined) throw new Error("Missing nation identity")
	const changes = procedural.record.events.nationEvents[nationId].events.filter(
		(event) => event.kind === "rulerChange",
	)
	const battleTimeMs = procedural.record.maxTimeMs
	const entries = changes.filter((event) => event.timeMs === battleTimeMs)
	expect(entries).toHaveLength(1)
	expect(entries[0].payload).toMatchObject({
		person: successor,
		newRuler: true,
		predecessor: ruler,
		predecessorDeathCause: "battle",
	})
	// The dead ruler's own entry, under whichever identity the realm then had.
	const reigns = procedural.record.events.nationEvents.flatMap((log) =>
		log.events.filter(
			(event) => event.kind === "rulerChange" && event.payload.person === ruler,
		),
	)
	expect(reigns.length).toBeGreaterThan(0)
	expect(reigns.at(-1)?.payload.deathCause).toBe("battle")
	expect(typeof reigns.at(-1)?.payload.deathDate).toBe("string")
	for (const log of procedural.record.events.nationEvents)
		for (const event of log.events)
			if (event.kind === "rulerChange" && event.payload.deathDate !== null)
				expect(["natural", "heart", "battle", "childbirth"]).toContain(
					event.payload.deathCause,
				)
}, 300000)
