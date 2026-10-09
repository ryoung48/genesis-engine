import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	EngineNote,
	HistoryState,
} from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { AppendedRow } from "@/model/history/sim/people/log/types"
import type { Sex } from "@/model/history/sim/people/types"
import { RNG } from "@/model/shared/random/rng"
import { PEOPLE_HEALTH_REPORT } from "@/test/history-run/report/people-health"

const ORIGIN = { realm: 0, culture: 0, genderSystem: 0 }
const START = 100

// A hand-built population in years: the record takes times in engine
// milliseconds, as the report run's record does.
function fixture() {
	const people = PEOPLE.create(4)
	const clock = { time: START }
	people.household = { ...people.household, time: () => clock.time }
	const record = PEOPLE_RECORD.create()
	const packets: ReturnType<typeof PEOPLE_LOG.seal>[] = []
	const flush = () => {
		const packet = PEOPLE_LOG.seal({ people, sovereign: () => true })
		packets.push(packet)
		PEOPLE_RECORD.append({
			record,
			packet,
			timeMs: clock.time * STATE.yearMs,
			recordTime: (years) => years * STATE.yearMs,
		})
	}
	const table = people.persons
	const spawn = (sex: Sex, birth: number, band: string) => {
		const person = PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex,
			birth,
			survives: 1e6,
			father: -1,
			mother: -1,
			dynasty: 0,
			origin: ORIGIN,
			rng: RNG.createRng({ seed: 3 }),
		})
		table.death[person] = Infinity
		table.healthFlags[person] = PEOPLE_LOG.healthBands.indexOf(
			band as (typeof PEOPLE_LOG.healthBands)[number],
		)
		return person
	}
	const log = (row: AppendedRow) => PEOPLE_LOG.append({ log: people.log, row })
	const at = (time: number, rows: AppendedRow[]) => {
		clock.time = time
		for (const row of rows) {
			log(row)
			if (row.kind === "death") table.death[row.person] = row.time
		}
		flush()
	}
	// Starters: two old men, a woman of 30 and a boy of 10; one ancestor
	// already dead.
	const oldBlind = spawn(0, 40, "Poor")
	const oldMind = spawn(0, 45, "Fine")
	const woman = spawn(1, 70, "Good")
	const boy = spawn(0, 90, "Good")
	const ancestor = spawn(0, 10, "Poor")
	table.death[ancestor] = 60
	people.log.count = 0
	at(START, [
		{
			kind: "condition",
			time: START,
			person: oldBlind,
			condition: "clouded_eyes",
			before: -1,
			after: 3,
		},
	])
	// Children delivered in the simulation.
	clock.time = 101
	const daughter = spawn(1, 101, "Good")
	const son = spawn(0, 101, "Good")
	people.log.count = 0
	flush()
	at(100.5, [])
	at(100.6, [
		{ kind: "death", time: 100.6, person: boy, cause: "natural" },
		{ kind: "wedding", time: 100.6, husband: oldMind, wife: woman },
	])
	at(102, [
		{
			kind: "condition",
			time: 102,
			person: oldBlind,
			condition: "clouded_eyes",
			before: 3,
			after: -1,
		},
		{
			kind: "condition",
			time: 102,
			person: oldBlind,
			condition: "blind",
			before: -1,
			after: 0,
		},
		{
			kind: "condition",
			time: 102,
			person: oldMind,
			condition: "withering_mind",
			before: -1,
			after: 0,
		},
		{
			kind: "condition",
			time: 102,
			person: oldMind,
			condition: "faltering_heart",
			before: -1,
			after: 0,
		},
	])
	at(104, [
		{
			kind: "condition",
			time: 104,
			person: oldMind,
			condition: "withering_mind",
			before: 0,
			after: 4,
		},
		{
			kind: "condition",
			time: 104,
			person: oldMind,
			condition: "incapable",
			before: -1,
			after: 0,
		},
		{
			kind: "condition",
			time: 104,
			person: oldMind,
			condition: "faltering_heart",
			before: 0,
			after: 1,
		},
		{ kind: "death", time: 104, person: son, cause: "natural" },
	])
	at(105.5, [
		{ kind: "death", time: 105.5, person: oldMind, cause: "heart" },
		{ kind: "death", time: 105.5, person: woman, cause: "childbirth" },
	])
	at(108, [{ kind: "death", time: 108, person: oldBlind, cause: "battle" }])
	return { people, record, packets, daughter }
}

