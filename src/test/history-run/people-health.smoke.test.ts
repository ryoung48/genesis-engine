import { expect, it } from "vitest"
import { DATE } from "@/model/history/earth/date"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { PeopleRecord } from "@/model/history/record/people/types"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { CHARACTER } from "@/model/history/sim/people/character"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { PeopleState, Sex } from "@/model/history/sim/people/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

const ORIGIN = { realm: 0, culture: 0, genderSystem: 0 }
// Three empty personality slots, and a neutral grade (stored plus three) on
// each of the intellect, physique and beauty ladders.
const NO_PERSONALITY = 63 | (63 << 6) | (63 << 12)
const NEUTRAL_GRADES = 3 | (3 << 7) | (3 << 14)

// One person in a world whose present the test moves.
function world(sex: Sex, birth: number) {
	const people = PEOPLE.create(2)
	const clock = { time: birth }
	people.household = { ...people.household, time: () => clock.time }
	const person = PEOPLE.spawn({
		people,
		sex,
		birth,
		survives: birth,
		father: -1,
		mother: -1,
		dynasty: 0,
		origin: ORIGIN,
		rng: RNG.createRng({ seed: 9 }),
	})
	return { people, person, clock }
}

// Clears every innate trait and restarts the person's health from a seed.
function reseed(people: PeopleState, person: number, seed: number): void {
	const table = people.persons
	table.nameSeed[person] = seed
	table.personality[person] = NO_PERSONALITY
	table.grades[person] = NEUTRAL_GRADES
	table.congenital[person] = 0
	table.death[person] = Infinity
	clearConditions(people, person)
	HEALTH.replay({ people, person, survives: table.birth[person] + 1000 })
	table.healthIntervalEnd[person] = table.birth[person]
}

it("gives newborns CK3 health, with the female bonus, and maps health to the six bands", () => {
	for (const sex of [0, 1] as const) {
		const { people, person } = world(sex, 10)
		let low = Infinity
		let high = -Infinity
		for (let seed = 1; seed <= 4000; seed++) {
			reseed(people, person, seed)
			low = Math.min(low, people.persons.baseHealth[person])
			high = Math.max(high, people.persons.baseHealth[person])
		}
		expect(low).toBeGreaterThanOrEqual(4.5 + 0.5 * sex)
		expect(high).toBeLessThan(5 + 0.5 * sex)
		expect(high - low).toBeGreaterThan(0.49)
	}
	expect(
		[-1, 0, 0.01, 1, 1.01, 3, 3.01, 5, 5.01, 7, 7.01].map(HEALTH.band),
	).toEqual([
		"Dying",
		"Dying",
		"Near death",
		"Near death",
		"Poor",
		"Poor",
		"Fine",
		"Fine",
		"Good",
		"Good",
		"Excellent",
	])
	const channels = [
		...Object.values(HEALTH.channels),
		...Object.values(LIFESPAN.channels),
	]
	expect(new Set(channels).size).toBe(channels.length)
	expect(Math.min(...channels)).toBeGreaterThanOrEqual(1000)
	expect(Math.max(...channels)).toBeLessThanOrEqual(1040)
})

it("combines the background hazard and health mortality over exact birthday segments", () => {
	const at = (health: number, from: number, to: number) =>
		LIFESPAN.survival({ birth: 0, health, from, to })
	expect(at(5, 20, 21)).toBeCloseTo(0.988, 12)
	expect(at(3, 20, 21)).toBeCloseTo(0.988, 12)
	expect(at(1.5, 20, 21)).toBeCloseTo(0.988 * (1 - 0.0625) ** 12, 12)
	expect(at(0, 20, 21)).toBeCloseTo(0.988 * 0.75 ** 12, 12)
	expect(at(1.5, 20, 20.5)).toBeCloseTo(0.988 ** 0.5 * (1 - 0.0625) ** 6, 12)
	expect(at(5, 0.5, 1.5)).toBeCloseTo(0.9 ** 0.5 * 0.97 ** 0.5, 12)
	expect(at(5, 4.25, 5.25)).toBeCloseTo(0.97 ** 0.75 * 0.995 ** 0.25, 12)
	expect(at(5, 15.9, 16.9)).toBeCloseTo(0.995 ** 0.1 * 0.988 ** 0.9, 12)
	// World-year intervals of any birth offset cover each age band exactly once.
	for (const offset of [0, 0.01, 0.5, 0.99]) {
		let survival = 1
		for (let year = 100; year < 117; year++) {
			const from = Math.max(100 + offset, year)
			const to = Math.min(116 + offset, year + 1)
			if (to > from)
				survival *= LIFESPAN.survival({
					birth: 100 + offset,
					health: 5,
					from,
					to,
				})
		}
		expect(survival).toBeCloseTo(0.9 * 0.97 ** 4 * 0.995 ** 11, 12)
	}
})

