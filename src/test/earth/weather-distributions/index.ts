import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_DECISION } from "@/model/climate/weather/local/decision"
import type { WeatherReportCondition as WeatherCondition } from "@/model/climate/weather/local/description/types"
import { WEATHER_VOCABULARY } from "@/model/climate/weather/local/vocabulary"
import { WEATHER_ENVIRONMENT } from "@/test/earth/weather-distributions/environment"
import type {
	CloseEventParams,
	CreateDistributionsParams,
	DistributionReport,
	DistributionState,
	EventRun,
	RecordDistributionParams,
	RecordGatesParams,
	RecordSpatialParams,
	UpdateEventParams,
} from "@/test/earth/weather-distributions/types"

function create({
	sites,
	pairs,
	stepHours,
	years,
}: CreateDistributionsParams): DistributionState {
	const inventory: WeatherCondition[] = [
		...WEATHER_DECISION.inventory().map((kind) => `system:${kind}` as const),
		...WEATHER_VOCABULARY.inventory(),
	]
	return {
		environment: WEATHER_ENVIRONMENT.create(),
		systemPrecipitation: Object.fromEntries(
			WEATHER_DECISION.inventory().map((kind) => [
				kind,
				{ drySamples: 0, wetSamples: 0 },
			]),
		),
		sites,
		pairs,
		stepHours,
		years,
		inventory,
		seen: sites.map(() => 0),
		localDay: sites.map(() => 0),
		lastPhase: sites.map<number | null>(() => null),
		lastObservedDay: sites.map<number | null>(() => null),
		lastObservedYear: sites.map(() => -1),
		sampledDaysByYear: sites.map(() => Array<number>(years).fill(0)),
		runs: sites.map(
			() =>
				new Map(
					inventory.map<[WeatherCondition, EventRun]>((kind) => [
						kind,
						{
							previous: null,
							activeSteps: 0,
							startsAtBoundary: false,
							completed: 0,
							completeSteps: 0,
							maxObservedSteps: 0,
							leftCensored: 0,
							rightCensored: 0,
							histogram: {},
							gaps: {},
							lastEndStep: null,
							transitions: { offOff: 0, offOn: 0, onOff: 0, onOn: 0 },
							onsetsByYear: Array<number>(years).fill(0),
							activeByYear: Array<number>(years).fill(0),
							activeDaysByYear: Array<number>(years).fill(0),
							lastActiveDay: null,
							lastActiveYear: -1,
						},
					]),
				),
		),
		bins: new Map(),
		gates: new Map(),
		spatial: pairs.map(
			() =>
				new Map(
					inventory.map((kind) => [
						kind,
						{ both: 0, firstOnly: 0, secondOnly: 0, neither: 0 },
					]),
				),
		),
		ranges: new Map(
			inventory.map((kind) => [
				kind,
				{
					minTemperatureC: Infinity,
					maxTemperatureC: -Infinity,
					maxWindMs: 0,
					maxRainMmH: 0,
				},
			]),
		),
		maxWindMs: 0,
		maxGustMs: 0,
	}
}
function close({ run, rightCensored, stepHours }: CloseEventParams) {
	if (!run.activeSteps) return
	if (run.startsAtBoundary) run.leftCensored++
	if (rightCensored) run.rightCensored++
	if (!run.startsAtBoundary && !rightCensored) {
		run.completed++
		run.completeSteps += run.activeSteps
		const hours = run.activeSteps * stepHours
		run.histogram[hours] = (run.histogram[hours] ?? 0) + 1
	}
	run.activeSteps = 0
}
function event({ run, active, step, year, day, stepHours }: UpdateEventParams) {
	if (run.previous !== null) {
		if (run.previous) {
			if (active) run.transitions.onOn++
			else run.transitions.onOff++
		} else if (active) run.transitions.offOn++
		else run.transitions.offOff++
	}
	if (active) {
		if (!run.activeSteps) {
			run.startsAtBoundary = step === 0
			if (step !== 0) run.onsetsByYear[year]++
			if (run.lastEndStep !== null) {
				const gap = (step - run.lastEndStep - 1) * stepHours
				run.gaps[gap] = (run.gaps[gap] ?? 0) + 1
			}
		}
		run.activeSteps++
		run.maxObservedSteps = Math.max(run.maxObservedSteps, run.activeSteps)
		run.activeByYear[year]++
		if (
			day !== null &&
			(run.lastActiveDay !== day || run.lastActiveYear !== year)
		) {
			run.activeDaysByYear[year]++
			run.lastActiveDay = day
			run.lastActiveYear = year
		}
	} else if (run.activeSteps) {
		close({ run, rightCensored: false, stepHours })
		run.lastEndStep = step - 1
	}
	run.previous = active
}
function gates({ state, group, traces }: RecordGatesParams) {
	let conditions = state.gates.get(group)
	if (!conditions) {
		conditions = new Map()
		state.gates.set(group, conditions)
	}
	for (const trace of traces) {
		let counts = conditions.get(trace.condition)
		if (!counts) {
			counts = trace.gates.map((gate) => ({
				name: gate.name,
				evaluated: 0,
				passed: 0,
				failed: 0,
				notEvaluated: 0,
				funnelReached: 0,
				funnelPassed: 0,
				funnelRejected: 0,
			}))
			conditions.set(trace.condition, counts)
		}
		let reached = true
		trace.gates.forEach((gate, index) => {
			const counter = counts[index]
			if (counter.name !== gate.name)
				throw new Error("Trigger gate order changed within a diagnostic")
			if (gate.passed === null) {
				counter.notEvaluated++
				reached = false
				return
			}
			counter.evaluated++
			if (gate.passed) counter.passed++
			else counter.failed++
			if (reached) {
				counter.funnelReached++
				if (gate.passed) counter.funnelPassed++
				else counter.funnelRejected++
			}
			reached = reached && gate.passed
		})
	}
}
function record({
	state,
	site,
	instant,
	values,
	traces,
}: RecordDistributionParams): Set<WeatherCondition> {
	const metadata = state.sites[site]
	const step = state.seen[site]++
	const year = Math.min(state.years - 1, Math.max(0, instant.year))
	const active = new Set<WeatherCondition>(
		values.dominant ? [values.dominant] : [],
	)
	active.add(`system:${values.system}`)
	state.systemPrecipitation[values.system][
		values.rainRateMmH >= 0.01 ? "wetSamples" : "drySamples"
	]++
	WEATHER_ENVIRONMENT.record({
		state: state.environment,
		values,
		conditions: active,
	})
	const season = WEATHER_CLOCK.season({
		instant,
		latitudeDeg: metadata.latitude,
	})
	const phase =
		values.localHour === null || instant.solarDaySeconds === null
			? null
			: (values.localHour * 3600) / instant.solarDaySeconds
	if (
		phase !== null &&
		state.lastPhase[site] !== null &&
		phase < state.lastPhase[site]!
	)
		state.localDay[site]++
	state.lastPhase[site] = phase
	const day = phase === null ? null : state.localDay[site]
	if (
		day !== null &&
		(state.lastObservedDay[site] !== day ||
			state.lastObservedYear[site] !== year)
	) {
		state.sampledDaysByYear[site][year]++
		state.lastObservedDay[site] = day
		state.lastObservedYear[site] = year
	}
	const localTime =
		phase === null
			? "noSolarClock"
			: ["00–06", "06–12", "12–18", "18–24"][Math.min(3, Math.floor(phase * 4))]
	const dimensions = [
		["all", "all"],
		["climate", metadata.climate],
		["season", season],
		["localTime", localTime],
		["climateSeason", `${metadata.climate} / ${season}`],
		["year", String(year)],
	]
	for (const [dimension, label] of dimensions) {
		const key = `${dimension}:${label}`
		let bin = state.bins.get(key)
		if (!bin) {
			bin = {
				dimension,
				label,
				samples: 0,
				sampleHours: 0,
				sites: new Set(),
				conditionSamples: {},
			}
			state.bins.set(key, bin)
		}
		bin.samples++
		bin.sampleHours += state.stepHours
		bin.sites.add(site)
		for (const kind of active)
			bin.conditionSamples[kind] = (bin.conditionSamples[kind] ?? 0) + 1
	}
	for (const kind of state.inventory) {
		event({
			run: state.runs[site].get(kind)!,
			active: active.has(kind),
			step,
			year,
			day,
			stepHours: state.stepHours,
		})
		if (active.has(kind)) {
			const range = state.ranges.get(kind)!
			range.minTemperatureC = Math.min(
				range.minTemperatureC,
				values.temperatureC,
			)
			range.maxTemperatureC = Math.max(
				range.maxTemperatureC,
				values.temperatureC,
			)
			range.maxWindMs = Math.max(range.maxWindMs, values.windSpeedMs)
			range.maxRainMmH = Math.max(range.maxRainMmH, values.rainRateMmH)
		}
	}
	gates({ state, group: "all", traces })
	gates({ state, group: metadata.climate, traces })
	state.maxWindMs = Math.max(state.maxWindMs, values.windSpeedMs)
	state.maxGustMs = Math.max(state.maxGustMs, values.gustMs)
	return active
}
function neighbors({ state, active }: RecordSpatialParams) {
	state.pairs.forEach((pair, index) => {
		for (const kind of state.inventory) {
			const first = active[pair.first].has(kind),
				second = active[pair.second].has(kind)
			const count = state.spatial[index].get(kind)!
			if (first && second) count.both++
			else if (first) count.firstOnly++
			else if (second) count.secondOnly++
			else count.neither++
		}
	})
}
function fano(counts: number[]): number | null {
	const mean = counts.reduce((a, b) => a + b, 0) / counts.length
	return mean > 0
		? counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
				counts.length /
				mean
		: null
}
function finish(state: DistributionState): DistributionReport {
	for (const site of state.runs)
		for (const run of site.values())
			close({ run, rightCensored: true, stepHours: state.stepHours })
	const bins = [...state.bins.values()].map((bin) => ({
		...bin,
		sites: [...bin.sites].sort((a, b) => a - b),
		conditions: Object.fromEntries(
			state.inventory.map((kind) => [
				kind,
				{
					samples: bin.conditionSamples[kind] ?? 0,
					sampleHours: (bin.conditionSamples[kind] ?? 0) * state.stepHours,
					fraction: (bin.conditionSamples[kind] ?? 0) / bin.samples,
				},
			]),
		),
	}))
	const overall = state.bins.get("all:all")!
	const hasSolarDays = state.sampledDaysByYear.some((days) =>
		days.some((count) => count > 0),
	)
	const conditions = state.inventory.map((kind) => {
		const runs = state.runs.map((site) => site.get(kind)!)
		const sampledDays = runs.reduce(
			(sum, run) => sum + run.activeDaysByYear.reduce((a, b) => a + b, 0),
			0,
		)
		const completed = runs.reduce((sum, run) => sum + run.completed, 0)
		const completeSteps = runs.reduce((sum, run) => sum + run.completeSteps, 0)
		const histogram: Record<string, number> = {},
			gaps: Record<string, number> = {}
		for (const run of runs) {
			for (const [key, value] of Object.entries(run.histogram))
				histogram[key] = (histogram[key] ?? 0) + value
			for (const [key, value] of Object.entries(run.gaps))
				gaps[key] = (gaps[key] ?? 0) + value
		}
		const transitions = runs.reduce(
			(sum, run) => ({
				offOff: sum.offOff + run.transitions.offOff,
				offOn: sum.offOn + run.transitions.offOn,
				onOff: sum.onOff + run.transitions.onOff,
				onOn: sum.onOn + run.transitions.onOn,
			}),
			{ offOff: 0, offOn: 0, onOff: 0, onOn: 0 },
		)
		const fraction = (overall.conditionSamples[kind] ?? 0) / overall.samples
		const continuation =
			transitions.onOn + transitions.onOff
				? transitions.onOn / (transitions.onOn + transitions.onOff)
				: null
		const activation =
			transitions.offOn + transitions.offOff
				? transitions.offOn / (transitions.offOn + transitions.offOff)
				: null
		const range = state.ranges.get(kind)!
		return {
			kind,
			samples: overall.conditionSamples[kind] ?? 0,
			fraction,
			sampledDays,
			meanSampledDaysPerSiteYear: hasSolarDays
				? sampledDays / (state.years * state.sites.length)
				: null,
			sitesWithEvents: runs.filter((run) =>
				run.activeByYear.some((value) => value > 0),
			).length,
			onsets: runs.reduce(
				(sum, run) => sum + run.onsetsByYear.reduce((a, b) => a + b, 0),
				0,
			),
			completedRuns: completed,
			meanCompletedRunHours: completed
				? (completeSteps * state.stepHours) / completed
				: null,
			maxObservedRunHours:
				Math.max(...runs.map((run) => run.maxObservedSteps)) * state.stepHours,
			leftCensoredRuns: runs.reduce((sum, run) => sum + run.leftCensored, 0),
			rightCensoredRuns: runs.reduce((sum, run) => sum + run.rightCensored, 0),
			completedRunHistogramHours: histogram,
			gapHistogramHours: gaps,
			transitions,
			continuationProbability: continuation,
			activationProbability: activation,
			persistenceLift:
				fraction && continuation !== null ? continuation / fraction : null,
			eventRanges: {
				...range,
				minTemperatureC: Number.isFinite(range.minTemperatureC)
					? range.minTemperatureC
					: null,
				maxTemperatureC: Number.isFinite(range.maxTemperatureC)
					? range.maxTemperatureC
					: null,
			},
			bySite: runs.map((run, site) => ({
				region: state.sites[site].region,
				onsetsByYear: run.onsetsByYear,
				activeSamplesByYear: run.activeByYear,
				activeDaysByYear: run.activeDaysByYear,
				onsetFano: fano(run.onsetsByYear),
			})),
		}
	})
	const spatial = state.pairs.map((pair, index) => ({
		...pair,
		conditions: Object.fromEntries(
			state.inventory.map((kind) => {
				const count = state.spatial[index].get(kind)!,
					either = count.both + count.firstOnly + count.secondOnly,
					total = either + count.neither
				const first = count.both + count.firstOnly,
					second = count.both + count.secondOnly
				return [
					kind,
					{
						...count,
						jaccard: either ? count.both / either : null,
						neighborGivenFirst: first ? count.both / first : null,
						jointLift:
							first && second ? (count.both * total) / (first * second) : null,
					},
				]
			}),
		),
	}))
	return {
		environment: WEATHER_ENVIRONMENT.report(state.environment),
		systemPrecipitation: state.systemPrecipitation,
		configuration: {
			stepHours: state.stepHours,
			years: state.years,
			weighting: "unweighted stratified site-time occupancy",
			season: "shared hemisphere-aware astronomical season",
			localTime: "four equal solar-day quarters, labeled as 24-hour equivalent",
			duration: "sampled contiguous runs, not measured storm lifetimes",
			dayDefinition:
				"observed local solar days from phase wrap; partial days at annual-window boundaries counted separately",
		},
		sites: state.sites,
		siteExposure: state.sites.map((site, index) => ({
			region: site.region,
			sampledDaysByYear: state.sampledDaysByYear[index],
		})),
		conditions,
		bins,
		triggerGates: Object.fromEntries(
			[...state.gates].map(([group, map]) => [group, Object.fromEntries(map)]),
		),
		spatial,
		weatherExtremes: {
			maxSustainedWindMs: state.maxWindMs,
			maxGustMs: state.maxGustMs,
		},
	}
}
export const WEATHER_DISTRIBUTIONS = {
	create,
	record,
	neighbors,
	finish,
}
