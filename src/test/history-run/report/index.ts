import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { HEALTH } from "@/model/history/sim/people/health"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { PeoplePacket } from "@/model/history/sim/people/log/types"
import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import { HISTORY_RUN } from "@/test/history-run"
import { HISTORY_COMPARISON } from "@/test/history-run/comparison"
import { HISTORY_OUTPUT } from "@/test/history-run/output"
import { DISTRIBUTION_REPORT } from "@/test/history-run/report/distribution"
import { DISTRICTS_REPORT } from "@/test/history-run/report/districts"
import type { DistrictReport } from "@/test/history-run/report/districts/types"
import { HOUSEHOLDS_REPORT } from "@/test/history-run/report/households"
import type {
	HouseholdsReport,
	StructuralSample,
} from "@/test/history-run/report/households/types"
import { KNOWLEDGE_REPORT } from "@/test/history-run/report/knowledge"
import { MILITARY_REPORT } from "@/test/history-run/report/military"
import { BATTLEFIELD_REPORT } from "@/test/history-run/report/military/battlefields"
import { REBEL_LOGISTICS_REPORT } from "@/test/history-run/report/military/rebel-logistics"
import { RECRUITMENT_REPORT } from "@/test/history-run/report/military/recruitment"
import { PARTITION_REPORT } from "@/test/history-run/report/partition"
import type { PartitionReport } from "@/test/history-run/report/partition/types"
import { PEOPLE_FAMILIES_REPORT } from "@/test/history-run/report/people-families"
import { PEOPLE_HEALTH_REPORT } from "@/test/history-run/report/people-health"
import type { StarterReport } from "@/test/history-run/report/people-health/types"
import { PEOPLE_MARRIAGE_REPORT } from "@/test/history-run/report/people-marriage"
import { PEOPLE_OPINION_REPORT } from "@/test/history-run/report/people-opinion"
import { PEOPLE_RECORD_REPORT } from "@/test/history-run/report/people-record"
import type { PeopleRecordReport } from "@/test/history-run/report/people-record/types"
import { PEOPLE_TRAITS_REPORT } from "@/test/history-run/report/people-traits"
import type { CharacterStage } from "@/test/history-run/report/people-traits/stages/types"
import { RELIGION_REPORT } from "@/test/history-run/report/religion"
import type {
	BetrothalOutcome,
	CenturyReport,
	EngineParams,
	HistoryReportOptions,
	MarriageReport,
	MarriageReportParams,
	MarriageTracker,
	PeopleReport,
	PeopleReportParams,
	RegencyReport,
	RegencyReportParams,
	ReportEnvParams,
	RunSeedParams,
	TrackMarriagesParams,
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
	const pipeline = env.HISTORY_PIPELINE ?? "simulation"
	if (pipeline !== "simulation" && pipeline !== "distribution")
		throw new Error("Invalid HISTORY_PIPELINE")
	const years = Number(
		env.HISTORY_YEARS ?? (pipeline === "distribution" ? 2023 : DEFAULT_YEARS),
	)
	const characterStage = (env.HISTORY_CHARACTER_STAGE ??
		"personality") as CharacterStage
	if (
		!["draw", "fertility", "attributes", "personality"].includes(characterStage)
	)
		throw new Error("Invalid HISTORY_CHARACTER_STAGE")
	return {
		pipeline,
		characterStage,
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
		councilShare: 0,
		usurpationsByUncle: 0,
		usurpationsByProtector: 0,
		largestRebellionRegencyShare: 0,
		preSuccessionRebellionShare: 0,
		restorationAttempts: 0,
		restorationBacked: 0,
		restorationRevolts: 0,
		claimsLapsed: 0,
	}
	let councils = 0
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
		if (note.tag === "regency started") {
			report.regencies++
			if (note.data.regent === -1) councils++
		} else if (note.tag === "usurpation") {
			if (note.data.kind === "protector") report.usurpationsByProtector++
			else report.usurpationsByUncle++
		} else if (note.tag === "rebellion") {
			const overlord = note.data.overlord as number
			rebellions++
			const pending = rebellionTimes.get(overlord)
			if (pending) pending.push(note.time)
			else rebellionTimes.set(overlord, [note.time])
			if (!top.has(overlord)) continue
			largestRebellions++
			if (regencies.has(overlord)) largestDuringRegency++
		} else if (note.tag === "restoration attempt") {
			report.restorationAttempts++
			if (note.data.backed) report.restorationBacked++
			if (note.data.revolt) report.restorationRevolts++
		} else if (note.tag === "claim lapsed") report.claimsLapsed++
	}
	report.councilShare = councils / Math.max(1, report.regencies)
	report.largestRebellionRegencyShare =
		largestDuringRegency / Math.max(1, largestRebellions)
	report.preSuccessionRebellionShare = preSuccession / Math.max(1, rebellions)
	return report
}