it("projects a death inside its interval at the survival rate, with separate newborn rolls", () => {
	const cases = [
		{ birth: 0, health: 1.5, from: 30, to: 31 },
		{ birth: 0, health: 5, from: 0.25, to: 1.75 },
		{ birth: 100.4, health: 5, from: 100.4, to: 101 },
	]
	for (const interval of cases) {
		let deaths = 0
		const seeds = 60000
		const segment = [0, 0]
		for (let seed = 1; seed <= seeds; seed++) {
			const death = LIFESPAN.project({ ...interval, seed, year: 30 })
			if (death === Infinity) continue
			deaths++
			expect(death).toBeGreaterThan(interval.from)
			expect(death).toBeLessThanOrEqual(interval.to)
			segment[death <= interval.birth + 1 ? 0 : 1]++
		}
		const expected = 1 - LIFESPAN.survival(interval)
		expect(Math.abs(deaths / seeds - expected)).toBeLessThan(0.006)
		if (interval.from === 0.25) {
			// Deaths split between the infant and child segments by their mass.
			const infant = 1 - 0.9 ** 0.75
			const child = 0.9 ** 0.75 * (1 - 0.97 ** 0.75)
			expect(
				Math.abs(segment[0] / deaths - infant / (infant + child)),
			).toBeLessThan(0.02)
		}
	}
	const same = { birth: 0, health: 1.5, from: 30, to: 31, seed: 77 }
	expect(LIFESPAN.project({ ...same, year: 30 })).toBe(
		LIFESPAN.project({ ...same, year: 30 }),
	)
	let differing = 0
	for (let seed = 1; seed <= 2000; seed++)
		if (
			(LIFESPAN.project({ ...same, seed, year: 30 }) === Infinity) !==
			(LIFESPAN.project({ ...same, seed, year: 31 }) === Infinity)
		)
			differing++
	expect(differing).toBeGreaterThan(200)
})

it("ages each completed year once from 25 and never restores lost health", () => {
	const { people, person, clock } = world(0, 0)
	const table = people.persons
	people.alive = [person]
	const losses = new Array<number>(81).fill(0)
	const seeds = 4000
	for (let seed = 1; seed <= seeds; seed++) {
		reseed(people, person, seed)
		table.healthIntervalEnd[person] = Infinity
		let before = table.baseHealth[person]
		for (let year = 1; year <= 80; year++) {
			clock.time = year
			HEALTH.runYear({ people, time: year })
			const after = table.baseHealth[person]
			expect(after).toBeLessThanOrEqual(before)
			if (after < before) {
				expect(before - after).toBeCloseTo(0.125, 12)
				losses[year]++
			}
			HEALTH.runYear({ people, time: year })
			expect(table.baseHealth[person]).toBe(after)
			before = after
		}
	}
	for (let age = 1; age < 25; age++) expect(losses[age]).toBe(0)
	const chance = (age: number) => Math.min(1, 0.075 + 0.022 * (age - 25))
	for (const age of [25, 30, 44])
		expect(Math.abs(losses[age] / seeds - chance(age))).toBeLessThan(0.025)
	// Fragile Bones ages its sufferers faster, so the later rate only rises.
	expect(losses[60] / seeds).toBeGreaterThan(chance(60) - 0.025)
	expect(losses[60] / seeds).toBeLessThan(chance(63) + 0.025)
	for (const age of [68, 80]) expect(losses[age]).toBe(seeds)
})

