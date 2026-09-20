import { it } from "vitest"
import { HISTORY_RUN } from "@/test/history-run"

it("runs a generated world through history and reports per year", () => {
	HISTORY_RUN.run(
		HISTORY_RUN.optionsFromEnv({
			env: process.env,
			log: (line) => process.stdout.write(`${line}\n`),
		}),
	)
}, 3_600_000)
