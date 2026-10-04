import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { COMMAND } from "@/model/history/sim/engine/events/battle/command"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { STRESS_EVENTS } from "@/model/history/sim/engine/events/people/stress"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { CHARACTER } from "@/model/history/sim/people/character"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { STRESS } from "@/model/history/sim/people/stress"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { PeopleState } from "@/model/history/sim/people/types"
import { HASH } from "@/model/shared/random/hash"
import { RNG } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"
import { PEOPLE_TRAITS_REPORT } from "@/test/history-run/report/people-traits"

// Stress levels a person's pending rows carry, in append order.
function stressLevels({
	people,
	person,
}: {
	people: PeopleState
	person: number
}): number[] {
	const levels: number[] = []
	for (let index = 0; index < people.log.count; index++) {
		const row = PEOPLE_LOG.read({ rows: people.log, index })
		if (row.kind === "stress" && row.person === person) levels.push(row.level)
	}
	return levels
}

it("draws only the name seed and fertility from the shared stream at spawn, and redraw consumes none", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 318 })
	const control = RNG.createRng({ seed: 318 })
	const seed = PEOPLE.nameSeed({ sex: 0, genderSystem: 1, rng: control })
	const fertility = 0.5 + 0.1 * control.random()
	const person = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people,
		sex: 0,
		birth: 0,
		survives: 0,
		father: -1,
		mother: -1,
		dynasty: 0,
		origin: { realm: 0, culture: 0, genderSystem: 1 },
		rng,
	})
	expect(people.persons.death[person]).toBe(Infinity)
	expect(people.persons.nameSeed[person]).toBe(seed)
	expect(people.persons.fertility[person]).toBe(fertility)
	PEOPLE.redraw({ people, person })
	expect(rng.random()).toBe(control.random())
})
it("draws valid, reproducible character and expected founder personality distributions", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 721 })
	const frequencies = new Map<string, number>()
	for (let person = 0; person < 20000; person++) {
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex: 0,
			birth: 0,
			survives: 0,
			father: -1,
			mother: -1,
			dynasty: 0,
			origin: { realm: 0, culture: 0, genderSystem: 1 },
			rng,
		})
		const character = CHARACTER.of({ people, person })
		expect(TRAITS.draw({ table: people.persons, person })).toEqual({
			personality: character.personality,
			grades: character.grades,
			congenital: character.congenital,
			carried: character.carried,
		})
		expect(ATTRIBUTES.draw({ table: people.persons, person })).toEqual({
			bases: character.bases,
		})
		for (let i = 0; i < 6; i++)
			expect((character.bases >>> (i * 4)) & 15).toBeLessThanOrEqual(10)
		const traits = TRAITS.active({ character, age: 16 })
		expect(new Set(traits).size).toBe(3)
		const codes = [0, 6, 12].map(
			(shift) => (character.personality >>> shift) & 63,
		)
		expect(
			new Set(
				codes.map((code) =>
					code < 30 ? Math.floor(code / 2) : code < 33 ? 15 : 16,
				),
			).size,
		).toBe(3)
		for (const trait of traits)
			frequencies.set(trait, (frequencies.get(trait) ?? 0) + 1)
		expect(character.congenital & character.carried).toBe(0)
		expect(character.congenital & 3).not.toBe(3)
		for (const ladder of ["intellect", "physique", "beauty"] as const) {
			const grade = TRAITS.grade({ character, ladder })
			expect(Math.abs(grade.active)).toBeLessThanOrEqual(3)
			expect(grade.good === 0 || grade.good > Math.max(0, grade.active)).toBe(
				true,
			)
			expect(grade.bad === 0 || grade.bad > Math.max(0, -grade.active)).toBe(
				true,
			)
		}
	}
	expect(frequencies.size).toBe(36)
	for (const [trait, count] of frequencies) {
		const share = count / 20000
		expect(share).toBeGreaterThan(trait === "eccentric" ? 0.002 : 0.04)
		expect(share).toBeLessThan(trait === "eccentric" ? 0.01 : 0.11)
	}
})
it("inherits active and carried single traits with conditional carrier probabilities", () => {
	const people = PEOPLE.create(1)
	const table = people.persons
	table.father = [-1, -1, 0]
	table.mother = [-1, -1, 1]
	table.personality = [0, 0, 0]
	table.grades = [49539, 49539, 49539]
	table.congenital = [0, 0, 0]
	table.carried = [0, 0, 0]
	table.nameSeed = [1, 2, 3]
	for (const fixture of [
		{ a: 1, c: 1, active: 0.8, carried: 1 },
		{ a: 1, c: 2, active: 0.5, carried: 1 },
		{ a: 1, c: 0, active: 0.25, carried: 0.75 },
		{ a: 2, c: 2, active: 0.1, carried: 0.5 },
		{ a: 2, c: 0, active: 0.02, carried: 0.25 },
		{ a: 0, c: 0, active: 0.005, carried: 0 },
	]) {
		table.congenital[0] = fixture.a === 1 ? 1 : 0
		table.carried[0] = fixture.a === 2 ? 1 : 0
		table.congenital[1] = fixture.c === 1 ? 1 : 0
		table.carried[1] = fixture.c === 2 ? 1 : 0
		let active = 0
		let carried = 0
		for (let seed = 1; seed <= 20000; seed++) {
			table.nameSeed[2] = seed
			const draw = TRAITS.draw({ table, person: 2 })
			if (draw.congenital & 1) active++
			if (draw.carried & 1) carried++
		}
		expect(Math.abs(active / 20000 - fixture.active)).toBeLessThan(0.015)
		expect(
			Math.abs(carried / 20000 - (1 - fixture.active) * fixture.carried),
		).toBeLessThan(0.015)
	}
})
it("redraws descendants from final parents in birth order, leaving births and shared rng unchanged", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 221 })
	for (let person = 0; person < 4; person++)
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex: person === 1 ? 1 : 0,
			birth: person * 20,
			survives: person * 20,
			father: person === 2 ? 0 : person === 3 ? 2 : -1,
			mother: person === 2 ? 1 : -1,
			dynasty: 0,
			origin: { realm: 0, culture: 0, genderSystem: 1 },
			rng,
		})
	const before = people.persons.birth.slice()
	people.persons.nameSeed[1] = 93289
	people.persons.father[1] = 0
	PEOPLE.redraw({ people, person: 1 })
	expect(people.persons.birth).toEqual(before)
	for (const person of [1, 2, 3]) {
		const character = CHARACTER.of({ people, person })
		expect(TRAITS.draw({ table: people.persons, person })).toEqual({
			personality: character.personality,
			grades: character.grades,
			congenital: character.congenital,
			carried: character.carried,
		})
		expect(ATTRIBUTES.draw({ table: people.persons, person })).toEqual({
			bases: character.bases,
		})
	}
})
it("gates personality by age and reads stress at the selected time", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 221 })
	const id = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people,
		sex: 0,
		birth: 0,
		survives: 0,
		father: -1,
		mother: -1,
		dynasty: 0,
		origin: { realm: 0, culture: 0, genderSystem: 1 },
		rng,
	})
	const character = CHARACTER.of({ people, person: id })
	for (const [age, count] of [
		[8, 0],
		[9, 1],
		[10, 1],
		[11, 2],
		[12, 2],
		[13, 3],
	])
		expect(TRAITS.active({ character, age })).toHaveLength(count)
	const record = PEOPLE_RECORD.create()
	people.persons.death[id] = 100
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: () => true }),
		timeMs: 0,
		recordTime: (years) => years * STATE.yearMs,
	})
	expect(PEOPLE_RECORD.person({ people: record, id })).toMatchObject(character)
	record.stressOf.set(id, [
		{ person: id, timeMs: 20 * STATE.yearMs, level: 2 },
		{ person: id, timeMs: 21 * STATE.yearMs, level: 0 },
	])
	expect(
		PERSON_QUERY.attributes({ people: record, id, timeMs: 16 * STATE.yearMs }),
	).toHaveLength(6)
	expect(
		PERSON_QUERY.stress({ people: record, id, timeMs: 19 * STATE.yearMs }),
	).toBe(0)
	expect(
		PERSON_QUERY.stress({ people: record, id, timeMs: 20 * STATE.yearMs }),
	).toBe(2)
	expect(
		PERSON_QUERY.stress({ people: record, id, timeMs: 21 * STATE.yearMs }),
	).toBe(0)
})
it("uses final neutral points, effect rates, tier bands and age-independent adult attributes", () => {
	const neutralPoints = {
		diplomacy: 5.5,
		martial: 5.4,
		stewardship: 5.4,
		intrigue: 5.7,
		learning: 6,
		prowess: 5,
	}
	const rates = {
		diplomacy: -0.0125,
		martial: 0.025,
		stewardship: 0.025,
		intrigue: 0.125,
		learning: 0.0125,
	}
	expect(GOVERNOR.candidateStrength(5.5)).toBe(0)
	expect(GOVERNOR.candidateStrength(6.5)).toBe(0.025)
	for (const attribute of Object.keys(
		neutralPoints,
	) as (keyof typeof neutralPoints)[])
		expect(ATTRIBUTES.neutral(attribute)).toBe(neutralPoints[attribute])
	for (const attribute of Object.keys(rates) as (keyof typeof rates)[]) {
		const centre = attribute === "diplomacy" ? 0 : 1
		expect(
			GOVERNOR.factor({ attribute, value: neutralPoints[attribute] }),
		).toBe(centre)
		expect(
			GOVERNOR.factor({ attribute, value: neutralPoints[attribute] + 1 }),
		).toBeCloseTo(centre + rates[attribute], 14)
		for (let value = 0; value < 40; value++) {
			const first = GOVERNOR.factor({ attribute, value })
			const second = GOVERNOR.factor({ attribute, value: value + 1 })
			expect(
				attribute === "diplomacy" ? second <= first : second >= first,
			).toBe(true)
		}
	}
	for (const [value, tier] of [
		[4, "Terrible"],
		[5, "Poor"],
		[7, "Poor"],
		[8, "Poor"],
		[9, "Average"],
		[10, "Average"],
		[11, "Good"],
		[13, "Good"],
		[14, "Excellent"],
	] as const)
		expect(ATTRIBUTES.tier(value)).toBe(tier)
	const character = {
		bases: 0x555555,
		personality: 0 | (18 << 6) | (20 << 12),
		grades: 49539,
		congenital: 0,
		carried: 0,
	}
	for (const attribute of Object.keys(
		neutralPoints,
	) as (keyof typeof neutralPoints)[]) {
		const value = ATTRIBUTES.effective({
			character,
			attribute,
			age: 16,
			conditions: [],
		})
		expect(value).toBe(
			ATTRIBUTES.base({ character, attribute }) +
				TRAITS.modifier({ character, age: 16, modifier: attribute }),
		)
		expect(value).toBe(
			ATTRIBUTES.effective({ character, attribute, age: 15, conditions: [] }),
		)
	}
})
it("scales stress, caps levels and decays in peace", () => {
	const character = {
		bases: 0,

		personality: 1 | (3 << 6) | (18 << 12),
		grades: 49539,
		congenital: 0,
		carried: 0,
	}
	let value = 0
	for (let year = 0; year < 8; year++)
		value = STRESS.step({
			conditions: [],
			character,
			age: 30,
			value,
			war: true,
			attacking: true,
			revolt: false,
			debt: false,
			paying: false,
			bereavements: 0,
		})
	expect(STRESS.level(value)).toBe(3)
	expect(
		STRESS.step({
			conditions: [],
			character,
			age: 30,
			value,
			war: false,
			attacking: false,
			revolt: false,
			debt: false,
			paying: false,
			bereavements: 0,
		}),
	).toBeLessThan(value)
	expect([0, 100, 200, 300].map(STRESS.fertilityFactor)).toEqual([
		1, 0.9, 0.7, 0.5,
	])
	expect(STRESS.level(400)).toBe(3)
	const greedy = { ...character, personality: 11 | (18 << 6) | (20 << 12) }
	for (let stressLevel = 0; stressLevel <= 3; stressLevel++)
		expect(
			TRAITS.incomeFactor({ character: greedy, age: 30, stressLevel }),
		).toBeCloseTo(1.05 + 0.1 * stressLevel)
	expect(
		TRAITS.warChance({
			character: { ...character, personality: 0 | (18 << 6) | (20 << 12) },
			age: 30,
		}),
	).toBeCloseTo(1 / 1.11)
})
it("centres and bounds governor factors", () => {
	for (const attribute of [
		"diplomacy",
		"martial",
		"stewardship",
		"intrigue",
		"learning",
	] as const) {
		const neutral = ATTRIBUTES.neutral(attribute)
		expect(GOVERNOR.factor({ attribute, value: neutral })).toBeCloseTo(
			attribute === "diplomacy" ? 0 : 1,
		)
		const low = GOVERNOR.factor({ attribute, value: -100 })
		const high = GOVERNOR.factor({ attribute, value: 100 })
		expect(attribute === "diplomacy" ? high < low : high > low).toBe(true)
	}
	expect(GOVERNOR.factor({ attribute: "martial", value: 100 })).toBe(1.21)
	expect(GOVERNOR.factor({ attribute: "learning", value: -100 })).toBe(0.93)
})
it("reads current governors outside the revenue cache and resets stale stress after sovereignty ends", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const realm = Array.from({ length: state.P }, (_, p) => p).find(
		(p) => STATE.isSovereign({ state, p }) && state.people.rulerOf[p] >= 0,
	) as number
	const people = state.people
	const ruler = people.rulerOf[realm]
	const time = state.time / STATE.yearMs
	people.regencies.delete(realm)
	people.persons.birth[ruler] = time - 30
	people.persons.personality[ruler] = 11 | (18 << 6) | (20 << 12)
	people.persons.stress[ruler] = 200
	expect(GOVERNOR.stressLevel({ state, realm })).toBe(2)
	const base = ECONOMY.revenue({ state, p: realm })
	people.persons.bases[ruler] ^= 10 << 8
	expect(ECONOMY.revenue({ state, p: realm })).not.toBe(base)
	expect(COMMAND.multiplier({ state, realm })).toBeGreaterThanOrEqual(0.87)
	const ward = people.alive.find((person) => person !== ruler) as number
	PEOPLE.setRuler({
		people,
		seat: realm,
		person: ward,
		rank: state.seatRank[realm],
		reason: "unknown",
	})
	people.regencies.set(realm, {
		cause: "minority",
		ward,
		regent: ruler,
		kind: "relative",
	})
	for (const seat of [...people.persons.heldSeats[ruler]])
		PEOPLE.vacate({ people, seat, reason: "unknown" })
	expect(GOVERNOR.stressLevel({ state, realm })).toBe(0)
	expect(GOVERNOR.incomeFactor({ state, realm })).toBeCloseTo(1.05)
	people.stressed = [ruler]
	STRESS_EVENTS.runYear({ state })
	expect(people.persons.stress[ruler]).toBe(0)
	expect(stressLevels({ people, person: ruler })).toContain(0)
	people.regencies.set(realm, {
		cause: "minority",
		ward,
		regent: -1,
		kind: "council",
	})
	expect(GOVERNOR.attribute({ state, realm, attribute: "learning" })).toBe(5)
})
it("hash channels and event salts separate deterministic rolls", () => {
	const roll = HASH.unit({ seed: 9, channel: 1, salt: 0 })
	expect(roll).toBeGreaterThanOrEqual(0)
	expect(roll).toBeLessThan(1)
	expect(roll).toBe(HASH.unit({ seed: 9, channel: 1, salt: 0 }))
	expect(roll).not.toBe(HASH.unit({ seed: 9, channel: 2, salt: 0 }))
	expect(roll).not.toBe(HASH.unit({ seed: 9, channel: 1, salt: 1 }))
})

