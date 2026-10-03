import { readdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { HISTORY_COMPARISON } from "@/test/history-run/comparison"
import type { OutputPathParams } from "@/test/history-run/output/types"

function path({ env, years, kind }: OutputPathParams): string {
	if (env.HISTORY_OUT) return env.HISTORY_OUT
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
	const title =
		(env.HISTORY_TITLE ?? `history-${kind}`)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || `history-${kind}`
	return `stats/history/${timestamp}-${title}/${kind === "pipeline" ? "pipeline/" : ""}${years}.json`
}

function prune(outPath: string): void {
	const root = resolve("stats/history")
	if (dirname(dirname(resolve(outPath))) !== root) return
	const runs = readdirSync(root, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/.test(entry.name),
		)
		.filter((entry) =>
			HISTORY_COMPARISON.files(join(root, entry.name)).some((file) => {
				try {
					HISTORY_COMPARISON.read(file)
					return true
				} catch {
					return false
				}
			}),
		)
		.sort((a, b) => b.name.localeCompare(a.name))
	for (const run of runs.slice(10)) {
		const directory = resolve(root, run.name)
		if (dirname(directory) !== root)
			throw new Error(`Unexpected history run path: ${directory}`)
		rmSync(directory, { recursive: true, force: true })
	}
}

export const HISTORY_OUTPUT = { path, prune }
