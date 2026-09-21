import { writeFileSync } from "node:fs"
import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type {
	BuildRunParams,
	BuiltRun,
	CountPeopleRowsParams,
	CreatedEngine,
	CreateEngineParams,
	EnvParams,
	HistoryRunOptions,
	HistoryRunSummary,
	YearReport,
} from "@/test/history-run/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const DEFAULT_SEED = 14963991
const DEFAULT_YEARS = 50

function optionsFromEnv({ env, log }: EnvParams): HistoryRunOptions {
	const era = (env.HISTORY_ERA ?? ERAS.defaultEra) as SocietyEra
	if (!ERAS.eraOrder.includes(era))
		throw new Error(`HISTORY_ERA must be one of ${ERAS.eraOrder.join(", ")}`)
	return {
		seed: Number(env.HISTORY_SEED ?? DEFAULT_SEED),
		era,
		numPoints: Number(env.HISTORY_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints),
		years: Number(env.HISTORY_YEARS ?? DEFAULT_YEARS),
		summaryPath: env.HISTORY_OUT ?? "",
		log,
	}
}

function countEngine({ engine }: { engine: EngineState }): {
	nations: number
	activeWars: number
	activeRebelWars: number
} {
	let nations = 0
	for (let p = 0; p < engine.P; p++)
		if (
			!engine.desolate[p] &&
			!engine.stateless[p] &&
			engine.parentCurrent[p] < 0
		)
			nations++
	const active = engine.wars.filter((war) => war.endTime === undefined)
	return {
		nations,
		activeWars: active.length,
		activeRebelWars: active.filter((war) => war.rebel).length,
	}
}

function countAlivePeople({
	engine,
	year,
}: {
	engine: EngineState
	year: number
}): number {
	const persons = engine.people?.persons
	if (!persons) return 0
	let alive = 0
	for (let person = 0; person < persons.count; person++)
		if (persons.birth[person] <= year && persons.death[person] > year) alive++
	return alive
}

function countPeopleRows({ transactions }: CountPeopleRowsParams): number {
	let rows = 0
	for (const transaction of transactions)
		for (const chunk of transaction.people) rows += chunk.count
	return rows
}

function createEngine({
	seed,
	era,
	numPoints,
}: CreateEngineParams): CreatedEngine {
	const generationStart = performance.now()
	const generated = GENERATE_WORLD.generateGenesisWorld({
		params: {
			...DEFAULT_WORLD_PARAMS,
			seed,
			era,
			numPoints,
			tideLock: null,
		},
	})
	const generationMs = performance.now() - generationStart
	const { nations, provinces, population, cultures } = generated
	const riverVisible = generated.rivers?.visible
	if (
		!nations ||
		!provinces ||
		!population ||
		!generated.coastal ||
		!generated.waterAccess ||
		!riverVisible ||
		!cultures
	)
		throw new Error("Generated world has no society data to run history on")

	const initStart = performance.now()
	const engine = SIM_ENGINE.initHistory({
		nations,
		provinces,
		population,
		coastal: generated.coastal,
		waterAccess: generated.waterAccess,
		riverVisible,
		r_xyz: generated.mesh.r_xyz,
		cultures,
		religions: generated.religions,
		era: generated.params.era,
		seed: generated.params.seed,
		landmarks: generated.landmarks,
		regionProvince: provinces.regionProvince,
		regionAdjOffset: generated.mesh.adjOffset,
		regionAdjList: generated.mesh.adjList,
		regionIsLand: generated.isLand,
		planetRadiusKm: generated.params.planetRadiusKm,
		settlementRegions: generated.settlementRegions,
		settlementWaterLandmarks: generated.settlementWaterLandmarks,
		settlementPortRegions: generated.settlementPortRegions,
	})
	return {
		generated,
		engine,
		generationMs,
		initMs: performance.now() - initStart,
	}
}

function build({ seed, era, numPoints, years }: BuildRunParams): BuiltRun {
	const { generated, engine } = createEngine({ seed, era, numPoints })
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	let cursor = engine.journal.length
	const start = engine.time / STATE.yearMs
	for (let step = 1; step <= years; step++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: (start + step) * STATE.yearMs,
			rng,
			validate: false,
		})
		SIM_RECORD.appendJournal({
			translator,
			transactions: engine.journal.slice(cursor),
		})
		cursor = engine.journal.length
	}
	return { engine, world, state }
}

