import { expect, it } from "vitest"
import { DATE } from "@/model/history/earth/date"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { PeopleRecord } from "@/model/history/record/people/types"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type {
	AppendedRow,
	PeoplePacket,
	PeopleRow,
	PeopleRows,
} from "@/model/history/sim/people/log/types"
import { OPINION_MEMORY } from "@/model/history/sim/people/opinion/memory"
import type {
	PeopleState,
	SeatChangeReason,
} from "@/model/history/sim/people/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

const SEAT_REASONS: SeatChangeReason[] = [
	"district grant",
	"partition",
	"rebellion",
	"regime change",
	"restoration",
	"succession",
	"territorial change",
	"union",
	"unknown",
	"usurpation",
	"promotion",
	"demotion",
]
const SNAPSHOT_COLUMNS = [
	"sex",
	"orientation",
	"death",
	"dynasty",
	"culture",
	"nameSeed",
	"home",
	"initialResidence",
	"bases",
	"personality",
	"grades",
	"congenital",
	"carried",
] as const

function rowsOf(rows: PeopleRows): PeopleRow[] {
	return Array.from({ length: rows.count }, (...entry) =>
		PEOPLE_LOG.read({ rows, index: entry[1] }),
	)
}

function byteLength(packet: PeoplePacket): number {
	return Object.values(packet).reduce(
		(sum, column) => sum + (ArrayBuffer.isView(column) ? column.byteLength : 0),
		0,
	)
}

function spawn(people: PeopleState): number {
	return PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people,
		sex: people.persons.sex.length % 2 === 0 ? 0 : 1,
		birth: 800 + people.persons.sex.length,
		survives: 800 + people.persons.sex.length,
		father: -1,
		mother: -1,
		dynasty: people.persons.sex.length - 1,
		origin: { realm: 3, culture: 2, genderSystem: 1 },
		rng: RNG.createRng({ seed: 77 }),
	})
}

it("round-trips every implemented row kind, code and sentinel", () => {
	const people = PEOPLE.create(8)
	const { log } = people
	const appended: AppendedRow[] = [
		{ kind: "death", time: 901.25, person: 4, cause: "natural" },
		{ kind: "wedding", time: 880.5, husband: 1, wife: 0x7fffffff },
		...SEAT_REASONS.map(
			(reason, seat): AppendedRow => ({
				kind: "seat",
				seat,
				person: seat === 0 ? -1 : seat,
				reason,
			}),
		),
		{ kind: "regent", seat: 2, person: -1, ward: 5, reason: "unknown" },
		{ kind: "regent", seat: 2, person: 6, ward: 5, reason: "succession" },
		{
			kind: "pregnancy",
			time: 902,
			mother: 3,
			father: 2,
			outcome: "childbirth death",
		},
		{
			kind: "pregnancy",
			time: 903,
			mother: 3,
			father: -1,
			outcome: "miscarriage",
		},
		{
			kind: "pregnancy",
			time: 904,
			mother: 3,
			father: 2,
			outcome: "stillbirth",
		},
		{ kind: "betrothal", time: 870, a: 6, b: 7 },
		{ kind: "betrothal_end", time: 871, a: 6, b: 7, cause: "alliance" },
		{ kind: "betrothal_end", time: -12.5, a: 7, b: 6, cause: "death" },
		{ kind: "stress", time: 899, person: 1, level: 3 },
		{ kind: "death", time: 905, person: 5, cause: "heart" },
		{ kind: "death", time: 906, person: 6, cause: "battle" },
		{ kind: "death", time: 907, person: 7, cause: "childbirth" },
		...PEOPLE_LOG.healthBands.map(
			(band, index): AppendedRow => ({
				kind: "health_band",
				time: 890 + index,
				person: 1,
				band,
			}),
		),
		...PEOPLE_LOG.conditions.map(
			(condition, index): AppendedRow => ({
				kind: "condition",
				time: 895,
				person: 2,
				condition,
				before: index - 1 > 4 ? -1 : index - 1,
				after: index === 1 ? -1 : Math.min(4, index),
			}),
		),
		...OPINION_MEMORY.reasons.map(
			(reason, index): AppendedRow => ({
				kind: "opinion_memory",
				time: 896 + index / 4,
				observer: index,
				target: index + 1,
				reason,
			}),
		),
	]
	for (const row of appended) PEOPLE_LOG.append({ log, row })
	expect(PEOPLE_LOG.pending(people)).toBe(true)
	expect(rowsOf(log)).toEqual(
		appended.map((row) =>
			row.kind === "seat" ? { ...row, seatKind: "ruler" } : row,
		),
	)
	const packet = PEOPLE_LOG.seal({
		people,
		sovereign: (seat) => seat % 2 === 0,
	})
	expect(rowsOf(packet)).toEqual(
		appended.map((row) =>
			row.kind === "seat"
				? { ...row, seatKind: row.seat % 2 === 0 ? "ruler" : "district" }
				: row,
		),
	)
	expect(byteLength(packet)).toBe(25 * appended.length)
	expect(log.count).toBe(0)
	expect(PEOPLE_LOG.pending(people)).toBe(false)
})

