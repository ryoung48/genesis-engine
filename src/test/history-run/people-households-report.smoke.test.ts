import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { AFFILIATION } from "@/model/history/record/people/query/affiliation"
import { PEOPLE } from "@/model/history/sim/people"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { RNG } from "@/model/shared/random/rng"
import { HOUSEHOLDS_REPORT } from "@/test/history-run/report/households"

it("resolves shared ancestors afresh after each territorial batch, including cycles", () => {
	const territory = HOUSEHOLDS_REPORT.territory({
		parents: [-1, -1, 0, 2, 2],
		owners: [0, 1, 2, 3, 4],
		timeMs: 0,
	})
	territory.maxTimeMs = 70
	for (const [province, timeMs, parentId] of [
		[2, 10, 1],
		[1, 20, 0],
		[1, 30, -1],
		[2, 40, 0],
		[2, 50, 3],
		[2, 60, 1],
	])
		territory.events.provinceEvents.get(province)?.events.push({
			timeMs,
			kind: "parent",
			payload: { parentId },
			comment: null,
		})
	for (const [timeMs, nationId] of [
		[30, -1],
		[70, 1],
	])
		territory.events.provinceEvents.get(1)?.events.push({
			timeMs,
			kind: "owner",
			payload: { nationId },
			comment: null,
		})
	const timelines = AFFILIATION.transitions({ record: territory })
	for (const province of [2, 3, 4]) {
		expect(timelines.get(province)).toEqual([
			{ timeMs: 10, before: 0, after: 1 },
			{ timeMs: 20, before: 1, after: 0 },
			{ timeMs: 30, before: 0, after: -1 },
			{ timeMs: 40, before: -1, after: 0 },
			{ timeMs: 50, before: 0, after: -1 },
			{ timeMs: 70, before: -1, after: 1 },
		])
		for (const row of timelines.get(province) ?? []) {
			expect(
				AFFILIATION.at({ record: territory, province, timeMs: row.timeMs - 1 }),
			).toBe(row.before)
			expect(
				AFFILIATION.at({ record: territory, province, timeMs: row.timeMs }),
			).toBe(row.after)
		}
	}
})

it("counts living observations, crowns and boundary samples independently of regencies", () => {
	const people = PEOPLE.create(6)
	const record = PEOPLE_RECORD.create()
	for (let id = 0; id < 3; id++) {
		PEOPLE.spawn({
			people,
			sex: 0,
			birth: 80,
			survives: 80,
			father: -1,
			mother: -1,
			dynasty: id,
			origin: { realm: 0, culture: 0, genderSystem: 0 },
			rng: RNG.createRng({ seed: id + 1 }),
		})
		people.persons.death[id] = id === 2 ? 102 : 150
	}
	for (const seat of [2, 3])
		PEOPLE.setRuler({ people, person: 0, seat, rank: 2, reason: "unknown" })
	PEOPLE.setRuler({ people, person: 1, seat: 4, rank: 2, reason: "unknown" })
	PEOPLE.setRegent({ people, seat: 2, person: 2, ward: 0 })
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: (seat) => seat !== 4 }),
		timeMs: 100,
		recordTime: (time) => time,
	})
	PEOPLE.vacate({ people, seat: 3, reason: "union" })
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "death", person: 2, time: 102, cause: "natural" },
	})
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: () => true }),
		timeMs: 101,
		recordTime: (time) => time,
	})
	const samples = [100, 101, 102].map((timeMs) => ({
		timeMs,
		sovereigns: new Set([2, 3]),
	}))
	expect(
		HOUSEHOLDS_REPORT.build({
			people: record,
			samples,
			fromMs: 100,
			toMs: 101,
			final: false,
		}),
	).toEqual({
		heldSeatsHistogram: [1, 1, 1],
		seatsPerHolder: 1.5,
		unionHolders: 1,
	})
	expect(
		HOUSEHOLDS_REPORT.build({
			people: record,
			samples,
			fromMs: 101,
			toMs: 102,
			final: true,
		}),
	).toEqual({
		heldSeatsHistogram: [1, 4, 0],
		seatsPerHolder: 1,
		unionHolders: 0,
	})
	expect(
		HOUSEHOLDS_REPORT.build({
			people: record,
			samples: [],
			fromMs: 100,
			toMs: 102,
			final: true,
		}).seatsPerHolder,
	).toBeNull()
})

