import { expect, it } from "vitest"
import { PERSON_KEY } from "@/model/people/keys"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_STORE } from "@/model/people/store"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"

it("links adjacent rulers as first cousins through real shared grandparents", () => {
	const fixture = PEOPLE_FIXTURE.create({ years: 300, points: 20000 })
	const record = fixture.state.record
	const store = PEOPLE_STORE.reset({ record })
	const index = PEOPLE_STORE.index(store)
	const open = (key: string) =>
		PERSON_QUERY.page({
			store,
			key,
			timeMs: record.maxTimeMs,
			frameAt: fixture.frameAt,
			doctrine: fixture.doctrine,
			geography: fixture.geography,
		})
	for (const fact of [...index.facts.values()].slice(0, 150)) open(fact.key)
	const links = [...index.couples.values()].filter((couple) =>
		couple.id.startsWith("c:"),
	)
	expect(links.length).toBeGreaterThan(0)
	let violations = 0
	let checked = 0
	for (const couple of links) {
		const mother = PERSON_KEY.parse(couple.children[0].key)
		const father = PERSON_KEY.parse(couple.children[1].key)
		if (mother.tag !== "A" || father.tag !== "A") continue
		const first = mother.anchor.slice(2)
		const second = father.anchor.slice(2)
		if (!first.startsWith("R(") || !second.startsWith("R(")) continue
		const page = open(first)
		const cousins = page?.groups
			.find((group) => group.label === "Cousins")
			?.members.map((member) => member.key)
		if (!cousins) continue
		checked++
		if (!cousins.includes(second)) violations++
	}
	expect(checked).toBeGreaterThan(0)
	expect(violations).toBe(0)
}, 900000)
