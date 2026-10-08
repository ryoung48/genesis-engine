import { vi } from "vitest"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EventHeap } from "@/model/history/sim/engine/event-heap"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type {
	SiegeFixture,
	SiegeMockParams,
	SiegeResultParams,
} from "@/test/history-run/fixtures/siege/types"

// Initial eligible target ratios from the saved 204k-world battle-types report.
const CALIBRATION_RATIOS = [
	1.2, 2, 4, 8, 20, 8.433626876656279, 118.8284912341113, 320.4382529310275,
]

function create(): SiegeFixture {
	const war: War = {
		idx: 0,
		attacker: 0,
		defender: 1,
		startTime: 0,
		goal: "conquest",
		backers: [],
		refusedCalls: new Set(),
		originalCrownRuler: -1,
		claimant: -1,
		deployed: { 0: { levy: 200, regular: 0 }, 1: { levy: 200, regular: 0 } },
		participants: { 0: "attacker", 1: "defender" },
		candidates: { attacker: [], defender: [] },
		callable: { attacker: [], defender: [] },
		candidatesHierarchyVersion: 0,
		allocation: { 0: 1, 1: 1 },
		occupied: [],
		battleScore: 0,
		dealConsidered: false,
		allies: new Set(),
		siege: null,
	}
	const state = {
		time: 0,
		militaryReady: false,
		wars: [war],
		heap: new EventHeap(),
		events: [],
		levyCurrent: new Float64Array([200, 200]),
		regularCurrent: new Float64Array(2),
		popUrbanCurrent: new Float32Array([5000, 5000]),
		popRuralCurrent: new Float32Array([1000000, 1000000]),
		provinceTopography: new Uint8Array(2),
		provinceVegetation: new Uint8Array([3, 3]),
		riverByProvince: new Uint8Array(2),
		occupationCurrent: new Int32Array([-1, -1]),
		militaryIntervals: new Map(),
		militaryTotals: { casualties: { levy: 0, regular: 0 } },
		militaryDirty: new Set(),
		militaryAllocationDirty: new Set(),
		militaryStrengthDirty: new Set(),
	} as unknown as HistoryState
	return { state, war, caps: [100000, 100000] }
}

function mock({ caps }: SiegeMockParams): void {
	vi.spyOn(STATE, "isSovereign").mockReturnValue(true)
	vi.spyOn(STATE, "getSovereign").mockImplementation(({ p }) => p)
	vi.spyOn(STATE, "getNationProvinces").mockImplementation(({ root }) => [root])
	vi.spyOn(ECONOMY, "realmKnowledge").mockImplementation(({ p }) => caps()[p])
	vi.spyOn(KNOWLEDGE, "maxFieldArmy").mockImplementation(
		({ knowledge }) => knowledge,
	)
	vi.spyOn(RECRUITMENT, "advance").mockReturnValue(undefined)
	vi.spyOn(RECRUITMENT, "realmTargets").mockReturnValue(
		RECRUITMENT.targets({
			population: 100000,
			tribal: false,
			knowledge: 1,
			surplus: 100,
			outputPerHead: 450,
		}),
	)
	vi.spyOn(FIELDS.prov.population.rural, "set").mockImplementation(
		({ state, p, value }) => {
			state.popRuralCurrent[p] = value
		},
	)
	vi.spyOn(FIELDS.prov.population.urban, "set").mockImplementation(
		({ state, p, value }) => {
			state.popUrbanCurrent[p] = value
		},
	)
	vi.spyOn(CONQUEST, "apply").mockReturnValue(undefined)
	vi.spyOn(CONQUEST, "settle").mockReturnValue(false)
}

function result({ state }: SiegeResultParams) {
	return state.events.findLast((note) => note.tag === "siege ended")?.data
}

export const SIEGE_FIXTURE = {
	create,
	mock,
	result,
	ratios: CALIBRATION_RATIOS,
}