it("lets physique and congenital health raise effective health and survival", () => {
	const { people, person } = world(0, 0)
	const table = people.persons
	reseed(people, person, 4242)
	const plain = HEALTH.effective({ people, person, time: 30 })
	expect(plain).toBe(table.baseHealth[person])
	const graded: number[] = []
	for (const grade of [-3, -2, -1, 1, 2, 3]) {
		table.grades[person] = 3 | ((3 + grade) << 7) | (3 << 14)
		graded.push(HEALTH.effective({ people, person, time: 30 }) - plain)
	}
	table.grades[person] = NEUTRAL_GRADES
	expect(graded).toEqual([-1, -0.5, -0.25, 0.25, 0.5, 1])
	for (const boost of [0.25, 0.5, 1])
		for (const health of [0.5, 1.5, 2.5, 2.9])
			expect(
				LIFESPAN.survival({
					birth: 0,
					health: health + boost,
					from: 50,
					to: 51,
				}),
			).toBeGreaterThan(
				LIFESPAN.survival({ birth: 0, health, from: 50, to: 51 }),
			)
	expect(LIFESPAN.survival({ birth: 0, health: 4, from: 50, to: 51 })).toBe(
		LIFESPAN.survival({ birth: 0, health: 3, from: 50, to: 51 }),
	)
})

it("reads pregnancy complications from the mother's current health and earlier births", () => {
	const weights = (health: number) =>
		[0, 2, 4].map((earlier) => FERTILITY.smoothWeight({ health, earlier }))
	expect(weights(5.01)).toEqual([215, 220, 225])
	expect(weights(5)).toEqual([205, 210, 215])
	expect(weights(3.01)).toEqual([205, 210, 215])
	expect(weights(3)).toEqual([190, 195, 200])
	expect(weights(0)).toEqual([190, 195, 200])
})

it("replays an offline life to the same health and death as living it year by year", () => {
	let dead = 0
	let alive = 0
	for (let seed = 1; seed <= 400; seed++) {
		const lived = world(seed % 2 === 0 ? 0 : 1, 100.3)
		const table = lived.people.persons
		table.nameSeed[lived.person] = seed
		table.death[lived.person] = Infinity
		lived.clock.time = 100.3
		HEALTH.replay({
			people: lived.people,
			person: lived.person,
			survives: 100.3,
		})
		lived.people.alive = [lived.person]
		for (let year = 101; year <= 160; year++) {
			lived.clock.time = year
			HEALTH.runYear({ people: lived.people, time: year })
		}
		const offline = world(seed % 2 === 0 ? 0 : 1, 100.3)
		offline.people.persons.nameSeed[offline.person] = seed
		offline.people.persons.death[offline.person] = Infinity
		offline.clock.time = 160.5
		HEALTH.replay({
			people: offline.people,
			person: offline.person,
			survives: 100.3,
		})
		expect(offline.people.persons.death[offline.person]).toBe(
			table.death[lived.person],
		)
		expect(offline.people.persons.baseHealth[offline.person]).toBe(
			table.baseHealth[lived.person],
		)
		expect(offline.people.persons.healthIntervalEnd[offline.person]).toBe(
			table.healthIntervalEnd[lived.person],
		)
		if (table.death[lived.person] === Infinity) alive++
		else dead++

		// A known survival date suppresses every earlier death.
		const starter = world(seed % 2 === 0 ? 0 : 1, 100.3)
		starter.people.persons.nameSeed[starter.person] = seed
		starter.people.persons.death[starter.person] = Infinity
		starter.clock.time = 150
		HEALTH.replay({
			people: starter.people,
			person: starter.person,
			survives: 150,
		})
		expect(starter.people.persons.death[starter.person]).toBeGreaterThan(150)
		expect(starter.people.persons.healthAgeYear[starter.person]).toBe(49)
		expect(starter.people.persons.healthIntervalEnd[starter.person]).toBe(151)
	}
	expect(dead).toBeGreaterThan(100)
	expect(alive).toBeGreaterThan(5)
})

