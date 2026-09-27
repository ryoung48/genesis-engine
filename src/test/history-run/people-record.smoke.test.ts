import { expect, it } from "vitest"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

it("records rulers, their families and seat tenures consistently", () => {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: engine.time + STATE.deltaYear(30),
		rng,
		validate: false,
	})
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const people = state.record.people
	expect(people).not.toBeNull()
	if (!people) return

	for (const log of state.record.events.nationEvents)
		for (const event of log?.events ?? []) {
			if (event.kind !== "rulerChange") continue
			expect(people.persons.has(event.payload.person as number)).toBe(true)
		}

	for (const tenures of [
		...people.tenuresOfSeat.values(),
		...people.regentsOfSeat.values(),
	])
		for (let i = 1; i < tenures.length; i++) {
			const previous = people.tenures[tenures[i - 1]]
			const next = people.tenures[tenures[i]]
			expect(previous.endTimeMs).toBeLessThanOrEqual(next.startTimeMs)
		}

	for (const marriage of people.marriages) {
		expect(people.persons.has(marriage.husband)).toBe(true)
		expect(people.persons.has(marriage.wife)).toBe(true)
	}

	const rootOf = new Map<number, number>()
	for (const [root, nationId] of translator.identityByRoot)
		rootOf.set(nationId, root)
	const activeMarriages = new Map<string, [number, number]>()
	for (const event of state.record.events.diplomacy) {
		if (!event.kind.startsWith("royalMarriage")) continue
		const key = `${Math.min(event.firstId, event.secondId)}:${Math.max(event.firstId, event.secondId)}`
		if (event.kind === "royalMarriageStart")
			activeMarriages.set(key, [event.firstId, event.secondId])
		else activeMarriages.delete(key)
	}
	for (const [first, second] of activeMarriages.values()) {
		const rulerA = engine.people.rulerOf[rootOf.get(first) ?? -1] ?? -1
		const rulerB = engine.people.rulerOf[rootOf.get(second) ?? -1] ?? -1
		expect(
			rulerA >= 0 &&
				rulerB >= 0 &&
				PEOPLE.tiedByMarriage({
					people: engine.people,
					a: rulerA,
					b: rulerB,
					time: engine.time / STATE.yearMs,
				}),
		).toBe(true)
	}

	const years = engine.time / STATE.yearMs
	const table = engine.people.persons
	for (let seat = 0; seat < engine.P; seat++) {
		const holder = engine.people.rulerOf[seat]
		if (holder < 0 || STATE.isSovereign({ state: engine, p: seat })) continue
		if (table.throne[holder] !== seat) continue
		expect(years - table.birth[holder]).toBeGreaterThanOrEqual(16)
	}
	for (const [realm, regency] of engine.people.regencies)
		if (regency.regent >= 0) {
			expect(people.persons.has(regency.regent)).toBe(true)
			expect(years - table.birth[regency.regent]).toBeGreaterThanOrEqual(16)
			if (engine.people.rulerOf[realm] === regency.ward)
				expect(table.death[regency.regent]).toBeGreaterThan(years)
		}
	for (const claim of engine.people.deposed.values()) {
		expect(claim.generation).toBeLessThan(2)
		expect(people.persons.has(claim.claimant)).toBe(true)
	}

	const timeMs = state.record.maxTimeMs
	for (let seat = 0; seat < engine.P; seat++) {
		const ruler = engine.people.rulerOf[seat]
		if (ruler < 0 || !STATE.isSovereign({ state: engine, p: seat })) continue
		const view = PERSON_QUERY.view({ people, id: ruler, timeMs })
		expect(view?.tenures.some((tenure) => tenure.endTimeMs === null)).toBe(true)
		expect(PERSON_QUERY.health({ people, id: ruler, timeMs })).not.toBeNull()
		expect(people.persons.get(ruler)?.name).toBeTruthy()
	}
}, 600_000)
