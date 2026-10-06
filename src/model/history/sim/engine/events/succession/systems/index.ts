import type {
	Candidate,
	CandidateParams,
	ChallengeParams,
	ChooseParams,
	ContestParams,
	ContestResult,
	ElectableParams,
	Elector,
	MarriageTieParams,
	PersonParams,
	RealmParams,
	SuccessionChoice,
	TallyParams,
	TallyResult,
} from "@/model/history/sim/engine/events/succession/systems/types"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { HEIRS } from "@/model/history/sim/people/heirs"
import type { HeirRelation } from "@/model/history/sim/people/heirs/types"
import type { GenderPreference } from "@/model/history/sim/people/types"

// Legitimacy of the new ruler by how they took the throne; feeds title
// founding.
const HEIR_CLAIM: Record<HeirRelation, number> = {
	child: 3,
	sibling: 2,
	relative: 1,
	none: 0,
}
const ELECTED_CLAIM = 2
const APPOINTED_CLAIM = 1
const PRETENDER_SHARE = 0.4
const MAX_FIEF_CANDIDATES = 3
const ADULT_AGE = 16

const NEW_HOUSE: SuccessionChoice = {
	heir: -1,
	claim: HEIR_CLAIM.none,
	pretender: -1,
	pretenderSeat: -1,
	supportingSeats: [],
}

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

function age({ state, person }: PersonParams): number {
	return now(state) - state.people.persons.birth[person]
}

// Alive, capable and not already sovereign somewhere; district holders may
// be raised.
function available({ state, person }: PersonParams): boolean {
	if (!PEOPLE.aliveAt({ people: state.people, person, time: now(state) }))
		return false
	if (AGEING.incapable({ people: state.people, person })) return false
	return !state.people.persons.heldSeats[person].some((seat) =>
		STATE.isSovereign({ state, p: seat }),
	)
}

// Single-heir realms also pass to a relative who already rules elsewhere,
// forming (or continuing) a personal union.
function inheritable({ state, realm, person }: ElectableParams): boolean {
	if (!PEOPLE.aliveAt({ people: state.people, person, time: now(state) }))
		return false
	const seats = state.people.persons.heldSeats[person]
	if (seats.includes(realm)) return false
	return seats
		.filter((seat) => STATE.isSovereign({ state, p: seat }))
		.every(
			(seat) =>
				STATE.unionSenior({ state, p: realm }) ===
					STATE.unionSenior({ state, p: seat }) ||
				STATE.canUnite({ state, a: realm, b: seat }),
		)
}

function adultAvailable({ state, person }: PersonParams): boolean {
	return available({ state, person }) && age({ state, person }) >= ADULT_AGE
}

// Elected and appointed rulers are adults of the culture's preferred sex.
function electable({ state, realm, person }: ElectableParams): boolean {
	if (!adultAvailable({ state, person })) return false
	const preference = preferenceOf({ state, realm })
	if (preference === "none") return true
	return state.people.persons.sex[person] === (preference === "male" ? 0 : 1)
}

function preferenceOf({ state, realm }: RealmParams): GenderPreference {
	return PEOPLE.preference(STATE.originOf({ state, realm }))
}

function districtsOf({ state, realm }: RealmParams): Elector[] {
	const people = state.people
	const electors: Elector[] = []
	for (const seat of [...new Set(STATE.getChildren({ state, p: realm }))].sort(
		(a, b) => a - b,
	)) {
		if (!STATE_TITLES.isDistrictSeat({ state, seat })) continue
		const person = people.rulerOf[seat]
		if (person < 0 || !people.persons.heldSeats[person].includes(seat)) continue
		if (!PEOPLE.aliveAt({ people, person, time: now(state) })) continue
		electors.push({
			seat,
			person,
			weight: STATE.getNationPopulation({ state, root: seat }),
		})
	}
	return electors
}

function localDistrict({ state, realm, person }: ElectableParams): number {
	return (
		districtsOf({ state, realm })
			.filter((elector) => elector.person === person)
			.sort((a, b) => b.weight - a.weight || a.seat - b.seat)[0]?.seat ?? -1
	)
}

function candidate({
	state,
	person,
	seat,
	totalWeight,
	weight,
}: CandidateParams): Candidate {
	const years = age({ state, person })
	return {
		person,
		seat,
		strength:
			(totalWeight > 0 ? weight / totalWeight : 0) +
			(years >= 25 && years <= 60 ? 0.2 : 0) +
			GOVERNOR.candidateStrength(
				GOVERNOR.personAttribute({ state, person, attribute: "diplomacy" }),
			),
	}
}

function tiedByMarriage({ state, a, b }: MarriageTieParams): boolean {
	const table = state.people.persons
	const houseA = table.dynasty[a]
	const houseB = table.dynasty[b]
	if (houseA < 0 || houseB < 0) return false
	const spouseA = table.spouse[a]
	const spouseB = table.spouse[b]
	return (
		(spouseA >= 0 && table.dynasty[spouseA] === houseB) ||
		(spouseB >= 0 && table.dynasty[spouseB] === houseA)
	)
}

