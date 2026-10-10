import { expect, it } from "vitest"
import { HISTORY_REPORT_OPTIONS } from "@/test/history-run/report/options"

it("defaults history reports to one seed and accepts a single override", () => {
	expect(
		HISTORY_REPORT_OPTIONS.fromEnv({ env: {}, log: () => undefined }).seeds,
	).toEqual([14963991])
	expect(
		HISTORY_REPORT_OPTIONS.fromEnv({
			env: { HISTORY_SEEDS: "42" },
			log: () => undefined,
		}).seeds,
	).toEqual([42])
})

it("rejects multiple or invalid benchmark seeds", () => {
	for (const value of ["1,2,3", "1,2", "", "invalid", "1.5"])
		expect(() =>
			HISTORY_REPORT_OPTIONS.fromEnv({
				env: { HISTORY_SEEDS: value },
				log: () => undefined,
			}),
		).toThrow("exactly one integer seed")
})