function note(tag: string, time: number, data: EngineNote["data"]): EngineNote {
	return { tag, time: time * STATE.yearMs, data }
}

it("folds deaths, conditions, causes and command into each window by hand count", () => {
	const { people, record, packets, daughter } = fixture()
	const engine = {
		P: 0,
		time: 110 * STATE.yearMs,
		people,
		lifecycle: {
			births: 2,
			deaths: 5,
			staleDeaths: 1,
			cancelledDeliveries: 3,
			peakDeliveries: 7,
		},
		events: [
			note("regency started", 101, { regencyCause: "minority" }),
			note("regency started", 104, { regencyCause: "incapacity" }),
			note("regency started", 109.9, { regencyCause: "incapacity" }),
			note("usurpation", 106, { regencyCause: "incapacity" }),
			note("regency started", 110, { regencyCause: "minority" }),
			note("battle", 103, {
				attackerLeader: 1,
				defenderLeader: -1,
				attackerLeaderKilled: false,
				defenderLeaderKilled: false,
			}),
			note("battle", 108, {
				attackerLeader: 0,
				defenderLeader: 1,
				attackerLeaderKilled: true,
				defenderLeaderKilled: false,
			}),
			note("battle", 111, {
				attackerLeader: 1,
				defenderLeader: -1,
				attackerLeaderKilled: false,
				defenderLeaderKilled: false,
			}),
		],
	} as unknown as HistoryState
	const tracker = PEOPLE_HEALTH_REPORT.tracker({
		engine: {
			...engine,
			lifecycle: {
				births: 0,
				deaths: 1,
				staleDeaths: 0,
				cancelledDeliveries: 0,
				peakDeliveries: 0,
			},
		} as HistoryState,
	})
	PEOPLE_HEALTH_REPORT.ingest({
		tracker,
		transactions: packets.map(
			(packet, index): JournalTransaction => ({
				timeMs: index,
				parents: [],
				relations: [],
				occupations: [],
				coalitions: [],
				rulers: [],
				people: packet,
				notes: [],
				census: null,
			}),
		),
	})
	tracker.healthMs = 50
	// Two yearly samples of the living: only the daughter remains.
	PEOPLE_HEALTH_REPORT.sample({ engine, tracker })
	PEOPLE_HEALTH_REPORT.sample({ engine, tracker })
	const report = PEOPLE_HEALTH_REPORT.summarize({
		engine,
		tracker,
		record,
		start: START,
		from: 100,
		to: 110,
	})
	expect(report.lifecycle).toEqual({
		weddingsPerYear: 0.1,
		birthEventsPerYear: 0.2,
		deathEventsPerYear: 0.4,
		staleDeathEvents: 1,
		cancelledDeliveries: 3,
		peakPendingDeliveries: 7,
		deadSeatHolderYears: 0,
	})
	expect(report.healthPassMsPerYear).toBe(5)
	expect(report.bandPersonYears).toEqual({
		Dying: 0,
		"Near death": 0,
		Poor: 0,
		Fine: 0,
		Good: 2,
		Excellent: 0,
	})
	expect(report.deaths.deaths).toBe(5)
	expect(report.deaths.byCause).toEqual({
		natural: 2,
		heart: 1,
		battle: 1,
		childbirth: 1,
	})
	// Men died at 3, 10.6, 60.5 and 68; the one woman at 35.5.
	const men = report.deaths.ageAtDeath[0]
	expect(men?.map((age) => +age.toFixed(1))).toEqual([3, 10.6, 60.5, 68, 68])
	expect(report.deaths.ageAtDeath[1]?.map((age) => +age.toFixed(1))).toEqual([
		35.5, 35.5, 35.5, 35.5, 35.5,
	])
	expect(
		report.deaths.adultAgeAtDeath[0]?.map((age) => +age.toFixed(1)),
	).toEqual([60.5, 60.5, 68, 68, 68])
	// Nobody born in the simulation reaches 16 inside this window.
	expect(report.deaths.childhoodCohort).toBe(0)
	expect(report.deaths.survivedTo16Share).toBeNull()
	// The two old men had health records and died past 50; the ancestor has
	// no record and died before the window.
	expect(report.deaths.reached50).toBe(2)
	expect(report.deaths.everBlind).toBe(1)
	expect(report.deaths.everIncapable).toBe(1)
	expect(report.deaths.incapableYears).toBeCloseTo(1.5, 9)
	// The starter's Clouded Eyes is a snapshot, not an onset; Blind at 62,
	// and the other man's three onsets at 57, 59 and 57.
	expect(report.deaths.onsetAges).toEqual({
		infirm: { onsets: 0, meanAge: null },
		clouded_eyes: { onsets: 0, meanAge: null },
		fragile_bones: { onsets: 0, meanAge: null },
		withering_mind: { onsets: 1, meanAge: 57 },
		faltering_heart: { onsets: 1, meanAge: 57 },
		blind: { onsets: 1, meanAge: 62 },
		incapable: { onsets: 1, meanAge: 59 },
	})
	expect(report.conditions.from50To59.personYears).toBe(0)
	// The window is [100, 110): the note at 110 belongs to the next one.
	expect(report.causes.regenciesStarted).toEqual({ minority: 1, incapacity: 2 })
	expect(report.causes.usurpations).toEqual({ minority: 0, incapacity: 1 })
	expect(report.command).toEqual({
		fieldBattles: 2,
		ledSides: 3,
		leadersKilled: 1,
		maxLedPerRulerYear: 1,
	})

	// The next window starts from the engine's counters with nothing carried.
	engine.lifecycle.births = 5
	const next = PEOPLE_HEALTH_REPORT.summarize({
		engine,
		tracker,
		record,
		start: START,
		from: 110,
		to: 120,
	})
	expect(next.lifecycle).toMatchObject({
		weddingsPerYear: 0,
		birthEventsPerYear: 0.3,
		deathEventsPerYear: 0,
		staleDeathEvents: 0,
		cancelledDeliveries: 0,
	})
	expect(next.deaths.deaths).toBe(0)
	expect(next.deaths.ageAtDeath).toEqual([null, null])
	expect(next.bandPersonYears.Good).toBe(0)
	expect(next.healthPassMsPerYear).toBe(0)
	expect(next.causes.regenciesStarted).toEqual({ minority: 1, incapacity: 0 })
	expect(next.command.fieldBattles).toBe(1)
	// The two children delivered at 101 turn 16 at 117: one died at 3.
	expect(next.deaths.childhoodCohort).toBe(2)
	expect(next.deaths.survivedTo16Share).toBe(0.5)
	expect(PEOPLE_RECORD.deathTimeMs({ people: record, id: daughter })).toBe(
		Infinity,
	)

	const starters = PEOPLE_HEALTH_REPORT.starters({ record, start: START })
	expect(starters.bands).toEqual({
		Dying: 0,
		"Near death": 0,
		Poor: 1,
		Fine: 1,
		Good: 2,
		Excellent: 0,
	})
	expect(starters.under16).toEqual({
		starters: 1,
		diedYear1: 1,
		diedYear2: 0,
		diedYears3To10: 0,
	})
	expect(starters.from16To39).toEqual({
		starters: 1,
		diedYear1: 0,
		diedYear2: 0,
		diedYears3To10: 1,
	})
	expect(starters.from40To59).toEqual({
		starters: 1,
		diedYear1: 0,
		diedYear2: 0,
		diedYears3To10: 1,
	})
	expect(starters.from60).toEqual({
		starters: 1,
		diedYear1: 0,
		diedYear2: 0,
		diedYears3To10: 1,
	})
})
