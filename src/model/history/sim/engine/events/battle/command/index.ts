import type {
	CommandParams,
	FatalityParams,
	PersonalLeader,
} from "@/model/history/sim/engine/events/battle/command/types"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { HASH } from "@/model/shared/random/hash"

const ADULT_AGE = 16
// Health must be above the Poor band to take the field.
const FIT_HEALTH = 3
const INFIRM = AGEING.conditions.indexOf("infirm")
// CK3 commander phase events: a kill is 5 of the 1040 total weight, scaled
// down by prowess to a floor, doubled for the Brave, halved for the Craven,
// and reduced for the side that outnumbers its enemy.
const FATAL_WEIGHT = 5 / 1040
const PROWESS_SCALE = 30
const PROWESS_FLOOR = 0.1
const OUTNUMBER_FACTOR = 1.4
const CHANNEL = 1040

// The governor's martial counts in every battle, whoever leads.
function multiplier(params: CommandParams): number {
	return GOVERNOR.factor({
		attribute: "martial",
		value: GOVERNOR.attribute({ ...params, attribute: "martial" }),
	})
}

// The realm's ruler takes the field in person for one battle a calendar
// year, if fit: an adult ruling for themselves, in better than Poor health,
// and not Infirm, Blind or Incapable. Leading is noted at once, so the same
// ruler leads no other battle that year, and Fragile Bones costs their army
// a share of its strength. Null when nobody leads in person.
function lead({ state, realm }: CommandParams): PersonalLeader | null {
	const people = state.people
	const table = people.persons
	const person = people.rulerOf[realm]
	if (person < 0 || GOVERNOR.regency({ state, realm })) return null
	const time = state.time / STATE.yearMs
	const year = Math.floor(time)
	if (table.death[person] <= time || table.ledYear[person] === year) return null
	if (time - table.birth[person] < ADULT_AGE) return null
	if (HEALTH.effective({ people, person, time }) <= FIT_HEALTH) return null
	const effects = AGEING.effectsOf({ people, person })
	if (effects) {
		if (
			AGEING.levels({ people, person })[INFIRM] >= 0 ||
			AGEING.blind({ people, person }) ||
			AGEING.incapable({ people, person })
		)
			return null
	}
	table.ledYear[person] = year
	HEALTH.led({ people, person })
	return {
		person,
		penalty: Math.max(0.5, Math.min(1, 1 + 0.01 * (effects?.advantage ?? 0))),
	}
}

// One roll per led battle, keyed to the leader and the battle's time.
function fatal({ state, leader, own, enemy }: FatalityParams): boolean {
	const person = leader.person
	const prowess = GOVERNOR.personAttribute({
		state,
		person,
		attribute: "prowess",
	})
	const temper = GOVERNOR.personHas({ state, person, trait: "brave" })
		? 2
		: GOVERNOR.personHas({ state, person, trait: "craven" })
			? 0.5
			: 1
	const outnumbering =
		own > enemy ? Math.min(1, (OUTNUMBER_FACTOR * enemy) / own) : 1
	return (
		HASH.unit({
			seed: state.people.persons.nameSeed[person],
			channel: CHANNEL,
			salt: Math.floor(state.time),
		}) <
		FATAL_WEIGHT *
			Math.max(PROWESS_FLOOR, (PROWESS_SCALE - prowess) / PROWESS_SCALE) *
			temper *
			outnumbering
	)
}

export const COMMAND = { channel: CHANNEL, multiplier, lead, fatal }