it("starts every ruler alive with a health snapshot, then records bands and causes as they happen", () => {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	const table = engine.people.persons
	const start = engine.time
	const startYears = start / STATE.yearMs
	const initial = engine.journal[0].people
	if (!initial) throw new Error("Missing initial people packet")
	let living = 0
	for (let index = 0; index < initial.count; index++) {
		const row = PEOPLE_LOG.read({ rows: initial, index })
		expect(["health_band", "death"]).not.toContain(row.kind)
		if (row.kind !== "creation") continue
		expect(initial.healthBand[row.snapshot]).toBe(
			table.healthFlags[row.person] & 7,
		)
		if (initial.death[row.snapshot] === Infinity) living++
		else expect(initial.death[row.snapshot]).toBeLessThanOrEqual(startYears)
	}
	expect(living).toBeGreaterThan(0)
	for (let seat = 0; seat < engine.P; seat++) {
		const ruler = engine.people.rulerOf[seat]
		if (ruler < 0) continue
		expect(table.death[ruler]).toBeGreaterThan(startYears)
		expect(table.healthIntervalEnd[ruler]).toBe(startYears + 1)
	}
	for (let person = 0; person < table.sex.length; person++) {
		const mother = table.mother[person]
		if (mother >= 0)
			expect(table.death[mother]).toBeGreaterThanOrEqual(table.birth[person])
		const father = table.father[person]
		if (father >= 0)
			expect(table.death[father]).toBeGreaterThan(
				table.birth[person] - 280 / 365,
			)
	}
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: start + STATE.deltaYear(15),
		rng: HISTORY_RNG.createHistoryRng(seed + 99999),
		validate: false,
	})
	const deaths = new Map<number, number>()
	const causes = new Set<string>()
	for (const { people: packet } of engine.journal)
		for (let index = 0; index < (packet?.count ?? 0); index++) {
			const row = PEOPLE_LOG.read({ rows: packet ?? initial, index })
			if (row.kind === "death") {
				expect(deaths.has(row.person)).toBe(false)
				deaths.set(row.person, row.time)
				causes.add(row.cause)
			}
			if (row.kind === "health_band")
				expect(row.time).toBeLessThanOrEqual(deaths.get(row.person) ?? Infinity)
		}
	expect(causes.has("natural")).toBe(true)
	expect(causes.has("childbirth")).toBe(true)
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const people = state.record.people as PeopleRecord
	const offsetMs = DATE.earthHistoryStartYear * STATE.yearMs
	const timeMs = engine.time - offsetMs
	const now = engine.time / STATE.yearMs
	let checked = 0
	let changed = 0
	for (let id = 0; id < PEOPLE_RECORD.count(people); id++) {
		const recorded = PERSON_QUERY.health({ people, id, timeMs })
		if (table.death[id] <= now) {
			expect(recorded).toBeNull()
			continue
		}
		expect(recorded).toBe(
			HEALTH.recorded({ people: engine.people, person: id }),
		)
		if (engine.people.alive.includes(id))
			expect(recorded).toBe(
				HEALTH.band(
					HEALTH.effective({ people: engine.people, person: id, time: now }),
				),
			)
		checked++
		if (people.persons.lastHealth[id] >= 0) changed++
		// Before the simulation began no health is known for a starter.
		if (table.birth[id] < startYears - 1)
			expect(
				PERSON_QUERY.health({ people, id, timeMs: start - offsetMs - 1 }),
			).toBeNull()
		expect(DEATH_SCHEDULE.revisionOf({ state: engine, person: id }) > 0).toBe(
			table.death[id] !== Infinity,
		)
	}
	expect(checked).toBeGreaterThan(100)
	expect(changed).toBeGreaterThan(10)
}, 300000)

const XP_COLUMNS = [
	"infirmXp",
	"cloudedEyesXp",
	"fragileBonesXp",
	"witheringMindXp",
	"falteringHeartXp",
] as const