it("rejects unknown kinds and codes and values a row cannot hold", () => {
	const people = PEOPLE.create(8)
	const { log } = people
	const reject = (row: unknown) =>
		expect(() => PEOPLE_LOG.append({ log, row: row as AppendedRow })).toThrow()
	const memory = {
		kind: "opinion_memory",
		time: 1,
		observer: 0,
		target: 1,
		reason: "attack",
	}
	reject({ ...memory, reason: "insult" })
	reject({ ...memory, target: 0 })
	reject({ ...memory, observer: -1 })
	reject({ ...memory, target: -1 })
	reject({ ...memory, time: Number.NaN })
	reject({ ...memory, time: Infinity })
	reject({ kind: "health_band", time: 1, person: 0, band: "Fair" })
	reject({
		kind: "condition",
		time: 1,
		person: 0,
		condition: "gout",
		before: -1,
		after: 0,
	})
	reject({
		kind: "condition",
		time: 1,
		person: 0,
		condition: "infirm",
		before: -2,
		after: 0,
	})
	reject({ kind: "creation", time: 1, person: 0 })
	reject({ kind: "coronation", time: 1, person: 0 })
	reject({ kind: "seat", seat: 0, person: 0, reason: "abdication" })
	reject({ kind: "pregnancy", time: 1, mother: 0, father: 1, outcome: "birth" })
	reject({ kind: "betrothal_end", time: 1, a: 0, b: 1, cause: "unknown" })
	reject({ kind: "death", time: Number.NaN, person: 0, cause: "natural" })
	reject({ kind: "death", time: Infinity, person: 0, cause: "natural" })
	reject({ kind: "death", time: 1, person: 2 ** 31, cause: "natural" })
	reject({ kind: "death", time: 1, person: 0, cause: "plague" })
	reject({ kind: "death", time: 1, person: -2, cause: "natural" })
	reject({ kind: "stress", time: 1, person: 0, level: 1.5 })
	expect(log.count).toBe(0)
	expect(PEOPLE_LOG.pending(people)).toBe(false)

	PEOPLE_LOG.append({
		log,
		row: { kind: "death", time: 1, person: 0, cause: "natural" },
	})
	const packet = PEOPLE_LOG.seal({ people, sovereign: () => true })
	expect(() => PEOPLE_LOG.read({ rows: packet, index: 1 })).toThrow()
	packet.b[0] = 4
	expect(() => PEOPLE_LOG.read({ rows: packet, index: 0 })).toThrow()
	packet.b[0] = 0
	packet.kind[0] = 14
	expect(() => PEOPLE_LOG.read({ rows: packet, index: 0 })).toThrow()

	PEOPLE_LOG.append({ log, row: memory as AppendedRow })
	const memories = PEOPLE_LOG.seal({ people, sovereign: () => true })
	expect(PEOPLE_LOG.read({ rows: memories, index: 0 })).toEqual(memory)
	for (const [column, value] of [
		["d", 1],
		["c", OPINION_MEMORY.reasons.length],
		["c", -1],
		["b", 0],
		["b", -1],
		["time", Number.NaN],
	] as const) {
		const held = memories[column][0]
		memories[column][0] = value
		expect(() => PEOPLE_LOG.read({ rows: memories, index: 0 })).toThrow()
		memories[column][0] = held
	}
	expect(PEOPLE_LOG.read({ rows: memories, index: 0 })).toEqual(memory)
})

