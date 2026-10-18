import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_STORE } from "@/model/people/store"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

it("renders a generated ruler's family chips and timeline", () => {
	const fixture = PEOPLE_FIXTURE.create({ years: 120, points: 20000 })
	const store = PEOPLE_STORE.reset({ record: fixture.state.record })
	const index = PEOPLE_STORE.index(store)
	const fact = [...index.facts.values()].find(
		(entry) => entry.reigns.length > 0,
	)
	if (!fact) throw new Error("No ruler")
	const select: PersonWikiDataInput["setSelectedWikiPerson"] = () => undefined
	const input = {
		selectedWikiPerson: PERSON_QUERY.rulerKey(fact.rulerId),
		history: {
			state: fixture.state,
			selectedTimeMs: fixture.state.record.maxTimeMs,
			setSelectedTimeMs: (): void => undefined,
			provinceMeta: [],
		},
		planetName: "Test world",
		setSelectedWikiPerson: select,
	} as unknown as PersonWikiDataInput
	function Probe(): ReactElement | null {
		const person = usePersonWikiData(input)
		return person ? createElement(PersonWikiPage, { person }) : null
	}
	const html = renderToStaticMarkup(createElement(Probe))
	expect(html).toContain("Parents")
	expect(html).toContain("Children")
	expect(html).toContain("Timeline")
}, 300000)
