import type { OutputPathParams } from "@/test/history-run/output/types"

function path({ env, years, kind }: OutputPathParams): string {
	const people = kind === "people"
	const out = people ? env.PEOPLE_OUT : env.HISTORY_OUT
	if (out) return out
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
	const title =
		(
			(people ? env.PEOPLE_TITLE : env.HISTORY_TITLE) ??
			(people ? "people-report" : `history-${kind}`)
		)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || `history-${kind}`
	return `stats/${people ? "people" : "history"}/${timestamp}-${title}/${kind === "pipeline" ? "pipeline/" : ""}${years}.json`
}

export const HISTORY_OUTPUT = { path }