it("adds cumulative conditions before applying percentage losses once and overrides incapacity", () => {
	const character = {
		bases: 10,

		personality: 0,
		grades: 49539,
		congenital: 0,
		carried: 0,
	}
	const zero = {
		diplomacy: 0,
		martial: 0,
		stewardship: 0,
		intrigue: 0,
		learning: 0,
		prowess: 0,
	}
	const conditions = [
		{
			additions: { ...zero, diplomacy: -2 },
			percentages: { ...zero, diplomacy: -0.2 },
			incapable: false,
		},
		{
			additions: { ...zero, diplomacy: -1 },
			percentages: { ...zero, diplomacy: -0.3 },
			incapable: false,
		},
	]
	expect(
		ATTRIBUTES.effective({
			character,
			attribute: "diplomacy",
			age: 8,
			conditions,
		}),
	).toBe(3.5)
	expect(
		ATTRIBUTES.effective({
			character,
			attribute: "diplomacy",
			age: 8,
			conditions: [{ ...conditions[0], incapable: true }],
		}),
	).toBe(0)
})

it("stores both carried grade sides and handles promotion above or up to the carried tier", () => {
	const people = PEOPLE.create(1)
	const table = people.persons
	table.father = [-1, -1, 0]
	table.mother = [-1, -1, 1]
	table.nameSeed = [1, 2, 3]
	table.personality = [0, 0, 0]
	table.congenital = [0, 0, 0]
	table.carried = [0, 0, 0]
	const original = HASH.unit
	try {
		table.grades = [(49539 & ~7) | 6, (49539 & ~7) | 0, 49539]
		HASH.unit = (params) =>
			params.channel >= 200 && params.channel < 224
				? params.channel % 3 === 0
					? 0
					: 0.99
				: original(params)
		// Explicit roll channels keep both top tiers carried and every active roll failing.
		HASH.unit = (params) =>
			[201, 204, 207, 213, 216, 219].includes(params.channel)
				? 0
				: [200, 203, 206, 212, 215, 218].includes(params.channel)
					? 0.99
					: original(params)
		let character = {
			...TRAITS.draw({ table, person: 2 }),
			bases: 0,
		}
		expect(TRAITS.grade({ character, ladder: "intellect" })).toEqual({
			active: 0,
			good: 3,
			bad: 3,
		})
		table.grades = [(49539 & ~7) | 4, (49539 & ~7) | 4, 49539]
		HASH.unit = (params) =>
			[201, 204, 206, 208].includes(params.channel)
				? 0
				: [200, 203].includes(params.channel)
					? 0.99
					: original(params)
		character = { ...TRAITS.draw({ table, person: 2 }), bases: 0 }
		expect(TRAITS.grade({ character, ladder: "intellect" })).toEqual({
			active: 2,
			good: 3,
			bad: 0,
		})
		HASH.unit = (params) =>
			[204, 206, 208].includes(params.channel)
				? 0
				: [200, 201, 203].includes(params.channel)
					? 0.99
					: original(params)
		character = { ...TRAITS.draw({ table, person: 2 }), bases: 0 }
		expect(TRAITS.grade({ character, ladder: "intellect" })).toEqual({
			active: 2,
			good: 0,
			bad: 0,
		})
	} finally {
		HASH.unit = original
	}
})
it("a Genius parent transmits Genius in a quarter of draws and an active good side suppresses bad grades", () => {
	const people = PEOPLE.create(1)
	const table = people.persons
	table.father = [-1, -1, 0]
	table.mother = [-1, -1, 1]
	table.nameSeed = [1, 2, 3]
	table.personality = [0, 0, 0]
	table.congenital = [0, 0, 0]
	table.carried = [0, 0, 0]
	table.grades = [(49539 & ~7) | 6, 49539, 49539]
	let geniuses = 0
	for (let seed = 1; seed <= 10000; seed++) {
		table.nameSeed[2] = seed
		const character = {
			...TRAITS.draw({ table, person: 2 }),
			bases: 0,
		}
		const grade = TRAITS.grade({ character, ladder: "intellect" })
		if (grade.active === 3) geniuses++
		if (grade.active > 0) expect(grade.bad).toBe(0)
	}
	expect(Math.abs(geniuses / 10000 - 0.25)).toBeLessThan(0.02)
})

