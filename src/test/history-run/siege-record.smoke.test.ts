import { expect, it, vi } from "vitest"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { SIM_RECORD } from "@/model/history/sim/record"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

it("translates every siege snapshot and synchronizes coalition changes at siege events", () => {
	const { engine, generated } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const recordState = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: recordState, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const war = engine.wars[[...engine.activeWarIds][0]]
	const ally = [...translator.identityByRoot.keys()].find(
		(nation) => nation !== war.attacker && nation !== war.defender,
	)!
	const record = recordState.record.events.wars[war.idx]
	engine.militaryReady = false
	war.participants = { [war.attacker]: "attacker", [war.defender]: "defender" }
	war.deployed = {
		[war.attacker]: { levy: 200, regular: 0 },
		[war.defender]: { levy: 200, regular: 0 },
	}
	for (const nation of [war.attacker, war.defender, ally]) {
		engine.levyCurrent[nation] = 200
		engine.regularCurrent[nation] = 0
	}
	engine.popUrbanCurrent[war.defender] = 5000
	engine.provinceTopography[war.defender] = 0
	engine.provinceVegetation[war.defender] = 3
	vi.spyOn(RECRUITMENT, "advance").mockReturnValue(undefined)
	vi.spyOn(RECRUITMENT, "realmTargets").mockReturnValue(
		RECRUITMENT.targets({
			population: 100000,
			tribal: false,
			knowledge: 1,
			surplus: 100,
			outputPerHead: 450,
		}),
	)
	vi.spyOn(KNOWLEDGE, "maxFieldArmy").mockReturnValue(1000)
	vi.spyOn(MILITARY, "clash").mockReturnValue({
		attackerWon: true,
		outcome: "inconclusive",
		initialOutcome: "inconclusive",
		preBattleWinProbability: 0.5,
		powerShare: 0.5,
		attackerLosses: 1,
		defenderLosses: 1,
		loserShortfall: 0,
	})
	vi.spyOn(CONQUEST, "apply").mockReturnValue(undefined)
	const siege = SIEGE.prepare({
		state: engine,
		war,
		attacker: war.attacker,
		province: war.defender,
	})!
	let cursor = engine.events.length
	SIEGE.begin({ state: engine, war, siege })
	JOURNAL.flush({
		state: engine,
		noteCursor: cursor,
		census: false,
		initial: false,
	})
	SIM_RECORD.appendJournal({
		translator,
		transactions: [engine.journal.at(-1)!],
	})
	expect(record.sieges.at(-1)).toMatchObject({
		outcome: null,
		endTimeMs: null,
		endContributions: null,
		phases: null,
		reason: null,
	})
	siege.breaches = 2
	war.participants[ally] = "attacker"
	war.deployed[ally] = { levy: 50, regular: 0 }
	engine.time += 30 * 86400000
	JOURNAL.coalition({
		state: engine,
		warId: war.idx,
		goal: war.goal,
		attackers: [war.attacker, ally],
		defenders: [war.defender],
	})
	const rng = HISTORY_RNG.createHistoryRng(2025)
	let i = 0
	const values = [0.99, 0.5, 0, 0, 0.99]
	rng.random = () => values[i++] ?? 0.99
	cursor = engine.events.length
	SIEGE.tick({ state: engine, warIdx: war.idx, rng })
	const notes = engine.events
		.slice(cursor)
		.filter((note) => note.tag === "siege beat")
	expect(notes.map((note) => note.data.beat)).toEqual([
		"breach",
		"sortie",
		"assault",
	])
	JOURNAL.flush({
		state: engine,
		noteCursor: cursor,
		census: false,
		initial: false,
	})
	SIM_RECORD.appendJournal({
		translator,
		transactions: [engine.journal.at(-1)!],
	})
	const recorded = record.sieges.at(-1)!
	expect(recorded.beats).toHaveLength(3)
	const allyId = translator.identityByRoot.get(ally)!
	expect(
		record.events.findLast(
			(event) => event.nationId === allyId && event.kind === "warStart",
		)?.timeMs,
	).toBe(TRANSLATOR.recordTime(engine.time))
	recorded.beats.forEach((beat, index) => {
		const data = notes[index].data
		expect(beat.contributions.map((m) => m.troops)).toEqual(data.deployedTroops)
		expect(beat.contributions.map((m) => m.countryId)).toEqual(
			(data.deployedNations as number[]).map((nation) =>
				translator.identityByRoot.get(nation),
			),
		)
	})
	const totals = recorded.beats.map((beat) =>
		beat.contributions.reduce((sum, m) => sum + m.troops, 0),
	)
	expect(totals[1]).toBeLessThan(totals[0])
	expect(totals[2]).toBeLessThan(totals[1])
	expect(recorded.outcome).toBeNull()
	engine.time += 30 * 86400000
	delete war.participants[ally]
	delete war.deployed[ally]
	JOURNAL.coalition({
		state: engine,
		warId: war.idx,
		goal: war.goal,
		attackers: [war.attacker],
		defenders: [war.defender],
	})
	cursor = engine.events.length
	rng.random = () => 0
	SIEGE.tick({ state: engine, warIdx: war.idx, rng })
	JOURNAL.flush({
		state: engine,
		noteCursor: cursor,
		census: false,
		initial: false,
	})
	SIM_RECORD.appendJournal({
		translator,
		transactions: [engine.journal.at(-1)!],
	})
	expect(recorded).toMatchObject({
		outcome: "betrayed",
		reason: null,
		phases: 2,
		endTimeMs: TRANSLATOR.recordTime(engine.time),
	})
	expect(
		record.events.findLast(
			(event) => event.nationId === allyId && event.kind === "warEnd",
		)?.timeMs,
	).toBe(TRANSLATOR.recordTime(engine.time))
	expect(recorded.endContributions?.map((m) => m.troops)).toEqual(
		engine.events.findLast((note) => note.tag === "siege ended")?.data
			.deployedTroops,
	)
	vi.restoreAllMocks()
}, 120000)