function clearConditions(people: PeopleState, person: number): void {
	const table = people.persons
	for (const column of XP_COLUMNS) table[column][person] = -1
	table.healthFlags[person] = 0
	table.stress[person] = 0
}

it("opens each condition at its age with CK3's age and health factors", () => {
	const base = (weight: number) => (0.75 * weight) / 885
	const chance = (condition: number, age: number, health: number) =>
		AGEING.onsetChance({ condition, age, health })
	// Infirm, Fragile Bones and Faltering Heart share the health rows.
	for (const [condition, weight] of [
		[0, 20],
		[2, 30],
		[4, 30],
	]) {
		expect(chance(condition, 50, 5)).toBe(0)
		expect(chance(condition, 50, 4.99)).toBeCloseTo(base(weight) * 0.8, 12)
		expect(chance(condition, 50, 3)).toBeCloseTo(base(weight) * 0.8, 12)
		expect(chance(condition, 50, 2.99)).toBeCloseTo(base(weight) * 2, 12)
		expect(chance(condition, 50, 1.01)).toBeCloseTo(base(weight) * 2, 12)
		expect(chance(condition, 50, 1)).toBeCloseTo(base(weight) * 10, 12)
		expect(chance(condition, 60, 5)).toBeCloseTo(base(weight), 12)
		expect(chance(condition, 60, 2)).toBeCloseTo(base(weight) * 2, 12)
		expect(chance(condition, 61, 5)).toBeCloseTo(base(weight) * 2, 12)
	}
	expect(chance(0, 71, 5)).toBeCloseTo(base(20) * 2, 12)
	expect(chance(4, 70, 5)).toBeCloseTo(base(30) * 2, 12)
	expect(chance(4, 71, 5)).toBeCloseTo(base(30) * 4, 12)
	expect(chance(4, 80, 5)).toBeCloseTo(base(30) * 4, 12)
	expect(chance(4, 81, 5)).toBeCloseTo(base(30) * 12, 12)
	expect(chance(4, 81, 1)).toBe(1)
	expect(chance(4, 61, 1)).toBeCloseTo(base(30) * 20, 12)
	expect(chance(1, 50, 5)).toBeCloseTo(base(20) * 0.35, 12)
	expect(chance(1, 50, 3)).toBeCloseTo(base(20) * 0.5, 12)
	expect(chance(1, 50, 2.99)).toBeCloseTo(base(20), 12)
	expect(chance(1, 60, 5)).toBeCloseTo(base(20), 12)
	expect(chance(1, 81, 0.5)).toBeCloseTo(base(20) * 2, 12)
	expect(chance(3, 55, 5)).toBeCloseTo(base(30) * 0.08, 12)
	expect(chance(3, 55, 3)).toBeCloseTo(base(30) * 0.8, 12)
	expect(chance(3, 55, 1)).toBeCloseTo(base(30), 12)
	expect(chance(3, 71, 1)).toBeCloseTo(base(30) * 4, 12)
	expect(chance(3, 81, 1)).toBeCloseTo(base(30) * 12, 12)

	// Age floors and susceptibility, over many seeds at poor health.
	const { people, person } = world(0, 0)
	const table = people.persons
	const seeds = 3000
	const ever = [0, 0, 0, 0, 0]
	for (let seed = 1; seed <= seeds; seed++) {
		table.nameSeed[person] = seed
		clearConditions(people, person)
		const step = (age: number) =>
			AGEING.step({
				people,
				person,
				age,
				health: 2,
				prowess: 6,
				stressLevel: 0,
				led: false,
			})
		for (let age = 16; age < 45; age++) expect(step(age)).toEqual([])
		for (let age = 45; age < 50; age++)
			for (const change of step(age)) expect(change.condition).not.toBe(3)
		for (let age = 50; age < 450; age++) step(age)
		const levels = AGEING.levels({ people, person })
		for (let condition = 0; condition < 5; condition++)
			if (levels[condition] >= 0 || (condition === 1 && levels[5] >= 0))
				ever[condition]++
	}
	expect(ever[0]).toBe(seeds)
	for (const condition of [1, 2, 3, 4])
		expect(Math.abs(ever[condition] / seeds - 0.8)).toBeLessThan(0.03)
})

