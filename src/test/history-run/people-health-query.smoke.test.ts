import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { PEOPLE } from "@/model/history/sim/people"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { AppendedRow } from "@/model/history/sim/people/log/types"
import type { PeopleState } from "@/model/history/sim/people/types"
import { RNG } from "@/model/shared/random/rng"

const ORIGIN = { realm: 0, culture: 0, genderSystem: 0 }

// A record in simulation years: a starter with conditions, a child born in
// the simulation, and an ancestor who was dead when created.
function fixture() {
	const people = PEOPLE.create(4)
	const clock = { time: 100 }
	people.household = { ...people.household, time: () => clock.time }
	const record = PEOPLE_RECORD.create()
	const flush = () =>
		PEOPLE_RECORD.append({
			record,
			packet: PEOPLE_LOG.seal({ people, sovereign: () => true }),
			timeMs: clock.time,
			recordTime: (years) => years,
		})
	const spawn = (birth: number, survives: number) =>
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex: 0,
			birth,
			survives,
			father: -1,
			mother: -1,
			dynasty: 0,
			origin: ORIGIN,
			rng: RNG.createRng({ seed: 11 }),
		})
	const starter = spawn(40, 1000)
	const ancestor = spawn(20, 1000)
	const table = people.persons
	table.death[starter] = Infinity
	table.death[ancestor] = 90
	table.healthFlags[starter] = PEOPLE_LOG.healthBands.indexOf("Fine")
	table.healthFlags[ancestor] = PEOPLE_LOG.healthBands.indexOf("Poor")
	people.log.count = 0
	const log = (row: AppendedRow) => PEOPLE_LOG.append({ log: people.log, row })
	const condition = (
		time: number,
		name: (typeof PEOPLE_LOG.conditions)[number],
		before: number,
		after: number,
	) =>
		log({
			kind: "condition",
			time,
			person: starter,
			condition: name,
			before,
			after,
		})
	condition(100, "infirm", -1, 0)
	condition(100, "clouded_eyes", -1, 2)
	flush()
	clock.time = 100.5
	const child = spawn(100.5, 1000)
	table.death[child] = Infinity
	table.healthFlags[child] = PEOPLE_LOG.healthBands.indexOf("Good")
	people.log.count = 0
	flush()
	clock.time = 110
	condition(110, "clouded_eyes", 2, 3)
	log({ kind: "health_band", time: 110, person: starter, band: "Poor" })
	flush()
	clock.time = 112
	condition(112, "clouded_eyes", 3, -1)
	condition(112, "blind", -1, 0)
	log({ kind: "health_band", time: 112, person: starter, band: "Near death" })
	flush()
	clock.time = 115
	log({ kind: "death", time: 115, person: starter, cause: "battle" })
	flush()
	return { people, record, starter, ancestor, child }
}

function scramble(people: PeopleState): void {
	const table = people.persons
	for (let person = 0; person < table.sex.length; person++) {
		table.baseHealth[person] = 0
		table.death[person] = 1
		table.healthFlags[person] = 0
		table.cloudedEyesXp[person] = 77
	}
}

it("answers health, conditions and causes from the record alone, at the selected time", () => {
	const { people: sim, record: people, starter, ancestor, child } = fixture()
	// Nothing below may read the simulation: its health is wiped first.
	scramble(sim)
	const health = (id: number, timeMs: number) =>
		PERSON_QUERY.health({ people, id, timeMs })
	// A starter has no recorded health before the simulation began.
	expect(health(starter, 39)).toBeNull()
	expect(health(starter, 99.9)).toBeNull()
	expect(health(starter, 100)).toBe("Fine")
	expect(health(starter, 109.9)).toBe("Fine")
	expect(health(starter, 110)).toBe("Poor")
	expect(health(starter, 114.9)).toBe("Near death")
	expect(health(starter, 115)).toBeNull()
	// A child's snapshot holds from birth; the unborn have none.
	expect(health(child, 100.4)).toBeNull()
	expect(health(child, 100.5)).toBe("Good")
	expect(health(child, 500)).toBe("Good")
	// Someone dead when created never has recorded health.
	for (const timeMs of [30, 89, 90, 200])
		expect(health(ancestor, timeMs)).toBeNull()
	expect(PEOPLE_RECORD.deathTimeMs({ people, id: ancestor })).toBe(90)
	expect(PEOPLE_RECORD.deathTimeMs({ people, id: child })).toBe(Infinity)

	const conditions = (timeMs: number) =>
		PERSON_QUERY.conditions({ people, id: starter, timeMs })
	expect(conditions(99)).toEqual([])
	expect(conditions(100)).toEqual([
		{ condition: "infirm", level: 0 },
		{ condition: "clouded_eyes", level: 2 },
	])
	expect(conditions(111)).toEqual([
		{ condition: "infirm", level: 0 },
		{ condition: "clouded_eyes", level: 3 },
	])
	expect(conditions(112)).toEqual([
		{ condition: "infirm", level: 0 },
		{ condition: "blind", level: 0 },
	])
	// After death the record keeps the conditions the person died with.
	expect(conditions(300)).toEqual(conditions(114))
	expect(PERSON_QUERY.conditions({ people, id: child, timeMs: 300 })).toEqual(
		[],
	)

	const martial = (timeMs: number) =>
		PERSON_QUERY.attributes({ people, id: starter, timeMs }).find(
			(entry) => entry.name === "martial",
		)?.value
	const person = PEOPLE_RECORD.person({ people, id: starter })
	if (!person) throw new Error("Missing starter")
	const expected = (levels: number[], age: number) =>
		ATTRIBUTES.effective({
			conditions: [AGEING.effects(levels).attributes],
			character: person,
			age,
			attribute: "martial",
		})
	expect(martial(105)).toBe(expected([0, 2, -1, -1, -1, -1, -1], 65))
	expect(martial(113)).toBe(expected([0, -1, -1, -1, -1, 0, -1], 73))
	expect(martial(99)).toBe(expected([-1, -1, -1, -1, -1, -1, -1], 59))

	expect(
		PERSON_QUERY.deathCause({ people, id: starter, timeMs: 114.9 }),
	).toBeNull()
	expect(PERSON_QUERY.deathCause({ people, id: starter, timeMs: 115 })).toBe(
		"battle",
	)
	expect(PERSON_QUERY.deathCause({ people, id: ancestor, timeMs: 200 })).toBe(
		"natural",
	)
	expect(PERSON_QUERY.deathCause({ people, id: child, timeMs: 200 })).toBeNull()

	const blind = PEOPLE_LOG.conditions.indexOf("blind")
	const clouded = PEOPLE_LOG.conditions.indexOf("clouded_eyes")
	const infirm = PEOPLE_LOG.conditions.indexOf("infirm")
	const timeline = (timeMs: number) =>
		PERSON_QUERY.timeline({ people, id: starter, timeMs })
			.filter((event) => event.kind !== "born")
			.map((event) => [event.timeMs, event.kind, event.other])
	expect(timeline(300)).toEqual([
		[100, "condition gained", infirm],
		[100, "condition gained", clouded],
		[110, "condition worsened", clouded],
		[112, "condition lost", clouded],
		[112, "became blind", blind],
		[115, "killed in battle", -1],
	])
	expect(timeline(111)).toEqual(timeline(300).slice(0, 3))
	expect(timeline(99)).toEqual([])
})
