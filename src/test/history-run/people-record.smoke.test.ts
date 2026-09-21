import { expect, it } from "vitest"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { PEOPLE_RECORD_VERIFY } from "@/test/history-run/people-record"
import { SUCCESSION_AUDIT } from "@/test/history-run/succession-audit"
import type { YearHookParams } from "@/test/history-run/types"

const SEED = 14963991
const POINTS = 20000

it("rebuilds every person, marriage and tenure on the main thread", () => {
	let last: YearHookParams | null = null
	HISTORY_RUN.run({
		seed: SEED,
		era: "highMedieval",
		numPoints: POINTS,
		years: 50,
		summaryPath: "",
		log: () => undefined,
		onYear: (params) => {
			const record = params.record.record.people
			PEOPLE_RECORD_VERIFY.verifyBands({
				engine: params.engine,
				record,
				year: params.year,
			})
			PEOPLE_RECORD_VERIFY.verifyTenures({
				engine: params.engine,
				record,
				year: params.year,
			})
			last = params
		},
	})
	if (!last) throw new Error("No year ran")
	const { engine, record: state, year } = last
	const record = state.record.people
	const counts = PEOPLE_RECORD_VERIFY.rowCoverage({
		engine,
		transactions: engine.journal,
	})
	expect(counts.births).toBeGreaterThan(0)
	expect(counts.arrivals).toBeGreaterThan(0)
	PEOPLE_RECORD_VERIFY.verifyPersons({ engine, record, year })
	PEOPLE_RECORD_VERIFY.verifyMarriages({ engine, record, year })
	PEOPLE_RECORD_VERIFY.verifyDynastyCultures({
		engine,
		record,
		transactions: engine.journal,
	})
}, 3_600_000)

it("writes an arrival row for each forced founder", () => {
	const { engine, generated } = HISTORY_RUN.createEngine({
		seed: SEED,
		era: "highMedieval",
		numPoints: POINTS,
	})
	const people = engine.people
	if (!people) throw new Error("History has no people")
	const before = people.persons.count
	const initial = PEOPLE_RECORD_VERIFY.rowCoverage({
		engine,
		transactions: engine.journal,
	})
	const seats = [false, true].map((sovereign) => {
		for (let seat = 0; seat < engine.P; seat++)
			if (
				engine.leaderNameSeedCurrent[seat] >= 0 &&
				STATE.isSovereign({ state: engine, p: seat }) === sovereign
			)
				return seat
		throw new Error("No suitable seat")
	})
	const time = engine.time / STATE.yearMs
	for (const seat of seats) {
		const person = people.holderOfSeat[seat]
		for (const kin of SUCCESSION_AUDIT.livingKin({
			people,
			person,
			time,
			gender: "male_preference",
		}))
			PEOPLE.endLife({ people, person: kin, time })
		PEOPLE.endLife({ people, person, time })
		SUCCESSION.runSuccession({
			state: engine,
			province: seat,
			leaderIdx: engine.leaderRuntime.idx[seat],
			rng: RNG.createRng({ seed: 5 + seat }),
		})
	}
	JOURNAL.flushPeople({ state: engine })
	const founders = people.persons.count - before
	expect(founders).toBeGreaterThan(0)
	const counts = PEOPLE_RECORD_VERIFY.rowCoverage({
		engine,
		transactions: engine.journal,
	})
	expect(counts.arrivals - initial.arrivals).toBe(founders)
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	PEOPLE_RECORD_VERIFY.verifyTenures({
		engine,
		record: state.record.people,
		year: time,
	})
}, 3_600_000)

it("rebuilds the same record from journals that crossed a transfer", () => {
	const { engine, generated } = HISTORY_RUN.createEngine({
		seed: SEED,
		era: "highMedieval",
		numPoints: POINTS,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const direct = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const transferred = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const directTranslator = SIM_RECORD.createTranslator({
		state: direct,
		world,
	})
	const transferredTranslator = SIM_RECORD.createTranslator({
		state: transferred,
		world,
	})
	const send = (transactions: typeof engine.journal) => {
		SIM_RECORD.appendJournal({
			translator: directTranslator,
			transactions: structuredClone(transactions),
		})
		const cloned = structuredClone(transactions, {
			transfer: JOURNAL.transferList({ journal: transactions }),
		})
		SIM_RECORD.appendJournal({
			translator: transferredTranslator,
			transactions: cloned,
		})
	}
	send(engine.journal)
	const rng = HISTORY_RNG.createHistoryRng(SEED + 99999)
	const start = engine.time / STATE.yearMs
	let cursor = engine.journal.length
	for (let step = 1; step <= 20; step++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: (start + step) * STATE.yearMs,
			rng,
			validate: false,
		})
		send(engine.journal.slice(cursor))
		cursor = engine.journal.length
	}
	const a = direct.record.people
	const b = transferred.record.people
	expect(b.count).toBeGreaterThan(0)
	expect(b.count).toBe(a.count)
	expect(b.healthCount).toBe(a.healthCount)
	expect(b.marriageCount).toBe(a.marriageCount)
	expect(b.tenureCount).toBe(a.tenureCount)
	expect(Array.from(b.birth.slice(0, b.count))).toEqual(
		Array.from(a.birth.slice(0, a.count)),
	)
	expect(Array.from(b.father.slice(0, b.count))).toEqual(
		Array.from(a.father.slice(0, a.count)),
	)
	expect(b.dynastyCulture).toEqual(a.dynastyCulture)
}, 3_600_000)
