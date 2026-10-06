import { expect, it } from "vitest"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { PEOPLE_OPINION_REPORT } from "@/test/history-run/report/people-opinion"

function total(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0)
}

it("reconciles memory, loyalty, drift and diplomacy counts with the run and reports only deltas for the next window", () => {
	const seed = 14963991
	const { engine, generated } = HISTORY_RUN.createEngine({
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
	const record = state.record.people
	if (!record) throw new Error("Missing recorded people")
	const tracker = PEOPLE_OPINION_REPORT.tracker()
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = Math.round(engine.time / STATE.yearMs)
	const years = 12
	let districtYears = 0
	for (let year = start + 1; year <= start + years; year++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: year * STATE.yearMs,
			rng,
			validate: false,
		})
		SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
		engine.journal.length = 0
		const builds = engine.opinionPolitics.contextBuilds
		PEOPLE_OPINION_REPORT.sample({ engine, tracker })
		expect(engine.opinionPolitics.contextBuilds).toBe(builds)
		for (let seat = 0; seat < engine.P; seat++)
			if (
				engine.people.rulerOf[seat] >= 0 &&
				STATE_TITLES.isDistrictSeat({ state: engine, seat })
			)
				districtYears++
	}
	const politics = structuredClone(engine.opinionPolitics)
	const memory = structuredClone(engine.people.memoryCounts)
	const { statistics, cost } = PEOPLE_OPINION_REPORT.of({
		engine,
		tracker,
		record,
		from: start,
		to: start + years,
	})

	let live = 0
	for (const targets of engine.people.memories.values())
		for (const entries of targets.values()) live += entries.length
	let rows = 0
	for (const targets of record.memoriesOf.values())
		for (const refreshes of targets.values()) rows += refreshes.length
	expect(statistics.memory.refreshes).toEqual(memory.refreshes)
	expect(statistics.memory.expired).toEqual(memory.expired)
	expect(statistics.memory.died).toEqual(memory.died)
	expect(total(statistics.memory.refreshes)).toBeGreaterThan(0)
	expect(total(statistics.memory.expired)).toBeGreaterThan(0)
	expect(total(statistics.memory.live)).toBe(live)
	expect(live).toBeLessThanOrEqual(
		total(memory.refreshes) - total(memory.expired) - total(memory.died),
	)
	expect(statistics.pruneVisited).toBe(memory.visited)
	expect(cost.recordRefreshRows).toBe(rows)
	expect(rows).toBe(total(memory.refreshes))
	expect(cost.logPayloadBytes).toBe(25 * rows)
	expect(cost.liveMemoryBytes).toBeGreaterThan(0)
	expect(cost.recordMemoryBytes).toBeGreaterThan(cost.liveMemoryBytes)

	const { holderOpinion, popularity, rebellion, drift, diplomacy } = statistics
	expect(total(holderOpinion.withReligion)).toBe(holderOpinion.holders)
	expect(total(holderOpinion.withoutReligion)).toBe(holderOpinion.holders)
	expect(holderOpinion.holders).toBeGreaterThan(0)
	expect(popularity.realms).toBeGreaterThan(0)
	expect(popularity.p10).toBeLessThanOrEqual(popularity.p90 as number)
	expect(
		Math.round((popularity.meanHolders as number) * popularity.realms),
	).toBeLessThanOrEqual(holderOpinion.holders)
	expect(
		total(rebellion.districtYears) + rebellion.unavailableDistrictYears,
	).toBe(districtYears)
	const evaluated = engine.events.filter(
		(note) =>
			note.tag === "rebellion evaluated" &&
			note.time >= start * STATE.yearMs &&
			note.time < (start + years) * STATE.yearMs &&
			!note.data.seeded,
	)
	expect(statistics.loyaltyEvaluations).toBe(politics.loyaltyEvaluations)
	expect(evaluated.length).toBeGreaterThan(0)
	expect(evaluated.length).toBeLessThanOrEqual(politics.loyaltyEvaluations)
	expect(total(rebellion.evaluations)).toBe(
		evaluated.filter((note) => typeof note.data.holderOpinion === "number")
			.length,
	)
	expect(total(rebellion.rebellions)).toBe(
		evaluated.filter(
			(note) =>
				typeof note.data.holderOpinion === "number" &&
				note.data.decision === "accepted",
		).length,
	)
	for (const [band, rate] of rebellion.perDistrictYear.entries())
		expect(rate).toBe(
			rebellion.districtYears[band] > 0
				? rebellion.rebellions[band] / rebellion.districtYears[band]
				: null,
		)

	expect(drift.calls).toBe(politics.driftCalls)
	expect(drift.calls).toBeGreaterThan(0)
	expect(total(drift.bands)).toBe(drift.calls)
	expect(drift.biased).toBe(drift.calls - drift.bands[2])
	expect(drift.meanBias).toBeCloseTo(politics.driftBias / drift.calls, 12)
	expect(drift.meanStepDelta).toBeCloseTo(
		(politics.driftTiltedStep - politics.driftOriginalStep) / drift.calls,
		12,
	)
	expect(Math.abs(drift.meanBias as number)).toBeLessThanOrEqual(1)
	expect(total(diplomacy.dispositions)).toBeGreaterThan(0)
	expect(diplomacy.alliancesFormed).toBe(
		engine.events.filter(
			(note) =>
				note.tag === "alliance formed" &&
				note.time >= start * STATE.yearMs &&
				note.time < (start + years) * STATE.yearMs,
		).length,
	)
	expect(statistics.contextBuilds).toBe(politics.contextBuilds)
	expect(statistics.marriageCacheMisses).toBe(politics.marriageCacheMisses)
	expect(statistics.marriageCacheMisses).toBeGreaterThan(0)
	for (const value of [
		cost.loyaltyMsPerYear,
		cost.driftMsPerYear,
		cost.pruneMsPerYear,
		cost.reportSampleMsPerYear,
	])
		expect(value).toBeGreaterThanOrEqual(0)

	const next = PEOPLE_OPINION_REPORT.of({
		engine,
		tracker,
		record,
		from: start + years,
		to: start + years + 1,
	})
	expect(next.statistics.memory).toEqual({
		live: statistics.memory.live,
		refreshes: [0, 0, 0, 0, 0, 0, 0, 0, 0],
		expired: [0, 0, 0, 0, 0, 0, 0, 0, 0],
		died: [0, 0, 0, 0, 0, 0, 0, 0, 0],
	})
	expect(next.statistics.drift).toMatchObject({
		calls: 0,
		biased: 0,
		meanBias: null,
		meanStepDelta: null,
	})
	expect(next.statistics.rebellion.districtYears).toEqual([0, 0, 0, 0])
	expect(next.statistics.loyaltyEvaluations).toBe(0)
	expect(next.statistics.holderOpinion).toEqual(holderOpinion)
	expect(next.cost.logPayloadBytes).toBe(0)
	expect(next.cost.recordRefreshRows).toBe(rows)
}, 300_000)
