import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_OUTPUT } from "@/test/history-run/output"
import type {
	BuildEngineParams,
	CreatedEngine,
	CreateEngineParams,
	EnvParams,
	HistoryRunOptions,
	HistoryRunSummary,
	YearReport,
} from "@/test/history-run/types"
import { WORLD_CACHE } from "@/test/history-run/world-cache"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const DEFAULT_SEED = 14963991
const DEFAULT_YEARS = 50

function optionsFromEnv({ env, log }: EnvParams): HistoryRunOptions {
	const era = (env.HISTORY_ERA ?? "lateMedieval") as SocietyEra
	if (!ERAS.eraOrder.includes(era))
		throw new Error(`HISTORY_ERA must be one of ${ERAS.eraOrder.join(", ")}`)
	const years = Number(env.HISTORY_YEARS ?? DEFAULT_YEARS)
	return {
		seed: Number(env.HISTORY_SEED ?? DEFAULT_SEED),
		era,
		numPoints: Number(env.HISTORY_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints),
		years,
		summaryPath: HISTORY_OUTPUT.path({ env, years, kind: "pipeline" }),
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
		activeRebelWars: active.filter((war) => war.goal !== "conquest").length,
	}
}

function build({
	seed,
	era,
	numPoints,
	startYear,
	generate,
}: BuildEngineParams): CreatedEngine {
	const generationStart = performance.now()
	const generated = generate({
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

	const engineStart = performance.now()
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
		heritages: generated.heritages,
		era: generated.params.era,
		seed: generated.params.seed,
		startYear,
		landmarks: generated.landmarks,
		regionProvince: provinces.regionProvince,
		regionAdjOffset: generated.mesh.adjOffset,
		regionAdjList: generated.mesh.adjList,
		regionIsLand: generated.isLand,
		planetRadiusKm: generated.params.planetRadiusKm,
		topography: generated.topography ?? null,
		vegetation: generated.vegetation ?? null,
		settlementRegions: generated.settlementRegions,
		settlementWaterLandmarks: generated.settlementWaterLandmarks,
		settlementPortRegions: generated.settlementPortRegions,
	})
	return {
		generated,
		engine,
		generationMs,
		engineMs: performance.now() - engineStart,
	}
}

// Tests reuse a generated world from disk.
function createEngine(params: CreateEngineParams): CreatedEngine {
	return build({ ...params, generate: WORLD_CACHE.generate })
}

// Benchmarks generate the world every time so its cost stays in their timings.
function createFreshEngine(params: CreateEngineParams): CreatedEngine {
	return build({ ...params, generate: GENERATE_WORLD.generateGenesisWorld })
}

function run(options: HistoryRunOptions): HistoryRunSummary {
	const { seed, era, numPoints, years, log } = options
	const { generated, engine, generationMs, engineMs } = createFreshEngine({
		seed,
		era,
		numPoints,
	})
	const recordStart = performance.now()
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.consumeJournal({ translator, transactions: engine.journal })
	JOURNAL.releaseSent(engine)
	const initMs = engineMs + performance.now() - recordStart
	log(
		`seed ${seed} era ${era} points ${numPoints} provinces ${engine.P} generation ${generationMs.toFixed(0)}ms init ${initMs.toFixed(0)}ms`,
	)
	log(
		"year   tick  frame  nations  wars(rebel)  striped  occupied  recNations  provEvents  diploEvents  titleEvents",
	)

	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const startYear = engine.time / STATE.yearMs
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
		SIM_RECORD.consumeJournal({
			translator,
			transactions: engine.journal,
		})
		JOURNAL.releaseSent(engine)
		const tickMs = performance.now() - tickStart

		const frameStart = performance.now()
		const frame = HISTORY.frameAt({ state, timeMs: state.record.maxTimeMs })
		const frameMs = performance.now() - frameStart

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
		}
		reports.push(report)
		log(
			`${String(year).padStart(4)} ${tickMs.toFixed(0).padStart(6)} ${frameMs.toFixed(0).padStart(6)} ${String(report.nations).padStart(8)} ${`${report.activeWars}(${report.activeRebelWars})`.padStart(12)} ${String(rebelStripedProvinces).padStart(8)} ${String(occupiedProvinces).padStart(9)} ${String(report.recordNations).padStart(11)} ${String(provinceEvents).padStart(11)} ${String(report.diplomacyEvents).padStart(12)} ${String(report.titleEvents).padStart(12)}`,
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
	if (options.summaryPath) {
		mkdirSync(dirname(options.summaryPath), { recursive: true })
		writeFileSync(options.summaryPath, JSON.stringify(summary, null, 2))
	}
	return summary
}

export const HISTORY_RUN = {
	optionsFromEnv,
	run,
	createEngine,
	createFreshEngine,
}