it("progresses a condition from the year after it began, by CK3's weighted gains", () => {
	const options = (
		condition: number,
		inputs: Partial<{
			age: number
			health: number
			prowess: number
			stressLevel: number
			led: boolean
		}>,
	) =>
		AGEING.progressOptions({
			condition,
			age: 50,
			health: 2,
			prowess: 6,
			stressLevel: 0,
			led: false,
			...inputs,
		}).map((option) => [option.xp, option.weight])
	expect(options(0, { age: 49 })).toEqual([
		[8, 50],
		[4, 66],
		[12, 0],
	])
	expect(options(0, { age: 50, health: 3, prowess: 12 })).toEqual([
		[8, 50],
		[4, 72],
		[12, -25],
	])
	expect(options(0, { age: 65 })).toEqual([
		[8, 75],
		[4, 66],
		[12, 50],
	])
	expect(options(0, { age: 65, health: 3 })).toEqual([
		[8, 50],
		[4, 66],
		[12, 25],
	])
	expect(options(3, {})).toEqual([
		[50, 9],
		[8, 48],
		[4, 75],
		[1, 10],
	])
	expect(options(3, { stressLevel: 2 })).toEqual([
		[50, 13],
		[8, 56],
		[4, 75],
		[1, 0],
	])
	expect(options(2, {})).toEqual([
		[3, 25],
		[6, 75],
		[12, 0],
	])
	expect(options(2, { led: true })).toEqual([
		[3, 25],
		[6, 75],
		[12, 100],
	])
	expect(options(1, {})).toEqual([
		[15, 5],
		[9, 20],
		[3, 75],
	])
	expect(options(4, {})).toEqual([])

	const { people, person } = world(0, 0)
	const table = people.persons
	const gains = [new Map<number, number>(), new Map<number, number>()]
	const seeds = 20000
	for (let seed = 1; seed <= seeds; seed++) {
		table.nameSeed[person] = seed
		clearConditions(people, person)
		table.cloudedEyesXp[person] = 0
		table.falteringHeartXp[person] = 0
		for (const [index, led] of [false, true].entries()) {
			table.fragileBonesXp[person] = 0
			AGEING.step({
				people,
				person,
				age: 30 + index,
				health: 2,
				prowess: 6,
				stressLevel: 0,
				led,
			})
			const gain = table.fragileBonesXp[person]
			gains[index].set(gain, (gains[index].get(gain) ?? 0) + 1)
		}
		expect(table.falteringHeartXp[person]).toBe(0)
		expect([3, 9, 15, 6, 12, 18, 24, 30]).toContain(table.cloudedEyesXp[person])
	}
	expect([...gains[0].keys()].sort((a, b) => a - b)).toEqual([3, 6])
	expect(Math.abs((gains[0].get(3) ?? 0) / seeds - 0.25)).toBeLessThan(0.01)
	expect(Math.abs((gains[1].get(12) ?? 0) / seeds - 0.5)).toBeLessThan(0.012)

	// A condition gained this year has no XP until the next pulse.
	for (let seed = 1; seed <= 300; seed++) {
		table.nameSeed[person] = seed
		clearConditions(people, person)
		for (let age = 45; age < 120; age++) {
			const before = AGEING.levels({ people, person })
			const changes = AGEING.step({
				people,
				person,
				age,
				health: 2,
				prowess: 6,
				stressLevel: 0,
				led: false,
			})
			for (const change of changes)
				if (change.before === -1 && change.condition < 5) {
					expect(before[change.condition]).toBe(-1)
					expect(table[XP_COLUMNS[change.condition]][person]).toBe(0)
				}
		}
	}
})

