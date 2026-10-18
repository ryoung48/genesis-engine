import { expect, it } from "vitest"
import { NOBILITY } from "@/model/people/nobility"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_STORE } from "@/model/people/store"
import { PERSON_STUB } from "@/model/people/stub"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"

it("draws spouses from seeded nobles by tier, with lowborn rare", () => {
	const fixture = PEOPLE_FIXTURE.create({ years: 300, points: 20000 })
	const record = fixture.state.record
	const store = PEOPLE_STORE.reset({ record })
	const index = PEOPLE_STORE.index(store)
	const keys = [...index.facts.values()].slice(0, 120).map((fact) => fact.key)
	let ranks = 0
	let violations = 0
	for (const key of keys) {
		const page = PERSON_QUERY.page({
			store,
			key,
			timeMs: record.maxTimeMs,
			frameAt: fixture.frameAt,
			doctrine: fixture.doctrine,
			geography: fixture.geography,
		})
		if (!page) continue
		ranks++
		if (!page.rank || page.seatProvince < 0) violations++
	}
	expect(ranks).toBeGreaterThan(0)
	expect(violations).toBe(0)
	let claimed = 0
	for (const list of store.claims.values()) claimed += list.length
	expect(claimed).toBeGreaterThan(0)
	let spouses = 0
	let lowborn = 0
	for (const marriage of new Set(store.marriages.values())) {
		if (marriage.kind !== "free") continue
		for (const key of [marriage.husband, marriage.wife]) {
			const stub = PERSON_STUB.of({ store, key })
			if (stub.kind !== "spouse") continue
			spouses++
			if (NOBILITY.tierOf({ store, stub, timeMs: marriage.startMs }) === -1)
				lowborn++
		}
	}
	expect(spouses).toBeGreaterThan(0)
	expect(lowborn / spouses).toBeLessThan(0.15)
	for (const [id, key] of store.holders) {
		const stub = PERSON_STUB.of({ store, key })
		expect(id.includes(":")).toBe(true)
		expect(stub.tier).toBeGreaterThanOrEqual(0)
	}
}, 900000)

it("never changes a claimed person's facts after they are claimed", () => {
	const fixture = PEOPLE_FIXTURE.create({ years: 200, points: 20000 })
	const record = fixture.state.record
	const store = PEOPLE_STORE.reset({ record })
	const index = PEOPLE_STORE.index(store)
	const keys = [...index.facts.values()].slice(0, 80).map((fact) => fact.key)
	const open = (key: string) =>
		PERSON_QUERY.page({
			store,
			key,
			timeMs: record.maxTimeMs,
			frameAt: fixture.frameAt,
			doctrine: fixture.doctrine,
			geography: fixture.geography,
		})
	for (const key of keys) open(key)
	let violations = 0
	for (const claimedKey of [...store.claims.keys()].slice(0, 60)) {
		const stub = PERSON_STUB.of({ store, key: claimedKey })
		const before = {
			birthMs: stub.birthMs,
			sex: stub.sex,
			dynasty: stub.dynasty,
		}
		const page = open(claimedKey)
		if (
			!page ||
			page.birthMs !== before.birthMs ||
			(page.female ? 1 : 0) !== before.sex
		)
			violations++
	}
	expect(violations).toBe(0)
}, 900000)
