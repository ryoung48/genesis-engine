import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterEach, expect, it } from "vitest"
import { HISTORY_COMPARISON } from "@/test/history-run/comparison"
import type { JsonObject, MetricRow } from "@/test/history-run/comparison/types"

const temporary: string[] = []
const cli = resolve("scripts/history-diff.mjs")

afterEach(() => {
	for (const path of temporary) {
		if (dirname(resolve(path)) !== resolve(tmpdir()))
			throw new Error(`Unexpected temporary path: ${path}`)
		rmSync(path, { recursive: true, force: true })
	}
	temporary.length = 0
})

function fixture(root: string): string {
	const path = mkdtempSync(join(root, "history-diff-"))
	temporary.push(path)
	return path
}

function report(population: number): JsonObject {
	return {
		"42": [
			{
				from: 867,
				to: 869,
				sovereigns: population,
				people: { alive: population, msPerYear: 10 },
			},
		],
		diagnostics: {
			completed: true,
			seed: 42,
			era: "lateMedieval",
			requestedPoints: 20,
			lateKnowledgeBand: 2.38,
			annualTicks: [10, 20],
			generationMs: 100,
			engineMs: 10,
			wallMs: 140,
			peakMemoryKb: 1000,
			recruitment: [{ year: 868, world: { population }, top: [{ nation: 1 }] }],
		},
	}
}

function rows(path: string): MetricRow[] {
	const html = readFileSync(path, "utf8")
	return JSON.parse(
		html.match(
			/<script type="application\/json" id="data">(.*?)<\/script>/s,
		)![1],
	)
}

it("separates simulation and performance changes, preserves missing fields and escapes HTML", () => {
	const root = fixture(tmpdir())
	const before = join(root, "previous.json")
	const current = join(root, "current.json")
	const a = report(100)
	const b = report(80)
	;(b.diagnostics as JsonObject).revision = "</script><script>alert(1)</script>"
	;(b["42"] as JsonObject[])[0].newMetric = 0
	writeFileSync(before, JSON.stringify(a))
	writeFileSync(current, JSON.stringify(b))
	const path = HISTORY_COMPARISON.write({ current, baseline: before })
	const result = rows(path)
	expect(
		result.find((row) => row.metric === "simulationTotalMs"),
	).toMatchObject({ section: "Performance", before: 30, after: 30 })
	expect(result.find((row) => row.metric === "sovereigns")).toMatchObject({
		section: "Century statistics",
		before: 100,
		after: 80,
	})
	expect(result.find((row) => row.metric === "people.msPerYear")).toMatchObject(
		{ section: "Performance", before: 10, after: 10 },
	)
	expect(result.find((row) => row.metric === "newMetric")).toMatchObject({
		after: 0,
	})
	expect(
		result.find((row) => row.metric === "newMetric")?.before,
	).toBeUndefined()
	expect(
		result
			.filter((row) => row.metric === "annualTickMs")
			.map((row) => row.period),
	).toEqual(["42 / year 868", "42 / year 869"])
	expect(readFileSync(path, "utf8")).not.toContain("</script><script>alert(1)")
})

it("selects the latest earlier equivalent completed run and supports regenerating all reports", () => {
	const root = fixture(tmpdir())
	const folders = [
		"2026-01-01T00-00-00-000Z-old",
		"2026-01-02T00-00-00-000Z-latest",
		"2026-01-03T00-00-00-000Z-mismatch",
		"2026-01-04T00-00-00-000Z-current",
		"2026-01-05T00-00-00-000Z-future",
	]
	for (const folder of folders) {
		const directory = join(root, "stats/history", folder)
		mkdirSync(directory, { recursive: true })
		const data = report(100)
		if (folder.includes("mismatch"))
			(data.diagnostics as JsonObject).requestedPoints = 30
		writeFileSync(join(directory, "2.json"), JSON.stringify(data))
	}
	const current = join("stats/history", folders[3], "2.json")
	const partialDirectory = join(
		root,
		"stats/history",
		"2026-01-03T12-00-00-000Z-partial",
	)
	mkdirSync(partialDirectory, { recursive: true })
	const partial = report(100)
	;(partial.diagnostics as JsonObject).completed = false
	writeFileSync(join(partialDirectory, "2.json"), JSON.stringify(partial))
	execFileSync(process.execPath, ["--experimental-strip-types", cli, current], {
		cwd: root,
	})
	const html = readFileSync(
		join(root, current.replace(".json", "-diff.html")),
		"utf8",
	)
	expect(html).toContain(folders[1])
	expect(html).not.toContain(folders[4])
	execFileSync(process.execPath, ["--experimental-strip-types", cli, "--all"], {
		cwd: root,
	})
	expect(
		readFileSync(
			join(root, "stats/history", folders[0], "2-diff.html"),
			"utf8",
		),
	).toContain("No earlier completed matching report")
})

it("rejects checkpoints and unfinished multi-seed reports", () => {
	const root = fixture(tmpdir())
	const current = join(root, "2.json")
	const data = report(100)
	;(data.diagnostics as JsonObject).completed = false
	writeFileSync(current, JSON.stringify(data))
	expect(() =>
		HISTORY_COMPARISON.write({ current, baseline: current }),
	).toThrow("Partial report")
	;(data.diagnostics as JsonObject).completed = true
	data.expectedSeeds = [42, 43]
	writeFileSync(current, JSON.stringify(data))
	expect(() =>
		HISTORY_COMPARISON.write({ current, baseline: current }),
	).toThrow("Partial multi-seed")
})
