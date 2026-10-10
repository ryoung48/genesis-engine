import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { HistoryRecord } from "@/model/history/record/types"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"
import { NO_RELIGION_SELECTION } from "@/test/history-run/no-religion-selection"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

it("summarizes noble popularity from the holders of a realm's districts at the selected time, with its label and empty state", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1, 0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 1 })
	const live = fixture.people
	live.persons.death.fill(Infinity)
	for (const [person, seat] of [
		[1, 0],
		[0, 1],
		[2, 2],
		[3, 3],
	])
		PEOPLE.setRuler({ people: live, person, seat, rank: 1, reason: "unknown" })
	const people = PEOPLE_RECORD.create()
	const province = (ownerId: number, parentId: number, religionId: number) => ({
		base: { ownerId, parentId, religionId },
		events: [] as unknown[],
	})
	const moved = province(0, 0, 0)
	moved.events.push({
		kind: "parent",
		timeMs: 101 * STATE.yearMs,
		payload: { parentId: 2 },
	})
	const record = {
		people,
		heritageOfCulture: new Int32Array([7]),
		minTimeMs: 100 * STATE.yearMs,
		maxTimeMs: 110 * STATE.yearMs,
		origin: "procedural",
		pipeline: "simulation",
		events: {
			provinceEvents: new Map([
				[0, province(0, -1, 0)],
				[1, moved],
				[2, province(2, -1, 1)],
				[3, province(0, 0, 0)],
			]),
			nationEvents: [
				{ base: { capitalProvinceId: 0 } },
				undefined,
				{ base: { capitalProvinceId: 2 } },
			],
		},
	} as unknown as HistoryRecord
	const flush = (time: number) =>
		PEOPLE_RECORD.append({
			record: people,
			packet: PEOPLE_LOG.seal({
				people: live,
				sovereign: (seat) => seat === 0 || seat === 2,
			}),
			timeMs: time * STATE.yearMs,
			recordTime: (year) => year * STATE.yearMs,
		})
	flush(100)
	const popularity = (seat: number, years: number) =>
		PERSON_QUERY.popularity({
			people,
			record,
			seat,
			timeMs: years * STATE.yearMs,
		})
	const loyalty = (holder: number, ruler: number, years: number) =>
		OPINION.loyaltyOf({
			breakdown: PERSON_QUERY.opinion({
				people,
				record,
				a: holder,
				b: ruler,
				timeMs: years * STATE.yearMs,
			}),
		})
	const empty = { value: 0, count: 0, bands: [0, 0, 0, 0] }
	expect(popularity(0, 99)).toEqual(empty)
	expect(popularity(0, 100)).toMatchObject({
		count: 2,
		value: (loyalty(0, 1, 100) + loyalty(3, 1, 100)) / 2,
	})
	expect(popularity(2, 100)).toEqual(empty)
	expect(popularity(0, 101)).toMatchObject({
		count: 1,
		value: loyalty(3, 1, 101),
	})
	expect(popularity(2, 101)).toMatchObject({
		count: 1,
		value: loyalty(0, 2, 101),
	})
	const before = popularity(0, 101).value
	OPINION.remember({
		people: live,
		observer: 3,
		target: 1,
		reason: "grant",
		time: 102,
	})
	flush(102)
	expect(popularity(0, 101.9).value).toBe(before)
	expect(popularity(0, 102).value).toBe(before + 15)
	expect(popularity(0, 107).value).toBe(before + 7.5)
	PEOPLE.vacate({ people: live, seat: 3, reason: "unknown" })
	flush(104)
	expect(popularity(0, 104 - 1 / 365).count).toBe(1)
	expect(popularity(0, 104)).toEqual(empty)
})

it("shows active memories at the selected date and removes expired partners while retaining family", () => {
	const { engine, generated } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const time = engine.time / STATE.yearMs
	const table = engine.people.persons
	const rulers = [
		...new Set(
			Array.from(engine.people.rulerOf.keys())
				.filter(
					(p) => !engine.desolate[p] && STATE.isSovereign({ state: engine, p }),
				)
				.map((p) => engine.people.rulerOf[p])
				.filter((person) => person >= 0 && table.death[person] > time + 1),
		),
	]
	const observer = rulers[0]
	const target = rulers.find(
		(person) =>
			person !== observer &&
			table.dynasty[person] !== table.dynasty[observer] &&
			table.spouse[person] !== observer,
	)
	if (target === undefined) throw new Error("Missing unrelated rulers")
	const disposition = Array.from(engine.dispositionsCurrent)
	expect(
		OPINION.remember({
			people: engine.people,
			observer,
			target,
			reason: "attack",
			time: time + 0.5,
		}),
	).toBe(true)
	expect(Array.from(engine.dispositionsCurrent)).toEqual(disposition)
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
	const input = {
		religionSelection: NO_RELIGION_SELECTION,
		selectedWikiPersonId: observer,
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
	const nameOf = (person: number) =>
		PERSON_NAMES.person({ people: state.record.people, person })?.name
	state.record.people!.persons.father[observer] = target
	function Page() {
		const data = usePersonWikiData(input)
		if (!data) throw new Error("Missing person page")
		return createElement(PersonWikiPage, { person: data })
	}
	const at = (years: number) => {
		input.history.selectedTimeMs = state.record.minTimeMs + years * STATE.yearMs
		return renderToString(createElement(Page))
	}
	expect(nameOf(target)).toBeTruthy()
	expect(at(0)).not.toContain("Attacked")
	const fresh = at(0.5)
	expect(fresh).toContain("Attacked (")
	expect(fresh).toContain("): -25")
	expect(fresh).toContain("memories: -25")
	expect(at(5.5)).toContain("): -12.5")
	expect(at(10.5)).not.toContain("Attacked (")
	input.selectedWikiPersonId = target
	expect(at(0.5)).not.toContain("Attacked (")
	expect(
		state.record.people!.memoriesOf.get(observer)?.get(target),
	).toHaveLength(1)
}, 120_000)