// Each elector backs a candidate of their own house, then (outside
// republics) one tied to it by marriage, then the strongest.
function tally({
	state,
	electors,
	candidates,
	republic,
}: TallyParams): TallyResult {
	const table = state.people.persons
	const votes = candidates.map(() => 0)
	const choices: number[] = []
	let strongest = 0
	for (let i = 1; i < candidates.length; i++)
		if (candidates[i].strength > candidates[strongest].strength) strongest = i
	for (const elector of electors) {
		const house = table.dynasty[elector.person]
		let choice = candidates.findIndex(
			(c) => house >= 0 && table.dynasty[c.person] === house,
		)
		if (choice < 0 && !republic)
			choice = candidates.findIndex((c) =>
				tiedByMarriage({ state, a: elector.person, b: c.person }),
			)
		if (choice < 0) choice = strongest
		votes[choice] += elector.weight
		choices.push(choice)
	}
	return { votes, choices }
}

// The district rulers split between the heir and a contender; with enough backing
// the contender's own district, or their strongest backer's, rises for them.
function contest({
	state,
	realm,
	heir,
	rival,
	rng,
}: ContestParams): ContestResult {
	const electors = districtsOf({ state, realm })
	const { votes, choices } = tally({
		state,
		electors,
		candidates: [heir, rival],
		republic: false,
	})
	const total = votes[0] + votes[1]
	const share = total > 0 ? votes[1] / total : 0
	const backed = share >= PRETENDER_SHARE
	if (!backed || rng.random() >= share)
		return { backed, share, seat: -1, supportingSeats: [] }
	const supportingSeats = electors.flatMap((elector, i) =>
		choices[i] === 1 ? [elector.seat] : [],
	)
	if (rival.seat >= 0)
		return { backed, share, seat: rival.seat, supportingSeats }
	let backer = -1
	for (let i = 0; i < electors.length; i++)
		if (
			choices[i] === 1 &&
			(backer < 0 || electors[i].weight > electors[backer].weight)
		)
			backer = i
	return {
		backed,
		share,
		seat: backer < 0 ? -1 : electors[backer].seat,
		supportingSeats,
	}
}

// A succession is disputed when the heir rules another realm, is a child or
// is of the sex the culture passes over, and an adult of the preferred sex
// at home stands next in line.
function disputed({ state, realm, person }: ElectableParams): boolean {
	const preference = preferenceOf({ state, realm })
	const sex = state.people.persons.sex[person]
	return (
		!available({ state, person }) ||
		age({ state, person }) < ADULT_AGE ||
		(preference === "male" && sex === 1) ||
		(preference === "female" && sex === 0)
	)
}

// The adult holder of the realm's largest district, or -1.
function strongestDistrict({ state, realm }: RealmParams): number {
	const strongest = districtsOf({ state, realm })
		.filter((f) => adultAvailable({ state, person: f.person }))
		.sort((a, b) => b.weight - a.weight || a.seat - b.seat)[0]
	return strongest?.person ?? -1
}

// A claimant contests an incumbent before the realm's district holders.
function challenge({
	state,
	realm,
	incumbent,
	claimant,
	rng,
}: ChallengeParams): ContestResult {
	const districts = districtsOf({ state, realm })
	if (districts.length === 0)
		return { backed: false, share: 0, seat: -1, supportingSeats: [] }
	const claimantDistrict = districts.find((f) => f.person === claimant)
	const totalWeight = districts.reduce((sum, f) => sum + f.weight, 0)
	return contest({
		state,
		realm,
		rng,
		heir: candidate({
			state,
			person: incumbent,
			seat: -1,
			totalWeight,
			weight: 0,
		}),
		rival: candidate({
			state,
			person: claimant,
			seat: claimantDistrict
				? localDistrict({ state, realm, person: claimant })
				: -1,
			totalWeight,
			weight: claimantDistrict?.weight ?? 0,
		}),
	})
}

function singleHeir({
	state,
	realm,
	dying,
	rng,
}: ChooseParams): SuccessionChoice {
	const people = state.people
	const preference = preferenceOf({ state, realm })
	const { heir, relation } = HEIRS.of({
		people,
		dying,
		time: now(state),
		preference,
		eligible: (person) => inheritable({ state, realm, person }),
	})
	if (heir < 0)
		return { ...NEW_HOUSE, heir: strongestDistrict({ state, realm }) }
	const choice: SuccessionChoice = {
		heir,
		claim: HEIR_CLAIM[relation],
		pretender: -1,
		pretenderSeat: -1,
		supportingSeats: [],
	}
	if (!disputed({ state, realm, person: heir })) return choice
	const rival = HEIRS.of({
		people,
		dying,
		time: now(state),
		preference,
		eligible: (person) =>
			person !== heir && electable({ state, realm, person }),
	}).heir
	if (rival < 0) return choice
	const contest = challenge({
		state,
		realm,
		incumbent: heir,
		claimant: rival,
		rng,
	})
	return {
		...choice,
		pretender: rival,
		pretenderSeat: contest.seat,
		supportingSeats: contest.supportingSeats,
	}
}

