import { it } from "vitest"
import { HISTORY_REPORT } from "@/test/history-run/report"
import { CHARACTER_STAGES } from "@/test/history-run/report/people-traits/stages"

it("reports multi-seed war, rebellion, union and raid rates per century", () => {
	const options = HISTORY_REPORT.optionsFromEnv({
		env: process.env,
		log: (line) => process.stdout.write(`${line}\n`),
	})
	const restore = CHARACTER_STAGES.configure({ stage: options.characterStage })
	try {
		HISTORY_REPORT.run(options)
	} finally {
		restore()
	}
}, 3_600_000)