function peopleReport({
	engine,
	from,
	to,
	peopleMs,
	childbirthDeathTimes,
}: PeopleReportParams): PeopleReport {
	const table = engine.people.persons
	const events = eventsIn({ engine, from, to })
	const minors = new Set(
		events
			.filter((note) => note.tag === "regency started")
			.map((note) => `${note.data.nation}:${note.data.leader}`),
	)
	const successions = events.filter((note) => note.tag === "succession")
	let births = 0
	let childless = 0
	let newHouse = 0
	let minor = 0
	for (const note of successions) {
		const dying = note.data.dying as number
		const time = note.time / STATE.yearMs
		births += table.children[dying].length
		if (
			!table.children[dying].some(
				(child) => table.birth[child] <= time && table.death[child] > time,
			)
		)
			childless++
		if (note.data.claim === 0) newHouse++
		if (minors.has(`${note.data.nation}:${note.data.successor}`)) minor++
	}
	const childbirthDeaths = childbirthDeathTimes.filter(
		(time) => time >= from * STATE.yearMs && time < to * STATE.yearMs,
	).length
	let twinBirths = 0
	for (let person = 0; person < table.birth.length; person++) {
		const mother = table.mother[person]
		if (mother < 0 || table.birth[person] < from || table.birth[person] >= to)
			continue
		if (
			table.children[mother].some(
				(child) => child < person && table.birth[child] === table.birth[person],
			)
		)
			twinBirths++
	}
	const count = Math.max(1, successions.length)
	return {
		successions: successions.length,
		birthsPerRuler: births / count,
		childlessShare: childless / count,
		newHouseShare: newHouse / count,
		minorShare: minor / count,
		childbirthDeaths,
		twinBirths,
		alive: engine.people.alive.length,
		msPerYear: peopleMs / Math.max(1, to - from),
	}
}

function standingBetrothals({ engine }: EngineParams): Map<number, number> {
	const people = engine.people
	const table = people.persons
	const time = engine.time / STATE.yearMs
	const pairs = new Map<number, number>()
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner > person && table.death[person] > time)
			pairs.set(person, partner)
	}
	return pairs
}

// Sovereign rulers' children are seen at their first yearly sample as married.
// Betrothals are compared with the previous sample: a pair that is gone was
// fulfilled if the two married, else broken by a death or by its alliance.
function trackMarriages({ engine, tracker }: TrackMarriagesParams): void {
	const people = engine.people
	const table = people.persons
	const time = engine.time / STATE.yearMs
	const pairs = standingBetrothals({ engine })
	for (const [person, partner] of pairs)
		if (tracker.betrothed.get(person) !== partner)
			tracker.betrothals.push({ time, outcome: "made" })
	for (const [person, partner] of tracker.betrothed) {
		if (pairs.get(person) === partner) continue
		tracker.betrothals.push({
			time,
			outcome:
				table.spouse[person] === partner
					? "married"
					: Math.min(table.death[person], table.death[partner]) <= time
						? "death"
						: "alliance",
		})
	}
	tracker.betrothed = pairs
	tracker.standing.push(pairs.size)
	for (const p of sovereigns({ engine }))
		if (people.rulerOf[p] >= 0) tracker.crowned.add(people.rulerOf[p])
	for (const person of people.alive) {
		const spouse = table.spouse[person]
		if (spouse < 0 || tracker.seen.has(person)) continue
		tracker.seen.add(person)
		if (
			!tracker.crowned.has(table.father[person]) &&
			!tracker.crowned.has(table.mother[person])
		)
			continue
		tracker.marriages.push({
			time: table.marriedAt[person],
			sex: table.sex[person],
			age: table.marriedAt[person] - table.birth[person],
			abroad: table.home[spouse] !== table.home[person],
		})
	}
}

