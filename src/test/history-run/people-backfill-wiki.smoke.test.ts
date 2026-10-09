import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { NO_RELIGION_SELECTION } from "@/test/history-run/no-religion-selection"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

it("renders prior titles with unknown starts and maternal dynasties", () => {
	const { engine, generated } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	const people = state.record.people
	if (!people) throw new Error("Missing recorded people")
	const tenure = people.tenures.find((tenure) => tenure.startTimeMs === null)
	if (!tenure) throw new Error("Missing predecessor tenure")
	const input = {
		religionSelection: NO_RELIGION_SELECTION,
		selectedWikiPersonId: tenure.person,
		history: {
			state,
			selectedTimeMs: state.record.minTimeMs,
			minTimeMs: state.record.minTimeMs,
			maxTimeMs: state.record.maxTimeMs,
			setSelectedTimeMs: vi.fn(),
		},
		sceneRef: { current: null },
		setSelectedWikiNationId: vi.fn(),
		setSelectedWikiOrganizationId: vi.fn(),
		setSelectedWikiWarId: vi.fn(),
		setSelectedWikiPersonId: vi.fn(),
	} as unknown as PersonWikiDataInput
	function Page() {
		const data = usePersonWikiData(input)
		if (!data) throw new Error("Missing person page")
		const previous = data.groups.find(
			(group) => group.label === "Previous titles",
		)
		if (input.selectedWikiPersonId === tenure?.person)
			expect(
				previous?.chips.some((chip) => chip.title?.includes("start unknown")),
			).toBe(true)
		return createElement(PersonWikiPage, { person: data })
	}
	expect(renderToString(createElement(Page))).toContain("Previous titles")
	const holder = PERSON_QUERY.holder({
		people,
		seat: tenure.seat,
		timeMs: state.record.minTimeMs,
	})
	input.selectedWikiPersonId = holder
	renderToString(createElement(Page))
	const mother = people.persons.mother[holder]
	expect(mother).toBeGreaterThanOrEqual(0)
	expect(people.persons.dynasty[mother]).toBeGreaterThanOrEqual(0)
})
