import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { INGEST } from "@/model/people/cast/ingest"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import {
	groupsOf,
	usePersonWikiData,
} from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

const MS_PER_DAY = 86_400_000

it("renders a generated ruler's family chips, extended groups and timeline", () => {
	const fixture = PEOPLE_FIXTURE.create({ years: 120, points: 20000 })
	const record = fixture.state.record
	const cast = INGEST.open({ record, context: fixture.context })
	const fact = [...cast.anchors.facts.values()].find(
		(entry) => entry.reigns.length > 0,
	)
	if (!fact) throw new Error("No ruler")
	const select: PersonWikiDataInput["setSelectedWikiPerson"] = () => undefined
	const key = PERSON_QUERY.rulerKey(fact.rulerId)
	const input = (selectedTimeMs: number) =>
		({
			selectedWikiPerson: key,
			history: {
				state: fixture.state,
				selectedTimeMs,
				setSelectedTimeMs: (): void => undefined,
				provinceMeta: [],
			},
			planetName: "Test world",
			setSelectedWikiPerson: select,
		}) as unknown as PersonWikiDataInput
	function Probe({ timeMs }: { timeMs: number }): ReactElement | null {
		const person = usePersonWikiData(input(timeMs))
		return person ? createElement(PersonWikiPage, { person }) : null
	}
	const html = renderToStaticMarkup(
		createElement(Probe, { timeMs: record.maxTimeMs }),
	)
	expect(html).toContain("Parents")
	expect(html).toContain("Children")
	expect(html).toContain("Timeline")
	expect(html).not.toContain("Grandparents")
	const groups = groupsOf(
		PERSON_QUERY.extended({ cast, key, timeMs: record.maxTimeMs }),
		select,
	)
	expect(groups.map((group) => group.label)).toEqual([
		"Grandparents",
		"Uncles and aunts",
		"Cousins",
	])
	expect(groups[0].chips.length).toBeGreaterThan(0)
	const pending = renderToStaticMarkup(
		createElement(Probe, { timeMs: record.maxTimeMs + 5 * 365 * MS_PER_DAY }),
	)
	expect(pending).toContain("Waiting for the history to reach this date")
}, 300000)