function marriageReport({
	engine,
	from,
	to,
	tracker,
}: MarriageReportParams): MarriageReport {
	const events = eventsIn({ engine, from, to })
	const betrothals = (outcome: BetrothalOutcome) =>
		tracker.betrothals.filter(
			(change) =>
				change.outcome === outcome && change.time > from && change.time <= to,
		).length
	const marriages = tracker.marriages.filter(
		(marriage) => marriage.time >= from && marriage.time < to,
	)
	const meanAge = (sex: number) => {
		const ages = marriages
			.filter((marriage) => marriage.sex === sex)
			.map((marriage) => marriage.age)
		return ages.reduce((sum, age) => sum + age, 0) / Math.max(1, ages.length)
	}
	return {
		alliancesFormed: events.filter((note) => note.tag === "marriage alliance")
			.length,
		alliancesStanding: engine.people.marriageAlliances.size,
		firstMarriageAge: [meanAge(0), meanAge(1)],
		marriedAbroadShare:
			marriages.filter((marriage) => marriage.abroad).length /
			Math.max(1, marriages.length),
		heiressUnions: events.filter(
			(note) => note.tag === "personal union formed" && !note.data.shared,
		).length,
		betrothalsMade: betrothals("made"),
		betrothalsFulfilled: betrothals("married"),
		betrothalsBrokenByDeath: betrothals("death"),
		betrothalsBrokenByAlliance: betrothals("alliance"),
	}
}

