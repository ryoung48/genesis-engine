import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import type { AttributeModifier } from "@/model/history/sim/people/attributes/types"
import { CHARACTER } from "@/model/history/sim/people/character"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import type { ConditionChange } from "@/model/history/sim/people/health/ageing/types"
import type {
	AdvanceParams,
	HealthAtParams,
	HealthBand,
	HealthPersonParams,
	HealthYear,
	HealthYearParams,
	LogChangesParams,
	PulseParams,
	ReplayParams,
} from "@/model/history/sim/people/health/types"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { TRAITS } from "@/model/history/sim/people/traits"
import { HASH } from "@/model/shared/random/hash"

// CK3 NChildbirth: a newborn's health.
const NEWBORN_BASE = 4.5
const NEWBORN_SPAN = 0.5
const NEWBORN_FEMALE_BONUS = 0.5
// CK3 NOldAge: from this age a yearly chance, rising each year, of a
// permanent loss.
const DECLINE_AGE = 25
const DECLINE_CHANCE = 0.075
const DECLINE_CHANCE_PER_YEAR = 0.022
const DECLINE_LOSS = 0.125
// CK3 NCharacter.HEALTH_STATE_LEVELS_VALUES: a band ends at each value.
const THRESHOLDS = [0, 1, 3, 5, 7]
const BANDS: readonly HealthBand[] = [
	"Dying",
	"Near death",
	"Poor",
	"Fine",
	"Good",
	"Excellent",
]
const BAND_MASK = 7
// The person led an army since their last yearly pulse.
const LED_FLAG = 32
const CHANNEL = { birth: 1000, ageing: 1001 }
const NO_ATTRIBUTE_CONDITIONS: readonly AttributeModifier[] = []

function bandCode(health: number): number {
	let index = 0
	while (index < THRESHOLDS.length && health > THRESHOLDS[index]) index++
	return index
}

function band(health: number): HealthBand {
	return BANDS[bandCode(health)]
}

function initialize({ people, person }: HealthPersonParams): void {
	const table = people.persons
	table.baseHealth[person] =
		NEWBORN_BASE +
		NEWBORN_SPAN *
			HASH.unit({
				seed: table.nameSeed[person],
				channel: CHANNEL.birth,
				salt: 0,
			}) +
		(table.sex[person] === 1 ? NEWBORN_FEMALE_BONUS : 0)
	table.healthAgeYear[person] = 0
}

// Base health with the trait and condition modifiers active at that time;
// never below 0.
function effective({ people, person, time }: HealthAtParams): number {
	const table = people.persons
	return Math.max(
		0,
		table.baseHealth[person] +
			TRAITS.health({
				character: CHARACTER.of({ people, person }),
				age: time - table.birth[person],
			}) +
			(AGEING.effectsOf({ people, person })?.health ?? 0),
	)
}

function attributeConditions(
	params: HealthPersonParams,
): readonly AttributeModifier[] {
	const total = AGEING.effectsOf(params)
	return total ? [total.attributes] : NO_ATTRIBUTE_CONDITIONS
}

function fertility(params: HealthPersonParams): number {
	return AGEING.effectsOf(params)?.fertility ?? 1
}

function recorded({ people, person }: HealthPersonParams): HealthBand {
	return BANDS[people.persons.healthFlags[person] & BAND_MASK]
}

// One completed age-year: the ageing loss, then the conditions' progression
// and onset. Fragile Bones adds its lost life expectancy to the age that
// drives the loss.
function pulse({ people, person, age }: PulseParams): ConditionChange[] {
	const table = people.persons
	const before = AGEING.effectsOf({ people, person })
	const physiological = age + (before?.ageingShift ?? 0)
	if (
		physiological >= DECLINE_AGE &&
		HASH.unit({
			seed: table.nameSeed[person],
			channel: CHANNEL.ageing,
			salt: age,
		}) <
			Math.min(
				1,
				DECLINE_CHANCE +
					DECLINE_CHANCE_PER_YEAR * (physiological - DECLINE_AGE),
			)
	)
		table.baseHealth[person] -= DECLINE_LOSS
	const led = (table.healthFlags[person] & LED_FLAG) !== 0
	table.healthFlags[person] &= ~LED_FLAG
	// Nothing can progress or begin for the young and unafflicted.
	if (age < AGEING.firstOnsetAge && !before) return AGEING.noChanges
	return AGEING.step({
		people,
		person,
		age,
		health: effective({
			people,
			person,
			time: table.birth[person] + age,
		}),
		prowess:
			table.infirmXp[person] < 0
				? 0
				: ATTRIBUTES.effective({
						conditions: before ? [before.attributes] : NO_ATTRIBUTE_CONDITIONS,
						character: CHARACTER.of({ people, person }),
						age,
						attribute: "prowess",
					}),
		led,
	})
}