it("sums every attained level row, replaces Clouded Eyes with Blind and ends in Incapable or death", () => {
	const none = [-1, -1, -1, -1, -1, -1, -1]
	const of = (condition: number, level: number) =>
		AGEING.effects(
			none.map((value, index) => (index === condition ? level : value)),
		)
	const clear = AGEING.effects(none)
	expect(clear.health).toBe(0)
	expect(clear.fertility).toBe(1)
	expect(clear.attributes.incapable).toBe(false)
	expect(clear.stress).toEqual({ gain: 0, loss: 0 })

	const infirm = of(0, 2)
	expect(infirm.attributes.additions).toMatchObject({
		diplomacy: -4,
		martial: -4,
		stewardship: -3,
	})
	expect(infirm.attributes.percentages.prowess).toBeCloseTo(-0.6, 12)
	expect(infirm.fertility).toBeCloseTo(0.7, 12)
	expect(infirm.health).toBeCloseTo(-0.75, 12)
	expect(infirm.attraction).toBe(-10)
	expect(of(0, 0).health).toBe(-0.25)
	expect(of(0, 4).health).toBe(-1.25)
	expect(of(0, 4).fertility).toBeCloseTo(0.5, 12)
	expect(of(0, 4).attributes.percentages.prowess).toBeCloseTo(-1, 12)

	const clouded = of(1, 3)
	expect(clouded.attributes.additions).toMatchObject({
		martial: -4,
		stewardship: -1,
		intrigue: -1,
		prowess: -8,
	})
	expect(clouded.attraction).toBe(-5)

	expect([0, 1, 2, 3, 4].map((level) => of(2, level).ageingShift)).toEqual([
		3, 6, 9, 14, 24,
	])
	expect([0, 1, 2, 3, 4].map((level) => of(2, level).advantage)).toEqual([
		-3, -6, -9, -14, -24,
	])
	expect(of(2, 4).attributes.percentages.prowess).toBeCloseTo(-0.5, 12)

	const mind = of(3, 2)
	expect(mind.attributes.additions.learning).toBe(-2)
	expect(mind.attributes.percentages.diplomacy).toBeCloseTo(-0.5, 12)
	expect(mind.attributes.percentages.prowess).toBe(0)
	expect(mind.stress.gain).toBeCloseTo(0.6, 12)

	const heart = of(4, 3)
	expect(heart.attributes.additions.prowess).toBe(-4)
	expect(heart.health).toBeCloseTo(-0.4, 12)
	expect(heart.stress.gain).toBeCloseTo(0.8, 12)
	expect(heart.stress.loss).toBeCloseTo(-0.8, 12)

	const blind = of(5, 0)
	expect(blind.attributes.additions).toMatchObject({
		martial: -6,
		stewardship: -2,
		intrigue: -2,
		prowess: -10,
	})
	expect(blind.health).toBe(-0.25)
	expect(blind.attraction).toBe(-10)
	const incapable = of(6, 0)
	expect(incapable.attributes.incapable).toBe(true)
	expect(incapable.health).toBe(-2)

	const several = AGEING.effects([1, -1, 0, -1, 0, 0, -1])
	expect(several.health).toBeCloseTo(-0.5 - 0.1 - 0.25, 12)
	expect(several.ageingShift).toBe(3)

	// The terminal levels.
	const { people, person } = world(0, 0)
	const table = people.persons
	clearConditions(people, person)
	table.cloudedEyesXp[person] = 98
	table.witheringMindXp[person] = 99
	const changes = AGEING.step({
		people,
		person,
		age: 70,
		health: 2,
		prowess: 6,
		stressLevel: 0,
		led: false,
	})
	expect(table.cloudedEyesXp[person]).toBe(-1)
	expect(table.witheringMindXp[person]).toBe(100)
	expect(AGEING.blind({ people, person })).toBe(true)
	expect(AGEING.incapable({ people, person })).toBe(true)
	expect(
		changes.filter((change) => [1, 3, 5, 6].includes(change.condition)),
	).toEqual([
		{ condition: 1, before: 3, after: -1 },
		{ condition: 3, before: 3, after: 4 },
		{ condition: 5, before: -1, after: 0 },
		{ condition: 6, before: -1, after: 0 },
	])
	for (let age = 71; age < 200; age++)
		for (const change of AGEING.step({
			people,
			person,
			age,
			health: 2,
			prowess: 6,
			stressLevel: 0,
			led: false,
		}))
			expect([1, 3, 5, 6]).not.toContain(change.condition)
	expect(
		ATTRIBUTES.effective({
			conditions: HEALTH.attributeConditions({ people, person }),
			character: { ...CHARACTER.of({ people, person }), bases: 0x666666 },
			age: 70,
			attribute: "martial",
		}),
	).toBe(0)
	expect(HEALTH.fertility({ people, person })).toBeLessThanOrEqual(1)

	clearConditions(people, person)
	expect(AGEING.heartRise({ people, person })).toEqual({
		terminal: false,
		change: null,
	})
	table.falteringHeartXp[person] = 0
	expect([1, 2, 3, 4].map(() => AGEING.heartRise({ people, person }))).toEqual([
		{ terminal: false, change: { condition: 4, before: 0, after: 1 } },
		{ terminal: false, change: { condition: 4, before: 1, after: 2 } },
		{ terminal: false, change: { condition: 4, before: 2, after: 3 } },
		{ terminal: true, change: { condition: 4, before: 3, after: 4 } },
	])
	expect(AGEING.heartRise({ people, person }).terminal).toBe(false)
})

