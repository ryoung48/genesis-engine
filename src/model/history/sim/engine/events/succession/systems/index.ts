import type {
	ChooseParams,
	PretenderOdds,
	PretenderParams,
	RealmParams,
	SuccessionChoice,
} from "@/model/history/sim/engine/events/succession/systems/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { GOVERNMENT } from "@/model/history/sim/nations/government"

const ELECTED_CLAIM = 2
// Elected rulers keep the late ruler's house in 1,546 of 2,724 elections.
const ELECTED_SAME_HOUSE_CHANCE = 0.568
const APPOINTED_CLAIM = 1
// A realm with a district appoints one of its notables in 22 of 75 cases.
const APPOINTED_NOTABLE_CHANCE = 0.293
// A heirless dynasty with districts to break away fell into an interregnum in
// 27 of 79 cases.
const INTERREGNUM_CHANCE = 0.34
// 435 pretender seats in 3,076 inherited successions with a district (0.14),
// assumed to fall on the disputed ones, which are 0.417 of inheritances.
const PRETENDER_CHANCE = { disputed: 0.34, election: 0.073 }
// 1,285 of 1,483 other districts joined a pretender (0.866) and 78 of 175
// (0.446) in an election, times the held share 472 / 697.
const SUPPORTER_CHANCE = { hereditary: 0.59, election: 0.3 }

function districts({ state, realm }: RealmParams): number[] {
	return [...new Set(STATE.getChildren({ state, p: realm }))]
		.filter((seat) => STATE_TITLES.isDistrictSeat({ state, seat }))
		.sort((a, b) => a - b)
}

function singleHeir({
	state,
	realm,
	plan,
	rng,
}: ChooseParams): SuccessionChoice {
	if (!plan) throw new Error(`Realm ${realm} has no heir plan for its ruler`)
	const { outcome } = plan
	return {
		system: "single_heir",
		house: outcome.house,
		claim: outcome.claim,
		age: outcome.house === "new" ? "fresh" : "inherited",
		primary: outcome.son ? plan.primary : null,
		juniors: GOVERNMENT.partitionsOfIndex(state.governmentType[realm])
			? plan.juniors
			: [],
		interregnum:
			outcome.house === "new" &&
			districts({ state, realm }).length > 0 &&
			rng.random() < INTERREGNUM_CHANCE,
		daughterLine: outcome.daughterLine,
	}
}

function election({ rng }: ChooseParams): SuccessionChoice {
	return {
		system: "election",
		house: rng.random() < ELECTED_SAME_HOUSE_CHANCE ? "same" : "new",
		claim: ELECTED_CLAIM,
		age: "elected",
		primary: null,
		juniors: [],
		interregnum: false,
		daughterLine: false,
	}
}

function appointment({ state, realm, rng }: ChooseParams): SuccessionChoice {
	const notable =
		districts({ state, realm }).length > 0 &&
		rng.random() < APPOINTED_NOTABLE_CHANCE
	return {
		system: "appointment",
		house: "new",
		claim: notable ? APPOINTED_CLAIM : 0,
		age: "fresh",
		primary: null,
		juniors: [],
		interregnum: false,
		daughterLine: false,
	}
}

function choose(params: ChooseParams): SuccessionChoice {
	const system = GOVERNMENT.successionOfIndex(
		params.state.governmentType[params.realm],
	)
	if (system === "appointment") return appointment(params)
	if (system === "election") return election(params)
	return singleHeir(params)
}

// A republic never raises a pretender, and an adult heir of the house faces
// none.
function pretender({
	state,
	realm,
	system,
	disputed,
}: PretenderParams): PretenderOdds {
	const none = { chance: 0, supporters: 0 }
	if (
		system === "appointment" ||
		GOVERNMENT.govFamilyOfIndex(state.governmentType[realm]) === "republic"
	)
		return none
	if (system === "election")
		return {
			chance: PRETENDER_CHANCE.election,
			supporters: SUPPORTER_CHANCE.election,
		}
	return disputed
		? {
				chance: PRETENDER_CHANCE.disputed,
				supporters: SUPPORTER_CHANCE.hereditary,
			}
		: none
}

export const SUCCESSION_SYSTEMS = {
	choose,
	districts,
	pretender,
}