it("validates final parent draws after init and years of births, with no sovereign or regent redrawn at init", () => {
	const original = PEOPLE.redraw
	let redraws = 0
	PEOPLE.redraw = (params) => {
		redraws++
		const descendants = new Set([params.person])
		const queue = [params.person]
		for (let i = 0; i < queue.length; i++)
			for (const child of params.people.persons.children[queue[i]])
				if (!descendants.has(child)) {
					descendants.add(child)
					queue.push(child)
				}
		for (const person of descendants) {
			expect(
				params.people.persons.heldSeats[person].some(
					(seat) => params.people.household.realmOf(seat) === seat,
				),
			).toBe(false)
			expect(
				Array.from(params.people.regencies.values()).some(
					(regency) => regency.regent === person,
				),
			).toBe(false)
		}
		original(params)
	}
	try {
		const { engine } = HISTORY_RUN.createEngine({
			seed: 14963991,
			era: "lateMedieval",
			numPoints: 30000,
		})
		expect(redraws).toBe(0)
		expect(PEOPLE_TRAITS_REPORT.validate({ engine })).toBe(
			engine.people.persons.birth.length,
		)
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: engine.time + 10 * STATE.yearMs,
			rng: HISTORY_RNG.createHistoryRng(14963991 + 99999),
			validate: false,
		})
		expect(PEOPLE_TRAITS_REPORT.validate({ engine })).toBe(
			engine.people.persons.birth.length,
		)
	} finally {
		PEOPLE.redraw = original
	}
}, 120000)

