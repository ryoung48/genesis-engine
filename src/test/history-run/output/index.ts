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

export const HISTORY_OUTPUT = { path }
