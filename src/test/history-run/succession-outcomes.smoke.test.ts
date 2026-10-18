import { expect, it } from "vitest"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import type {
	HeirOutcome,
	HeirPlan,
} from "@/model/history/sim/engine/state/rulers/heirs/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { RNG, type SharedRng } from "@/model/shared/random/rng"
import { REALMS_FIXTURE } from "@/test/history-run/fixtures/realms"

function sequence(values: number[]): SharedRng {
	return RNG.fromSource({
		random: () => values.shift() ?? 0.5,
		nonPositiveWeightBehavior: "undefined",
	})
}

function setup() {
	const { state, realms } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	return { state, realm: realms[0] }
}

const OUTCOMES: HeirOutcome[] = [
	{ chance: 0.75, house: "same", claim: 3, daughterLine: false, son: true },
	{ chance: 0.19, house: "other", claim: 3, daughterLine: true, son: false },
	{ chance: 0.035, house: "same", claim: 2, daughterLine: false, son: false },
	{ chance: 0.015, house: "same", claim: 1, daughterLine: false, son: false },
	{ chance: 0.01, house: "new", claim: 0, daughterLine: false, son: false },
]

function planOf({
	state,
	realm,
	outcome,
	juniors,
}: {
	state: HistoryState
	realm: number
	outcome: HeirOutcome
	juniors: number
}): HeirPlan {
	const owner = STATE_RULERS.read({ state, p: realm })
	const rng = HISTORY_RNG.createHistoryRng(7)
	const child = () =>
		STATE_RULERS.draw({
			state,
			p: realm,
			dynasty: owner.dynasty,
			age: "inherited",
			rng,
		})
	return {
		root: realm,
		owner,
		outcome,
		primary: outcome.son ? child() : null,
		juniors: outcome.son ? Array.from({ length: juniors }, child) : [],
		fulfilled: false,
	}
}

it("reads one heir outcome that fixes the house, claim and age table together", () => {
	const { state, realm } = setup()
	for (const outcome of OUTCOMES) {
		const plan = planOf({ state, realm, outcome, juniors: 2 })
		const choice = SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			plan,
			rng: sequence([0.99]),
		})
		expect(choice).toMatchObject({
			system: "single_heir",
			house: outcome.house,
			claim: outcome.claim,
			daughterLine: outcome.daughterLine,
			age: outcome.house === "new" ? "fresh" : "inherited",
			primary: plan.primary,
			juniors: [],
		})
	}
})

it("refuses a hereditary choice without a plan", () => {
	const { state, realm } = setup()
	expect(() =>
		SUCCESSION_SYSTEMS.choose({ state, realm, plan: null, rng: sequence([]) }),
	).toThrow()
})

it("gives junior heirs only to a partitioning realm whose heir is a son", () => {
	const { state, realm } = setup()
	const choose = (outcome: HeirOutcome) =>
		SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			plan: planOf({ state, realm, outcome, juniors: 2 }),
			rng: sequence([0.99]),
		})
	expect(choose(OUTCOMES[0]).juniors).toHaveLength(0)
	state.governmentType[realm] = GOVERNMENT.getGovIdx().tribal_monarchy
	expect(choose(OUTCOMES[0]).juniors).toHaveLength(2)
	expect(choose(OUTCOMES[1]).juniors).toHaveLength(0)
})

it("elects the late ruler's house or a new one at the elected age", () => {
	const { state, realm } = setup()
	state.governmentType[realm] = GOVERNMENT.getGovIdx().elective_monarchy
	expect(
		SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			plan: null,
			rng: sequence([0.1]),
		}),
	).toMatchObject({
		system: "election",
		house: "same",
		claim: 2,
		age: "elected",
		juniors: [],
		interregnum: false,
	})
	expect(
		SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			plan: null,
			rng: sequence([0.9]),
		}).house,
	).toBe("new")
})

it("appoints a new house, a notable only where a district can supply one", () => {
	const { state, realm } = setup()
	state.governmentType[realm] = GOVERNMENT.getGovIdx().theocracy
	const districts = SUCCESSION_SYSTEMS.districts({ state, realm })
	const choice = SUCCESSION_SYSTEMS.choose({
		state,
		realm,
		plan: null,
		rng: sequence([0.1]),
	})
	expect(choice).toMatchObject({
		system: "appointment",
		house: "new",
		age: "fresh",
	})
	expect(choice.claim).toBe(districts.length > 0 ? 1 : 0)
	expect(
		SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			plan: null,
			rng: sequence([0.9]),
		}).claim,
	).toBe(0)
})

it("raises a pretender only against a disputed inheritance or an election", () => {
	const { state, realm } = setup()
	const odds = (
		system: "single_heir" | "election" | "appointment",
		disputed: boolean,
	) => SUCCESSION_SYSTEMS.pretender({ state, realm, system, disputed })
	expect(odds("single_heir", false).chance).toBe(0)
	expect(odds("single_heir", true).chance).toBeGreaterThan(0)
	expect(odds("election", false).chance).toBeGreaterThan(0)
	expect(odds("appointment", true).chance).toBe(0)
	state.governmentType[realm] = GOVERNMENT.getGovIdx().oligarchic_republic
	expect(odds("election", true).chance).toBe(0)
})