it("seals each person once with an exact snapshot and grows without losing rows", () => {
	const people = PEOPLE.create(8)
	const table = people.persons
	const first = [spawn(people), spawn(people), spawn(people)]
	table.nameSeed[first[1]] = 0x7fffffff
	table.father[first[2]] = first[0]
	table.mother[first[2]] = first[1]
	const packet = PEOPLE_LOG.seal({ people, sovereign: () => true })
	expect(byteLength(packet)).toBe(25 * 3 + 79 * 3)
	expect(rowsOf(packet)).toEqual(
		first.map((person) => ({
			kind: "creation",
			time: table.birth[person],
			person,
			father: table.father[person],
			mother: table.mother[person],
			snapshot: person,
		})),
	)
	for (const person of first)
		for (const column of SNAPSHOT_COLUMNS)
			expect(packet[column][person]).toBe(
				column === "death" && table.death[person] > people.household.time()
					? Infinity
					: table[column][person],
			)
	expect(packet.nameSeed[first[1]]).toBe(0x7fffffff)
	expect(PEOPLE_LOG.pending(people)).toBe(false)

	const late = spawn(people)
	const rows = 5000
	for (let level = 0; level < rows; level++)
		PEOPLE_LOG.append({
			log: people.log,
			row: { kind: "stress", time: level / 8, person: late, level },
		})
	expect(people.log.time.length).toBe(8192)
	const grown = PEOPLE_LOG.seal({ people, sovereign: () => true })
	expect(grown.count).toBe(rows + 1)
	expect(byteLength(grown)).toBe(25 * (rows + 1) + 79)
	const decoded = rowsOf(grown)
	expect(decoded[0]).toMatchObject({
		kind: "creation",
		person: late,
		snapshot: 0,
	})
	for (const level of [0, 4095, 4096, rows - 1])
		expect(decoded[level + 1]).toEqual({
			kind: "stress",
			time: level / 8,
			person: late,
			level,
		})

	const invalid: [keyof typeof table, number][] = [
		["death", Number.NaN],
		["birth", Number.NaN],
		["sex", 2],
		["nameSeed", 2 ** 31],
		["father", -2],
		["bases", Number.NaN],
	]
	const broken = spawn(people)
	for (const [column, value] of invalid) {
		const columnValues = table[column] as number[]
		const valid = columnValues[broken]
		columnValues[broken] = value
		expect(() => PEOPLE_LOG.seal({ people, sovereign: () => true })).toThrow()
		columnValues[broken] = valid
	}
	expect(PEOPLE_LOG.pending(people)).toBe(true)
	expect(PEOPLE_LOG.seal({ people, sovereign: () => true }).count).toBe(1)
})

