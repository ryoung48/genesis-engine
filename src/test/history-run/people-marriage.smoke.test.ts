import { expect, it, vi } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { SUCCESSION_PROJECTION } from "@/model/history/sim/engine/events/succession/projection"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { FAMILY } from "@/model/history/sim/people/family"
import { MATCH_SCORING } from "@/model/history/sim/people/family/match-scoring"
import { HEALTH } from "@/model/history/sim/people/health"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import { TRAITS } from "@/model/history/sim/people/traits"
import { HASH } from "@/model/shared/random/hash"
import { HISTORY_RUN } from "@/test/history-run"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"

it("projects actual ordered primary and partition allocations for each gender law without mutations or draws", () => {
	for (const [gender, expected] of [
		[0, 2],
		[1, 1],
		[2, 1],
	]) {
		const fixture = MARRIAGE_FIXTURE.create()
		for (const [sex, age] of [
			[0, 60],
			[1, 30],
			[0, 25],
			[0, 20],
			[0, 60],
			[0, 60],
		])
			MARRIAGE_FIXTURE.add({ fixture, age, sex: sex as 0 | 1, realm: 0 })
		const people = fixture.people
		for (const child of [1, 2, 3]) {
			people.persons.father[child] = 0
			people.persons.children[0].push(child)
		}
		for (const [person, seat] of [
			[0, 0],
			[4, 1],
			[5, 2],
		])
			PEOPLE.setRuler({
				people,
				person,
				seat,
				rank: [3, 2, 1][seat],
				reason: "unknown",
			})
		const state = {
			people,
			time: 100 * STATE.yearMs,
			P: 3,
			parentCurrent: new Int32Array([-1, 0, 0]),
			sovereignCurrent: new Int32Array([0, 0, 0]),
			childOffset: new Int32Array([0, 2, 2, 2]),
			childList: new Int32Array([1, 2]),
			hierarchyDirty: false,
			culture: new Int32Array([0, 0, 0]),
			cultureGenderSystems: new Uint8Array([gender]),
			seatRank: new Uint8Array([3, 2, 1]),
			governmentType: new Uint8Array([
				GOVERNMENT.getGovIdx().tribal_monarchy,
				GOVERNMENT.getGovIdx().feudal_monarchy,
				GOVERNMENT.getGovIdx().feudal_monarchy,
			]),
			popRuralCurrent: new Float32Array([1000, 100, 10]),
			popUrbanCurrent: new Float32Array(3),
			occupationCurrent: new Int32Array(3).fill(-1),
			desolate: new Uint8Array(3),
		} as HistoryState
		const before = JSON.stringify(people)
		const random = vi.spyOn(fixture.rng, "random")
		const projection = SUCCESSION_PROJECTION.crowns({ state })
		expect(projection.get(expected)).toBe(4)
		const junior = expected === 1 ? 2 : 3
		expect(projection.get(junior)).toBe(3)
		expect(JSON.stringify(people)).toBe(before)
		expect(random).not.toHaveBeenCalled()
		for (const government of ["elective_monarchy", "theocracy"] as const) {
			state.governmentType[0] = GOVERNMENT.getGovIdx()[government]
			expect(SUCCESSION_PROJECTION.crowns({ state }).size).toBe(0)
			expect(SUCCESSION_PROJECTION.districts({ state }).size).toBe(0)
		}
	}
})

