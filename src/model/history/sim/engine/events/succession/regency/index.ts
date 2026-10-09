import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { CORONATION } from "@/model/history/sim/engine/events/succession/coronation"
import type {
	AppointParams,
	BeginParams,
	BindsToParams,
	ChooseParams,
	ComeOfAgeParams,
	EndParams,
	RealmRegencyParams,
	RegentChoice,
	RegentDiedParams,
	ReviewParams,
	WardParams,
} from "@/model/history/sim/engine/events/succession/regency/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { HEIRS } from "@/model/history/sim/people/heirs"

const COUNCIL: RegentChoice = { regent: -1, kind: "council" }
const WEAK_CROWN_LAXITY = 0.1
// Below the Poor band's upper bound of 3, so the weak-crown period stays near
// the two years the old lifespan-derived band gave.
const AILING_HEALTH = 2.5

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

// A child's surviving parent or an incapable ruler's spouse, then the closest
// adult of the ward's house in inheritance order, then the strongest district
// holder, then a council.
function choose({ state, realm, ward, cause }: ChooseParams): RegentChoice {
	const people = state.people
	const table = people.persons
	if (cause === "minority") {
		for (const parent of [table.mother[ward], table.father[ward]])
			if (
				parent >= 0 &&
				SUCCESSION_SYSTEMS.adultAvailable({ state, person: parent })
			)
				return { regent: parent, kind: "parent" }
	} else {
		const spouse = table.spouse[ward]
		if (
			spouse >= 0 &&
			SUCCESSION_SYSTEMS.adultAvailable({ state, person: spouse })
		)
			return { regent: spouse, kind: "spouse" }
	}
	const house = table.dynasty[ward]
	if (house >= 0) {
		const relative = HEIRS.of({
			people,
			dying: ward,
			time: now(state),
			preference: SUCCESSION_SYSTEMS.preferenceOf({ state, realm }),
			eligible: (person) =>
				table.dynasty[person] === house &&
				SUCCESSION_SYSTEMS.adultAvailable({ state, person }),
		}).heir
		if (relative >= 0) return { regent: relative, kind: "relative" }
	}
	const protector = SUCCESSION_SYSTEMS.strongestDistrict({ state, realm })
	if (protector >= 0 && protector !== ward)
		return { regent: protector, kind: "protector" }
	return COUNCIL
}

function ailing({ state, realm }: RealmRegencyParams): boolean {
	const ruler = state.people.rulerOf[realm]
	if (ruler < 0) return false
	return (
		HEALTH.effective({
			people: state.people,
			person: ruler,
			time: now(state),
		}) < AILING_HEALTH
	)
}

// A realm under a regent or an ailing ruler has a weak crown: its districts
// rebel more easily and it starts no wars.
function weak({ state, realm }: RealmRegencyParams): boolean {
	return GOVERNOR.regency({ state, realm }) !== null || ailing({ state, realm })
}

// A parent regent born into another ruling house holds the realm's alliance
// with that house's realm as a living marriage would.
function bindsTo({ state, realm, other }: BindsToParams): boolean {
	const regency = GOVERNOR.regency({ state, realm })
	if (!regency || regency.kind !== "parent") return false
	const table = state.people.persons
	const house = table.dynasty[regency.regent]
	const ruler = state.people.rulerOf[other]
	return (
		house >= 0 &&
		house !== table.dynasty[regency.ward] &&
		ruler >= 0 &&
		table.dynasty[ruler] === house
	)
}

function appoint({ state, realm, ward, cause, choice }: AppointParams): void {
	const people = state.people
	people.regencies.set(realm, { ward, cause, ...choice })
	PEOPLE.setRegent({ people, seat: realm, person: choice.regent, ward })
}

function begin({ state, realm, cause }: BeginParams): void {
	const people = state.people
	const ward = people.rulerOf[realm]
	const choice = choose({ state, realm, ward, cause })
	appoint({ state, realm, ward, cause, choice })
	state.events.push({
		tag: "regency started",
		time: state.time,
		data: {
			nation: realm,
			leader: state.leaderRuntime.idx[realm],
			ward,
			regent: choice.regent,
			kind: choice.kind,
			regencyCause: cause,
			age: Math.round(now(state) - people.persons.birth[ward]),
		},
	})
}