it("records every person once and rebuilds the same record from transferred packets", () => {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const startTimeMs = engine.time
	const direct = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const streamed = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const directTranslator = SIM_RECORD.createTranslator({ state: direct, world })
	const streamedTranslator = SIM_RECORD.createTranslator({
		state: streamed,
		world,
	})
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const created: number[] = []
	const kinds = new Set<string>()
	for (let year = 0; year <= 25; year++) {
		if (year === 1) {
			const parties = [0, 1].map((sex) =>
				PEOPLE.spawn({
					recordHealth: true,
					death: null,
					nameSeed: null,
					people: engine.people,
					sex: sex === 0 ? 0 : 1,
					birth: engine.time / STATE.yearMs - 13,
					survives: engine.time / STATE.yearMs - 13,
					father: -1,
					mother: -1,
					dynasty: -1,
					origin: { realm: 0, culture: 0, genderSystem: 0 },
					rng,
				}),
			)
			BETROTHAL.betroth({
				people: engine.people,
				a: parties[0],
				b: parties[1],
				time: engine.time / STATE.yearMs,
			})
			BETROTHAL.release({
				people: engine.people,
				person: parties[0],
				time: engine.time / STATE.yearMs,
				cause: "alliance",
			})
		}
		if (year > 0)
			SIM_ENGINE.simulateUntil({
				state: engine,
				targetTimeMs: startTimeMs + STATE.deltaYear(year),
				rng,
				validate: false,
			})
		const packets = engine.journal.flatMap((transaction) =>
			transaction.people ? [transaction.people] : [],
		)
		for (const packet of packets) {
			expect(byteLength(packet)).toBe(
				25 * packet.count + 79 * packet.sex.length,
			)
			for (const row of rowsOf(packet)) {
				kinds.add(row.kind)
				if (row.kind === "creation") created.push(row.person)
			}
		}
		if (year === 0) expect(kinds.has("opinion_memory")).toBe(false)
		SIM_RECORD.appendJournal({
			translator: directTranslator,
			transactions: engine.journal,
		})
		const received = structuredClone(engine.journal, {
			transfer: JOURNAL.transferList(engine.journal),
		})
		for (const packet of packets) {
			expect(packet.time.byteLength).toBe(0)
			expect(packet.carried.byteLength).toBe(0)
		}
		JOURNAL.releaseSent(engine)
		SIM_RECORD.consumeJournal({
			translator: streamedTranslator,
			transactions: received,
		})
	}
	const table = engine.people.persons
	const count = table.birth.length
	expect(created).toEqual(Array.from({ length: count }, (...entry) => entry[1]))
	// Stress rows depend on which rulers the world's wars happen to strain.
	kinds.delete("stress")
	kinds.delete("consort")
	expect([...kinds].sort()).toEqual([
		"betrothal",
		"betrothal_end",
		"condition",
		"creation",
		"death",
		"health_band",
		"opinion_memory",
		"pregnancy",
		"regent",
		"residence",
		"seat",
		"wedding",
	])

	const people = streamed.record.people as PeopleRecord
	expect(people).toEqual(direct.record.people)
	expect(engine.people.memories.size).toBeGreaterThan(0)
	for (const [observer, targets] of engine.people.memories)
		for (const [target, entries] of targets)
			expect(
				PERSON_QUERY.memories({
					people,
					a: observer,
					b: target,
					timeMs: streamed.record.maxTimeMs,
				})
					.filter((memory) => memory.strength !== 0)
					.map((memory) => ({
						reason: memory.reason,
						start:
							memory.startTimeMs / STATE.yearMs + DATE.earthHistoryStartYear,
					}))
					.sort((x, y) => x.reason.localeCompare(y.reason)),
			).toEqual(
				entries
					.filter(
						(memory) =>
							!OPINION_MEMORY.expired({
								memory,
								time:
									streamed.record.maxTimeMs / STATE.yearMs +
									DATE.earthHistoryStartYear,
							}),
					)
					.sort((x, y) => x.reason.localeCompare(y.reason)),
			)
	expect(PEOPLE_RECORD.count(people)).toBe(count)
	expect(PEOPLE_RECORD.has({ people, id: count })).toBe(false)
	expect(PEOPLE_RECORD.has({ people, id: -1 })).toBe(false)
	const offsetMs = DATE.earthHistoryStartYear * STATE.yearMs
	for (let id = 0; id < count; id++) {
		const person = PEOPLE_RECORD.person({ people, id })
		expect(person).toMatchObject({
			id,
			sex: table.sex[id],
			father: table.father[id],
			mother: table.mother[id],
			dynasty: table.dynasty[id],
			culture: table.culture[id],
			nameSeed: table.nameSeed[id],
			home: table.home[id],
			bases: table.bases[id],
			personality: table.personality[id],
			grades: table.grades[id],
			congenital: table.congenital[id],
			carried: table.carried[id],
			birthTimeMs: table.birth[id] * STATE.yearMs - offsetMs,
			deathTimeMs:
				table.death[id] * STATE.yearMs <= engine.time
					? table.death[id] * STATE.yearMs - offsetMs
					: Infinity,
		})
	}
	const start = startTimeMs / STATE.yearMs
	const seated = new Set(people.tenures.map((tenure) => tenure.person))
	const ids = Array.from({ length: count }, (...entry) => entry[1])
	expect(ids.some((id) => !seated.has(id) && table.death[id] > start)).toBe(
		true,
	)
	expect(ids.some((id) => !seated.has(id) && table.death[id] <= start)).toBe(
		true,
	)
	expect(ids.some((id) => table.dynasty[id] < 0 && table.father[id] < 0)).toBe(
		true,
	)
	// Final ancestry is allocated before births; child IDs remain ordered.
	expect(
		ids.some((id) =>
			table.children[id].some(
				(child, index) => index > 0 && child < table.children[id][index - 1],
			),
		),
	).toBe(false)
}, 600000)