it("scores exactly six terms and separates current title from inheritance and former standing", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 0, realm: 0 })
	MARRIAGE_FIXTURE.add({ fixture, age: 25, sex: 1, realm: 1 })
	const score = () =>
		MATCH_SCORING.score({
			observer: 0,
			target: 1,
			time: 100,
			context: fixture.context,
			candidateOf: fixture.market.candidateOf,
			alliance: false,
			allied: false,
		})!
	expect(score()).toMatchObject({
		attraction: 0,
		opinion: 40,
		age: -10,
		standing: 0,
		alliance: 0,
		desperation: 25,
		total: 55,
	})
	fixture.people.persons.peak[1] = 5
	expect(score().standing).toBe(0)
	for (let standing = 1; standing <= 5; standing++) {
		fixture.candidates.set(1, {
			currentStanding: standing,
			projectedStanding: 0,
			sovereignTiers: [],
			attractionModifier: 0,
		})
		expect(score().standing).toBe(10 * standing)
	}
	fixture.candidates.set(1, {
		currentStanding: 2,
		projectedStanding: 4,
		sovereignTiers: [],
		attractionModifier: -5,
	})
	expect(score()).toMatchObject({ standing: 40, attraction: -5 })
	fixture.people.persons.birth[1] = 30
	expect(score().age).toBe(-30)
	fixture.people.persons.birth[0] = 75
	expect(score().desperation).toBe(0)
})

it("uses exact alliance tiers, existing-alliance divisor and no private alliance bonus", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 0, realm: 0 })
	MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 1, realm: 1 })
	fixture.candidates.set(0, {
		currentStanding: 4,
		projectedStanding: 5,
		sovereignTiers: [3],
		attractionModifier: 0,
	})
	for (const [standing, expected] of [
		[5, 70],
		[4, 25],
		[3, 10],
		[2, 10 / 3],
		[1, 0],
	]) {
		fixture.candidates.set(1, {
			currentStanding: standing,
			projectedStanding: 5,
			sovereignTiers: [standing - 1],
			attractionModifier: 0,
		})
		const params = {
			observer: 0,
			target: 1,
			time: 100,
			context: fixture.context,
			candidateOf: fixture.market.candidateOf,
		}
		expect(
			MATCH_SCORING.score({ ...params, alliance: true, allied: false })
				?.alliance,
		).toBe(expected)
		expect(
			MATCH_SCORING.score({ ...params, alliance: true, allied: true })
				?.alliance,
		).toBe(expected / 1.5)
		expect(
			MATCH_SCORING.score({ ...params, alliance: false, allied: true })
				?.alliance,
		).toBe(0)
	}
})

it("reads all active attraction grades and congenital penalties without carried traits", () => {
	const character = {
		bases: 0,
		grades: 3 | (3 << 7) | (3 << 14),
		congenital: 0,
		carried: 0x7fff,
		personality: 6 | (8 << 6) | (16 << 12),
	}
	for (let grade = -3; grade <= 3; grade++) {
		expect(
			TRAITS.attraction({
				character: { ...character, grades: 3 | (3 << 7) | ((grade + 3) << 14) },
				age: 30,
			}),
		).toBe(grade * 10)
		expect(
			TRAITS.attraction({
				character: { ...character, grades: 3 | ((grade + 3) << 7) | (3 << 14) },
				age: 30,
			}),
		).toBe([-10, -5, 0, 0, 5, 10, 15][grade + 3])
	}
	for (const [trait, expected] of [
		[0, -5],
		[1, -20],
		[2, -10],
		[3, -30],
		[4, -10],
		[10, -30],
		[13, -10],
		[14, -10],
	])
		expect(
			TRAITS.attraction({
				character: { ...character, congenital: 1 << trait },
				age: 30,
			}),
		).toBe(expected)
})

it("ranks the entire domestic group, breaks ties by ID and records pre-wedding opinions", () => {
	for (const order of [
		[0, 1, 2],
		[0, 2, 1],
	]) {
		const fixture = MARRIAGE_FIXTURE.create()
		for (const sex of [0, 1, 1] as const)
			MARRIAGE_FIXTURE.add({ fixture, age: 25, sex, realm: 0 })
		fixture.rng.random = () => 1
		FAMILY.seekMatches({
			people: fixture.people,
			time: 100,
			seekers: order,
			sovereigns: [],
			minorChance: 0,
			rng: fixture.rng,
			...fixture.market,
		})
		expect(fixture.people.persons.spouse[0]).toBe(1)
		const selected = fixture.observations.find(
			(row) => row.kind === "selection",
		)
		expect(
			selected?.kind === "selection" && selected.first.breakdown.spouse,
		).toBe(0)
		const search = fixture.observations.find((row) => row.kind === "search")
		expect(search).toMatchObject({
			evaluated: 2,
			firstFit: order[1] === 1 ? "unchanged" : "ranking",
		})
	}
})

