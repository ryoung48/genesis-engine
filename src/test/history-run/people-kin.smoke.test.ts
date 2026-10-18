import { expect, it } from "vitest"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { MARRIAGE } from "@/model/people/marriage"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_STORE } from "@/model/people/store"
import { PERSON_STUB } from "@/model/people/stub"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"

it("marries relatives only where both religions allow it, on both pages", () => {
	const fixture = PEOPLE_FIXTURE.create({ years: 400, points: 20000 })
	const record = fixture.state.record
	const store = PEOPLE_STORE.reset({ record })
	const index = PEOPLE_STORE.index(store)
	for (const fact of index.facts.values())
		PERSON_QUERY.page({
			store,
			key: fact.key,
			timeMs: record.maxTimeMs,
			frameAt: fixture.frameAt,
			doctrine: fixture.doctrine,
			geography: fixture.geography,
		})
	const doctrine = fixture.doctrine
	const required = {
		sibling: 3,
		"half-sibling": 3,
		"uncle-niece": 2,
		cousin: 1,
	}
	let kin = 0
	let violations = 0
	for (const marriage of new Set(store.marriages.values())) {
		if (!marriage.kinship) continue
		kin++
		for (const key of [marriage.husband, marriage.wife]) {
			if (!MARRIAGE.chain({ store, key }).marriages.includes(marriage))
				violations++
			const stub = PERSON_STUB.of({ store, key })
			const frame = fixture.frameAt(marriage.startMs)
			const bar =
				doctrine &&
				RELIGION_DOCTRINE.consanguinity({
					doctrine,
					religion: frame.provinceReligion[stub.home] ?? -1,
				})
			if (bar === null || bar === undefined) violations++
		}
		expect(required[marriage.kinship]).toBeGreaterThan(0)
	}
	expect(kin).toBeGreaterThan(0)
	expect(violations).toBe(0)
}, 900000)