it("keeps the append buffer writable after a transfer and never emits a row twice", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = engine.people
	const initial = engine.journal.flatMap((transaction) =>
		transaction.people ? [transaction.people] : [],
	)
	expect(initial.reduce((sum, packet) => sum + packet.sex.length, 0)).toBe(
		people.persons.birth.length,
	)
	structuredClone(engine.journal, {
		transfer: JOURNAL.transferList(engine.journal),
	})
	JOURNAL.releaseSent(engine)
	expect(PEOPLE_LOG.pending(people)).toBe(false)
	const flush = () =>
		JOURNAL.flush({
			state: engine,
			noteCursor: 0,
			census: false,
			initial: false,
		})
	flush()
	expect(engine.journal).toHaveLength(0)

	const district = Array.from(
		{ length: engine.P },
		(...entry) => entry[1],
	).find((seat) => engine.parentCurrent[seat] >= 0) as number
	const realm = engine.parentCurrent.indexOf(-1)
	const born = spawn(people)
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "seat", seat: district, person: born, reason: "union" },
	})
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "seat", seat: realm, person: born, reason: "partition" },
	})
	flush()
	flush()
	expect(engine.journal).toHaveLength(1)
	const packet = engine.journal[0].people as PeoplePacket
	expect(rowsOf(packet)).toEqual([
		{
			kind: "creation",
			time: people.persons.birth[born],
			person: born,
			father: -1,
			mother: -1,
			snapshot: 0,
		},
		{
			kind: "seat",
			seat: district,
			person: born,
			seatKind: "district",
			reason: "union",
		},
		{
			kind: "seat",
			seat: realm,
			person: born,
			seatKind: "ruler",
			reason: "partition",
		},
	])
	expect(byteLength(packet)).toBe(25 * 3 + 79)
}, 600000)

it("answers family, marriage, betrothal, tenure, pregnancy and stress views from the record alone", () => {
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
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: engine.time + STATE.deltaYear(40),
		rng: HISTORY_RNG.createHistoryRng(seed + 99999),
		validate: false,
	})
	const transactions = structuredClone(engine.journal, {
		transfer: JOURNAL.transferList(engine.journal),
	})
	SIM_RECORD.consumeJournal({ translator, transactions })
	const people = state.record.people as PeopleRecord
	const timeMs = state.record.maxTimeMs
	const views = Array.from(
		{ length: PEOPLE_RECORD.count(people) },
		(...entry) => PERSON_QUERY.view({ people, id: entry[1], timeMs }),
	).flatMap((view) => (view ? [view] : []))
	expect(views.length).toBeGreaterThan(0)
	for (const [label, found] of [
		["children", views.some((view) => view.children.length > 0)],
		["siblings", views.some((view) => view.siblings.length > 0)],
		["parents", views.some((view) => view.father >= 0 && view.mother >= 0)],
		["spouses", views.some((view) => view.spouses.length > 0)],
		["betrothals", views.some((view) => view.betrothals.length > 0)],
		["tenures", views.some((view) => view.tenures.length > 0)],
		["regents", views.some((view) => view.regents.length > 0)],
		["deaths", views.some((view) => view.deathTimeMs !== null)],
	] as const)
		expect([label, found]).toEqual([label, true])
	for (const view of views) {
		for (const relative of [
			...view.children,
			...view.siblings,
			...view.spouses.map((spouse) => spouse.person),
			...view.betrothals.map((betrothal) => betrothal.person),
		])
			expect(PEOPLE_RECORD.has({ people, id: relative })).toBe(true)
		for (const child of view.children)
			expect([view.id]).toContain(
				view.sex === 0
					? PEOPLE_RECORD.person({ people, id: child })?.father
					: PEOPLE_RECORD.person({ people, id: child })?.mother,
			)
	}
	const events = new Set(
		views.flatMap((view) =>
			PERSON_QUERY.timeline({ people, id: view.id, timeMs }).map(
				(event) => event.kind,
			),
		),
	)
	for (const kind of [
		"born",
		"married",
		"betrothed",
		"child born",
		"took seat",
		"became regent",
		"miscarriage",
		"stillborn child",
		"died in childbirth",
		"died",
	])
		expect(events).toContain(kind)
	const stressed = [...people.stressOf.values()]
		.flat()
		.findLast((row) => row.level > 0)
	if (!stressed) throw new Error("Missing stress rows")
	expect(
		PERSON_QUERY.stress({
			people,
			id: stressed.person,
			timeMs: stressed.timeMs,
		}),
	).toBe(stressed.level)
}, 600000)
