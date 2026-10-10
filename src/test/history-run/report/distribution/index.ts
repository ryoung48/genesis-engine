import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import { DISTRIBUTION_RECORD } from "@/model/history/distribution/record"
import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import { HISTORY } from "@/model/history/record"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_COMPARISON } from "@/test/history-run/comparison"
import type {
	AverageParams,
	DistanceParams,
	DistributionSnapshot,
	SnapshotParams,
} from "@/test/history-run/report/distribution/types"
import { REPORT_LIFETIME } from "@/test/history-run/report/lifetime"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"
import type { HistoryReportOptions } from "@/test/history-run/report/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

function snapshot({ engine: e }: SnapshotParams): DistributionSnapshot {
	const sizes = [...e.territory.countries.values()].map((c) => c.members.size),
		h = DISTRIBUTION_TARGETS.histogram({ sizes }),
		t = e.target
	const countryShares = h.countries.map((n) => (h.count ? n / h.count : 0)),
		territoryShares = h.territory.map((n) => (h.mass ? n / h.mass : 0))
	const rawMean = t.raw.shares.reduce((a, q, b) => a + q * t.raw.means[b], 0)
	const rawTerritory = t.raw.shares.map(
		(q, b) => (q * t.raw.means[b]) / rawMean,
	)
	const tv = ({ before, after }: DistanceParams) =>
		before.reduce((sum, v, i) => sum + Math.abs(v - after[i]) * 0.5, 0)
	const incoming = new Map<number, number>()
	for (const a of e.attacks.active.values())
		incoming.set(a.defender, (incoming.get(a.defender) ?? 0) + 1)
	const average = ({ values }: AverageParams) =>
		values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
	let tendrils = 0,
		shaped = 0
	for (const c of e.territory.countries.values()) {
		if (c.members.size < 2) continue
		for (const p of c.members) {
			shaped++
			if (
				DISTRIBUTION_TERRITORY.enclosure({
					territory: e.territory,
					attacker: c.id,
					province: p,
				}) <= 1
			)
				tendrils++
		}
	}
	let lifecycle = 0
	const activeWars = new Set(e.attacks.active.keys())
	const pending = e.pending.at(-1)
	for (const identity of pending
		? pending.nations.map((p) => p.identity)
		: e.history.record.nations)
		if (identity.deathTimeMs < 0 !== e.territory.countries.has(identity.id))
			lifecycle++
	for (const country of e.territory.countries.values()) {
		const identity = e.history.record.nations[country.id]
		if (
			!identity ||
			identity.deathTimeMs >= 0 ||
			DISTRIBUTION_RECORD.capitalOf({
				log: e.history.record.events.nationEvents[country.id],
			}) !== country.capital
		)
			lifecycle++
	}
	const wars = new Map((pending?.wars ?? []).map((war) => [war.id, war]))
	for (const attack of e.attacks.active.values()) {
		const war = e.history.record.events.wars[attack.id]
		if (!war || war.id !== attack.id) {
			lifecycle++
			continue
		}
		wars.set(war.id, war)
	}
	for (const war of wars.values()) {
		const starts = war.events.filter((event) => event.kind === "warStart"),
			ends = war.events.filter((event) => event.kind === "warEnd")
		if (
			starts.length !== 2 ||
			(activeWars.has(war.id) ? ends.length !== 0 : ends.length !== 2)
		)
			lifecycle++
	}
	return {
		year: e.year,
		count: h.count,
		mass: h.mass,
		mean: h.count ? h.mass / h.count : 0,
		maximum: sizes.length ? Math.max(...sizes) : 0,
		ceiling: t.raw.ceiling,
		countryTV: h.mass
			? tv({ before: countryShares, after: t.countryShares })
			: 0,
		territoryTV: h.mass
			? tv({ before: territoryShares, after: t.territoryShares })
			: 0,
		countError: t.targetN ? Math.abs(h.count - t.targetN) / t.targetN : 0,
		steeringLoss: DISTRIBUTION_TARGETS.loss({ observed: h, target: t }),
		rawCountryTV: h.mass
			? tv({ before: countryShares, after: t.raw.shares })
			: 0,
		rawTerritoryTV: h.mass
			? tv({ before: territoryShares, after: rawTerritory })
			: 0,
		targetCount: t.targetN,
		targetMean: t.targetMean,
		applicable: t.distributionApplicable,
		countryShares,
		territoryShares,
		targetCountryShares: t.countryShares,
		targetTerritoryShares: t.territoryShares,
		activeAttacks: e.attacks.active.size,
		maximumIncoming: incoming.size ? Math.max(...incoming.values()) : 0,
		meanGain: average({ values: e.attacks.gains }),
		meanBias: average({ values: e.attacks.biases }),
		gainQuantiles: REPORT_STATISTICS.summarize(e.attacks.gains),
		biasQuantiles: REPORT_STATISTICS.summarize(e.attacks.biases),
		meanAttackerRatio: average({ values: e.attacks.attackerRatios }),
		opportunities: e.attacks.opportunities,
		suppressed: e.attacks.suppressed,
		captureDraws: e.attacks.captureDraws,
		blockedFronts: e.attacks.blocked,
		meanCompletionRatio: average({ values: e.attacks.completionRatios }),
		rejectedFronts: e.attacks.rejectedFronts,
		rejectedCapacity: e.attacks.rejectedCapacity,
		endReasons: { ...e.attacks.endReasons },
		projectionSummary: [...new Set(t.components)].map((c) => ({
			capacity: c.capacity,
			ceiling: c.ceiling,
			count: c.sizes.length,
			continuousMean: c.continuousMean,
			objective: c.objective,
			fits: c.fitDiagnostics,
		})),
		declared: e.attacks.declared.length,
		ended: e.attacks.ended.length,
		mutations: e.territory.mutations,
		splits: e.splits,
		absorptions: e.absorptions,
		connectivityScans: e.territory.connectivityScans,
		connectivityMs: e.territory.connectivityMs,
		tendrilShare: shaped ? tendrils / shaped : 0,
		invariants: {
			...DISTRIBUTION_TERRITORY.validate({ territory: e.territory }),
			lifecycle,
		},
	}
}

