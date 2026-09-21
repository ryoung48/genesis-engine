import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { NAMES } from "@/model/society/language/names"
import { HISTORY_RUN } from "@/test/history-run"

const SEED = 14963991

it("names people by their own culture and sex", () => {
	const { world, state } = HISTORY_RUN.build({
		seed: SEED,
		era: "highMedieval",
		numPoints: 20000,
		years: 60,
	})
	const names = NAMES.createWorldNames(world)
	const people = state.record.people
	let women = 0
	let rulers = 0
	for (const log of state.record.events.nationEvents) {
		for (const event of log?.events ?? []) {
			if (event.kind !== "rulerChange") continue
			const personId = event.payload.personId as number
			expect(PEOPLE_RECORD.has({ record: people, person: personId })).toBe(true)
			expect(event.payload.female).toBe(people.sex[personId] === 1)
			if (event.payload.female) women++
			if (event.payload.regent) continue
			rulers++
			expect(event.payload.name).toBe(
				names.person({
					personId,
					culture: people.culture[personId],
					sex: people.sex[personId] as 0 | 1,
				}),
			)
		}
	}
	expect(rulers).toBeGreaterThan(0)
	expect(women).toBeGreaterThan(0)

	let differing = 0
	let sampled = 0
	for (let personId = 0; personId < people.count && sampled < 200; personId++) {
		const culture = people.culture[personId]
		const male = names.person({ personId, culture, sex: 0 })
		const female = names.person({ personId, culture, sex: 1 })
		if (male.startsWith("Person #")) continue
		sampled++
		if (male !== female) differing++
	}
	expect(sampled).toBeGreaterThan(0)
	expect(differing / sampled).toBeGreaterThan(0.5)

	const cultures = new Map<number, Set<number>>()
	for (let person = 0; person < people.count; person++) {
		const dynasty = people.dynasty[person]
		const set = cultures.get(dynasty) ?? new Set<number>()
		set.add(people.culture[person])
		cultures.set(dynasty, set)
	}
	let spread = 0
	for (const [dynasty, set] of cultures) {
		if (set.size < 2) continue
		spread++
		const first = names.dynasty({
			dynastyIdx: dynasty,
			culture: people.dynastyCulture.get(dynasty) ?? -1,
		})
		for (const culture of set)
			expect(names.dynasty({ dynastyIdx: dynasty, culture })).toBe(first)
	}
	expect(spread).toBeGreaterThan(0)
}, 3_600_000)