it("settles and refreshes after the first pair before regrouping the fixed cohort for the next seeker", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const [sex, realm] of [
		[0, 0],
		[1, 0],
		[0, 1],
		[1, 2],
	])
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: sex as 0 | 1, realm })
	fixture.rng.random = () => 1
	const realms = [0, 1, 2]
	fixture.people.household.realmOf = (province) => realms[province]
	let version = 0
	fixture.market.settle = ({ match }) => {
		if (match.a !== 0) return
		realms[1] = 0
		realms[2] = 0
		fixture.candidates.set(3, {
			currentStanding: 2,
			projectedStanding: 4,
			sovereignTiers: [1],
			attractionModifier: 0,
		})
	}
	fixture.market.refresh = () => {
		version++
		if (version < 2) return
		for (const id of [2, 3])
			fixture.persons.set(id, {
				...fixture.context.personOf(id)!,
				religion: 2,
				districtSovereigns: id === 2 ? [2] : [],
				sovereignSeats: id === 3 ? [2] : [],
			})
	}
	FAMILY.seekMatches({
		people: fixture.people,
		time: 100,
		seekers: [0, 2, 1, 3],
		sovereigns: [],
		minorChance: 0,
		rng: fixture.rng,
		...fixture.market,
	})
	expect(fixture.people.persons.spouse).toEqual([1, 0, 3, 2])
	const selections = fixture.observations.filter(
		(row) => row.kind === "selection",
	)
	expect(selections[0]).toMatchObject({
		group: "domestic",
		a: { religion: 0 },
		b: { religion: 0 },
	})
	expect(selections[1]).toMatchObject({
		group: "domestic",
		first: { standing: 40, alliance: 0, breakdown: { religion: 15 } },
		a: { religion: 2 },
		b: { religion: 2 },
	})
	expect(version).toBe(3)
})

it("keeps successful foreign searches ahead of domestic candidates and ranks across realm order", () => {
	for (const near of [
		[1, 2],
		[2, 1],
	]) {
		const fixture = MARRIAGE_FIXTURE.create()
		for (const realm of [0, 1, 2, 0])
			MARRIAGE_FIXTURE.add({
				fixture,
				age: 25,
				sex: realm === 0 && fixture.people.persons.sex.length === 0 ? 0 : 1,
				realm,
			})
		fixture.rng.random = () => 0
		fixture.market.neighborsOf = (realm) => (realm === 0 ? near : [])
		fixture.candidates.set(3, {
			currentStanding: 5,
			projectedStanding: 5,
			sovereignTiers: [],
			attractionModifier: 100,
		})
		FAMILY.seekMatches({
			people: fixture.people,
			time: 100,
			seekers: [0, 1, 2, 3],
			sovereigns: [],
			minorChance: 0,
			rng: fixture.rng,
			...fixture.market,
		})
		expect(fixture.people.persons.spouse[0]).toBe(1)
	}
})

it("reciprocal rejection leaves candidates available and ancestry beats every positive score", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1, 0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 25, sex, realm: 0 })
	fixture.rng.random = () => 1
	fixture.candidates.set(0, {
		currentStanding: 0,
		projectedStanding: 0,
		sovereignTiers: [],
		attractionModifier: -100,
	})
	fixture.people.persons.father[3] = 2
	fixture.candidates.set(3, {
		currentStanding: 5,
		projectedStanding: 5,
		sovereignTiers: [],
		attractionModifier: 100,
	})
	FAMILY.seekMatches({
		people: fixture.people,
		time: 100,
		seekers: [0, 2, 1, 3],
		sovereigns: [],
		minorChance: 0,
		rng: fixture.rng,
		...fixture.market,
	})
	expect(fixture.people.persons.spouse[0]).toBe(-1)
	expect(fixture.people.persons.spouse[2]).toBe(1)
	expect(
		fixture.observations.some(
			(row) => row.kind === "search" && row.kinship > 0,
		),
	).toBe(true)
})

