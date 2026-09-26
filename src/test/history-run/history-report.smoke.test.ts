import { it } from "vitest"
import { HISTORY_REPORT } from "@/test/history-run/report"

it("reports multi-seed war, rebellion, union and raid rates per century", () => {
	HISTORY_REPORT.run(
		HISTORY_REPORT.optionsFromEnv({
			env: process.env,
			log: (line) => process.stdout.write(`${line}\n`),
		}),
	)
}, 3_600_000)
