import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { join, resolve, sep } from "node:path"
import { afterAll, expect, it } from "vitest"
import { WEATHER_BENCH } from "@/bench/weather"
import { formatBenchValue } from "@/ui/bench/format"
import { WEATHER_BENCH_VIEW } from "@/ui/bench/weather/view"

const cache = resolve("node_modules/.cache")
mkdirSync(cache, { recursive: true })
const root = mkdtempSync(join(cache, "weather-bench-"))
const previous = "2026-11-02T01-00-00-000Z-province-local-weather"
const current = "2026-11-02T02-00-00-000Z-province-local-weather"
const incompatible = "2026-11-02T03-00-00-000Z-province-local-weather"
const malformed = "2026-11-02T04-00-00-000Z-province-local-weather"
const partial = "2026-11-02T05-00-00-000Z-province-local-weather"
const source = {
	configuration: {
		seed: 1,
		years: 10,
		regions: 204001,
		stepHours: 6,
		siteCount: 1,
	},
	sites: [
		{
			region: 7,
			partitionViolations: 0,
			stormCloudMismatches: 0,
			blizzardViolations: 0,
		},
	],
	distributions: {
		conditions: [
			{
				kind: "hail",
				samples: 0,
				fraction: 0,
				sitesWithEvents: 0,
				onsets: 0,
				completedRunHistogramHours: {},
				gapHistogramHours: {},
			},
		],
		bins: [
			{
				dimension: "climate",
				label: "arctic",
				sampleHours: 6,
				sites: [0],
				conditions: { hail: { fraction: 0 } },
			},
		],
		triggerGates: {
			all: {
				hail: [
					{
						name: "updraft",
						evaluated: 0,
						passed: 0,
						failed: 0,
						notEvaluated: 1,
						funnelReached: 0,
						funnelPassed: 0,
						funnelRejected: 0,
					},
				],
			},
		},
		spatial: [] as unknown[],
		sites: [{ region: 7 }],
	},
	execution: { queries: 1, warmSnapshotMs: 1, batchMs: 10 },
	invariants: {
		sameTimeReproducible: true,
		baselineUnchanged: true,
		inspectionMatchesSampling: true,
		gateAgreementViolations: [] as string[],
		exposureMismatches: [] as string[],
	},
}
for (const id of [previous, current, incompatible, malformed, partial]) {
	const folder = join(root, "stats/weather", id)
	mkdirSync(folder, { recursive: true })
	if (id === partial) continue
	writeFileSync(
		join(folder, "results.json"),
		id === malformed
			? "{"
			: JSON.stringify(
					id === incompatible
						? { ...source, configuration: { ...source.configuration, seed: 2 } }
						: source,
				),
	)
}
afterAll(() => {
	if (!realpathSync(root).startsWith(realpathSync(cache) + sep))
		throw new Error("Unsafe weather bench fixture cleanup path")
	rmSync(root, { recursive: true, force: true })
})
it("lists completed distributions and preserves true zero versus absent metrics", () => {
	const runs = WEATHER_BENCH.list(root)
	expect(runs.map((run) => run.id)).toEqual([incompatible, current, previous])
	const report = WEATHER_BENCH.detail({ root, id: current })
	expect(report.run.startedAt).toBe("2026-11-02T02:00:00.000Z")
	expect(report.conditions[0].fraction).toBe(0)
	expect(report.conditions[0].daysPerYear).toBeNull()
	expect(report.maxWindMs).toBeNull()
	expect(report.environment).toBeNull()
	expect(
		report.checks.find((check) => check.label === "Environment accounting")
			?.passed,
	).toBeNull()
	expect(
		report.checks
			.filter((check) => check.passed !== null)
			.every((check) => check.passed),
	).toBe(true)
})
it("rejects traversal and unrelated paths", () => {
	expect(() => WEATHER_BENCH.detail({ root, id: "../history/1.json" })).toThrow(
		"Invalid weather report ID",
	)
	expect(() => WEATHER_BENCH.detail({ root, id: "%2e%2e%2fsecret" })).toThrow(
		"Invalid weather report ID",
	)
})
it("compares only matching sites/configuration and keeps rare percentages visible", () => {
	const runs = WEATHER_BENCH.list(root)
	expect(
		WEATHER_BENCH_VIEW.candidates({ runs, currentId: current }).map(
			(run) => run.id,
		),
	).toEqual([previous])
	expect(WEATHER_BENCH_VIEW.defaultBaseline({ runs, currentId: current })).toBe(
		previous,
	)
	const report = WEATHER_BENCH.detail({ root, id: current })
	const prior = WEATHER_BENCH.detail({ root, id: previous })
	const table = WEATHER_BENCH_VIEW.conditions({
		current: report,
		baseline: prior,
	})
	expect(table.rows[0].cells.current).toBe("0%")
	expect(table.rows[0].cells.baseline).toBe("0%")
	expect(table.rows[0].cells.days).toBe("—")
	const excluded = WEATHER_BENCH_VIEW.conditions({
		current: report,
		baseline: WEATHER_BENCH.detail({ root, id: incompatible }),
	})
	expect(excluded.rows[0].cells.baseline).toBe("—")
	expect(formatBenchValue({ value: 0.00053, unit: "%" })).toBe("0.00053%")
	expect(
		WEATHER_BENCH_VIEW.gates({ current: report, kind: "hail", scope: "all" })
			.rows[0].cells.passed,
	).toBe("—")
})