// A child on a sovereign throne is governed by a regent until sixteen. The
// end is queued for that birthday; a ward who has died or been deposed by
// then leaves it stale.
function startMinority({ state, realm }: RealmRegencyParams): void {
	const ward = state.people.rulerOf[realm]
	if (ward < 0 || !STATE.isSovereign({ state, p: realm })) return
	const birth = state.people.persons.birth[ward]
	if (now(state) - birth >= SUCCESSION_SYSTEMS.adultAge) return
	begin({ state, realm, cause: "minority" })
	state.heap.enqueue(
		birth * STATE.yearMs + STATE.deltaYear(SUCCESSION_SYSTEMS.adultAge),
		EVENT_HEAP.evt.REGENCY,
		realm,
		state.leaderRuntime.idx[realm],
	)
}

// An incapable sovereign is governed for until they die or are usurped.
function startIncapacity({ state, realm }: RealmRegencyParams): void {
	const ward = state.people.rulerOf[realm]
	if (ward < 0 || !STATE.isSovereign({ state, p: realm })) return
	if (!AGEING.incapable({ people: state.people, person: ward })) return
	if (GOVERNOR.regency({ state, realm })) return
	begin({ state, realm, cause: "incapacity" })
}

// The regency a newly seated ruler needs, if any.
function start(params: RealmRegencyParams): void {
	startMinority(params)
	startIncapacity(params)
}

function end({ state, realm, cause }: EndParams): void {
	const people = state.people
	const regency = people.regencies.get(realm)
	if (!regency) return
	people.regencies.delete(realm)
	if (regency.regent >= 0)
		PEOPLE.setRegent({ people, seat: realm, person: -1, ward: regency.ward })
	state.events.push({
		tag: "regency ended",
		time: state.time,
		data: {
			nation: realm,
			ward: regency.ward,
			regent: regency.regent,
			kind: regency.kind,
			regencyCause: regency.cause,
			cause,
		},
	})
}

// A ward who is incapable at sixteen passes straight into an incapacity
// regency; one who acceded to the throne is otherwise crowned.
function comeOfAge({ state, realm, leader, rng }: ComeOfAgeParams): void {
	if (state.leaderRuntime.idx[realm] !== leader) return
	if (state.people.regencies.get(realm)?.cause !== "minority") return
	end({ state, realm, cause: "age" })
	startIncapacity({ state, realm })
	CORONATION.holdDeferred({ state, realm, leader, rng })
}

function replace({ state, realm, ward }: WardParams): void {
	const cause = state.people.regencies.get(realm)?.cause ?? "minority"
	const choice = choose({ state, realm, ward, cause })
	appoint({ state, realm, ward, cause, choice })
	state.events.push({
		tag: "regent changed",
		time: state.time,
		data: {
			nation: realm,
			ward,
			regent: choice.regent,
			kind: choice.kind,
			regencyCause: cause,
		},
	})
}

// The next in the regent order takes over each regency the dead person held.
function regentDied({ state, regent }: RegentDiedParams): void {
	let governs = false
	for (const held of state.people.regencies.values())
		if (held.regent === regent) governs = true
	if (!governs) return
	for (const [realm, held] of [...state.people.regencies]) {
		if (held.regent !== regent) continue
		const regency = GOVERNOR.regency({ state, realm })
		if (!regency || regency.regent !== regent) continue
		if (!STATE.isSovereign({ state, p: realm })) continue
		replace({ state, realm, ward: regency.ward })
	}
}

// Ends regencies whose ward no longer holds a sovereign throne, and replaces
// regents who took a throne of their own or can no longer govern.
function review({ state }: ReviewParams): void {
	for (const [realm, regency] of [...state.people.regencies]) {
		if (
			!STATE.isSovereign({ state, p: realm }) ||
			!GOVERNOR.regency({ state, realm })
		) {
			end({ state, realm, cause: "lost" })
			continue
		}
		if (
			regency.regent >= 0 &&
			!SUCCESSION_SYSTEMS.adultAvailable({ state, person: regency.regent })
		)
			replace({ state, realm, ward: regency.ward })
	}
}

export const REGENCY = {
	active: (params: RealmRegencyParams) => GOVERNOR.regency(params),
	weak,
	bindsTo,
	laxity: WEAK_CROWN_LAXITY,
	start,
	startIncapacity,
	end,
	comeOfAge,
	regentDied,
	review,
}