it("retains rejected outsiders after onboarding and does not offer them to this year's later seekers", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (let index = 0; index < 2; index++)
		MARRIAGE_FIXTURE.add({ fixture, age: 35, sex: 0, realm: 0 })
	fixture.rng.random = () => 1
	const original = HASH.unit
	const hash = vi
		.spyOn(HASH, "unit")
		.mockImplementation((params) =>
			params.channel === 140 ? 0 : original(params),
		)
	const attraction = vi.spyOn(TRAITS, "attraction").mockReturnValue(-1000)
	const onboard = vi.spyOn(fixture.market, "onboard")
	try {
		FAMILY.seekMatches({
			people: fixture.people,
			time: 100,
			seekers: [0, 1],
			sovereigns: [],
			minorChance: 0,
			rng: fixture.rng,
			...fixture.market,
		})
		expect(onboard).toHaveBeenCalledTimes(2)
		expect(fixture.people.persons.sex).toHaveLength(4)
		for (const id of [2, 3]) {
			expect(fixture.people.persons.spouse[id]).toBe(-1)
			expect(fixture.people.persons.createdAt[id]).toBe(100)
			expect(fixture.people.persons.healthIntervalEnd[id]).toBe(101)
		}
		expect(
			fixture.observations
				.filter((row) => row.kind === "search")
				.every((row) => row.kind === "search" && row.evaluated === 0),
		).toBe(true)
	} finally {
		hash.mockRestore()
		attraction.mockRestore()
	}
})

it("fallback has exact age probabilities and the scorer consumes no shared random draws", () => {
	for (const [age, threshold] of [
		[25, 0],
		[30, 0.25],
		[35, 0.5],
		[60, 0.5],
	]) {
		for (const roll of [Math.max(0, threshold - 0.001), threshold]) {
			const fixture = MARRIAGE_FIXTURE.create()
			MARRIAGE_FIXTURE.add({ fixture, age, sex: 0, realm: 0 })
			fixture.rng.random = () => 1
			const original = HASH.unit
			const hash = vi
				.spyOn(HASH, "unit")
				.mockImplementation((params) =>
					params.channel === 140 ? roll : original(params),
				)
			try {
				FAMILY.seekMatches({
					people: fixture.people,
					time: 100,
					seekers: [0],
					sovereigns: [],
					minorChance: 0,
					rng: fixture.rng,
					...fixture.market,
				})
				expect(fixture.people.persons.sex.length).toBe(roll < threshold ? 2 : 1)
				if (age === 60 && roll < threshold) {
					expect(fixture.people.persons.spouse[0]).toBe(1)
					expect(fixture.people.persons.spouse[1]).toBe(0)
				}
			} finally {
				hash.mockRestore()
			}
		}
	}
})

