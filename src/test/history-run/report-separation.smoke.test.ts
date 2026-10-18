import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it, vi } from "vitest"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { PERSON_QUERY } from "@/model/people/query"
import { HISTORY_REPORT } from "@/test/history-run/report"
import { HISTORY_REPORT_OPTIONS } from "@/test/history-run/report/options"
import { PEOPLE_RUN } from "@/test/people-run"
import { PEOPLE_REPORT } from "@/test/people-run/report"

it("completes a history report without invoking people generation", () => {
	const outPath = join(mkdtempSync(join(tmpdir(), "history-only-")), "1.json")
	const people = vi.spyOn(PEOPLE_REPORT, "of").mockImplementation(() => {
		throw new Error("People generation must be independent")
	})
	try {
		HISTORY_REPORT.run(
			HISTORY_REPORT_OPTIONS.fromEnv({
				env: {
					HISTORY_POINTS: "3000",
					HISTORY_YEARS: "1",
					HISTORY_OUT: outPath,
				},
				log: () => undefined,
			}),
		)
		const saved = JSON.parse(readFileSync(outPath, "utf8"))
		expect(saved.diagnostics.completed).toBe(true)
		expect(saved.diagnostics).not.toHaveProperty("people")
		expect(saved.diagnostics).not.toHaveProperty("peopleMs")
		expect(people).not.toHaveBeenCalled()
	} finally {
		people.mockRestore()
	}
}, 120000)

it("keeps people output and workload controls separate from history output", () => {
	const options = PEOPLE_RUN.optionsFromEnv({
		env: {
			HISTORY_OUT: "history.json",
			PEOPLE_OUT: "people.json",
			HISTORY_YEARS: "933",
			PEOPLE_PAGES: "2",
		},
		log: () => undefined,
	})
	expect(options.outPath).toBe("people.json")
	expect(options.history.outPath).toBe("history.json")
	expect(options.sampleSize).toBe(2)
	expect(options.history.years).toBe(0)
	const defaults = PEOPLE_RUN.optionsFromEnv({ env: {}, log: () => undefined })
	expect(defaults.outPath).toMatch(/^stats\/people\//)
})

it.each([
	"-1",
	"0.5",
	"NaN",
	"3000",
	"0",
])("rejects an invalid people page count %s", (value) => {
	expect(() =>
		PEOPLE_RUN.optionsFromEnv({
			env: { PEOPLE_PAGES: value },
			log: () => undefined,
		}),
	).toThrow("PEOPLE_PAGES")
})

it("queries initialized procedural people without advancing history or sweeping pages", () => {
	const outPath = join(mkdtempSync(join(tmpdir(), "people-initial-")), "0.json")
	const advance = vi
		.spyOn(SIM_ENGINE, "simulateUntil")
		.mockImplementation(() => {
			throw new Error("People report must not simulate history")
		})
	const page = vi.spyOn(PERSON_QUERY, "page")
	try {
		const result = PEOPLE_RUN.run(
			PEOPLE_RUN.optionsFromEnv({
				env: {
					HISTORY_POINTS: "3000",
					HISTORY_YEARS: "933",
					PEOPLE_OUT: outPath,
				},
				log: () => undefined,
			}),
		)
		expect(result.completed).toBe(true)
		expect(advance).not.toHaveBeenCalled()
		expect(page.mock.calls.length).toBeGreaterThan(0)
		expect(page.mock.calls.length).toBeLessThanOrEqual(24)
		const keys = new Set(page.mock.calls.map(([params]) => params.key))
		expect(page.mock.calls.length).toBe(keys.size * 2)
		expect(Object.values(result.seeds)[0].people.generatedPages).toBe(keys.size)
		for (const [params] of page.mock.calls) {
			expect(params.record.maxTimeMs).toBe(params.record.minTimeMs)
		}
	} finally {
		advance.mockRestore()
		page.mockRestore()
	}
}, 120000)