it("keeps base variance near founders and child bases correlated with parental means", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 451 })
	const size = 8000
	let previous: number[] = []
	let foundersVariance = 0
	let finalCorrelation = 0
	let finalVariance = 0
	for (let generation = 0; generation < 7; generation++) {
		const ids: number[] = []
		let sx = 0
		let sy = 0
		let sxx = 0
		let syy = 0
		let sxy = 0
		for (let i = 0; i < size; i++) {
			const father = generation === 0 ? -1 : previous[rng.randint(0, size - 1)]
			const mother = generation === 0 ? -1 : previous[rng.randint(0, size - 1)]
			const person = PEOPLE.spawn({
				recordHealth: true,
				death: null,
				nameSeed: null,
				people,
				sex: 0,
				birth: 40 * generation,
				survives: 40 * generation,
				father,
				mother,
				dynasty: 0,
				origin: { realm: 0, culture: 0, genderSystem: 1 },
				rng,
			})
			ids.push(person)
			const child = ATTRIBUTES.base({
				character: CHARACTER.of({ people, person }),
				attribute: "diplomacy",
			})
			const parent =
				father < 0
					? 5
					: (ATTRIBUTES.base({
							character: CHARACTER.of({ people, person: father }),
							attribute: "diplomacy",
						}) +
							ATTRIBUTES.base({
								character: CHARACTER.of({ people, person: mother }),
								attribute: "diplomacy",
							})) /
						2
			sx += parent
			sy += child
			sxx += parent * parent
			syy += child * child
			sxy += parent * child
		}
		finalVariance = syy / size - (sy / size) ** 2
		if (generation === 0) foundersVariance = finalVariance
		else
			finalCorrelation =
				(sxy / size - (sx * sy) / size ** 2) /
				Math.sqrt((sxx / size - (sx / size) ** 2) * finalVariance)
		previous = ids
	}
	expect(finalCorrelation).toBeGreaterThan(0.1)
	expect(finalVariance / foundersVariance).toBeGreaterThan(0.8)
	expect(finalVariance / foundersVariance).toBeLessThan(1.2)
}, 120000)

