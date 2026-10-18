import { it } from "vitest"
import { HISTORY_REPORT } from "@/test/history-run/report"
import { HISTORY_REPORT_OPTIONS } from "@/test/history-run/report/options"

it("reports multi-seed war, rebellion, union and raid rates per century", () => {
	const options = HISTORY_REPORT_OPTIONS.fromEnv({
		env: process.env,
		log: (line) => process.stdout.write(`${line}\n`),
	})
	HISTORY_REPORT.run(options)
}, 3_600_000)