function runSeed({
	seed,
	options,
	saved,
	seedDiagnostics,
}: RunSeedParams): CenturyReport[] {
	const started = performance.now()
	const familyCapture = PEOPLE_FAMILIES_REPORT.attach()
	const { engine, generated, generationMs, engineMs } = (() => {
		try {
			return HISTORY_RUN.createFreshEngine({
				seed,
				era: options.era,
				numPoints: options.numPoints,
				startYear: options.startYear,
			})
		} finally {
			familyCapture.detach()
		}
	})()
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
			doctrine: generated.religionDoctrine,
			era: options.era,
		}),
		religion: RELIGION_REPORT.summarize({
			religionTypes: generated.religionTypes,
			religionFamilies: generated.religionFamilies,
			religionDoctrine: generated.religionDoctrine,
		}),
		validation,
		initialBattlefields: BATTLEFIELD_REPORT.initial({ engine }),
		siegeLifecycle: BATTLEFIELD_REPORT.lifecycle({ engine }),
		completed: false,
		characterStage: options.characterStage,
		innateValidatedAtInit: PEOPLE_TRAITS_REPORT.validate({ engine }),
		totalPeopleCreated: engine.people.persons.birth.length,
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
		initial,
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
		districtsTotal: null as DistrictReport | null,
		householdsReportMs: 0,
		peopleRecord: null as PeopleRecordReport | null,
		households: null as HouseholdsReport | null,
		lifecycle: { ...engine.lifecycle },
		starters: null as StarterReport | null,
		wallMs: 0,
		peakMemoryKb: 0,
	}
	const persist = () => {
		if (!options.outPath) return
		mkdirSync(dirname(options.outPath), { recursive: true })
		diagnostics.wallMs = performance.now() - started
		diagnostics.peakMemoryKb = process.resourceUsage().maxRSS
		diagnostics.lifecycle = { ...engine.lifecycle }
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
	const peopleRecord = PEOPLE_RECORD_REPORT.attach()
	const initialPeople = structuredClone(peopleRecord.tracker)
	PEOPLE_RECORD_REPORT.ingest({
		tracker: initialPeople,
		transactions: engine.journal,
	})
	const startingFamilies = PEOPLE_FAMILIES_REPORT.of({
		engine,
		peopleRecord: initialPeople.record,
		capture: familyCapture,
	})
	familyCapture.skeleton = []
	Object.assign(diagnostics, { startingFamilies })
	const peopleHealth = PEOPLE_HEALTH_REPORT.tracker({ engine })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = Math.round(engine.time / STATE.yearMs)
	const reports: CenturyReport[] = []
	let from = start
	let startSovereigns = sovereigns({ engine }).length
	let atWarYears = 0
	let sampledYears = 0
	let peopleMs = 0
	let childbirthDeathTimes: number[] = []
	const startBetrothals = standingBetrothals({ engine })
	const tracker: MarriageTracker = {
		crowned: new Set(),
		seen: new Set(),
		marriages: [],
		betrothed: startBetrothals,
		betrothals: [],
		standing: [startBetrothals.size],
	}
	const runHealthYear = HEALTH.runYear
	HEALTH.runYear = (params) => {
		const t0 = performance.now()
		const dying = runHealthYear(params)
		peopleHealth.healthMs += performance.now() - t0
		return dying
	}
	const runPeopleYear = PEOPLE_EVENTS.runYear
	PEOPLE_EVENTS.runYear = (params) => {
		const t0 = performance.now()
		runPeopleYear(params)
		peopleMs += performance.now() - t0
		HISTORY_VALIDATION.betrothals({ engine: params.state, tracker: validation })
	}
	const characterTracker = PEOPLE_TRAITS_REPORT.tracker()
	const opinionTracker = PEOPLE_OPINION_REPORT.tracker()
	const householdTerritory = HOUSEHOLDS_REPORT.territory({
		parents: engine.parentCurrent,
		owners: engine.sovereignCurrent,
		timeMs: start * STATE.yearMs,
	})
	const householdSamples: StructuralSample[] = [
		{
			timeMs: start * STATE.yearMs,
			sovereigns: new Set(sovereigns({ engine })),
		},
	]
	const districts = DISTRICTS_REPORT.capture({ engine })
	const partitions = PARTITION_REPORT.tracker()
	partitions.cursor = engine.events.length
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
			householdSamples.push({
				timeMs: year * STATE.yearMs,
				sovereigns: new Set(sovereigns({ engine })),
			})
			MILITARY.validate({ state: engine })
			rebelLogistics.sample({ source: "annual" })
			diagnostics.recruitment.push(
				RECRUITMENT_REPORT.snapshot({
					engine,
					lateKnowledgeBand: options.lateKnowledgeBand,
				}),
			)
			HOUSEHOLDS_REPORT.ingestTerritory({
				territory: householdTerritory,
				transactions: engine.journal,
			})
			PEOPLE_RECORD_REPORT.ingest({
				tracker: peopleRecord.tracker,
				transactions: engine.journal,
			})
			PEOPLE_HEALTH_REPORT.ingest({
				tracker: peopleHealth,
				transactions: engine.journal,
			})
			for (const { people: packet } of engine.journal)
				for (let index = 0; index < (packet?.count ?? 0); index++) {
					const row = PEOPLE_LOG.read({ rows: packet as PeoplePacket, index })
					if (row.kind === "pregnancy" && row.outcome === "childbirth death")
						childbirthDeathTimes.push(row.time * STATE.yearMs)
				}
			engine.journal.length = 0
			diagnostics.annualTicks.push(performance.now() - tickStart)
			HISTORY_VALIDATION.alliances({ engine, tracker: validation })
			HISTORY_VALIDATION.rulers({ engine, tracker: validation })
			HISTORY_VALIDATION.unions({ engine, tracker: validation })
			if ((year - start) % 10 === 0)
				HISTORY_VALIDATION.districts({ engine, tracker: validation })
			if ([1367, 1500, 1800].includes(year) || year === start + options.years) {
				diagnostics.snapshots.push(KNOWLEDGE_REPORT.snapshot({ engine }))
				persist()
			}
			DISTRICTS_REPORT.sample({ engine, tracker: districts.tracker })
			PARTITION_REPORT.observe({ engine, tracker: partitions })
			trackMarriages({ engine, tracker })
			PEOPLE_HEALTH_REPORT.sample({ engine, tracker: peopleHealth })
			if (year === start + 10)
				diagnostics.starters = PEOPLE_HEALTH_REPORT.starters({
					record: peopleRecord.tracker.record,
					start,
				})
			PEOPLE_TRAITS_REPORT.sample({ engine, tracker: characterTracker, start })
			PEOPLE_OPINION_REPORT.sample({ engine, tracker: opinionTracker })
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
			const opinion = PEOPLE_OPINION_REPORT.of({
				engine,
				tracker: opinionTracker,
				record: peopleRecord.tracker.record,
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
				character: PEOPLE_TRAITS_REPORT.summarize({
					engine,
					tracker: characterTracker,
					from,
					to: year,
				}),
				households: {
					residenceRows: 0,
					sameResidenceRealmChanges: 0,
					...HOUSEHOLDS_REPORT.build({
						people: peopleRecord.tracker.record,
						samples: householdSamples,
						fromMs: from * STATE.yearMs,
						toMs: year * STATE.yearMs,
						final: year === start + options.years,
					}),
				},
				people: peopleReport({
					engine,
					from,
					to: year,
					peopleMs,
					childbirthDeathTimes,
				}),
				peopleHealth: PEOPLE_HEALTH_REPORT.summarize({
					engine,
					tracker: peopleHealth,
					record: peopleRecord.tracker.record,
					start,
					from,
					to: year,
				}),
				marriageDemography: PEOPLE_MARRIAGE_REPORT.demography({
					engine,
					record: peopleRecord.tracker.record,
					from,
					to: year,
				}),
				inbreeding: PEOPLE_TRAITS_REPORT.inbreeding({ engine, from, to: year }),
				marriage: marriageReport({ engine, from, to: year, tracker }),
				marriageMarket: PEOPLE_MARRIAGE_REPORT.summarize({
					windows: engine.marriageMarket,
					from,
					to: year,
				}),
				peopleOpinion: opinion.statistics,
				peopleOpinionCost: opinion.cost,
				military: MILITARY_REPORT.summarize({ tracker: military.tracker }),
				districts: DISTRICTS_REPORT.summarize({
					engine,
					tracker: districts.tracker,
					from,
					to: year,
				}),
				partitionState: PARTITION_REPORT.state({ engine }),
				partition: PARTITION_REPORT.summarize({
					engine,
					tracker: partitions,
					from,
					to: year,
					divideMs,
				}),
			})
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
			if (diagnostics.completed) {
				const householdsStarted = performance.now()
				const residenceReports = HOUSEHOLDS_REPORT.residence({
					people: peopleRecord.tracker.record,
					territory: householdTerritory,
					windows: reports.map((report, index) => ({
						fromMs: report.from * STATE.yearMs,
						toMs: report.to * STATE.yearMs,
						final: index === reports.length - 1,
					})),
				})
				for (let index = 0; index < reports.length; index++)
					Object.assign(reports[index].households, residenceReports[index])

				diagnostics.totalPeopleCreated = PEOPLE_TRAITS_REPORT.validate({
					engine,
				})
				HISTORY_VALIDATION.record({
					engine,
					tracker: validation,
					people: peopleRecord.tracker.record,
				})
				diagnostics.households = {
					...HOUSEHOLDS_REPORT.build({
						people: peopleRecord.tracker.record,
						samples: householdSamples,
						fromMs: start * STATE.yearMs,
						toMs: year * STATE.yearMs,
						final: true,
					}),
					...residenceReports.reduce(
						(total, report) => ({
							residenceRows: total.residenceRows + report.residenceRows,
							sameResidenceRealmChanges:
								total.sameResidenceRealmChanges +
								report.sameResidenceRealmChanges,
						}),
						{ residenceRows: 0, sameResidenceRealmChanges: 0 },
					),
				}
				diagnostics.householdsReportMs = performance.now() - householdsStarted
				diagnostics.peopleRecord = PEOPLE_RECORD_REPORT.summarize(
					peopleRecord.tracker,
				)
			}
			diagnostics.siegeLifecycle = BATTLEFIELD_REPORT.lifecycle({ engine })
			persist()
			options.log(
				`seed ${seed} saved through ${year}; ${(diagnostics.wallMs / 1000).toFixed(1)}s`,
			)
			childbirthDeathTimes = childbirthDeathTimes.filter(
				(time) => time >= year * STATE.yearMs,
			)
			from = year
			startSovereigns = endSovereigns.length
			atWarYears = 0
			sampledYears = 0
			peopleMs = 0
			divideMs = 0
		}
	} finally {
		PEOPLE_EVENTS.runYear = runPeopleYear
		HEALTH.runYear = runHealthYear
		PARTITION.divide = divide
		districts.detach()
		peopleRecord.detach()
		military.detach()
		rebelLogistics.detach()
	}
	const settled = tracker.standing.slice(20, 31)
	options.log(
		`seed ${seed} betrothals standing: ${tracker.standing[0]} at start, ${(settled.reduce((sum, count) => sum + count, 0) / Math.max(1, settled.length)).toFixed(1)} mean over years 20-30`,
	)
	HISTORY_VALIDATION.assert(validation)
	return reports
}