it("steps personal unions once, resets subjects without a holder change, and counts bereavement once before remarriage", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const realms = Array.from(state.people.rulerOf.keys()).filter(
		(p) => STATE.isSovereign({ state, p }) && state.people.rulerOf[p] >= 0,
	)
	const realm = realms[0]
	const other = realms[1]
	const ruler = state.people.rulerOf[realm]
	const table = state.people.persons
	const people = state.people
	const time = state.time / STATE.yearMs
	table.birth[ruler] = time - 30
	table.death[ruler] = time + 100
	table.personality[ruler] = 1 | (3 << 6) | (18 << 12)
	table.children[ruler] = []
	table.spouse[ruler] = -1
	table.stress[ruler] = 0
	people.rulerOf[other] = ruler
	people.regencies.clear()
	const original = MILITARY.atWar
	MILITARY.atWar = () => true
	try {
		const war = state.wars[0]
		war.attacker = realm
		war.defender = other
		war.endTime = undefined
		war.goal = "conquest"
		state.activeWarIds = new Set([war.idx])
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(47)
		for (let year = 1; year < 8; year++) {
			state.time += STATE.yearMs
			STRESS_EVENTS.runYear({ state })
		}
		expect(STRESS.level(table.stress[ruler])).toBe(3)
		expect(REGENCY.weak({ state, realm })).toBe(true)
		expect(stressLevels({ people, person: ruler })).toEqual([1, 2, 3])
		// A sovereignty change can leave every seat's holder unchanged.
		state.parentCurrent[realm] = realms[2]
		state.parentCurrent[other] = realms[2]
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(0)
		expect(stressLevels({ people, person: ruler }).at(-1)).toBe(0)
		state.parentCurrent[realm] = -1
		state.parentCurrent[other] = -1
		table.stress[ruler] = 200
		people.stressed = [ruler]
		table.personality[ruler] = 18 | (20 << 6) | (24 << 12)
		const relatives = people.alive
			.filter(
				(person) =>
					person !== ruler &&
					table.heldSeats[person].length === 0 &&
					PEOPLE.aliveAt({
						people,
						person,
						time: state.time / STATE.yearMs,
					}),
			)
			.slice(0, 3)
		table.spouse[ruler] = relatives[0]
		table.spouse[relatives[0]] = ruler
		for (const relative of relatives) {
			table.father[relative] = -1
			table.mother[relative] = -1
		}
		table.spouse[relatives[1]] = -1
		table.father[relatives[1]] = ruler
		table.children[ruler] = [relatives[1]]
		for (const relative of relatives.slice(0, 2)) {
			PERSON_DEATH.mark({ state, person: relative, cause: "natural" })
			PERSON_DEATH.run({
				state,
				person: relative,
				revision: DEATH_SCHEDULE.revisionOf({ state, person: relative }),
				rng: RNG.createRng({ seed: 1 }),
			})
		}
		expect(table.spouse[ruler]).toBe(-1)
		expect(people.bereavements.get(ruler)).toBe(2)
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(210)
		expect(people.bereavements.size).toBe(0)
		table.spouse[ruler] = relatives[2]
		state.time += STATE.yearMs
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(180)
		// Brief deposition and restoration between passes does not erase accumulated stress.
		people.rulerOf[realm] = -1
		people.rulerOf[other] = -1
		people.rulerOf[realm] = ruler
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(150)
	} finally {
		MILITARY.atWar = original
	}
}, 120000)