function logChanges({ people, person, time, changes }: LogChangesParams): void {
	for (const change of changes)
		PEOPLE_LOG.append({
			log: people.log,
			row: {
				kind: "condition",
				person,
				time,
				condition: AGEING.conditions[change.condition],
				before: change.before,
				after: change.after,
			},
		})
}

// Processes each newly completed age once, then projects death over what the
// year's interval still leaves uncovered. Condition changes are logged in
// condition order, then the resulting band. True when a death date was
// chosen.
function advance({ people, person, year, record }: AdvanceParams): boolean {
	const table = people.persons
	const birth = table.birth[person]
	const completed = Math.floor(year - birth)
	for (let age = table.healthAgeYear[person] + 1; age <= completed; age++) {
		const changes = pulse({ people, person, age })
		const knownAlive = !record && birth + age <= table.healthIntervalEnd[person]
		if (knownAlive) AGEING.spareHeart({ people, person })
		if (record && changes.length > 0)
			logChanges({ people, person, time: year, changes })
		if (AGEING.heartFailed({ people, person })) break
	}
	if (completed > table.healthAgeYear[person])
		table.healthAgeYear[person] = completed
	const from = table.healthIntervalEnd[person]
	const to = year + 1
	const health = effective({ people, person, time: Math.max(from, year) })
	const code = bandCode(health)
	if (code !== (table.healthFlags[person] & BAND_MASK)) {
		table.healthFlags[person] = (table.healthFlags[person] & ~BAND_MASK) | code
		if (record)
			PEOPLE_LOG.append({
				log: people.log,
				row: { kind: "health_band", person, time: year, band: BANDS[code] },
			})
	}
	if (AGEING.heartFailed({ people, person })) {
		table.death[person] = Math.max(year, from)
		return true
	}
	if (from >= to) return false
	table.healthIntervalEnd[person] = to
	const death = LIFESPAN.project({
		seed: table.nameSeed[person],
		birth,
		health,
		from,
		to,
		year,
	})
	if (death >= table.death[person]) return false
	table.death[person] = death
	return true
}

// A person created with a past: their health and conditions are aged to the
// present, and death is projected only from the date they are known to have
// reached. They may be dead already, or due to die later this year. The
// living are recorded with their band and conditions as they stand, with no
// history of how they came by them.
function replay({
	people,
	person,
	survives,
	death,
	record,
}: ReplayParams): void {
	const table = people.persons
	initialize({ people, person })
	table.healthIntervalEnd[person] = survives
	const now = people.household.time()
	for (
		let year = Math.floor(survives);
		year <= Math.floor(Math.min(now, death ?? Infinity)) &&
		table.death[person] === Infinity;
		year++
	)
		advance({ people, person, year, record: false })
	if (death !== null) table.death[person] = death
	const last = Math.min(table.death[person], Math.max(now, survives))
	table.healthFlags[person] =
		(table.healthFlags[person] & ~BAND_MASK) |
		BANDS.indexOf(band(effective({ people, person, time: last })))
	if (record) snapshot({ people, person })
}

function snapshot({ people, person }: HealthPersonParams): void {
	const table = people.persons
	const now = people.household.time()
	if (table.death[person] <= now || !AGEING.afflicted({ people, person }))
		return
	logChanges({
		people,
		person,
		time: Math.max(now, table.birth[person]),
		changes: AGEING.levels({ people, person }).flatMap((level, condition) =>
			level < 0 ? [] : [{ condition, before: -1, after: level }],
		),
	})
}

// The yearly pass over the living: those whose death was chosen, and those
// whose mind gave way this year.
function runYear({ people, time }: HealthYearParams): HealthYear {
	const table = people.persons
	const year = Math.round(time)
	const result: HealthYear = { dying: [], incapacitated: [] }
	for (const person of people.alive) {
		if (table.death[person] !== Infinity) continue
		const capable = !AGEING.incapable({ people, person })
		if (advance({ people, person, year, record: true }))
			result.dying.push(person)
		if (capable && AGEING.incapable({ people, person }))
			result.incapacitated.push(person)
	}
	return result
}

// The next yearly pulse sees that the person led an army.
function led({ people, person }: HealthPersonParams): void {
	people.persons.healthFlags[person] |= LED_FLAG
}

export const HEALTH = {
	snapshot,
	channels: CHANNEL,
	band,
	effective,
	attributeConditions,
	fertility,
	recorded,
	replay,
	runYear,
	led,
}
