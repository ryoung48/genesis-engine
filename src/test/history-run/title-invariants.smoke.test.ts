import { expect, it } from "vitest"
import { HISTORY_RUN } from "@/test/history-run"
import { TITLE_INVARIANTS } from "@/test/history-run/title-invariants"
import type { HistoryRunOptions } from "@/test/history-run/types"

function options(overrides: Partial<HistoryRunOptions>): HistoryRunOptions {
	return {
		...HISTORY_RUN.optionsFromEnv({ env: process.env, log: () => undefined }),
		numPoints: Number(process.env.TITLE_POINTS ?? 20000),
		years: Number(process.env.TITLE_YEARS ?? 60),
		...overrides,
	}
}

it("keeps title, ruler, law and record invariants every year", () => {
	let checked = 0
	HISTORY_RUN.run(
		options({
			onYear: (params) => {
				TITLE_INVARIANTS.check(params)
				checked++
			},
		}),
	)
	expect(checked).toBeGreaterThan(0)
}, 3_600_000)

it("gives the same holders, laws and people for the same seed", () => {
	const digests: string[] = []
	for (let run = 0; run < 2; run++) {
		let digest = ""
		HISTORY_RUN.run(
			options({
				years: 25,
				onYear: ({ engine, year }) => {
					if (year % 5 !== 0) return
					digest += `${Array.from(engine.titles.holder.subarray(0, engine.titles.count)).join(",")}|${Array.from(engine.successionLaw).join("")}|${Array.from(engine.leaderNameSeedCurrent).join(",")}|${engine.people?.persons.count};`
				},
			}),
		)
		digests.push(digest)
	}
	expect(digests[0].length).toBeGreaterThan(0)
	expect(digests[1]).toBe(digests[0])
}, 3_600_000)