it("releases a related betrothal once, preserves kinship cause through transferred packets and both timelines", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 16, sex, realm: 0 })
	BETROTHAL.betroth({ people: fixture.people, a: 0, b: 1, time: 96 })
	fixture.people.persons.father[1] = 0
	const released = vi.fn()
	expect(
		BETROTHAL.fulfil({
			people: fixture.people,
			time: 100,
			onKinship: released,
		}),
	).toEqual([])
	expect(
		BETROTHAL.fulfil({
			people: fixture.people,
			time: 101,
			onKinship: released,
		}),
	).toEqual([])
	expect(released).toHaveBeenCalledTimes(1)
	const packet = PEOPLE_LOG.seal({
		people: fixture.people,
		sovereign: () => true,
	})
	const transferred = structuredClone(packet, {
		transfer: Object.values(packet).flatMap((value) =>
			ArrayBuffer.isView(value) ? [value.buffer] : [],
		),
	})
	const people = PEOPLE_RECORD.create()
	PEOPLE_RECORD.append({
		record: people,
		packet: transferred,
		timeMs: 100,
		recordTime: (time) => time,
	})
	for (const id of [0, 1]) {
		expect(
			PERSON_QUERY.view({ people, id, timeMs: 99 })?.betrothals[0].cause,
		).toBeNull()
		expect(
			PERSON_QUERY.view({ people, id, timeMs: 100 })?.betrothals[0].cause,
		).toBe("kinship")
		expect(
			PERSON_QUERY.timeline({ people, id, timeMs: 101 }).filter(
				(event) => event.kind === "betrothal broken for kinship",
			),
		).toHaveLength(1)
	}
})

it("settles and refreshes each wedding before regrouping later fixed-cohort seekers", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const [sex, realm] of [
		[0, 0],
		[1, 1],
		[0, 2],
		[1, 3],
	])
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: sex as 0 | 1, realm })
	fixture.rng.random = () => 0
	fixture.market.neighborsOf = (realm) =>
		realm === 0 ? [1] : realm === 2 ? [3] : []
	fixture.market.alliable = (match) => match.realmA !== match.realmB
	fixture.market.settle = ({ match }) => {
		if (match.a !== 0) return
		fixture.people.persons.residence[3] = 2
		const a = fixture.context.personOf(2)!
		const b = fixture.context.personOf(3)!
		a.religion = 4
		b.religion = 4
		a.districtSovereigns = [2]
		b.sovereignSeats = [2]
		fixture.persons.set(2, a)
		fixture.persons.set(3, b)
		fixture.candidates.set(3, {
			currentStanding: 3,
			projectedStanding: 4,
			sovereignTiers: [2],
			attractionModifier: 0,
		})
	}
	const refresh = vi.spyOn(fixture.market, "refresh")
	const matches = FAMILY.seekMatches({
		people: fixture.people,
		time: 100,
		seekers: [0, 1, 2, 3],
		sovereigns: [],
		minorChance: 0,
		rng: fixture.rng,
		...fixture.market,
	})
	expect(matches.weddings).toEqual([
		{ a: 0, b: 1, realmA: 0, realmB: 1 },
		{ a: 2, b: 3, realmA: 2, realmB: 2 },
	])
	expect(refresh).toHaveBeenCalledTimes(3)
	const selections = fixture.observations.filter(
		(row) => row.kind === "selection",
	)
	expect(selections[0].group).toBe("foreign")
	expect(selections[0].first.alliance).toBe(25)
	expect(selections[0].current).toEqual([0, 0])
	expect(selections[1].group).toBe("domestic")
	expect(selections[1].first).toMatchObject({ alliance: 0, standing: 40 })
	expect(selections[1].first.breakdown).toEqual(
		OPINION.of({
			observer: 2,
			target: 3,
			time: 100,
			context: { ...fixture.context, married: () => false },
		}),
	)
})

