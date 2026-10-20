import type {
	HistoricalTarget,
	TargetBand,
	TargetBandsParams,
	TargetFormatParams,
	TargetMetric,
	TargetMetricId,
	TargetReference,
	TargetRow,
	TargetRowsParams,
	TargetSources,
	TargetSourcesParams,
	TargetStatus,
	TargetStatusParams,
	TargetValues,
	TargetValuesParams,
	TargetWindow,
} from "@/bench/targets/types"
import type { JsonObject, JsonValue } from "@/test/history-run/comparison/types"

const REFERENCES: Record<string, TargetReference> = {
	parker: {
		title:
			"Approximate Size of European Armies, 1475–1705 (after Geoffrey Parker)",
		url: "https://pages.uoregon.edu/dluebke/WesternCiv102/EuropeanArmies.html",
	},
	biggestArmies: {
		title: "15 of the Biggest Armies Ever Assembled (24/7 Wall St, 2023)",
		url: "https://247wallst.com/special-report/2023/10/09/15-of-the-biggest-armies-ever-assembled/3/",
	},
	qing: {
		title: "Military of the Qing dynasty (Wikipedia)",
		url: "https://en.wikipedia.org/wiki/Military_of_the_Qing_dynasty",
	},
	greenStandard: {
		title: "Green Standard Army (Wikipedia)",
		url: "https://en.wikipedia.org/wiki/Green_Standard_Army",
	},
	prussia: {
		title: "German militarism (Wikipedia)",
		url: "https://en.wikipedia.org/wiki/German_militarism",
	},
	habsburg: {
		title: "Battles between ‘emperors’ and ‘peoples’ (habsburger.net)",
		url: "https://habsburger.net/en/chapter/battles-between-emperors-and-peoples",
	},
	royalNavy: {
		title: "Royal Navy during the Napoleonic Wars (Wikipedia)",
		url: "https://en.wikipedia.org/wiki/Royal_Navy_during_the_Napoleonic_Wars",
	},
	britishNavy: {
		title: "The British Navy, 1793–1802 (napoleon.org)",
		url: "https://www.napoleon.org/en/history-of-the-two-empires/articles/the-british-navy-1793-1802/",
	},
	fulton: {
		title:
			"The fleets of Europe in 1792, from Robert Fulton (1810), in The British Navy, 1792–1802 (napoleon.org)",
		url: "https://www.napoleon.org/en/reading_room/articles/files/british_navy_17921802.asp",
	},
	frenchNavy: {
		title: "The Napoleonic French and Spanish Navies (warhistory.org)",
		url: "https://warhistory.org/%40msw/article/the-napoleonic-french-and-spanish-navies",
	},
	frykman: {
		title:
			"Frykman, Seamen on Late Eighteenth-Century European Warships (International Review of Social History, 2009)",
		url: "https://www.cambridge.org/core/services/aop-cambridge-core/content/view/B9DD11186E6574618F424E02E5341146/S0020859009000030a.pdf/seamen-on-late-eighteenth-century-european-warships.pdf",
	},
	navies: {
		title: "docs/terrestrial/politics/navies.md, crew curve basis",
		url: "",
	},
}

const MEDIEVAL_ARMY =
	"Medieval figures are paper strengths or levy potential, and the largest simulated realms hold 10–20 million people. No sourced anchor yet."

const MEDIEVAL_SHARE =
	"Large pre-modern empires kept about 1% under arms; the 90th-percentile realm sits toward the militarized end. No sourced anchor yet."

const LATE_FLEET =
	"The Royal Navy, the largest sailing navy: 120,000 men required by 1799, about 320 ships in commission in 1805, 138,000 active in 1813, and by the 1780s it needed every seaman Britain had. A simulated ship carries 375 crew from knowledge 2.38."

const METRICS: Record<TargetMetricId, TargetMetric> = {
	largestArmy: {
		label: "Largest army",
		path: ["military", "armySize.max"],
		unit: "soldiers",
	},
	monarchyArmyShare: {
		label: "Army share of population, monarchy p90",
		path: ["military", "armyShare.p90.monarchy"],
		unit: "share",
	},
	largestFleet: {
		label: "Largest fleet",
		path: ["navy", "largestFleet"],
		unit: "ships",
	},
	fleetSailorShare: {
		label: "Sailors in the largest fleet, share of its realm population",
		path: ["navy", "largestFleetLimits", "sailorShare"],
		unit: "share",
	},
}

const METRIC_IDS = Object.keys(METRICS) as TargetMetricId[]