it("reproduces the planned kernel: a minority become Incapable or Blind and no calm heart fails", () => {
	const lives = 200000
	const reached = {
		count: 0,
		incapable: 0,
		blind: 0,
		heart: 0,
		incapableYears: 0,
	}
	const ages: [number[], number[]] = [[], []]
	for (const sex of [0, 1] as const) {
		const { people, person, clock } = world(sex, 0)
		const table = people.persons
		people.alive = [person]
		for (let life = 0; life < lives / 2; life++) {
			table.nameSeed[person] = 1 + life * 2 + sex
			table.personality[person] = NO_PERSONALITY
			table.grades[person] = NEUTRAL_GRADES
			table.congenital[person] = 0
			table.bases[person] = 0x655555
			table.death[person] = Infinity
			clearConditions(people, person)
			clock.time = 16
			HEALTH.replay({ people, person, survives: 16 })
			people.log.count = 0
			let incapableAt = -1
			for (let year = 17; table.death[person] === Infinity; year++) {
				clock.time = year
				const result = HEALTH.runYear({ people, time: year })
				if (result.incapacitated.length > 0) incapableAt = year
				people.log.count = 0
			}
			const death = table.death[person]
			ages[sex].push(death)
			if (death <= 50) continue
			reached.count++
			if (AGEING.blind({ people, person })) reached.blind++
			if (table.falteringHeartXp[person] >= 100) reached.heart++
			if (incapableAt >= 0) {
				reached.incapable++
				reached.incapableYears += death - incapableAt
			}
		}
	}
	const incapableShare = reached.incapable / reached.count
	const blindShare = reached.blind / reached.count
	const incapableYears = reached.incapableYears / Math.max(1, reached.incapable)
	const median = (values: number[]) =>
		[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
	process.stdout.write(
		`kernel: reached 50 ${reached.count}, incapable ${(100 * incapableShare).toFixed(2)}%, blind ${(100 * blindShare).toFixed(2)}%, incapable years ${incapableYears.toFixed(2)}, median death men ${median(ages[0]).toFixed(1)} women ${median(ages[1]).toFixed(1)}\n`,
	)
	expect(reached.heart).toBe(0)
	expect(incapableShare).toBeGreaterThanOrEqual(0.04)
	expect(incapableShare).toBeLessThanOrEqual(0.07)
	expect(blindShare).toBeGreaterThanOrEqual(0.005)
	expect(blindShare).toBeLessThanOrEqual(0.015)
	expect(incapableYears).toBeGreaterThanOrEqual(0.5)
	expect(incapableYears).toBeLessThanOrEqual(0.9)
}, 900000)