it("onboards outsiders with one health replay and ordinary creation-time mortality and recording", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 2000,
	})
	const time = engine.time / STATE.yearMs
	const rng = HISTORY_RNG.createHistoryRng(17)
	const projection = vi
		.spyOn(LIFESPAN, "project")
		.mockImplementation(({ from, to }) => (from + to) / 2)
	const replay = vi.spyOn(HEALTH, "replay")
	const ids: number[] = []
	const market = vi.spyOn(FAMILY, "runYear").mockImplementation((params) => {
		for (const sex of [0, 1] as const) {
			const id = PEOPLE.spawn({
				recordHealth: true,
				death: null,
				nameSeed: null,
				people: engine.people,
				sex,
				birth: time - 40,
				survives: time,
				father: -1,
				mother: -1,
				dynasty: -1,
				origin: params.originOf(0),
				rng,
			})
			ids.push(id)
			params.onboard(id)
			expect(params.opinionContext().personOf(id)).not.toBeNull()
			expect(engine.people.persons.createdAt[id]).toBe(time)
			expect(engine.people.persons.healthIntervalEnd[id]).toBe(time + 1)
			const token = engine.deathSchedule.pending.get(id)!
			expect(token.due / STATE.yearMs).toBe(time + 0.5)
			expect(token.revision).toBeGreaterThan(0)
			DEATH_SCHEDULE.ensure({ state: engine, person: id, cause: "natural" })
			expect(engine.deathSchedule.pending.get(id)?.revision).toBe(
				token.revision,
			)
		}
		return { weddings: [], betrothals: [] }
	})
	try {
		PEOPLE_EVENTS.runYear({ state: engine, rng })
		expect(replay).toHaveBeenCalledTimes(2)
		for (const id of ids) {
			const calls = projection.mock.calls.filter(
				([call]) => call.seed === engine.people.persons.nameSeed[id],
			)
			expect(calls).toHaveLength(1)
			expect(calls[0][0]).toMatchObject({ from: time, to: time + 1 })
		}
		const count = projection.mock.calls.length
		HEALTH.runYear({ people: engine.people, time })
		expect(projection).toHaveBeenCalledTimes(count)
		JOURNAL.flush({
			state: engine,
			noteCursor: 0,
			census: false,
			initial: false,
		})
		const packet = engine.journal.at(-1)!.people!
		const rows = Array.from({ length: packet.count }, (...entry) =>
			PEOPLE_LOG.read({ rows: packet, index: entry[1] }),
		)
		const creation = rows.find(
			(row) => row.kind === "creation" && row.person === ids[0],
		)!
		if (creation.kind !== "creation") throw new Error("Missing creation")
		expect(packet.createdAt[creation.snapshot]).toBe(time)
		const retained = PEOPLE_RECORD.create()
		for (const transaction of engine.journal)
			if (transaction.people)
				PEOPLE_RECORD.append({
					record: retained,
					packet: transaction.people,
					timeMs: transaction.timeMs,
					recordTime: (year) => year * STATE.yearMs,
				})
		for (const id of ids) {
			expect(
				PERSON_QUERY.view({ people: retained, id, timeMs: engine.time - 1 }),
			).toBeNull()
			expect(
				PERSON_QUERY.health({ people: retained, id, timeMs: engine.time - 1 }),
			).toBeNull()
			expect(
				PERSON_QUERY.health({ people: retained, id, timeMs: engine.time }),
			).toBe(HEALTH.recorded({ people: engine.people, person: id }))
			for (const row of rows)
				if (
					(row.kind === "condition" ||
						row.kind === "health_band" ||
						row.kind === "death") &&
					row.person === id
				)
					expect(row.time).toBeGreaterThanOrEqual(time)
		}
		engine.time = (time + 0.5) * STATE.yearMs
		for (const person of ids)
			PERSON_DEATH.run({
				state: engine,
				person,
				revision: DEATH_SCHEDULE.revisionOf({ state: engine, person }),
				rng,
			})
		JOURNAL.flush({
			state: engine,
			noteCursor: 0,
			census: false,
			initial: false,
		})
		const deaths = engine.journal
			.flatMap(({ people }) =>
				people
					? Array.from({ length: people.count }, (...entry) =>
							PEOPLE_LOG.read({ rows: people, index: entry[1] }),
						)
					: [],
			)
			.filter((row) => row.kind === "death" && ids.includes(row.person))
		expect(deaths).toHaveLength(2)
		expect(ids.every((id) => engine.people.persons.spouse[id] < 0)).toBe(true)
	} finally {
		market.mockRestore()
		replay.mockRestore()
		projection.mockRestore()
	}
})
