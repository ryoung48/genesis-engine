import { expect, it } from "vitest"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
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

it("rolls one heir outcome that fixes the house, claim and age table together", () => {
	const { state, realm } = setup()
	const total = SUCCESSION_SYSTEMS.heir.reduce(
		(sum, outcome) => sum + outcome.chance,
		0,
	)
	expect(total).toBeCloseTo(1, 12)
	let low = 0
	const rolls = SUCCESSION_SYSTEMS.heir.map((outcome) => {
		const roll = low + outcome.chance / 2
		low += outcome.chance
		return { outcome, roll }
	})
	for (const { outcome, roll } of rolls) {
		const choice = SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			rng: sequence([roll, 0.99]),
		})
		expect(choice).toMatchObject({
			system: "single_heir",
			house: outcome.house,
			claim: outcome.claim,
			daughterLine: outcome.daughterLine,
			age: outcome.house === "new" ? "fresh" : "inherited",
			juniors: 0,
		})
	}
})

it("gives junior heirs only to a partitioning realm whose heir is a son", () => {
	const { state, realm } = setup()
	const roll = (values: number[]) =>
		SUCCESSION_SYSTEMS.choose({ state, realm, rng: sequence(values) })
	expect(roll([0.1, 0.1, 0.1]).juniors).toBe(0)
	state.governmentType[realm] = GOVERNMENT.getGovIdx().tribal_monarchy
	expect(roll([0.1, 0.1, 0.1]).juniors).toBeGreaterThanOrEqual(1)
	expect(roll([0.1, 0.9, 0.1]).juniors).toBe(0)
	expect(roll([0.8, 0.1, 0.1]).juniors).toBe(0)
})

it("elects the late ruler's house or a new one at the elected age", () => {
	const { state, realm } = setup()
	state.governmentType[realm] = GOVERNMENT.getGovIdx().elective_monarchy
	expect(
		SUCCESSION_SYSTEMS.choose({ state, realm, rng: sequence([0.1]) }),
	).toMatchObject({
		system: "election",
		house: "same",
		claim: 2,
		age: "elected",
		juniors: 0,
		interregnum: false,
	})
	expect(
		SUCCESSION_SYSTEMS.choose({ state, realm, rng: sequence([0.9]) }).house,
	).toBe("new")
})

it("appoints a new house, a notable only where a district can supply one", () => {
	const { state, realm } = setup()
	state.governmentType[realm] = GOVERNMENT.getGovIdx().theocracy
	const districts = SUCCESSION_SYSTEMS.districts({ state, realm })
	const choice = SUCCESSION_SYSTEMS.choose({
		state,
		realm,
		rng: sequence([0.1]),
	})
	expect(choice).toMatchObject({
		system: "appointment",
		house: "new",
		age: "fresh",
	})
	expect(choice.claim).toBe(districts.length > 0 ? 1 : 0)
	expect(
		SUCCESSION_SYSTEMS.choose({ state, realm, rng: sequence([0.9]) }).claim,
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