function run(options: HistoryRunOptions): HistoryRunSummary {
	const { seed, era, numPoints, years, log } = options
	const {
		generated,
		engine,
		generationMs,
		initMs: engineInitMs,
	} = createEngine({
		seed,
		era,
		numPoints,
	})
	const initStart = performance.now()
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	let peopleLogRows = countPeopleRows({ transactions: engine.journal })
	const initMs = engineInitMs + performance.now() - initStart
	log(
		`seed ${seed} era ${era} points ${numPoints} provinces ${engine.P} generation ${generationMs.toFixed(0)}ms init ${initMs.toFixed(0)}ms`,
	)
	log(
		"year   tick  frame  nations  wars(rebel)  striped  occupied  recNations  provEvents  diploEvents  titleEvents  people  logRows",
	)

	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const startYear = engine.time / STATE.yearMs
	let cursor = engine.journal.length
	const reports: YearReport[] = []
	for (let step = 1; step <= years; step++) {
		const year = startYear + step
		const tickStart = performance.now()
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: year * STATE.yearMs,
			rng,
			validate: false,
		})
		if (engine.people) {
			const people = engine.people
			for (let seat = 0; seat < engine.P; seat++) {
				const holder = people.holderOfSeat[seat]
				if (holder < 0) continue
				if (people.persons.death[holder] <= year)
					throw new Error(`Dead person ${holder} holds seat ${seat} in ${year}`)
				if (engine.leaderNameSeedCurrent[seat] !== holder)
					throw new Error(`Leader and person disagree at seat ${seat}`)
			}
		}
		const transactions = engine.journal.slice(cursor)
		SIM_RECORD.appendJournal({ translator, transactions })
		peopleLogRows += countPeopleRows({ transactions })
		cursor = engine.journal.length
		const tickMs = performance.now() - tickStart

		state.frameCache.clear()
		const frameStart = performance.now()
		const frame = HISTORY.frameAt({ state, timeMs: state.record.maxTimeMs })
		const frameMs = performance.now() - frameStart

		options.onYear?.({ engine, record: state, frame, year })
		const landholders = new Set<number>()
		for (const owner of frame.provinceNation)
			if (owner >= 0) landholders.add(owner)
		const rebelHeld = new Set<number>()
		for (const war of frame.wars)
			if (war.rebel)
				for (const id of war.defenders)
					if (!landholders.has(id)) rebelHeld.add(id)
		let occupiedProvinces = 0
		let rebelStripedProvinces = 0
		for (let p = 0; p < frame.provinceCount; p++) {
			const owner = frame.provinceNation[p]
			const controller = frame.provinceController[p]
			if (owner < 0 || controller < 0 || owner === controller) continue
			occupiedProvinces++
			if (rebelHeld.has(controller)) rebelStripedProvinces++
		}
		let provinceEvents = 0
		for (const log of state.record.events.provinceEvents.values())
			provinceEvents += log.events.length
		const counts = countEngine({ engine })
		const peopleAlive = countAlivePeople({ engine, year })
		const report: YearReport = {
			year,
			tickMs,
			frameMs,
			...counts,
			rebelStripedProvinces,
			occupiedProvinces,
			recordNations: state.record.nations.length,
			provinceEvents,
			titleEvents: state.record.events.titleEvents.length,
			wars: state.record.events.wars.length,
			diplomacyEvents: state.record.events.diplomacy.length,
			population: frame.totalPopulation,
			peopleAlive,
			peopleLogRows,
		}
		reports.push(report)
		log(
			`${String(year).padStart(4)} ${tickMs.toFixed(0).padStart(6)} ${frameMs.toFixed(0).padStart(6)} ${String(report.nations).padStart(8)} ${`${report.activeWars}(${report.activeRebelWars})`.padStart(12)} ${String(rebelStripedProvinces).padStart(8)} ${String(occupiedProvinces).padStart(9)} ${String(report.recordNations).padStart(11)} ${String(provinceEvents).padStart(11)} ${String(report.diplomacyEvents).padStart(12)} ${String(report.titleEvents).padStart(12)} ${String(report.peopleAlive).padStart(7)} ${String(report.peopleLogRows).padStart(8)}`,
		)
	}

	const summary: HistoryRunSummary = {
		seed,
		era,
		numPoints,
		provinceCount: engine.P,
		generationMs,
		initMs,
		reports,
	}
	if (options.summaryPath)
		writeFileSync(options.summaryPath, JSON.stringify(summary, null, 2))
	return summary
}

export const HISTORY_RUN = { optionsFromEnv, createEngine, build, run }
