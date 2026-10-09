import { writeFileSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { PEOPLE } from "@/model/history/sim/people"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { NO_RELIGION_SELECTION } from "@/test/history-run/no-religion-selection"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

it("renders concurrent titles, separate regencies and historical unmoved affiliation", () => {
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const crowns = Array.from(engine.people.rulerOf.keys()).filter(
		(p) => !engine.desolate[p] && STATE.isSovereign({ state: engine, p }),
	)
	const district = Array.from(engine.people.rulerOf.keys()).find((seat) =>
		STATE_TITLES.isDistrictSeat({ state: engine, seat }),
	)
	if (district === undefined || crowns.length < 4)
		throw new Error("Missing seats")
	const born = engine.time / STATE.yearMs - 30
	const rng = RNG.createRng({ seed: 771 })
	const person = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people: engine.people,
		sex: 0,
		birth: born,
		survives: born,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin: STATE.originOf({ state: engine, realm: crowns[0] }),
		rng,
	})
	const resident = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people: engine.people,
		sex: 1,
		birth: born,
		survives: born,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin: STATE.originOf({ state: engine, realm: crowns[2] }),
		rng,
	})
	engine.people.persons.death[person] = born + 80
	engine.people.persons.death[resident] = born + 80
	for (const seat of [crowns[0], crowns[1], district])
		PEOPLE.setRuler({
			people: engine.people,
			person,
			seat,
			rank: engine.seatRank[seat],
			reason: "unknown",
		})
	FIELDS.prov.occupation.set({ state: engine, p: crowns[2], value: crowns[0] })
	STATE.setRelation({
		state: engine,
		a: crowns[2],
		b: crowns[1],
		rel: STATE.rel.PU_JUNIOR,
	})
	expect(HOUSEHOLD.realmOf({ people: engine.people, person: resident })).toBe(
		crowns[2],
	)
	const home = engine.people.persons.home[resident]
	const culture = engine.people.persons.culture[resident]
	PEOPLE.setRegent({
		people: engine.people,
		seat: crowns[3],
		person,
		ward: engine.people.rulerOf[crowns[3]],
	})
	JOURNAL.flush({
		state: engine,
		noteCursor: engine.events.length,
		census: false,
		initial: false,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state, world })
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	engine.journal.length = 0
	const start = state.record.minTimeMs
	const input = {
		religionSelection: NO_RELIGION_SELECTION,
		selectedWikiPersonId: person,
		history: {
			state,
			selectedTimeMs: start,
			minTimeMs: start,
			maxTimeMs: start,
			setSelectedTimeMs: vi.fn(),
		},
		sceneRef: { current: null },
		setSelectedWikiNationId: vi.fn(),
		setSelectedWikiOrganizationId: vi.fn(),
		setSelectedWikiWarId: vi.fn(),
		setSelectedWikiPersonId: vi.fn(),
	} as unknown as PersonWikiDataInput
	let titleCount = 3
	function Page() {
		const data = usePersonWikiData(input)
		if (!data) throw new Error("Missing page")
		if (input.selectedWikiPersonId === person) {
			const titles = data.titles
			expect(titles).toHaveLength(titleCount)
			expect(new Set(titles.map((chip) => chip.key)).size).toBe(titleCount)
			expect(titles[0].title).toContain("Primary title")
			expect(
				data.groups.find((group) => group.label === "Regencies")?.chips,
			).toHaveLength(1)
		}
		return createElement(PersonWikiPage, { person: data })
	}
	expect(renderToString(createElement(Page))).toContain(
		"Current household location",
	)
	engine.time += STATE.yearMs
	PEOPLE.vacate({ people: engine.people, seat: crowns[1], reason: "union" })
	FIELDS.prov.parent.set({ state: engine, p: crowns[2], value: crowns[3] })
	expect(HOUSEHOLD.realmOf({ people: engine.people, person: resident })).toBe(
		crowns[3],
	)
	expect(engine.people.persons.residence[resident]).toBe(crowns[2])
	expect(engine.people.persons.home[resident]).toBe(home)
	expect(engine.people.persons.culture[resident]).toBe(culture)
	JOURNAL.flush({
		state: engine,
		noteCursor: engine.events.length,
		census: false,
		initial: false,
	})
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	input.history.selectedTimeMs = state.record.maxTimeMs
	titleCount = 2
	const html = renderToString(createElement(Page))
	expect(html).toContain("Titles")
	if (process.env.HOUSEHOLD_PAGE_OUT)
		writeFileSync(process.env.HOUSEHOLD_PAGE_OUT, html)
	const people = state.record.people
	if (!people) throw new Error("Missing people")
	expect(
		PERSON_QUERY.realmAt({
			people,
			id: resident,
			timeMs: start,
			record: state.record,
		}),
	).toBe(translator.identityByRoot.get(crowns[2]))
	expect(
		PERSON_QUERY.realmAt({
			people,
			id: resident,
			timeMs: state.record.maxTimeMs,
			record: state.record,
		}),
	).toBe(translator.identityByRoot.get(crowns[3]))
	expect(
		PERSON_QUERY.residenceAt({
			people,
			id: resident,
			timeMs: state.record.maxTimeMs,
		}),
	).toBe(crowns[2])
	input.selectedWikiPersonId = resident
	expect(renderToString(createElement(Page))).toContain(
		"Territorial sovereign of residence",
	)
}, 60000)