it("reads scalar trait modifiers without changing age gates or grade contributions", () => {
	const character = {
		bases: 0,

		personality: 2 | (11 << 6) | (12 << 12),
		grades: 6 | (1 << 7) | (6 << 14),
		congenital: (1 << 10) | (1 << 12),
		carried: 0,
	}
	const expected = {
		diplomacy: 6,
		martial: 5,
		stewardship: 5,
		intrigue: 7,
		learning: 6,
		prowess: -3,
		health: -1,
		fertility: 0.25,
		attraction: -30,
		opinion: 0,
		vassalOpinion: -10,
		stressGain: 0.25,
		stressLoss: 0,
		warChance: 1.5,
		income: 0.05,
	} as const
	for (const modifier of Object.keys(expected) as (keyof typeof expected)[])
		expect(TRAITS.modifier({ character, age: 13, modifier })).toBeCloseTo(
			expected[modifier],
			12,
		)
	expect(TRAITS.modifier({ character, age: 8, modifier: "diplomacy" })).toBe(7)
	expect(TRAITS.has({ character, age: 10, trait: "greedy" })).toBe(false)
	expect(TRAITS.has({ character, age: 11, trait: "greedy" })).toBe(true)
	expect(TRAITS.has({ character, age: 12, trait: "lustful" })).toBe(false)
	expect(TRAITS.has({ character, age: 13, trait: "lustful" })).toBe(true)
})

