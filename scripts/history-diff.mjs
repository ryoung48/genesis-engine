import { HISTORY_COMPARISON } from "../src/test/history-run/comparison/index.ts"

const [current, baseline, ...extra] = process.argv.slice(2)
if (extra.length || (current === "--all" && baseline)) {
	throw new Error("Usage: pnpm diff:history <current.json> [previous.json] | --all")
}
if (current === "--all") {
	for (const path of HISTORY_COMPARISON.files("stats/history")) {
		try {
			console.log(HISTORY_COMPARISON.write({ current: path, baseline: null }))
		} catch (error) {
			if (!(error instanceof Error) || !/^(Partial|Incomplete|Missing timeline)/.test(error.message)) throw error
			console.warn(`Skipped ${error.message}`)
		}
	}
} else if (current) {
	console.log(HISTORY_COMPARISON.write({ current, baseline: baseline ?? null }))
} else {
	throw new Error("Usage: pnpm diff:history <current.json> [previous.json] | --all")
}
