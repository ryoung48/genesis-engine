import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { resolve as resolvePath } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const SOURCE_ROOT = fileURLToPath(new URL("../src/", import.meta.url))

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!specifier.startsWith("@/")) return nextResolve(specifier, context)
		const base = resolvePath(SOURCE_ROOT, specifier.slice(2))
		const file = [base, `${base}.ts`, resolvePath(base, "index.ts")].find(
			(candidate) => /\.ts$/.test(candidate) && existsSync(candidate),
		)
		return nextResolve(file ? pathToFileURL(file).href : specifier, context)
	},
})

const { HISTORY_COMPARISON } = await import(
	"../src/test/history-run/comparison/index.ts"
)

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
