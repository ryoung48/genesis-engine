import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { ERAS } from "@/model/society/eras"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"
import type { SocietyEra } from "@/model/society/types"
import { HISTORY_RUN } from "@/test/history-run"
import { HISTORY_COMPARISON } from "@/test/history-run/comparison"
import { HISTORY_OUTPUT } from "@/test/history-run/output"
import { CORONATION_REPORT } from "@/test/history-run/report/coronation"
import { DISTRICTS_REPORT } from "@/test/history-run/report/districts"
import type { DistrictReport } from "@/test/history-run/report/districts/types"
import { GOVERNMENT_REPORT } from "@/test/history-run/report/government"
import type { GovernmentReport } from "@/test/history-run/report/government/types"
import { INTERREGNUM_REPORT } from "@/test/history-run/report/interregnum"
import { KNOWLEDGE_REPORT } from "@/test/history-run/report/knowledge"
import { MILITARY_REPORT } from "@/test/history-run/report/military"
import { BATTLEFIELD_REPORT } from "@/test/history-run/report/military/battlefields"
import { REBEL_LOGISTICS_REPORT } from "@/test/history-run/report/military/rebel-logistics"
import { RECRUITMENT_REPORT } from "@/test/history-run/report/military/recruitment"
import { PARTITION_REPORT } from "@/test/history-run/report/partition"
import type { PartitionReport } from "@/test/history-run/report/partition/types"
import { RELIGION_REPORT } from "@/test/history-run/report/religion"
import { ROADS_REPORT } from "@/test/history-run/report/roads"
import { RULERS_REPORT } from "@/test/history-run/report/rulers"
import { SETTLEMENT_CHANGE_REPORT } from "@/test/history-run/report/settlement-change"
import type {
	CenturyReport,
	EngineParams,
	HistoryReportOptions,
	RegencyReport,
	RegencyReportParams,
	ReportEnvParams,
	RunSeedParams,
	UnionJuniorsParams,
	WindowParams,
} from "@/test/history-run/report/types"
import { HISTORY_VALIDATION } from "@/test/history-run/report/validation"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const LARGEST = 20

const DEFAULT_SEEDS = [14963991]

const DEFAULT_YEARS = 300

// Year 1800 quantile from the original 933-year history baseline.
const DEFAULT_LATE_KNOWLEDGE_BAND = 2.366478320318625