it("joins unmoved households to parent-only territorial transitions and excludes boundaries", () => {
	const people = PEOPLE.create(6)
	people.household = {
		heritageOfCulture: () => -1,
		religionOfRealm: () => -1,
		realmOf: () => 0,
		ranks: () => [0, 0, 0, 0, 0, 0],
		time: () => 115,
	}
	for (let id = 0; id < 4; id++) {
		PEOPLE.spawn({
			people,
			sex: 0,
			birth: id === 2 ? 115 : 80,
			survives: id === 2 ? 115 : 80,
			father: -1,
			mother: -1,
			dynasty: id,
			origin: { realm: 3, culture: 0, genderSystem: 0 },
			rng: RNG.createRng({ seed: id + 7 }),
		})
		people.persons.death[id] = id === 3 ? 115 : 150
	}
	HOUSEHOLD.relocate({ people, person: 0, province: 2, time: 115 })
	const record = PEOPLE_RECORD.create()
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: () => false }),
		timeMs: 115,
		recordTime: (time) => time,
	})
	const territory = HOUSEHOLDS_REPORT.territory({
		parents: [-1, 0, -1, 1, -1, -1],
		owners: [0, 0, 2, 0, -1, -1],
		timeMs: 90,
	})
	territory.maxTimeMs = 120
	const log = territory.events.provinceEvents.get(1)
	if (!log) throw new Error("Missing territory")
	for (const [timeMs, parentId] of [
		[100, 2],
		[110, 0],
		[110, 2],
		[115, 0],
	])
		log.events.push({
			timeMs,
			kind: "parent",
			payload: { parentId },
			comment: null,
		})
	territory.events.provinceEvents.get(3)?.events.push({
		timeMs: 101,
		kind: "controller",
		payload: { nationId: 5 },
		comment: null,
	})
	territory.events.provinceEvents.get(5)?.events.push({
		timeMs: 102,
		kind: "controller",
		payload: { nationId: 0 },
		comment: null,
	})
	expect(AFFILIATION.at({ record: territory, province: 3, timeMs: 99 })).toBe(0)
	expect(AFFILIATION.at({ record: territory, province: 3, timeMs: 100 })).toBe(
		2,
	)
	expect(AFFILIATION.at({ record: territory, province: 5, timeMs: 105 })).toBe(
		-1,
	)
	expect(
		PERSON_QUERY.realmAt({
			people: record,
			id: 1,
			timeMs: 89,
			record: territory,
		}),
	).toBe(-1)
	expect(PERSON_QUERY.residenceAt({ people: record, id: 1, timeMs: 89 })).toBe(
		3,
	)
	expect(PERSON_QUERY.residenceAt({ people: record, id: 2, timeMs: 114 })).toBe(
		-1,
	)
	expect(AFFILIATION.transitions({ record: territory }).get(3)).toEqual([
		{ timeMs: 100, before: 0, after: 2 },
		{ timeMs: 115, before: 2, after: 0 },
	])
	expect(
		HOUSEHOLDS_REPORT.residence({
			people: record,
			territory,
			windows: [
				{ fromMs: 90, toMs: 110, final: false },
				{ fromMs: 110, toMs: 120, final: true },
			],
		}),
	).toEqual([
		{ residenceRows: 0, sameResidenceRealmChanges: 3 },
		{ residenceRows: 1, sameResidenceRealmChanges: 1 },
	])

	const reference = [100, 115].reduce(
		(total, timeMs) =>
			total +
			[0, 1, 2, 3].filter((id) => {
				if (
					PEOPLE_RECORD.birthTimeMs({ people: record, id }) >= timeMs ||
					PEOPLE_RECORD.deathTimeMs({ people: record, id }) <= timeMs
				)
					return false
				if (
					(record.residencesOf.get(id) ?? []).some(
						(row) => row.timeMs === timeMs,
					)
				)
					return false
				return (
					PERSON_QUERY.realmAt({
						people: record,
						id,
						timeMs: timeMs - 0.5,
						record: territory,
					}) !==
					PERSON_QUERY.realmAt({
						people: record,
						id,
						timeMs,
						record: territory,
					})
				)
			}).length,
		0,
	)
	expect(reference).toBe(4)
	expect(people.persons.home).toEqual([3, 3, 3, 3])
	expect(people.persons.culture).toEqual([0, 0, 0, 0])
})
