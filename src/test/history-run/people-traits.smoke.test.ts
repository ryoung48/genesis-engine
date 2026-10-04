import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { COMMAND } from "@/model/history/sim/engine/events/battle/command"
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
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { STRESS } from "@/model/history/sim/people/stress"
import { TRAITS } from "@/model/history/sim/people/traits"
import { HASH } from "@/model/shared/random/hash"
import { RNG } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"
import { PEOPLE_TRAITS_REPORT } from "@/test/history-run/report/people-traits"

it("reproduces spawn's original shared random draws and redraw consumes none", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 318 })
	const control = RNG.createRng({ seed: 318 })
	const death = LIFESPAN.deathAt({ birth: 0, from: 0, rng: control })
	const seed = PEOPLE.nameSeed({ sex: 0, genderSystem: 1, rng: control })
	const fertility = 0.5 + 0.1 * control.random()
	const person = PEOPLE.spawn({
		people,
		sex: 0,
		birth: 0,
		father: -1,
		mother: -1,
		dynasty: 0,
		origin: { realm: 0, culture: 0, genderSystem: 1 },
		rng,
	})
	expect(people.persons.death[person]).toBe(death)
	expect(people.persons.nameSeed[person]).toBe(seed)
	expect(people.persons.fertility[person]).toBe(fertility)
	PEOPLE.redraw({ people, person })
	expect(rng.random()).toBe(control.random())
})
it("draws valid, reproducible character and expected founder personality and education distributions", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 721 })
	const frequencies = new Map<string, number>()
	const education = [0, 0, 0, 0]
	let ungraded = 0
	for (let person = 0; person < 20000; person++) {
		PEOPLE.spawn({
			people,
			sex: 0,
			birth: 0,
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
		expect(
			ATTRIBUTES.draw({ table: people.persons, person, character }),
		).toEqual({ bases: character.bases, education: character.education })
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
		if (TRAITS.grade({ character, ladder: "intellect" }).active === 0) {
			ungraded++
			education[ATTRIBUTES.education({ character }).level - 1]++
		}
	}
	expect(frequencies.size).toBe(36)
	for (const [trait, count] of frequencies) {
		const share = count / 20000
		expect(share).toBeGreaterThan(trait === "eccentric" ? 0.002 : 0.04)
		expect(share).toBeLessThan(trait === "eccentric" ? 0.01 : 0.11)
	}
	for (const [index, target] of [0.172, 0.656, 0.161, 0.011].entries())
		expect(Math.abs(education[index] / ungraded - target)).toBeLessThan(0.02)
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
			people,
			sex: person === 1 ? 1 : 0,
			birth: person * 20,
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
		expect(
			ATTRIBUTES.draw({ table: people.persons, person, character }),
		).toEqual({ bases: character.bases, education: character.education })
	}
})
it("gates personality and education by age and reads stress at the selected time", () => {
	const people = PEOPLE.create(1)
	const rng = RNG.createRng({ seed: 221 })
	const id = PEOPLE.spawn({
		people,
		sex: 0,
		birth: 0,
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
	record.persons.set(id, {
		...character,
		id,
		sex: 0,
		birthTimeMs: 0,
		deathTimeMs: 100 * STATE.yearMs,
		father: -1,
		mother: -1,
		dynasty: 0,
		nameSeed: 1,
		home: 0,
	})
	record.stressOf.set(id, [
		{ person: id, timeMs: 20 * STATE.yearMs, level: 2 },
		{ person: id, timeMs: 21 * STATE.yearMs, level: 0 },
	])
	expect(
		PERSON_QUERY.traits({ people: record, id, timeMs: 15 * STATE.yearMs })
			?.education,
	).toBeNull()
	expect(
		PERSON_QUERY.traits({ people: record, id, timeMs: 16 * STATE.yearMs })
			?.education,
	).not.toBeNull()
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
it("scales stress, caps levels and decays in peace", () => {
	const character = {
		bases: 0,
		education: 8,
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
	people.rulerOf[realm] = ward
	people.regencies.set(realm, { ward, regent: ruler, kind: "relative" })
	for (let seat = 0; seat < state.P; seat++)
		if (people.rulerOf[seat] === ruler) people.rulerOf[seat] = -1
	expect(GOVERNOR.stressLevel({ state, realm })).toBe(0)
	expect(GOVERNOR.incomeFactor({ state, realm })).toBeCloseTo(1.05)
	people.stressed = [ruler]
	STRESS_EVENTS.runYear({ state })
	expect(people.persons.stress[ruler]).toBe(0)
	expect(
		people.log.stress.some((row) => row.person === ruler && row.level === 0),
	).toBe(true)
	people.regencies.set(realm, { ward, regent: -1, kind: "council" })
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
		education: 8,
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
			education: 8,
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
		character = { ...TRAITS.draw({ table, person: 2 }), bases: 0, education: 8 }
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
		character = { ...TRAITS.draw({ table, person: 2 }), bases: 0, education: 8 }
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
			education: 8,
		}
		const grade = TRAITS.grade({ character, ladder: "intellect" })
		if (grade.active === 3) geniuses++
		if (grade.active > 0) expect(grade.bad).toBe(0)
	}
	expect(Math.abs(geniuses / 10000 - 0.25)).toBeLessThan(0.02)
})

it("validates final parent draws after init and years of births, with no governing person redrawn at init", () => {
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
			expect(params.people.rulerOf.includes(person)).toBe(false)
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
		expect(redraws).toBeGreaterThan(0)
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
				people,
				sex: 0,
				birth: 40 * generation,
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
		expect(
			people.log.stress
				.filter((row) => row.person === ruler)
				.map((row) => row.level),
		).toEqual([1, 2, 3])
		// A sovereignty change can leave every seat's holder unchanged.
		state.parentCurrent[realm] = realms[2]
		state.parentCurrent[other] = realms[2]
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(0)
		expect(
			people.log.stress.filter((row) => row.person === ruler).at(-1)?.level,
		).toBe(0)
		state.parentCurrent[realm] = -1
		state.parentCurrent[other] = -1
		table.stress[ruler] = 200
		people.stressed = [ruler]
		table.personality[ruler] = 18 | (20 << 6) | (24 << 12)
		const relatives = people.alive
			.filter((person) => person !== ruler)
			.slice(0, 3)
		const pass = state.time / STATE.yearMs
		table.spouse[ruler] = relatives[0]
		table.children[ruler] = [relatives[1]]
		table.death[relatives[0]] = pass - 0.5
		table.death[relatives[1]] = pass - 0.5
		STRESS_EVENTS.runYear({ state })
		expect(table.stress[ruler]).toBe(210)
		table.spouse[ruler] = relatives[2]
		table.death[relatives[2]] = pass + 100
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
		education: 0,
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
		attraction: 0,
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

it("preserves the reference character draw across 20000 founders and descendants", () => {
	const people = PEOPLE.create(1)
	const table = people.persons
	const digest = createHash("sha256")
	for (let person = 0; person < 20000; person++) {
		table.nameSeed.push(person + 721)
		table.father.push(
			person < 200
				? -1
				: Math.floor(HASH.unit({ seed: person, channel: 1, salt: 0 }) * person),
		)
		table.mother.push(
			person < 200
				? -1
				: Math.floor(HASH.unit({ seed: person, channel: 2, salt: 0 }) * person),
		)
		const traits = TRAITS.draw({ table, person })
		table.personality.push(traits.personality)
		table.grades.push(traits.grades)
		table.congenital.push(traits.congenital)
		table.carried.push(traits.carried)
		const attributes = ATTRIBUTES.draw({
			table,
			person,
			character: CHARACTER.of({ people, person }),
		})
		table.bases.push(attributes.bases)
		table.education.push(attributes.education)
		digest.update(JSON.stringify(CHARACTER.of({ people, person })))
	}
	expect(digest.digest("hex")).toBe(
		"0ec4e50acf0a30f3c86bf61836bf7ad076119dc1c1dbf22222cc934b8e761900",
	)
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
