import { it } from "vitest"
import { HISTORY_REPORT } from "@/test/history-run/report"

it("reports multi-seed war, rebellion, union and raid rates per century", () => {
	const options = HISTORY_REPORT.optionsFromEnv({
		env: process.env,
		log: (line) => process.stdout.write(`${line}\n`),
	})
	HISTORY_REPORT.run(options)
}, 3_600_000)