function houseSenior({ state, realm, dying }: ChooseParams): number {
	if (dying < 0) return -1
	if (electable({ state, realm, person: dying })) return dying
	return HEIRS.of({
		people: state.people,
		dying,
		time: now(state),
		preference: preferenceOf({ state, realm }),
		eligible: (person) => electable({ state, realm, person }),
	}).heir
}

function election(params: ChooseParams): SuccessionChoice {
	const { state, realm } = params
	const republic =
		GOVERNMENT.govFamilyOfIndex(state.governmentType[realm]) === "republic"
	const late = houseSenior(params)
	const electors: Elector[] = republic
		? [...new Set(state.people.patricians.get(realm) ?? [])]
				.filter((person) => available({ state, person }))
				.map((person) => ({ person, seat: -1, weight: 1 }))
		: districtsOf({ state, realm })
	if (electors.length === 0)
		return {
			heir: late,
			claim: ELECTED_CLAIM,
			pretender: -1,
			pretenderSeat: -1,
			supportingSeats: [],
		}
	const totalWeight = electors.reduce((sum, e) => sum + e.weight, 0)
	const candidates: Candidate[] = []
	if (late >= 0)
		candidates.push(
			candidate({ state, person: late, seat: -1, totalWeight, weight: 0 }),
		)
	const ranked = [...electors].sort(
		(a, b) => b.weight - a.weight || a.seat - b.seat,
	)
	for (const elector of republic
		? ranked
		: ranked.slice(0, MAX_FIEF_CANDIDATES)) {
		const person = houseSenior({ ...params, dying: elector.person })
		if (person < 0 || candidates.some((c) => c.person === person)) continue
		const holdsDistrict =
			!republic && localDistrict({ state, realm, person }) >= 0
		candidates.push(
			candidate({
				state,
				person,
				seat: holdsDistrict ? localDistrict({ state, realm, person }) : -1,
				totalWeight,
				weight: elector.weight,
			}),
		)
	}
	if (candidates.length === 0) return NEW_HOUSE
	const voters =
		late >= 0
			? [
					...electors,
					{ person: late, seat: -1, weight: totalWeight / electors.length },
				]
			: electors
	const { votes, choices } = tally({
		state,
		electors: voters,
		candidates,
		republic,
	})
	let winner = 0
	for (let i = 1; i < candidates.length; i++)
		if (votes[i] > votes[winner]) winner = i
	const total = votes.reduce((sum, v) => sum + v, 0)
	let pretenderSeat = -1
	let pretenderIndex = -1
	if (!republic && total > 0)
		for (let i = 0; i < candidates.length; i++)
			if (
				i !== winner &&
				candidates[i].seat >= 0 &&
				votes[i] / total >= PRETENDER_SHARE
			) {
				pretenderSeat = candidates[i].seat
				pretenderIndex = i
			}
	return {
		heir: candidates[winner].person,
		claim: ELECTED_CLAIM,
		pretender: pretenderIndex < 0 ? -1 : candidates[pretenderIndex].person,
		pretenderSeat,
		supportingSeats: electors.flatMap((elector, i) =>
			choices[i] === pretenderIndex ? [elector.seat] : [],
		),
	}
}

// Half the time an adult from a great-vassal house of the realm, else a new
// house.
function appointment({ state, realm, rng }: ChooseParams): SuccessionChoice {
	if (rng.random() >= 0.5) return NEW_HOUSE
	const table = state.people.persons
	const pool: number[] = []
	for (const { person } of districtsOf({ state, realm }))
		for (const kin of [person, ...table.children[person]])
			if (electable({ state, realm, person: kin })) pool.push(kin)
	if (pool.length === 0) return NEW_HOUSE
	return {
		heir: rng.choice(pool),
		claim: APPOINTED_CLAIM,
		pretender: -1,
		pretenderSeat: -1,
		supportingSeats: [],
	}
}

function choose(params: ChooseParams): SuccessionChoice {
	const system = GOVERNMENT.successionOfIndex(
		params.state.governmentType[params.realm],
	)
	if (system === "appointment") return appointment(params)
	if (params.dying < 0) return NEW_HOUSE
	if (system === "election") return election(params)
	return singleHeir(params)
}

export const SUCCESSION_SYSTEMS = {
	choose,
	districts: districtsOf,
	inheritable,
	localDistrict,
	challenge,
	strongestDistrict,
	adultAvailable,
	available,
	preferenceOf,
	adultAge: ADULT_AGE,
}