function optionsFromEnv({ env, log }: ReportEnvParams): HistoryReportOptions {
	const era = (env.HISTORY_ERA ?? "lateMedieval") as SocietyEra
	if (!ERAS.eraOrder.includes(era))
		throw new Error(`HISTORY_ERA must be one of ${ERAS.eraOrder.join(", ")}`)
	const years = Number(env.HISTORY_YEARS ?? DEFAULT_YEARS)
	return {
		lateKnowledgeBand: Number(
			env.HISTORY_LATE_KNOWLEDGE ?? DEFAULT_LATE_KNOWLEDGE_BAND,
		),
		seeds: env.HISTORY_SEEDS
			? env.HISTORY_SEEDS.split(",").map(Number)
			: DEFAULT_SEEDS,
		era,
		numPoints: Number(env.HISTORY_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints),
		years,
		startYear: env.HISTORY_START ? Number(env.HISTORY_START) : undefined,
		outPath: HISTORY_OUTPUT.path({ env, years, kind: "report" }),
		baselinePath: env.HISTORY_BASELINE ?? null,
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

const PRE_SUCCESSION_YEARS = 2

function regencyReport({
	engine,
	from,
	to,
	top,
}: RegencyReportParams): RegencyReport {
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	const regencies = new Set<number>()
	const report: RegencyReport = {
		regencies: 0,
		usurpationsByKinsman: 0,
		usurpationsByProtector: 0,
		largestRebellionRegencyShare: 0,
		preSuccessionRebellionShare: 0,
	}
	let largestRebellions = 0
	let largestDuringRegency = 0
	const rebellionTimes = new Map<number, number[]>()
	let rebellions = 0
	let preSuccession = 0
	for (const note of engine.events) {
		if (note.time >= hi) break
		const nation = note.data.nation as number
		if (note.tag === "regency started") regencies.add(nation)
		else if (note.tag === "regency ended") regencies.delete(nation)
		else if (note.tag === "succession" && note.time >= lo) {
			const pending = rebellionTimes.get(nation) ?? []
			preSuccession += pending.filter(
				(time) => note.time - time <= PRE_SUCCESSION_YEARS * STATE.yearMs,
			).length
			rebellionTimes.delete(nation)
		}
		if (note.time < lo) continue
		if (note.tag === "regency started") report.regencies++
		else if (note.tag === "usurpation") {
			if (note.data.kinsman) report.usurpationsByKinsman++
			else report.usurpationsByProtector++
		} else if (note.tag === "rebellion") {
			const overlord = note.data.overlord as number
			rebellions++
			const pending = rebellionTimes.get(overlord)
			if (pending) pending.push(note.time)
			else rebellionTimes.set(overlord, [note.time])
			if (!top.has(overlord)) continue
			largestRebellions++
			if (regencies.has(overlord)) largestDuringRegency++
		}
	}
	report.largestRebellionRegencyShare =
		largestDuringRegency / Math.max(1, largestRebellions)
	report.preSuccessionRebellionShare = preSuccession / Math.max(1, rebellions)
	return report
}

function runSeed({
	seed,
	options,
	saved,
	seedDiagnostics,
}: RunSeedParams): CenturyReport[] {
	const started = performance.now()
	const { engine, generated, generationMs, engineMs } =
		HISTORY_RUN.createFreshEngine({
			seed,
			era: options.era,
			numPoints: options.numPoints,
			startYear: options.startYear,
		})
	const logs = {
		rebelLogistics: HISTORY_COMPARISON.digester(),
		rebellionEvents: HISTORY_COMPARISON.digester(),
		rebellionAttempts: HISTORY_COMPARISON.digester(),
		armyReconstitutions: HISTORY_COMPARISON.digester(),
		rebelWarOutcomes: HISTORY_COMPARISON.digester(),
	}
	let digestedEvents = 0
	const digestEvents = () => {
		for (; digestedEvents < engine.events.length; digestedEvents++) {
			const note = engine.events[digestedEvents]
			if (note.tag === "rebellion") logs.rebellionEvents.add(note)
			else if (note.tag === "rebellion evaluated")
				logs.rebellionAttempts.add(note)
			else if (note.tag === "army reconstituted")
				logs.armyReconstitutions.add(note)
			else if (
				note.tag === "war ended" &&
				STATE.isRebelGoal({
					goal: engine.wars[note.data.war as number].goal,
				})
			)
				logs.rebelWarOutcomes.add(note)
		}
	}
	const rebelLogistics = REBEL_LOGISTICS_REPORT.attach({
		engine,
		record: logs.rebelLogistics.add,
	})
	digestEvents()
	const initial = KNOWLEDGE_REPORT.snapshot({ engine })
	const validation = HISTORY_VALIDATION.tracker()
	const diagnostics = {
		religionGenderSystems: RELIGION_REPORT.genderSystems({
			systems: engine.cultureGenderSystems,
			cultureToReligion: engine.religion,
			religionGender: generated.religionGender,
			era: options.era,
		}),
		religion: RELIGION_REPORT.genderShare({
			religionTypes: generated.religionTypes,
			religionGender: generated.religionGender,
		}),
		validation,
		initialBattlefields: BATTLEFIELD_REPORT.initial({ engine }),
		siegeLifecycle: BATTLEFIELD_REPORT.lifecycle({ engine }),
		completed: false,
		sourceHash: createHash("sha256")
			.update(
				execFileSync(
					"git",
					[
						"ls-files",
						"--cached",
						"--others",
						"--exclude-standard",
						"src/model/history",
						"src/test/history-run",
					],
					{ encoding: "utf8" },
				)
					.trim()
					.split("\n")
					.sort()
					.filter((path) => existsSync(path.trim()))
					.map((path) => path + "\n" + readFileSync(path.trim(), "utf8"))
					.join("\n"),
			)
			.digest("hex"),
		seed,
		era: options.era,
		requestedPoints: options.numPoints,
		generatedPoints: generated.mesh.r_xyz.length / 3,
		provinces: engine.P,
		revision: execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim(),
		generationMs,
		engineMs,
		initial: { ...initial, spinUp: engine.knowledgeSpinUp },
		lateKnowledgeBand: options.lateKnowledgeBand,
		recruitment: [
			RECRUITMENT_REPORT.snapshot({
				engine,
				lateKnowledgeBand: options.lateKnowledgeBand,
			}),
		],
		snapshots: [initial],
		rebelLogistics: logs.rebelLogistics.value(),
		rebellionEvents: logs.rebellionEvents.value(),
		rebellionAttempts: logs.rebellionAttempts.value(),
		armyReconstitutions: logs.armyReconstitutions.value(),
		rebelWarOutcomes: logs.rebelWarOutcomes.value(),
		annualTicks: [] as number[],
		partitionTotal: null as PartitionReport | null,
		governmentTotal: null as GovernmentReport | null,
		districtsTotal: null as DistrictReport | null,
		wallMs: 0,
		peakMemoryKb: 0,
	}
	const persist = () => {
		if (!options.outPath) return
		mkdirSync(dirname(options.outPath), { recursive: true })
		diagnostics.wallMs = performance.now() - started
		diagnostics.peakMemoryKb = process.resourceUsage().maxRSS
		digestEvents()
		diagnostics.rebelLogistics = logs.rebelLogistics.value()
		diagnostics.rebellionEvents = logs.rebellionEvents.value()
		diagnostics.rebellionAttempts = logs.rebellionAttempts.value()
		diagnostics.armyReconstitutions = logs.armyReconstitutions.value()
		diagnostics.rebelWarOutcomes = logs.rebelWarOutcomes.value()
		saved[seed] = reports
		seedDiagnostics[seed] = diagnostics
		if (options.seeds.length === 1) saved.diagnostics = diagnostics
		else saved.diagnosticsBySeed = seedDiagnostics
		const content = JSON.stringify(saved)
		writeFileSync(options.outPath, content)
		if (diagnostics.recruitment.at(-1)?.year === start + 500)
			writeFileSync(options.outPath.replace(/\.json$/, "-500.json"), content)
	}
	const military = MILITARY_REPORT.attach({
		engine,
		probe: MILITARY_REPORT.fiscalProbe,
	})
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = Math.round(engine.time / STATE.yearMs)
	const reports: CenturyReport[] = []
	const settlementChanges = SETTLEMENT_CHANGE_REPORT.create(engine)
	let roadCursor = 0
	let from = start
	let startSovereigns = sovereigns({ engine }).length
	let atWarYears = 0
	let sampledYears = 0
	const rulers = RULERS_REPORT.tracker()
	rulers.cursor = engine.events.length
	const coronations = CORONATION_REPORT.tracker()
	const districts = DISTRICTS_REPORT.capture({ engine })
	const partitions = PARTITION_REPORT.tracker()
	partitions.cursor = engine.events.length
	const interregnums = INTERREGNUM_REPORT.tracker()
	interregnums.cursor = engine.events.length
	let divideMs = 0
	let divideTotalMs = 0
	const divide = PARTITION.divide
	PARTITION.divide = (params) => {
		const t0 = performance.now()
		const created = divide(params)
		const elapsed = performance.now() - t0
		divideMs += elapsed
		divideTotalMs += elapsed
		return created
	}
	try {
		for (let year = start + 1; year <= start + options.years; year++) {
			const tickStart = performance.now()
			SIM_ENGINE.simulateUntil({
				state: engine,
				targetTimeMs: year * STATE.yearMs,
				rng,
				validate: false,
			})
			if ((year - start) % ROUTE_TUNING.batchIntervalYears === 0)
				SETTLEMENT_CHANGE_REPORT.sample({
					tracker: settlementChanges,
					engine,
					year,
				})
			MILITARY.validate({ state: engine })
			rebelLogistics.sample({ source: "annual" })
			diagnostics.recruitment.push(
				RECRUITMENT_REPORT.snapshot({
					engine,
					lateKnowledgeBand: options.lateKnowledgeBand,
				}),
			)
			engine.journal.length = 0
			diagnostics.annualTicks.push(performance.now() - tickStart)
			HISTORY_VALIDATION.alliances({ engine, tracker: validation })
			HISTORY_VALIDATION.rulers({ engine, tracker: validation })
			HISTORY_VALIDATION.unions({ engine, tracker: validation })
			HISTORY_VALIDATION.marriageTies({ engine, tracker: validation })
			if ((year - start) % 10 === 0)
				HISTORY_VALIDATION.districts({ engine, tracker: validation })
			if (
				[1000, 1100, 1200, 1367, 1500, 1800].includes(year) ||
				year === start + options.years
			) {
				diagnostics.snapshots.push(KNOWLEDGE_REPORT.snapshot({ engine }))
				persist()
			}
			DISTRICTS_REPORT.sample({ engine, tracker: districts.tracker })
			PARTITION_REPORT.observe({ engine, tracker: partitions })
			INTERREGNUM_REPORT.observe({ engine, tracker: interregnums })
			RULERS_REPORT.sample({ engine, tracker: rulers })
			MILITARY_REPORT.sample({
				engine,
				tracker: military.tracker,
				sampleRelations: (year - start) % 10 === 0,
			})
			for (const p of largest({ engine })) {
				sampledYears++
				if (MILITARY.atWar({ state: engine, nation: p })) atWarYears++
			}
			if ((year - start) % 100 !== 0 && year !== start + options.years) continue
			const top = largest({ engine })
			const topSet = new Set(top)
			const coronation = CORONATION_REPORT.of({
				engine,
				tracker: coronations,
				from,
				to: year,
			})
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
				roads: ROADS_REPORT.of({ engine, fromBatch: roadCursor }),
				settlementChange: SETTLEMENT_CHANGE_REPORT.of({
					tracker: settlementChanges,
					from,
					to: year,
				}),
				from,
				to: year,
				sovereigns: endSovereigns.length,
				warsPerSovereign: wars / ((startSovereigns + endSovereigns.length) / 2),
				rebellions: rebellions.length,
				largestAtWarShare: atWarYears / Math.max(1, sampledYears),
				rebellionsPerLargest:
					rebellions.filter((event) =>
						topSet.has(event.data.overlord as number),
					).length / LARGEST,
				unionJuniorsPerLargest:
					top.reduce(
						(sum, nation) => sum + unionJuniors({ engine, nation }),
						0,
					) / LARGEST,
				raids: raids.length,
				raidSuccessShare:
					raids.filter((event) => event.data.success).length /
					Math.max(1, raids.length),
				revenuePerHead: revenue / Math.max(1, pop),
				regency: regencyReport({ engine, from, to: year, top: topSet }),
				...RULERS_REPORT.window({
					engine,
					tracker: rulers,
					from,
					to: year,
				}),
				coronations: coronation.coronations,
				elevateMsPerYear: coronation.elevateMsPerYear,
				military: MILITARY_REPORT.summarize({ tracker: military.tracker }),
				districts: DISTRICTS_REPORT.summarize({
					engine,
					tracker: districts.tracker,
					from,
					to: year,
				}),
				government: GOVERNMENT_REPORT.summarize({ engine, from, to: year }),
				partitionState: PARTITION_REPORT.state({ engine }),
				partition: PARTITION_REPORT.summarize({
					engine,
					tracker: partitions,
					from,
					to: year,
					divideMs,
				}),
				interregnum: INTERREGNUM_REPORT.summarize({
					engine,
					tracker: interregnums,
					from,
					to: year,
				}),
			})
			if (year === start + options.years)
				diagnostics.governmentTotal = GOVERNMENT_REPORT.summarize({
					engine,
					from: start,
					to: year + 1,
				})
			roadCursor = engine.roads?.batch ?? 0
			if (year === start + options.years)
				diagnostics.partitionTotal = PARTITION_REPORT.summarize({
					engine,
					tracker: partitions,
					from: start,
					to: year + 1,
					divideMs: divideTotalMs,
				})
			if (year === start + options.years)
				diagnostics.districtsTotal = DISTRICTS_REPORT.summarize({
					engine,
					tracker: districts.tracker,
					from: start,
					to: year,
				})
			diagnostics.completed = year === start + options.years
			diagnostics.siegeLifecycle = BATTLEFIELD_REPORT.lifecycle({ engine })
			persist()
			options.log(
				`seed ${seed} saved through ${year}; ${(diagnostics.wallMs / 1000).toFixed(1)}s`,
			)
			from = year
			startSovereigns = endSovereigns.length
			atWarYears = 0
			sampledYears = 0
			divideMs = 0
		}
	} finally {
		PARTITION.divide = divide
		districts.detach()
		military.detach()
		rebelLogistics.detach()
	}
	HISTORY_VALIDATION.assert(validation)
	return reports
}

