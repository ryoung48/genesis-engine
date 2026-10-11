import type {
	ChooseParams,
	HeirOutcome,
	PretenderOdds,
	PretenderParams,
	RealmParams,
	SuccessionChoice,
} from "@/model/history/sim/engine/events/succession/systems/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { GOVERNMENT } from "@/model/history/sim/nations/government"

// Who inherits a single-heir throne, which fixes the house and the legitimacy
// of the new ruler (it feeds title founding). The chances assume a sovereign's
// sons and daughters are independent Poisson counts with mean ln 4, so that a
// quarter of reigns leave no surviving son, the failure fraction McFarlane
// finds for peerage families per generation; the collateral lines repeat that
// proxy. Rounded to sum to 1. They are an assumption, not a measurement.
const HEIR: readonly HeirOutcome[] = [
	{ chance: 0.75, house: "same", claim: 3, daughterLine: false, son: true },
	{ chance: 0.19, house: "other", claim: 3, daughterLine: true, son: false },
	{ chance: 0.035, house: "same", claim: 2, daughterLine: false, son: false },
	{ chance: 0.015, house: "same", claim: 1, daughterLine: false, son: false },
	{ chance: 0.01, house: "new", claim: 0, daughterLine: false, son: false },
]
// A second surviving son given a first, from the same Poisson counts.
const JUNIOR_HEIR_CHANCE = 0.54
// Poisson(ln 4) probabilities of 2, 3, 4, 5 and 6+ sons, each over P(2+ sons)
// and scaled to 1,000.
const JUNIOR_COUNT: readonly { v: number; w: number }[] = [
	{ v: 1, w: 594 },
	{ v: 2, w: 275 },
	{ v: 3, w: 96 },
	{ v: 4, w: 27 },
	{ v: 5, w: 8 },
]
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

function heirOutcome({ rng }: Pick<ChooseParams, "rng">): HeirOutcome {
	let roll = rng.random()
	for (const outcome of HEIR) {
		roll -= outcome.chance
		if (roll < 0) return outcome
	}
	return HEIR[HEIR.length - 1]
}

function singleHeir({ state, realm, rng }: ChooseParams): SuccessionChoice {
	const outcome = heirOutcome({ rng })
	const juniors =
		outcome.son &&
		GOVERNMENT.partitionsOfIndex(state.governmentType[realm]) &&
		rng.random() < JUNIOR_HEIR_CHANCE
			? (rng.weightedChoice(JUNIOR_COUNT) ?? 1)
			: 0
	return {
		system: "single_heir",
		house: outcome.house,
		claim: outcome.claim,
		age: outcome.house === "new" ? "fresh" : "inherited",
		juniors,
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
		juniors: 0,
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
		juniors: 0,
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
	heir: HEIR,
}
