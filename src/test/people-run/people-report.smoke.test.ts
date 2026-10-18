import { it } from "vitest"
import { PEOPLE_RUN } from "@/test/people-run"

it("reports people queries on an initialized procedural world", () => {
	PEOPLE_RUN.run(
		PEOPLE_RUN.optionsFromEnv({
			env: process.env,
			log: (line) => process.stdout.write(`${line}\n`),
		}),
	)
}, 300_000)