function run(options: HistoryReportOptions): Map<number, CenturyReport[]> {
	const results = new Map<number, CenturyReport[]>()
	const saved: Record<string, unknown> = { expectedSeeds: options.seeds }
	const seedDiagnostics: Record<string, unknown> = {}
	for (const seed of options.seeds) {
		const reports = runSeed({ seed, options, saved, seedDiagnostics })
		results.set(seed, reports)
		options.log(`seed ${seed}`)
		options.log(
			"period      sovereigns  wars/sov  rebellions  top20 at war  rebels/top20  unions/top20  raids  raid win  ducats/head",
		)
		for (const r of reports)
			options.log(
				`${`${r.from}-${r.to}`.padEnd(11)} ${String(r.sovereigns).padStart(10)} ${r.warsPerSovereign.toFixed(2).padStart(9)} ${String(r.rebellions).padStart(11)} ${`${(100 * r.largestAtWarShare).toFixed(0)}%`.padStart(13)} ${r.rebellionsPerLargest.toFixed(2).padStart(13)} ${r.unionJuniorsPerLargest.toFixed(1).padStart(13)} ${String(r.raids).padStart(6)} ${`${(100 * r.raidSuccessShare).toFixed(0)}%`.padStart(9)} ${`${r.revenuePerHead.toFixed(6)} D`.padStart(13)}`,
			)
		options.log(
			"period      regencies  usurp kinsman/protector  top20 rebels in regency  pre-death rebels",
		)
		for (const { from, to, regency: g } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(g.regencies).padStart(9)} ${`${g.usurpationsByKinsman}/${g.usurpationsByProtector}`.padStart(23)} ${`${(100 * g.largestRebellionRegencyShare).toFixed(0)}%`.padStart(24)} ${`${(100 * g.preSuccessionRebellionShare).toFixed(0)}%`.padStart(17)}`,
			)
		options.log(
			"period      successions  same/other/new  minor  pretender revolts  interregnums  ties formed  ties standing  tied share  dynasty sharing  unions formed/ended/merged",
		)
		for (const {
			from,
			to,
			succession: c,
			marriageTies: m,
			dynasty: d,
			unions: u,
		} of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(c.count).padStart(11)} ${`${c.byHouse.same ?? 0}/${c.byHouse.other ?? 0}/${c.byHouse.new ?? 0}`.padStart(15)} ${`${(100 * c.minorShare).toFixed(1)}%`.padStart(6)} ${String(c.pretenderRevolts).padStart(18)} ${String(c.interregnums).padStart(13)} ${String(m.formed).padStart(12)} ${m.meanStanding.toFixed(1).padStart(14)} ${`${(100 * m.tiedShare).toFixed(0)}%`.padStart(11)} ${`${(100 * d.sharingShare).toFixed(1)}%`.padStart(16)} ${`${u.formed}/${u.ended}/${u.merged}`.padStart(27)}`,
			)
		options.log(
			"period      partitions  rate  skipped heir/seat  new realms p50/p90  primary share p50  eff realms p50  same tier  sibling wars/unions  fates merged/sibling/other/again  standing union/alone  divide ms",
		)
		for (const { from, to, partition: d } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(d.partitions).padStart(10)} ${`${(100 * d.rate).toFixed(0)}%`.padStart(5)} ${`${d.skipped["no junior heir"]}/${d.skipped["no free seat"]}`.padStart(23)} ${`${d.newRealms.p50}/${d.newRealms.p90}`.padStart(19)} ${d.primaryPopulationShare.p50.toFixed(2).padStart(18)} ${d.effectiveRealms.p50.toFixed(2).padStart(15)} ${`${(100 * d.sameTierShare).toFixed(0)}%`.padStart(10)} ${`${d.siblingWars}/${d.siblingUnions}`.padStart(20)} ${`${d.fates.mergedByUnion}/${d.fates.absorbedBySibling}/${d.fates.absorbedByOther}/${d.fates.partitionedAgain}`.padStart(33)} ${`${d.fates.standingInUnion}/${d.fates.standingAlone}`.padStart(21)} ${d.divideMs.toFixed(0).padStart(10)}`,
			)
		options.log(
			"period      interregnums  freed p50/p90  skipped  wars  cut off  titles lost  freed still sovereign  heirless without districts",
		)
		for (const { from, to, interregnum: d } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(d.events).padStart(12)} ${`${d.freedPerEvent.p50}/${d.freedPerEvent.p90}`.padStart(14)} ${String(d.skippedSeats).padStart(8)} ${String(d.warsDeclared).padStart(5)} ${String(d.cutOffProvinces).padStart(8)} ${String(d.titlesLost).padStart(12)} ${`${d.freedStillSovereign}/${d.freedRealms}`.padStart(22)} ${String(d.withoutDistricts).padStart(26)}`,
			)
		MILITARY_REPORT.log({ reports, log: options.log })
	}

	if (options.outPath) {
		options.log(
			`HTML comparison: ${HISTORY_COMPARISON.write({ current: options.outPath, baseline: options.baselinePath })}`,
		)
	}
	return results
}

export const HISTORY_REPORT = { optionsFromEnv, run }
