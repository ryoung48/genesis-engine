import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { RULER_NAMES } from "@/model/history/record/rulers"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { SIM_RECORD } from "@/model/history/sim/record"
import { NAMES } from "@/model/society/language/names"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { rulerDisplay } from "@/ui/genesis/wiki-bridge/nation-wiki-mentions"

function history({ years, points }: { years: number; points: number }) {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: points,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const startTimeMs = engine.time
	if (years > 0)
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: startTimeMs + STATE.deltaYear(years),
			rng: HISTORY_RNG.createHistoryRng(seed + 99999),
			validate: false,
		})
	return { world, engine, startTimeMs }
}

it("generates names only for requested display data and caches them", () => {
	const { world, engine, startTimeMs } = history({ years: 25, points: 10000 })
	const reference = NAMES.createWorldNames(world)
	const create = NAMES.createWorldNames
	let rulerCalls = 0
	let dynastyCalls = 0
	NAMES.createWorldNames = (world) => {
		const names = create(world)
		return {
			...names,
			ruler: (params) => {
				rulerCalls++
				return names.ruler(params)
			},
			dynasty: (params) => {
				dynastyCalls++
				return names.dynasty(params)
			},
		}
	}
	try {
		const state = SIM_RECORD.buildProceduralState({ world, startTimeMs })
		const translator = SIM_RECORD.createTranslator({ state, world })
		SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
		const frame = HISTORY.frameAt({ state, timeMs: state.record.maxTimeMs })
		const nation = Array.from(frame.nations.values()).find(
			(nation) => nation.ruler !== null,
		)
		if (!nation?.ruler) throw new Error("Generated history has no ruler")
		const event = state.record.events.nationEvents[nation.id].events.findLast(
			(event) => event.kind === "rulerChange",
		)
		if (!event) throw new Error("Ruler has no event")
		const ref = RULER_NAMES.refOf(event.payload)
		if (!ref) throw new Error("Ruler payload carries no naming inputs")
		structuredClone(state.record)
		expect(rulerCalls).toBe(0)
		expect(dynastyCalls).toBe(0)
		expect(event.payload).not.toHaveProperty("name")
		expect(event.payload.dynasty).toBe(ref.dynasty)
		const house =
			ref.dynasty < 0
				? null
				: reference.dynasty({
						dynastyIdx: ref.dynasty,
						province: ref.dynastyOrigin,
					})
		expect(nation.ruler.dynasty).toBe(house)
		expect(nation.ruler.dynasty).toBe(house)
		expect(dynastyCalls).toBe(ref.dynasty < 0 ? 0 : 1)
		const expected = reference.ruler({
			province: ref.nameOrigin,
			nameSeed: ref.nameSeed,
		})
		expect(nation.ruler.name).toBe(expected.name)
		expect(rulerCalls).toBe(1)
		const first = RULER_NAMES.names({ record: state.record, ref })
		expect(first).toMatchObject({
			name: expected.name,
			house,
			female: expected.female,
		})
		expect(RULER_NAMES.names({ record: state.record, ref })).toBe(first)
		expect(rulerCalls).toBe(1)
		expect(
			RULER_NAMES.payload({ record: state.record, payload: event.payload }),
		).toMatchObject({
			name: expected.name,
			dynasty: house,
			female: expected.female,
		})
		expect(
			rulerDisplay({ record: state.record, payload: event.payload })
				.description,
		).toBe(house ? `${expected.name} ${house}` : expected.name)
	} finally {
		NAMES.createWorldNames = create
	}
}, 600000)

it("names a ruler copied onto another throne the same in every realm", () => {
	const { world, engine, startTimeMs } = history({ years: 0, points: 10000 })
	const realms = Array.from({ length: engine.P }, (_, p) => p).filter(
		(p) =>
			!engine.desolate[p] &&
			!engine.stateless[p] &&
			STATE.isSovereign({ state: engine, p }) &&
			!STATE.getRulerRelation({ state: engine, nation: p }),
	)
	const culture = (p: number) => engine.culture[p]
	const a = realms[0]
	const b = realms.find((p) => culture(p) !== culture(a)) ?? realms[1]
	const rng = HISTORY_RNG.createHistoryRng(5)
	for (const p of [a, b]) engine.governmentType[p] = engine.governmentType[a]
	STATE.unite({
		state: engine,
		a,
		b,
		ruler: STATE_RULERS.read({ state: engine, p: a }),
		claim: 3,
		rng,
	})
	JOURNAL.flush({
		state: engine,
		noteCursor: engine.events.length,
		census: false,
		initial: false,
	})
	const state = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const frame = HISTORY.frameAt({ state, timeMs: state.record.maxTimeMs })
	const first = frame.nations.get(translator.identityByRoot.get(a) as number)
	const second = frame.nations.get(translator.identityByRoot.get(b) as number)
	expect(first?.ruler?.name).toBe(second?.ruler?.name)
	expect(first?.ruler?.dynasty).toBe(second?.ruler?.dynasty)
})

it("names starting realms that share a dynasty with one house", () => {
	const { world, engine, startTimeMs } = history({ years: 0, points: 20000 })
	const state = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const frame = HISTORY.frameAt({ state, timeMs: state.record.maxTimeMs })
	const houses = new Map<number, Set<string | null>>()
	for (let p = 0; p < engine.P; p++) {
		const id = translator.identityByRoot.get(p)
		if (id === undefined || engine.leaderRuntime.rulerId[p] < 0) continue
		const dynasty = engine.leaderDynCurrent[p]
		const set = houses.get(dynasty) ?? new Set<string | null>()
		set.add(frame.nations.get(id)?.ruler?.dynasty ?? null)
		houses.set(dynasty, set)
	}
	expect([...houses.values()].some((names) => names.size > 0)).toBe(true)
	for (const names of houses.values()) expect(names.size).toBe(1)
	expect(houses.size).toBeLessThan([...translator.identityByRoot.keys()].length)
})

it("keeps recorded Earth labels and plain comments intact", () => {
	const { world, startTimeMs } = history({ years: 0, points: 3000 })
	const record = SIM_RECORD.buildProceduralState({ world, startTimeMs }).record
	const payload = {
		name: "Recorded ruler",
		dynasty: "Recorded house",
		female: true,
	}
	expect(RULER_NAMES.payload({ record, payload })).toBe(payload)
	expect(RULER_NAMES.ruler({ record, payload })).toEqual({
		name: payload.name,
		dynasty: payload.dynasty,
	})
	expect(RULER_NAMES.comment({ record, comment: "Recorded comment" })).toBe(
		"Recorded comment",
	)
	expect(RULER_NAMES.comment({ record, comment: null })).toBeNull()
})