const TARGETS: HistoricalTarget[] = [
	...[967, 1067, 1167].map(
		(to): HistoricalTarget => ({
			metric: "largestArmy",
			to,
			min: 100_000,
			max: 250_000,
			basis: "assumption",
			note: MEDIEVAL_ARMY,
			references: [],
		}),
	),
	...[1267, 1367].map(
		(to): HistoricalTarget => ({
			metric: "largestArmy",
			to,
			min: 150_000,
			max: 300_000,
			basis: "assumption",
			note: MEDIEVAL_ARMY,
			references: [],
		}),
	),
	{
		metric: "largestArmy",
		to: 1467,
		min: 200_000,
		max: 400_000,
		basis: "sourced",
		note: "Ming China raised the first standing army of about a million in the 15th century, about 1% of a far larger empire than any simulated realm.",
		references: ["biggestArmies"],
	},
	{
		metric: "largestArmy",
		to: 1567,
		min: 200_000,
		max: 400_000,
		basis: "sourced",
		note: "The Spanish Monarchy fielded about 300,000 in 1635.",
		references: ["parker"],
	},
	{
		metric: "largestArmy",
		to: 1667,
		min: 300_000,
		max: 500_000,
		basis: "sourced",
		note: "France fielded about 400,000 in 1705.",
		references: ["parker"],
	},
	{
		metric: "largestArmy",
		to: 1767,
		min: 400_000,
		max: 800_000,
		basis: "sourced",
		note: "Qing China kept about 800,000 in the mid-1700s (200,000 bannermen and 600,000 Green Standard troops), about 0.3% of some 300 million people.",
		references: ["qing", "greenStandard"],
	},
	{
		metric: "largestArmy",
		to: 1800,
		min: 400_000,
		max: 800_000,
		basis: "sourced",
		note: "Russia had about 400,000 around 1805 and Austria over 300,000 at full strength; Qing China about 800,000.",
		references: ["habsburg", "qing"],
	},
	...[967, 1067, 1167, 1267, 1367].map(
		(to): HistoricalTarget => ({
			metric: "monarchyArmyShare",
			to,
			min: 0.015,
			max: 0.025,
			basis: "assumption",
			note: MEDIEVAL_SHARE,
			references: [],
		}),
	),
	...[1467, 1567].map(
		(to): HistoricalTarget => ({
			metric: "monarchyArmyShare",
			to,
			min: 0.02,
			max: 0.025,
			basis: "assumption",
			note: MEDIEVAL_SHARE,
			references: [],
		}),
	),
	{
		metric: "monarchyArmyShare",
		to: 1667,
		min: 0.02,
		max: 0.03,
		basis: "sourced",
		note: "France's 400,000 in 1705 was about 2% of some 20 million people.",
		references: ["parker"],
	},
	...[1767, 1800].map(
		(to): HistoricalTarget => ({
			metric: "monarchyArmyShare",
			to,
			min: 0.025,
			max: 0.035,
			basis: "sourced",
			note: "Prussia kept 83,000 of 2.5 million people under arms in 1740, about 3.3%, the highest sustained share; Qing China about 0.3%.",
			references: ["prussia", "qing"],
		}),
	),
	{
		metric: "largestFleet",
		to: 1567,
		min: 100,
		max: 300,
		basis: "sourced",
		note: "The Armada of 1588 carried about 29,500 men on about 130 ships.",
		references: ["navies"],
	},
	{
		metric: "largestFleet",
		to: 1667,
		min: 150,
		max: 350,
		basis: "assumption",
		note: "Interpolated between the Armada and the Royal Navy of 1800.",
		references: [],
	},
	...[1767, 1800].map(
		(to): HistoricalTarget => ({
			metric: "largestFleet",
			to,
			min: 250,
			max: 450,
			basis: "sourced",
			note: LATE_FLEET,
			references: ["britishNavy", "royalNavy", "frykman", "navies"],
		}),
	),
	...[1767, 1800].map(
		(to): HistoricalTarget => ({
			metric: "fleetSailorShare",
			to,
			min: 0.003,
			max: 0.009,
			basis: "sourced",
			note: "France crewed about 78,000 men on 291 vessels in 1792 from at most 60,000 trained seamen, about 0.3% of some 28 million people; Britain crewed 100,000 in 1792 and about 138,000 by 1813, about 0.6–0.85% of some 16 million. The national populations are approximate.",
			references: ["fulton", "frenchNavy", "royalNavy", "britishNavy"],
		}),
	),
]

function object(value: JsonValue | undefined): JsonObject {
	return value && typeof value === "object" && !Array.isArray(value)
		? value
		: {}
}

function values({ rows }: TargetValuesParams): TargetValues {
	const result = {} as TargetValues
	for (const id of METRIC_IDS) {
		const { path } = METRICS[id]
		const found = rows
			.map((row) =>
				path.reduce<JsonValue | undefined>(
					(value, step) => object(value)[step],
					row,
				),
			)
			.filter((value): value is number => typeof value === "number")
		result[id] = found.length
			? found.reduce((sum, value) => sum + value, 0) / found.length
			: null
	}
	return result
}

function status({ value, target }: TargetStatusParams): TargetStatus {
	if (value === null) return "missing"
	if (value < target.min) return "below"
	return value > target.max ? "above" : "within"
}

function rows({ current, baseline }: TargetRowsParams): TargetRow[] {
	const at = (windows: TargetWindow[] | null, target: HistoricalTarget) =>
		windows?.find((window) => window.to === target.to)?.values[target.metric] ??
		null
	return TARGETS.map((target) => {
		const now = at(current, target)
		const before = at(baseline, target)
		return {
			target,
			current: now,
			baseline: before,
			currentStatus: status({ value: now, target }),
			baselineStatus: status({ value: before, target }),
		}
	})
}

function bands({ metric, years }: TargetBandsParams): (TargetBand | null)[] {
	return years.map((to) => {
		const target = TARGETS.find(
			(item) => item.metric === metric && item.to === to,
		)
		return target ? { min: target.min, max: target.max } : null
	})
}

function format({ value, unit }: TargetFormatParams): string {
	if (value === null) return "Missing"
	if (unit === "share") return `${(value * 100).toFixed(1)}%`
	return Math.round(value).toLocaleString("en-US")
}

function sources({ metric }: TargetSourcesParams): TargetSources {
	const targets = TARGETS.filter((target) => target.metric === metric)
	const keys = [...new Set(targets.flatMap((target) => target.references))]
	return {
		references: keys.map((key) => REFERENCES[key]),
		sourced: targets
			.filter((target) => target.basis === "sourced")
			.map((target) => target.to),
		assumed: targets
			.filter((target) => target.basis === "assumption")
			.map((target) => target.to),
	}
}

export const BENCH_TARGETS = {
	metrics: METRICS,
	references: REFERENCES,
	values,
	rows,
	bands,
	sources,
	format,
}
