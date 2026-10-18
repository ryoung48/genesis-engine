import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { HISTORY_OUTPUT } from "@/test/history-run/output"
import { HISTORY_REPORT_OPTIONS } from "@/test/history-run/report/options"
import type { ReportEnvParams } from "@/test/history-run/report/options/types"
import { PEOPLE_INPUT } from "@/test/people-run/input"
import { PEOPLE_REPORT } from "@/test/people-run/report"
import type { PeopleRunOptions, PeopleRunResult } from "@/test/people-run/types"

function optionsFromEnv(params: ReportEnvParams): PeopleRunOptions {
	const history = HISTORY_REPORT_OPTIONS.fromEnv({
		...params,
		env: { ...params.env, HISTORY_YEARS: "0" },
	})
	const sampleSize = Number(params.env.PEOPLE_PAGES ?? 12)
	if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 12)
		throw new Error("PEOPLE_PAGES must be an integer from 1 to 12")
	return {
		history,
		sampleSize,
		outPath: HISTORY_OUTPUT.path({
			env: params.env,
			years: 0,
			kind: "people",
		}),
	}
}

function run({
	history,
	sampleSize,
	outPath,
}: PeopleRunOptions): PeopleRunResult {
	const result: PeopleRunResult = {
		completed: false,
		sampleSize,
		seeds: {},
	}
	for (const seed of history.seeds) {
		const input = PEOPLE_INPUT.build({
			history: {
				seed,
				era: history.era,
				numPoints: history.numPoints,
				startYear: history.startYear,
				reachKm: history.reachKm,
				cohesionStep: history.cohesionStep,
			},
			years: 0,
			fresh: true,
		})
		history.log(
			`seed ${seed}: initial world ready; querying ${sampleSize} pages`,
		)
		const started = performance.now()
		const people = PEOPLE_REPORT.of({
			state: input.state,
			context: input.context,
			sampleSize,
		})
		result.seeds[seed] = {
			era: history.era,
			numPoints: history.numPoints,
			startYear: input.startYear,
			years: 0,
			reachKm: history.reachKm,
			cohesionStep: history.cohesionStep,
			generationMs: input.generationMs,
			historyMs: input.historyMs,
			peopleMs: performance.now() - started,
			peakMemoryKb: process.resourceUsage().maxRSS,
			people,
		}
		history.log(
			`seed ${seed}: ${people.generatedPages} pages, ${people.persons} people`,
		)
	}
	result.completed = true
	mkdirSync(dirname(outPath), { recursive: true })
	writeFileSync(outPath, JSON.stringify(result))
	history.log(`People report: ${outPath}`)
	return result
}

export const PEOPLE_RUN = { optionsFromEnv, run }