function run(options: HistoryReportOptions): void {
	const baselinePipeline = options.baselinePath
		? (HISTORY_COMPARISON.read(options.baselinePath).data.pipeline ??
			"simulation")
		: null
	const from = options.startYear ?? 2,
		to = from + options.years
	if (from < 2 || to > 2025 || options.years < 1)
		throw new Error("Distribution measurement window must be inside 2–2025")
	const saved: Record<string, unknown> = {
		pipeline: "distribution",
		expectedSeeds: options.seeds,
		diagnosticsBySeed: {},
	}
	const bySeed: Record<string, unknown> = {}
	for (const seed of options.seeds) {
		const started = performance.now()
		const generated = GENERATE_WORLD.generateGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed,
				era: options.era,
				numPoints: options.numPoints,
				tideLock: null,
				historyPipeline: "distribution",
			},
		})
		const generationMs = performance.now() - started
		const init = performance.now()
		const engine = DISTRIBUTION_ENGINE.create({
			world: generated as unknown as SerializedGenesisWorld,
		})
		const engineMs = performance.now() - init
		const warmupStarted = performance.now()
		while (engine.year < from) {
			DISTRIBUTION_ENGINE.advanceYear({ engine })
			engine.pending = []
		}
		const warmupMs = performance.now() - warmupStarted
		const initial = snapshot({ engine }),
			annual: DistributionSnapshot[] = [],
			annualTicks: number[] = [],
			frameTicks: number[] = [],
			frameYears: number[] = []
		const checkpoints = [2, 476, 1066, 1701, 1914, 2025]
		const selected: DistributionSnapshot[] = checkpoints.includes(from)
			? [initial]
			: []
		for (let year = from + 1; year <= to; year++) {
			const tick = performance.now()
			DISTRIBUTION_ENGINE.advanceYear({ engine })
			annualTicks.push(performance.now() - tick)
			const row = snapshot({ engine })
			engine.pending = []
			annual.push(row)
			if (year % 100 === 0)
				options.log(
					`seed ${seed} through ${year}: countries ${row.count}/${row.targetCount}`,
				)
			if (checkpoints.includes(year)) {
				selected.push(row)
				options.log(
					`seed ${seed} year ${year}: tendrils ${row.tendrilShare.toFixed(4)}, countries ${row.count}/${row.targetCount}, country TV ${row.countryTV.toFixed(3)}, territory TV ${row.territoryTV.toFixed(3)}, count error ${row.countError.toFixed(3)}`,
				)
			}
			if (
				(year - from) % 20 === 0 ||
				checkpoints.includes(year) ||
				year === to
			) {
				frameYears.push(year)
				const frameStart = performance.now()
				HISTORY.frameAt({
					state: engine.history,
					timeMs: engine.history.record.maxTimeMs,
				})
				frameTicks.push(performance.now() - frameStart)
				engine.history.frameCache.clear()
			}
		}
		const violations = annual.reduce(
			(n, r) =>
				n +
				r.invariants.ownership +
				r.invariants.connectivity +
				r.invariants.capitals +
				r.invariants.lifecycle,
			initial.invariants.ownership +
				initial.invariants.connectivity +
				initial.invariants.capitals +
				initial.invariants.lifecycle,
		)
		const gate =
			selected.length === 6 &&
			selected.every(
				(r) =>
					r.applicable &&
					r.countryTV <= 0.1 &&
					r.territoryTV <= 0.15 &&
					r.countError <= 0.25,
			) &&
			violations === 0
		const recordBytes = Buffer.byteLength(
			JSON.stringify(engine.history.record, (...args) =>
				args[1] instanceof Map ? [...args[1]] : args[1],
			),
		)
		bySeed[seed] = {
			pipeline: "distribution",
			completed: true,
			era: options.era,
			requestedPoints: options.numPoints,
			lateKnowledgeBand: options.lateKnowledgeBand,
			generationMs,
			engineMs,
			warmupMs,
			warmupFrom: 2,
			warmupTo: from,
			annualTicks,
			frameTicks,
			frameYears,
			frameCadence: 20,
			annual,
			checkpoints: selected,
			initial,
			projection: engine.target,
			projectionMs: engine.projectionMs,
			advanceMs: engine.advanceMs,
			recordWritingMs: engine.recordWritingMs,
			recordIngestionMs: engine.recordIngestionMs,
			generationStages: generated.timings,
			recordBytes,
			identityCount: engine.history.record.nations.length,
			nationLifetimes: REPORT_LIFETIME.summarize({
				nations: engine.history.record.nations,
				windows: [
					{ from, to },
					{ from: 200, to: 1000 },
					{ from: 1444, to: 1821 },
				],
			}),
			provinceEvents: [
				...engine.history.record.events.provinceEvents.values(),
			].reduce((a, l) => a + l.events.length, 0),
			invariantViolations: violations,
			calibrationPassed: gate,
			wallMs: performance.now() - started,
			peakMemoryKb: process.resourceUsage().maxRSS,
			memory: process.memoryUsage(),
		}
		saved[seed] = [
			{
				from,
				to,
				sovereigns: annual.at(-1)?.count ?? initial.count,
				distribution: annual.at(-1),
			},
		]
		options.log(
			`seed ${seed}: calibration ${gate ? "PASS" : "FAIL"}; generation ${generationMs.toFixed(0)}ms, init ${engineMs.toFixed(0)}ms, record ${recordBytes} bytes`,
		)
	}
	saved.diagnosticsBySeed = bySeed
	if (options.seeds.length === 1) saved.diagnostics = bySeed[options.seeds[0]]
	mkdirSync(dirname(options.outPath), { recursive: true })
	writeFileSync(options.outPath, JSON.stringify(saved))
	const comparison = HISTORY_COMPARISON.write({
		current: options.outPath,
		baseline: options.baselinePath,
	})
	writeFileSync(
		join(dirname(options.outPath), "comparison.md"),
		`Pipe 3 (${options.seeds.join(", ")}, ${options.numPoints} points, ${from}–${to}). Warm-up from AD 2 is reported separately. ${options.baselinePath ? `Explicit reference: ${options.baselinePath}; ${baselinePipeline === "distribution" ? "same producer" : "different mechanisms"}.` : "No equivalent pre-change Pipe 3 baseline exists."} See ${comparison}. Calibration results are recorded per seed; the default-switch gate requires all three 204000-point workloads to pass.\n`,
	)
}

export const DISTRIBUTION_REPORT = { run, snapshot }