it("keeps personality group order stable when group hash rolls tie", () => {
	const people = PEOPLE.create(1)
	const table = people.persons
	table.nameSeed.push(721)
	table.father.push(-1)
	table.mother.push(-1)
	const unit = HASH.unit
	HASH.unit = () => 0.5
	try {
		expect(TRAITS.draw({ table, person: 0 }).personality).toBe(
			1 | (3 << 6) | (5 << 12),
		)
	} finally {
		HASH.unit = unit
	}
})

it("samples living populations on matched dates and measures capped governors including regents and councils", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const start = engine.time / STATE.yearMs
	const ids = engine.people.alive.slice(0, 4)
	const table = engine.people.persons
	const seats = Array.from(engine.people.rulerOf.keys()).filter((p) =>
		STATE.isSovereign({ state: engine, p }),
	)
	engine.people.rulerOf.fill(-1)
	engine.people.alive = ids
	engine.people.regencies.clear()
	for (const [i, person] of ids.entries()) {
		table.birth[person] = start - [30, 10, 40, 8][i]
		table.bases[person] = [2, 4, 10, 8][i] * 0x111111
		table.personality[person] = 0 | (18 << 6) | (20 << 12)
		table.grades[person] = 49539

		table.congenital[person] = 0
		table.carried[person] = 0
		table.stress[person] = i === 2 ? 110 : 0
		table.heldSeats[person] = []
	}
	table.grades[ids[2]] = 49542 | (2 << 5)
	table.congenital[ids[2]] = 2
	table.carried[ids[2]] = 1
	engine.people.rulerOf[seats[2]] = ids[3]
	engine.parentCurrent[seats[2]] = seats[0]
	table.heldSeats[ids[3]] = [seats[2]]
	engine.people.rulerOf[seats[0]] = ids[0]
	table.heldSeats[ids[0]] = [seats[0]]
	engine.people.rulerOf[seats[1]] = ids[1]
	table.heldSeats[ids[1]] = [seats[1]]
	engine.people.regencies.set(seats[0], {
		cause: "minority",
		ward: ids[0],
		regent: -1,
		kind: "council",
	})
	engine.people.regencies.set(seats[1], {
		cause: "minority",
		ward: ids[1],
		regent: ids[2],
		kind: "relative",
	})
	const tracker = PEOPLE_TRAITS_REPORT.tracker()
	PEOPLE_TRAITS_REPORT.sample({ engine, tracker, start })
	const report = PEOPLE_TRAITS_REPORT.summarize({
		engine,
		tracker,
		from: start,
		to: start + 1,
	})
	expect(report.rulers.all.observations).toBe(2)
	expect(report.rulers.adults.observations).toBe(1)
	expect(report.rulers.minors.observations).toBe(1)
	expect(report.people.all.observations).toBe(4)
	expect(report.people.adults.observations).toBe(2)
	expect(report.people.minors.observations).toBe(2)
	expect(report.enrichment.rulers.observations).toBe(1)
	expect(report.enrichment.others.observations).toBe(1)
	const all = report.people.all
	if (!("attributes" in all)) throw new Error("Missing population")
	expect(all.stressedNonRulers).toBe(1)
	const expected = {
		diplomacy: [4, 4, 17, 8],
		martial: [4, 6, 17, 8],
		stewardship: [2, 4, 15, 8],
		intrigue: [0, 4, 11, 8],
		learning: [2, 4, 15, 8],
		prowess: [5, 7, 9, 8],
	}
	for (const name of Object.keys(expected) as (keyof typeof expected)[]) {
		const values = expected[name]
		const mean = values.reduce((sum, value) => sum + value, 0) / 4
		expect(all.attributes[name].mean).toBe(mean)
		expect(all.attributes[name].deviation).toBeCloseTo(
			Math.sqrt(
				values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 4,
			),
			12,
		)
		expect(all.attributes[name].histogram).toEqual(
			Array.from(
				Array(38).keys(),
				(bin) => values.filter((value) => value === bin).length,
			),
		)
		for (const tier of ["Terrible", "Poor", "Average", "Good", "Excellent"])
			expect(all.attributes[name].tierShares[tier]).toBe(
				values.filter((value) => ATTRIBUTES.tier(value) === tier).length / 4,
			)
	}
	expect(all.personalityShares).toEqual({
		brave: 0.75,
		humble: 0.5,
		honest: 0.5,
	})
	expect(all.gradeShares).toEqual({ Genius: 0.25 })
	expect(all.congenitalShares).toEqual({ dwarf: 0.25 })
	expect(all.carriedShares).toEqual({ "intellect.bad.2": 0.25, giant: 0.25 })
	expect(all.stressLevelShares).toEqual([0.75, 0.25, 0, 0])
	for (const [effect, attribute, value] of [
		["laxity", "diplomacy", 17],
		["battle", "martial", 17],
		["revenue", "stewardship", 15],
		["knowledge", "learning", 15],
	] as const) {
		const values = [5, value].map((value) =>
			GOVERNOR.factor({ attribute, value }),
		)
		const mean = (values[0] + values[1]) / 2
		expect(report.appliedEffects[effect].observations).toBe(2)
		expect(report.appliedEffects[effect].meanDelta).toBe(
			(5 + value) / 2 - ATTRIBUTES.neutral(attribute),
		)
		expect(report.appliedEffects[effect].mean).toBe(mean)
		expect(report.appliedEffects[effect].deviation).toBeCloseTo(
			Math.abs(values[1] - values[0]) / 2,
			10,
		)
		expect(report.appliedEffects[effect].lowerCapShare).toBe(
			effect === "laxity" ? 0.5 : 0,
		)
		expect(report.appliedEffects[effect].upperCapShare).toBe(
			effect === "laxity" ? 0 : 0.5,
		)
	}
	expect(report.appliedEffects.usurpation.observations).toBe(1)
	expect(report.appliedEffects.usurpation.mean).toBe(
		GOVERNOR.factor({ attribute: "intrigue", value: 11 }),
	)
	expect(report.appliedEffects.usurpation.upperCapShare).toBe(0)
	expect(report.appliedEffects.candidateProxy.mean).toBe(
		GOVERNOR.candidateStrength(8),
	)
	expect(report.appliedEffects.candidateProxy.lowerCapShare).toBe(0)
	expect(report.appliedEffects.candidateProxy.upperCapShare).toBe(0)
	expect(report.enrichment.gradeDifferences).toEqual({ Genius: -1 })
	expect(report.enrichment.congenitalDifferences).toEqual({ dwarf: -1 })
	engine.time += STATE.yearMs
	PEOPLE_TRAITS_REPORT.sample({ engine, tracker, start })
	const offGrid = PEOPLE_TRAITS_REPORT.summarize({
		engine,
		tracker,
		from: start + 1,
		to: start + 2,
	})
	expect(offGrid.people.adults).toEqual({ observations: 0 })
	expect(offGrid.people.minors).toEqual({ observations: 0 })
	expect(offGrid.enrichment.rulers).toEqual({ observations: 0 })
	expect(offGrid.enrichment.others).toEqual({ observations: 0 })
	expect(offGrid.rulers.all.observations).toBe(2)
}, 120000)
