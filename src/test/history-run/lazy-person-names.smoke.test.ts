import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { HISTORY } from "@/model/history/record"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { NAMES } from "@/model/society/language/names"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import {
	personDisplay,
	recordPersonMention,
} from "@/ui/genesis/wiki-bridge/nation-wiki-mentions"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"

it("generates names only for requested display data and caches them without changing raw people", () => {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const startTimeMs = engine.time
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: startTimeMs + STATE.deltaYear(25),
		rng: HISTORY_RNG.createHistoryRng(seed + 99999),
		validate: false,
	})
	const reference = NAMES.createWorldNames(world)
	const create = NAMES.createWorldNames
	let rulerCalls = 0
	let dynastyCalls = 0
	NAMES.createWorldNames = (world) => {
		const names = create(world)
		return {
			...names,
			ruler: (params) => {
				rulerCalls++
				return names.ruler(params)
			},
			dynasty: (params) => {
				dynastyCalls++
				return names.dynasty(params)
			},
		}
	}
	try {
		const state = SIM_RECORD.buildProceduralState({ world, startTimeMs })
		const translator = SIM_RECORD.createTranslator({ state, world })
		SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
		const people = state.record.people
		if (!people) throw new Error("Generated history has no people")
		const frame = HISTORY.frameAt({ state, timeMs: state.record.maxTimeMs })
		const nation = Array.from(frame.nations.values()).find(
			(nation) => nation.ruler !== null,
		)
		if (!nation?.ruler) throw new Error("Generated history has no ruler")
		const event = state.record.events.nationEvents[nation.id].events.findLast(
			(event) => event.kind === "rulerChange",
		)
		if (!event) throw new Error("Ruler has no event")
		const id = event.payload.person as number
		const row = people.persons.get(id)
		if (!row) throw new Error("Ruler has no person")
		PERSON_QUERY.view({ people, id, timeMs: state.record.maxTimeMs })
		PERSON_QUERY.timeline({ people, id, timeMs: state.record.maxTimeMs })
		structuredClone(state.record)
		expect(rulerCalls).toBe(0)
		expect(dynastyCalls).toBe(0)
		expect(event.payload).not.toHaveProperty("name")
		expect(event.payload).not.toHaveProperty("dynasty")
		expect(event.payload).not.toHaveProperty("regentName")
		const house =
			row.dynasty < 0
				? null
				: reference.dynasty({
						dynastyIdx: row.dynasty,
						province: people.dynastyHome.get(row.dynasty) ?? row.home,
					})
		expect(nation.ruler.dynasty).toBe(house)
		expect(nation.ruler.dynasty).toBe(house)
		expect(dynastyCalls).toBe(row.dynasty < 0 ? 0 : 1)
		expect(rulerCalls).toBe(0)
		const expected = reference.ruler({
			province: row.home,
			nameSeed: row.nameSeed,
		})
		expect(nation.ruler.name).toBe(expected.name)
		expect(rulerCalls).toBe(1)
		const first = PERSON_NAMES.person({ people, person: id })
		expect(first).toMatchObject({
			name: expected.name,
			house,
			female: expected.female,
		})
		expect(nation.ruler.name).toBe(expected.name)
		expect(PERSON_NAMES.person({ people, person: id })).toEqual(first)
		expect(rulerCalls).toBe(1)
		row.deathTimeMs -= STATE.yearMs
		expect(PERSON_NAMES.person({ people, person: id })?.deathTimeMs).toBe(
			row.deathTimeMs,
		)
		row.deathTimeMs += STATE.yearMs
		for (const person of Array.from(people.persons.values()).reverse()) {
			const actual = PERSON_NAMES.person({ people, person: person.id })
			const expected = reference.ruler({
				province: person.home,
				nameSeed: person.nameSeed,
			})
			const house =
				person.dynasty < 0
					? null
					: reference.dynasty({
							dynastyIdx: person.dynasty,
							province: people.dynastyHome.get(person.dynasty) ?? person.home,
						})
			expect(actual).toMatchObject({
				name: expected.name,
				female: expected.female,
				house,
			})
			expect(person).not.toHaveProperty("name")
			expect(person).not.toHaveProperty("house")
		}
		expect(rulerCalls).toBe(people.persons.size)
		const display = PERSON_NAMES.payload({ people, payload: event.payload })
		expect(display).toMatchObject({
			name: expected.name,
			dynasty: house,
			female: expected.female,
		})
		const comment = {
			nation: "Test kingdom",
			cause: "restoration",
			person: id,
			throne: true,
		}
		expect(PERSON_NAMES.comment({ people, comment })).toBe(
			`Revolted against Test kingdom (restoration, for ${expected.name}) to seize the throne`,
		)
		expect(
			PERSON_NAMES.comment({
				people,
				comment: { ...comment, person: -1, throne: false },
			}),
		).toBe("Revolted against Test kingdom (restoration)")
		expect(rulerCalls).toBe(people.persons.size)
		expect(PERSON_NAMES.person({ people, person: -1 })).toBeNull()
		expect(recordPersonMention({ people, person: id })?.name).toBe(
			expected.name,
		)
		expect(personDisplay({ people, payload: event.payload }).description).toBe(
			house ? `${expected.name} ${house}` : expected.name,
		)
		const input = {
			selectedWikiPersonId: id,
			history: {
				state,
				selectedTimeMs: state.record.maxTimeMs,
				minTimeMs: state.record.minTimeMs,
				maxTimeMs: state.record.maxTimeMs,
				setSelectedTimeMs: vi.fn(),
			},
			planetName: "Test world",
			sceneRef: { current: null },
			setSelectedWikiNationId: vi.fn(),
			setSelectedWikiOrganizationId: vi.fn(),
			setSelectedWikiWarId: vi.fn(),
			setSelectedWikiPersonId: vi.fn(),
		} as unknown as PersonWikiDataInput
		function PersonPage() {
			const data = usePersonWikiData(input)
			expect(data?.name).toBe(expected.name)
			expect(data?.stats.find((stat) => stat.label === "House")?.value).toBe(
				house ?? "None",
			)
			expect(data?.timelineEvents.length).toBeGreaterThan(0)
			return createElement("span", null, data?.name)
		}
		expect(renderToString(createElement(PersonPage))).toContain(expected.name)
		expect(rulerCalls).toBe(people.persons.size)
	} finally {
		NAMES.createWorldNames = create
	}
}, 600000)

it("keeps recorded Earth labels and plain comments intact", () => {
	const payload = {
		name: "Recorded ruler",
		dynasty: "Recorded house",
		female: true,
	}
	expect(PERSON_NAMES.payload({ people: null, payload })).toBe(payload)
	expect(PERSON_NAMES.ruler({ people: null, payload })).toEqual({
		name: payload.name,
		dynasty: payload.dynasty,
	})
	expect(
		PERSON_NAMES.comment({ people: null, comment: "Recorded comment" }),
	).toBe("Recorded comment")
	expect(PERSON_NAMES.comment({ people: null, comment: null })).toBeNull()
	expect(PERSON_NAMES.person({ people: null, person: 0 })).toBeNull()
})
