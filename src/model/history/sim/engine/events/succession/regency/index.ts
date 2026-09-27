import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	AppointParams,
	BeginParams,
	BindsToParams,
	EndParams,
	LeaderParams,
	RealmRegencyParams,
	RegentChoice,
	RegentDiedParams,
	ReviewParams,
	WardParams,
} from "@/model/history/sim/engine/events/succession/regency/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { HEALTH } from "@/model/history/sim/people/health"
import { HEIRS } from "@/model/history/sim/people/heirs"
import type { Regency } from "@/model/history/sim/people/types"

const COUNCIL: RegentChoice = { regent: -1, kind: "council" }
const WEAK_CROWN_LAXITY = 0.1

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

// The surviving parent, then the closest adult of the child's house in
// inheritance order, then the strongest district holder, then a council.
function choose({ state, realm, ward }: WardParams): RegentChoice {
	const people = state.people
	const table = people.persons
	for (const parent of [table.mother[ward], table.father[ward]])
		if (
			parent >= 0 &&
			SUCCESSION_SYSTEMS.adultAvailable({ state, person: parent })
		)
			return { regent: parent, kind: "parent" }
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

function active({ state, realm }: RealmRegencyParams): Regency | null {
	const regency = state.people.regencies.get(realm)
	return regency && regency.ward === state.people.rulerOf[realm]
		? regency
		: null
}

function ailing({ state, realm }: RealmRegencyParams): boolean {
	const ruler = state.people.rulerOf[realm]
	if (ruler < 0) return false
	const table = state.people.persons
	const band = HEALTH.band({
		birth: table.birth[ruler],
		death: table.death[ruler],
		time: now(state),
	})
	return band === "Poor" || band === "Grave"
}

// A realm under a regent or an ailing ruler has a weak crown: its districts
// rebel more easily and it starts no wars.
function weak({ state, realm }: RealmRegencyParams): boolean {
	return active({ state, realm }) !== null || ailing({ state, realm })
}

// A parent regent born into another ruling house holds the realm's alliance
// with that house's realm as a living marriage would.
function bindsTo({ state, realm, other }: BindsToParams): boolean {
	const regency = active({ state, realm })
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

// Schedules the regent's replacement at their death.
function scheduleRegentDeath({ state, realm, regent }: RegentDiedParams): void {
	state.heap.enqueue(
		// A millisecond past the death, so the regent reads as dead when the
		// order is re-run and cannot be chosen again.
		Math.ceil(state.people.persons.death[regent] * STATE.yearMs) + 1,
		EVENT_HEAP.evt.REGENT_DEATH,
		realm,
		regent,
	)
}

function appoint({ state, realm, ward, choice }: AppointParams): void {
	const people = state.people
	people.regencies.set(realm, { ward, ...choice })
	PEOPLE.setRegent({ people, seat: realm, person: choice.regent, ward })
	if (choice.regent >= 0)
		scheduleRegentDeath({ state, realm, regent: choice.regent })
}

function begin({ state, realm, choice }: BeginParams): void {
	const people = state.people
	const ward = people.rulerOf[realm]
	appoint({ state, realm, ward, choice })
	state.events.push({
		tag: "regency started",
		time: state.time,
		data: {
			nation: realm,
			leader: state.leaderRuntime.idx[realm],
			ward,
			regent: choice.regent,
			kind: choice.kind,
			age: Math.round(now(state) - people.persons.birth[ward]),
		},
	})
}

// A child on a sovereign throne is governed by a regent until sixteen.
function startMinority({ state, realm }: RealmRegencyParams): void {
	const ward = state.people.rulerOf[realm]
	if (ward < 0 || !STATE.isSovereign({ state, p: realm })) return
	const birth = state.people.persons.birth[ward]
	if (now(state) - birth >= SUCCESSION_SYSTEMS.adultAge) return
	begin({ state, realm, choice: choose({ state, realm, ward }) })
	const comesOfAge =
		birth * STATE.yearMs + STATE.deltaYear(SUCCESSION_SYSTEMS.adultAge)
	if (comesOfAge < state.leaderRuntime.end[realm])
		state.heap.enqueue(
			comesOfAge,
			EVENT_HEAP.evt.REGENCY,
			realm,
			state.leaderRuntime.idx[realm],
		)
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
			cause,
		},
	})
}

function comeOfAge({ state, realm, leader }: LeaderParams): void {
	if (state.leaderRuntime.idx[realm] !== leader) return
	end({ state, realm, cause: "age" })
}

function replace({ state, realm, ward }: WardParams): void {
	const choice = choose({ state, realm, ward })
	appoint({ state, realm, ward, choice })
	state.events.push({
		tag: "regent changed",
		time: state.time,
		data: { nation: realm, ward, regent: choice.regent, kind: choice.kind },
	})
}

// The next in the regent order takes over as soon as the regent dies.
function regentDied({ state, realm, regent }: RegentDiedParams): void {
	const regency = active({ state, realm })
	if (!regency || regency.regent !== regent) return
	if (!STATE.isSovereign({ state, p: realm })) return
	replace({ state, realm, ward: regency.ward })
}

// Ends regencies whose child no longer holds a sovereign throne, and replaces
// regents who took a throne of their own.
function review({ state }: ReviewParams): void {
	for (const [realm, regency] of [...state.people.regencies]) {
		if (!STATE.isSovereign({ state, p: realm }) || !active({ state, realm })) {
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
	active,
	weak,
	bindsTo,
	laxity: WEAK_CROWN_LAXITY,
	startMinority,
	end,
	comeOfAge,
	regentDied,
	scheduleRegentDeath,
	review,
}
