import type {
	MarkdownCell,
	MarkdownTableParams,
} from "@/test/earth/weather-distributions/presentation/types"
import type { DistributionReport } from "@/test/earth/weather-distributions/types"

function cell(value: MarkdownCell): string {
	return String(value ?? "—").replaceAll("|", "\\|")
}
function table({ headers, rows }: MarkdownTableParams): string {
	return [
		`| ${headers.map(cell).join(" | ")} |`,
		`| ${headers.map(() => "---").join(" | ")} |`,
		...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
	].join("\n")
}
function markdown(report: DistributionReport): string {
	const percent = (value: number | null) =>
		value === null ? "—" : `${(100 * value).toFixed(4)}%`
	const summary = table({
		headers: [
			"Condition",
			"Sampled time",
			"Sites",
			"Sampled days/site/year",
			"Onsets",
			"Complete runs",
			"Mean complete hours",
			"Max observed hours",
			"Left/right censored",
		],
		rows: report.conditions.map((c) => [
			c.kind,
			percent(c.fraction),
			c.sitesWithEvents,
			c.meanSampledDaysPerSiteYear?.toFixed(2) ?? null,
			c.onsets,
			c.completedRuns,
			c.meanCompletedRunHours?.toFixed(1) ?? null,
			c.maxObservedRunHours,
			`${c.leftCensoredRuns}/${c.rightCensoredRuns}`,
		]),
	})
	const exposure = table({
		headers: ["Dimension", "Bin", "Sample-hours", "Sites"],
		rows: report.bins
			.filter((bin) => !["climateSeason", "year"].includes(bin.dimension))
			.map((bin) => [
				bin.dimension,
				bin.label,
				bin.sampleHours,
				bin.sites.length,
			]),
	})
	const breakdowns = ["climate", "season", "localTime"]
		.map((dimension) => {
			const bins = report.bins.filter((bin) => bin.dimension === dimension)
			return (
				`## ${dimension} occupancy\n\n` +
				table({
					headers: ["Condition", ...bins.map((bin) => bin.label)],
					rows: report.conditions.map((c) => [
						c.kind,
						...bins.map((bin) => percent(bin.conditions[c.kind].fraction)),
					]),
				})
			)
		})
		.join("\n\n")
	const gateTables = Object.entries(report.triggerGates.all)
		.map(
			([kind, counts]) =>
				`### ${kind}\n\n` +
				table({
					headers: [
						"Gate",
						"Evaluated",
						"Independent passed",
						"Independent failed",
						"Not evaluated",
						"Funnel reached",
						"Funnel passed",
						"First rejection",
					],
					rows: counts.map((c) => [
						c.name,
						c.evaluated,
						c.passed,
						c.failed,
						c.notEvaluated,
						c.funnelReached,
						c.funnelPassed,
						c.funnelRejected,
					]),
				}),
		)
		.join("\n\n")
	const temporal = table({
		headers: [
			"Condition",
			"P(next on | on)",
			"P(next on | off)",
			"Persistence lift",
		],
		rows: report.conditions.map((c) => [
			c.kind,
			percent(c.continuationProbability),
			percent(c.activationProbability),
			c.persistenceLift?.toFixed(2) ?? null,
		]),
	})
	return `# Weather trigger distributions\n\nThese are unweighted occupancies over the diagnostic's stratified sites, not global occurrence rates or calibrated probabilities. ${report.configuration.stepHours}-hour samples can miss short events and merge intervening gaps. Durations are sampled runs quantized to ${report.configuration.stepHours} hours; boundary-touching runs are excluded from completed-run means and histograms. Censored runs still contribute occupancy. Sampled event days count a condition once per observed local solar day (per annual window), so multiple onsets in one day do not inflate the count. ${report.configuration.stepHours}-hour sampling still misses short storms; these are not equivalent to complete observed thunder-day records. Site/year sampled-day denominators are in JSON. No observational calibration or arbitrary rate acceptance gates are applied.\n\n## Overall occupancy and sampled runs\n\n${summary}\n\n## Exposure denominators\n\nEach breakdown cell uses that column's sample-hours. Climate-season cross-tabs and per-site/year onset counts are in results.json.\n\n${exposure}\n\n${breakdowns}\n\n## Temporal clustering\n\nThese transitions are ${report.configuration.stepHours} hours apart. Lift is continuation probability divided by overall occupancy, a descriptive measure rather than an independent-event significance test. Gap histograms and within-site annual onset Fano ratios are in JSON; sparse annual events make Fano estimates unstable.\n\n${temporal}\n\n## Decision consistency checks\n\nChecks validate selected outcomes and numeric accounting, not probabilities of upper-air phenomena. Independent counts and ordered funnel counts remain separately recorded. Climate-specific gate counters are in JSON. Normal weather sampling does not allocate trace arrays.\n\n${gateTables}\n\n## Spatial clustering\n\nPer-condition nearest-site contingency tables, Jaccard overlap, conditional neighbor occupancy and joint lift are in results.json with actual pair distances. These directed pairs may repeat a physical pair and are not independent observations. The sparse global sites do not resolve storm-cell geometry. Joint non-events are retained in the contingency table but excluded from Jaccard, avoiding misleading clear-weather agreement.\n\nMaximum sustained wind ${report.weatherExtremes.maxSustainedWindMs.toFixed(2)} m/s; maximum gust ${report.weatherExtremes.maxGustMs.toFixed(2)} m/s.\n`
}

export const WEATHER_DISTRIBUTION_PRESENTATION = { markdown }