function run(options: HistoryReportOptions): Map<number, CenturyReport[]> {
	if (options.pipeline === "distribution") {
		DISTRIBUTION_REPORT.run(options)
		return new Map()
	}
	const results = new Map<number, CenturyReport[]>()
	const saved: Record<string, unknown> = {
		pipeline: "simulation",
		expectedSeeds: options.seeds,
	}
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
			"period      regencies  council  usurp uncle/prot  top20 rebels in regency  pre-death rebels  restore try/backed/revolt  lapsed",
		)
		for (const { from, to, regency: g } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(g.regencies).padStart(9)} ${`${(100 * g.councilShare).toFixed(0)}%`.padStart(8)} ${`${g.usurpationsByUncle}/${g.usurpationsByProtector}`.padStart(17)} ${`${(100 * g.largestRebellionRegencyShare).toFixed(0)}%`.padStart(24)} ${`${(100 * g.preSuccessionRebellionShare).toFixed(0)}%`.padStart(17)} ${`${g.restorationAttempts}/${g.restorationBacked}/${g.restorationRevolts}`.padStart(26)} ${String(g.claimsLapsed).padStart(7)}`,
			)
		options.log(
			"period      successions  births/ruler  childless  new house  minor  childbirth deaths  twins  alive  people ms/yr",
		)
		for (const { from, to, people: h } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(h.successions).padStart(11)} ${h.birthsPerRuler.toFixed(2).padStart(13)} ${`${(100 * h.childlessShare).toFixed(1)}%`.padStart(10)} ${`${(100 * h.newHouseShare).toFixed(1)}%`.padStart(10)} ${`${(100 * h.minorShare).toFixed(1)}%`.padStart(6)} ${String(h.childbirthDeaths).padStart(18)} ${String(h.twinBirths).padStart(6)} ${String(h.alive).padStart(6)} ${h.msPerYear.toFixed(1).padStart(13)}`,
			)
		options.log(
			"period      alliances made  standing  first wed m/f  wed abroad  heiress unions  betrothed  fulfilled  broken death/alliance",
		)
		for (const { from, to, marriage: m } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(m.alliancesFormed).padStart(14)} ${String(m.alliancesStanding).padStart(9)} ${`${m.firstMarriageAge[0].toFixed(1)}/${m.firstMarriageAge[1].toFixed(1)}`.padStart(14)} ${`${(100 * m.marriedAbroadShare).toFixed(0)}%`.padStart(11)} ${String(m.heiressUnions).padStart(15)} ${String(m.betrothalsMade).padStart(10)} ${String(m.betrothalsFulfilled).padStart(10)} ${`${m.betrothalsBrokenByDeath}/${m.betrothalsBrokenByAlliance}`.padStart(23)}`,
			)
		options.log(
			"period      partitions  rate  skipped line/heir/seat  new realms p50/p90  primary share p50  eff realms p50  same tier  sibling wars/unions  fates merged/sibling/other/again  standing union/alone  divide ms",
		)
		for (const { from, to, partition: d } of reports)
			options.log(
				`${`${from}-${to}`.padEnd(11)} ${String(d.partitions).padStart(10)} ${`${(100 * d.rate).toFixed(0)}%`.padStart(5)} ${`${d.skipped["not child line"]}/${d.skipped["no junior heir"]}/${d.skipped["no free seat"]}`.padStart(23)} ${`${d.newRealms.p50}/${d.newRealms.p90}`.padStart(19)} ${d.primaryPopulationShare.p50.toFixed(2).padStart(18)} ${d.effectiveRealms.p50.toFixed(2).padStart(15)} ${`${(100 * d.sameTierShare).toFixed(0)}%`.padStart(10)} ${`${d.siblingWars}/${d.siblingUnions}`.padStart(20)} ${`${d.fates.mergedByUnion}/${d.fates.absorbedBySibling}/${d.fates.absorbedByOther}/${d.fates.partitionedAgain}`.padStart(33)} ${`${d.fates.standingInUnion}/${d.fates.standingAlone}`.padStart(21)} ${d.divideMs.toFixed(0).padStart(10)}`,
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
