import { expect, it } from "vitest"
import { PEOPLE } from "@/model/history/sim/people"
import { MARRIAGE } from "@/model/history/sim/people/marriage"
import { HISTORY_RUN } from "@/test/history-run"

it("keeps ruler families married and in the planned size range", () => {
	let rulers = 0
	let married = 0
	let kids = 0
	HISTORY_RUN.run({
		...HISTORY_RUN.optionsFromEnv({ env: process.env, log: () => undefined }),
		numPoints: 20000,
		years: 160,
		onYear: ({ engine, year }) => {
			const people = engine.people
			if (!people || year < 1100 || year % 5 !== 0) return
			const persons = people.persons
			for (let seat = 0; seat < engine.P; seat++) {
				const ruler = people.holderOfSeat[seat]
				if (ruler < 0) continue
				const age = year - persons.birth[ruler]
				if (age < 35 || age >= 65) continue
				rulers++
				if (MARRIAGE.activeMarriage({ people, person: ruler, time: year }) >= 0)
					married++
				kids += PEOPLE.childrenOf({ people, parent: ruler }).filter(
					(child) => persons.death[child] > year,
				).length
			}
		},
	})
	expect(rulers).toBeGreaterThan(500)
	expect(married / rulers).toBeGreaterThanOrEqual(0.85)
	expect(kids / rulers).toBeGreaterThanOrEqual(2.2)
	expect(kids / rulers).toBeLessThanOrEqual(3.2)
}, 3_600_000)
