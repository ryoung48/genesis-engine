import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import { HISTORY_RUN } from "@/test/history-run"
import type {
	CenturyReport,
	EngineParams,
	HistoryReportOptions,
	ReportEnvParams,
	RunSeedParams,
	UnionJuniorsParams,
	WindowParams,
} from "@/test/history-run/report/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const LARGEST = 20

const DEFAULT_SEEDS = [14963991]

const DEFAULT_YEARS = 300

function optionsFromEnv({ env, log }: ReportEnvParams): HistoryReportOptions {
	const era = (env.HISTORY_ERA ?? "lateMedieval") as SocietyEra
	if (!ERAS.eraOrder.includes(era))
		throw new Error(`HISTORY_ERA must be one of ${ERAS.eraOrder.join(", ")}`)
	return {
		seeds: env.HISTORY_SEEDS
			? env.HISTORY_SEEDS.split(",").map(Number)
			: DEFAULT_SEEDS,
		era,
		numPoints: Number(env.HISTORY_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints),
		years: Number(env.HISTORY_YEARS ?? DEFAULT_YEARS),
		log,
	}
}

function sovereigns({ engine }: EngineParams): number[] {
	const list: number[] = []
	for (let p = 0; p < engine.P; p++)
		if (
			!engine.desolate[p] &&
			!engine.stateless[p] &&
			engine.parentCurrent[p] < 0
		)
			list.push(p)
	return list
}

function largest({ engine }: EngineParams): number[] {
	DERIVE.ensureHierarchyClean(engine)
	const population = new Float64Array(engine.P)
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p] || engine.stateless[p]) continue
		population[engine.sovereignCurrent[p]] +=
			engine.popRuralCurrent[p] + engine.popUrbanCurrent[p]
	}
	return sovereigns({ engine })
		.sort((a, b) => population[b] - population[a])
		.slice(0, LARGEST)
}

function unionJuniors({ engine, nation }: UnionJuniorsParams): number {
	let count = 0
	for (const other of engine.relationColumns[nation])
		if (
			STATE.getRelation({ state: engine, a: other, b: nation }) ===
			STATE.rel.PU_JUNIOR
		)
			count++
	return count
}

function eventsIn({ engine, from, to }: WindowParams) {
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	return engine.events.filter((event) => event.time >= lo && event.time < hi)
}

function runSeed({ seed, options }: RunSeedParams): CenturyReport[] {
	const { engine } = HISTORY_RUN.createEngine({
		seed,
		era: options.era,
		numPoints: options.numPoints,
	})
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = Math.round(engine.time / STATE.yearMs)
	const reports: CenturyReport[] = []
	let from = start
	let startSovereigns = sovereigns({ engine }).length
	let atWarYears = 0
	let sampledYears = 0
	for (let year = start + 1; year <= start + options.years; year++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: year * STATE.yearMs,
			rng,
			validate: false,
		})
		for (const p of largest({ engine })) {
			sampledYears++
			if (engine.provinceWars[p].length > 0) atWarYears++
		}
		if ((year - start) % 100 !== 0 && year !== start + options.years) continue
		const top = largest({ engine })
		const topSet = new Set(top)
		const events = eventsIn({ engine, from, to: year })
		const rebellions = events.filter((event) => event.tag === "rebellion")
		const raids = events.filter((event) => event.tag === "raid")
		const endSovereigns = sovereigns({ engine })
		let pop = 0
		let revenue = 0
		for (const p of endSovereigns) {
			pop += STATE.getNationPopulation({ state: engine, root: p })
			revenue += ECONOMY.revenue({ state: engine, p })
		}
		const wars = engine.wars.filter(
			(war) =>
				war.startTime >= from * STATE.yearMs &&
				war.startTime < year * STATE.yearMs,
		).length
		reports.push({
			from,
			to: year,
			sovereigns: endSovereigns.length,
			warsPerSovereign: wars / ((startSovereigns + endSovereigns.length) / 2),
			rebellions: rebellions.length,
			largestAtWarShare: atWarYears / Math.max(1, sampledYears),
			rebellionsPerLargest:
				rebellions.filter((event) => topSet.has(event.data.overlord as number))
					.length / LARGEST,
			unionJuniorsPerLargest:
				top.reduce((sum, nation) => sum + unionJuniors({ engine, nation }), 0) /
				LARGEST,
			raids: raids.length,
			raidSuccessShare:
				raids.filter((event) => event.data.success).length /
				Math.max(1, raids.length),
			revenuePerHead: revenue / Math.max(1, pop),
		})
		from = year
		startSovereigns = endSovereigns.length
		atWarYears = 0
		sampledYears = 0
	}
	return reports
}

function run(options: HistoryReportOptions): Map<number, CenturyReport[]> {
	const results = new Map<number, CenturyReport[]>()
	for (const seed of options.seeds) {
		const reports = runSeed({ seed, options })
		results.set(seed, reports)
		options.log(`seed ${seed}`)
		options.log(
			"period      sovereigns  wars/sov  rebellions  top20 at war  rebels/top20  unions/top20  raids  raid win  revenue/head",
		)
		for (const r of reports)
			options.log(
				`${`${r.from}-${r.to}`.padEnd(11)} ${String(r.sovereigns).padStart(10)} ${r.warsPerSovereign.toFixed(2).padStart(9)} ${String(r.rebellions).padStart(11)} ${`${(100 * r.largestAtWarShare).toFixed(0)}%`.padStart(13)} ${r.rebellionsPerLargest.toFixed(2).padStart(13)} ${r.unionJuniorsPerLargest.toFixed(1).padStart(13)} ${String(r.raids).padStart(6)} ${`${(100 * r.raidSuccessShare).toFixed(0)}%`.padStart(9)} ${`${r.revenuePerHead.toFixed(1)} g`.padStart(13)}`,
			)
	}
	return results
}

export const HISTORY_REPORT = { optionsFromEnv, run }
