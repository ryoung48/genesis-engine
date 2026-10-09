import type { Attribute } from "@/model/history/sim/people/attributes/types"
import type {
	AgeingPersonParams,
	AgeingStepParams,
	ConditionChange,
	ConditionEffects,
	ConditionLevels,
	ConditionRow,
	HealthCondition,
	LevelChangeParams,
	OnsetChanceParams,
	ProgressOption,
	ProgressParams,
} from "@/model/history/sim/people/health/ageing/types"
import { HASH } from "@/model/shared/random/hash"

// Code order: the five ageing conditions, then the two terminal states.
const CONDITIONS: readonly HealthCondition[] = [
	"infirm",
	"clouded_eyes",
	"fragile_bones",
	"withering_mind",
	"faltering_heart",
	"blind",
	"incapable",
]
const INFIRM = 0
const CLOUDED_EYES = 1
const FRAGILE_BONES = 2
const WITHERING_MIND = 3
const FALTERING_HEART = 4
const BLIND = 5
const INCAPABLE = 6
const XP_COLUMNS = [
	"infirmXp",
	"cloudedEyesXp",
	"fragileBonesXp",
	"witheringMindXp",
	"falteringHeartXp",
] as const
const BLIND_FLAG = 8
const INCAPABLE_FLAG = 16
const LEVEL_XP = 25
const MAX_XP = 100
const SKILLS: readonly Attribute[] = [
	"diplomacy",
	"martial",
	"stewardship",
	"intrigue",
	"learning",
]
const CHANNEL = { susceptibility: 1010, progression: 1020, onset: 1030 }
// CK3 yearly_health_pulse: an event is drawn three years in four from a pool
// of this total weight.
const PULSE_CHANCE = 0.75
const POOL_WEIGHT = 885
// CK3 health.7000-7500: the age each onset opens at, its pool weight, and the
// share of people who can ever develop it.
const ONSET = [
	{ from: 45, weight: 20, share: 1 },
	{ from: 45, weight: 20, share: 0.8 },
	{ from: 45, weight: 30, share: 0.8 },
	{ from: 50, weight: 30, share: 0.8 },
	{ from: 45, weight: 30, share: 0.8 },
]

function row(values: Partial<ConditionRow>): ConditionRow {
	return {
		additions: {},
		percentages: {},
		health: 0,
		fertility: 0,
		attraction: 0,
		advantage: 0,
		life: 0,
		...values,
	}
}

const INFIRM_BASE = row({
	additions: { diplomacy: -1, martial: -1 },
	percentages: { prowess: -0.2 },
	fertility: -0.1,
	health: -0.25,
})
const INFIRM_FIRST = row({
	additions: { diplomacy: -1, martial: -1, stewardship: -1 },
	percentages: { prowess: -0.2 },
	fertility: -0.1,
	health: -0.25,
	attraction: -5,
})
const INFIRM_LATER = row({
	additions: { diplomacy: -2, martial: -2, stewardship: -2 },
	percentages: { prowess: -0.2 },
	fertility: -0.1,
	health: -0.25,
	attraction: -5,
})
const CLOUDED = row({ additions: { martial: -1, prowess: -2 } })
const CLOUDED_THIRD = row({
	additions: { martial: -1, stewardship: -1, intrigue: -1, prowess: -2 },
	attraction: -5,
})
const FRAGILE = row({ percentages: { prowess: -0.1 }, advantage: -3, life: 3 })
const FRAGILE_THIRD = row({
	percentages: { prowess: -0.1 },
	advantage: -5,
	life: 5,
})
const FRAGILE_FOURTH = row({
	percentages: { prowess: -0.1 },
	advantage: -10,
	life: 10,
})
const WITHERING_BASE = row({ additions: { learning: -2 } })
const WITHERING_LEVEL = row({
	percentages: Object.fromEntries(SKILLS.map((skill) => [skill, -0.25])),
})
const HEART = row({
	additions: { prowess: -1 },
	health: -0.1,
})
// CK3 00_traits.txt: each condition's base row, then one row per level
// attained; a person's effects are the sum of every row up to their level.
const ROWS: readonly (readonly ConditionRow[])[] = [
	[INFIRM_BASE, INFIRM_FIRST, INFIRM_LATER, INFIRM_LATER, INFIRM_LATER],
	[CLOUDED, CLOUDED, CLOUDED, CLOUDED_THIRD],
	[FRAGILE, FRAGILE, FRAGILE, FRAGILE_THIRD, FRAGILE_FOURTH],
	[
		WITHERING_BASE,
		WITHERING_LEVEL,
		WITHERING_LEVEL,
		WITHERING_LEVEL,
		WITHERING_LEVEL,
	],
	[HEART, HEART, HEART, HEART],
	[
		row({
			additions: { martial: -6, stewardship: -2, intrigue: -2, prowess: -10 },
			health: -0.25,
			attraction: -10,
		}),
	],
	[row({ health: -2 })],
]
const ATTRIBUTE_NAMES: readonly Attribute[] = [...SKILLS, "prowess"]
const EFFECTS = new Map<number, ConditionEffects>()
const NO_CHANGES: ConditionChange[] = []
const FIRST_ONSET_AGE = 45

function levelOf(xp: number): number {
	return xp < 0 ? -1 : Math.min(4, Math.floor(xp / LEVEL_XP))
}

function afflicted({ people, person }: AgeingPersonParams): boolean {
	const table = people.persons
	return (
		(table.healthFlags[person] & (BLIND_FLAG | INCAPABLE_FLAG)) !== 0 ||
		table.infirmXp[person] >= 0 ||
		table.cloudedEyesXp[person] >= 0 ||
		table.fragileBonesXp[person] >= 0 ||
		table.witheringMindXp[person] >= 0 ||
		table.falteringHeartXp[person] >= 0
	)
}

function levels({ people, person }: AgeingPersonParams): number[] {
	const table = people.persons
	const flags = table.healthFlags[person]
	return [
		...XP_COLUMNS.map((column) => levelOf(table[column][person])),
		flags & BLIND_FLAG ? 0 : -1,
		flags & INCAPABLE_FLAG ? 0 : -1,
	]
}

// Three bits per condition: its level plus one, so no condition is 0.
function signature(levels: ConditionLevels): number {
	let key = 0
	for (const [condition, level] of levels.entries())
		key |= (level + 1) << (3 * condition)
	return key
}

// The summed rows are the same for everyone at the same levels, so each
// combination is computed once and shared; callers only read it.
function effects(levels: ConditionLevels): ConditionEffects {
	const key = signature(levels)
	let total = EFFECTS.get(key)
	if (!total) {
		total = sumRows(levels)
		EFFECTS.set(key, total)
	}
	return total
}

// The person's summed effects; null without any condition.
function effectsOf({
	people,
	person,
}: AgeingPersonParams): ConditionEffects | null {
	const table = people.persons
	const flags = table.healthFlags[person]
	const key =
		(levelOf(table.infirmXp[person]) + 1) |
		((levelOf(table.cloudedEyesXp[person]) + 1) << 3) |
		((levelOf(table.fragileBonesXp[person]) + 1) << 6) |
		((levelOf(table.witheringMindXp[person]) + 1) << 9) |
		((levelOf(table.falteringHeartXp[person]) + 1) << 12) |
		(flags & BLIND_FLAG ? 1 << 15 : 0) |
		(flags & INCAPABLE_FLAG ? 1 << 18 : 0)
	if (key === 0) return null
	return EFFECTS.get(key) ?? effects(levels({ people, person }))
}

function sumRows(levels: ConditionLevels): ConditionEffects {
	const zero = () =>
		Object.fromEntries(ATTRIBUTE_NAMES.map((name) => [name, 0])) as Record<
			Attribute,
			number
		>
	const total: ConditionEffects = {
		attributes: {
			additions: zero(),
			percentages: zero(),
			incapable: levels[INCAPABLE] >= 0,
		},
		health: 0,
		fertility: 0,
		attraction: 0,
		advantage: 0,
		ageingShift: 0,
	}
	for (const [condition, level] of levels.entries()) {
		const rows = ROWS[condition]
		for (let index = 0; index <= Math.min(level, rows.length - 1); index++) {
			const entry = rows[index]
			for (const name of ATTRIBUTE_NAMES) {
				total.attributes.additions[name] += entry.additions[name] ?? 0
				total.attributes.percentages[name] += entry.percentages[name] ?? 0
			}
			total.health += entry.health
			total.fertility += entry.fertility
			total.attraction += entry.attraction
			total.advantage += entry.advantage
			total.ageingShift += entry.life
		}
	}
	total.fertility = Math.max(0, 1 + total.fertility)
	return total
}

// CK3 weight_multiplier blocks. Every matching factor multiplies: the
// under-60 rows stop at 60, and the older rows begin above their age.
function onsetChance({ condition, age, health }: OnsetChanceParams): number {
	let factor = age > 60 ? 2 : 1
	if (condition === WITHERING_MIND || condition === FALTERING_HEART) {
		if (age > 70) factor *= 2
		if (age > 80) factor *= 3
	}
	const young = age < 60
	if (condition === CLOUDED_EYES) {
		if (young && health >= 5) factor *= 0.7
		if (young && health >= 3) factor *= 0.5
	} else if (condition === WITHERING_MIND) {
		if (young && health >= 5) factor *= 0.1
		if (young && health >= 3) factor *= 0.8
	} else {
		if (young && health >= 5) factor *= 0
		if (young && health >= 3) factor *= 0.8
		if (health < 3) factor *= 2
		if (health <= 1) factor *= 5
	}
	return Math.min(
		1,
		((PULSE_CHANCE * ONSET[condition].weight) / POOL_WEIGHT) * factor,
	)
}

// CK3 yearly_health_pulse effect block: the yearly XP gains and their
// weights, with the sim's stand-ins for friends, lovers and the Athletic
// trait folded into the constants.
function progressOptions({
	condition,
	age,
	health,
	prowess,
	led,
}: ProgressParams): ProgressOption[] {
	if (condition === INFIRM) {
		const fine = health >= 3 ? 25 : 0
		return [
			{ xp: 8, weight: 50 + (age >= 50 ? 25 : 0) - fine },
			{ xp: 4, weight: 60 + prowess },
			{ xp: 12, weight: (age >= 65 ? 50 : 0) - fine },
		]
	}
	if (condition === WITHERING_MIND)
		return [
			{ xp: 50, weight: 9 },
			{ xp: 8, weight: 48 },
			{ xp: 4, weight: 75 },
			{ xp: 1, weight: 10 },
		]
	if (condition === FRAGILE_BONES)
		return [
			{ xp: 3, weight: 25 },
			{ xp: 6, weight: 75 },
			{ xp: 12, weight: led ? 100 : 0 },
		]
	if (condition === CLOUDED_EYES)
		return [
			{ xp: 15, weight: 5 },
			{ xp: 9, weight: 20 },
			{ xp: 3, weight: 75 },
		]
	if (condition === FALTERING_HEART)
		return [
			{ xp: 2, weight: 75 },
			{ xp: 4, weight: 25 },
			{ xp: 8, weight: (age >= 65 ? 25 : 0) + (health < 3 ? 25 : 0) },
		]
	return []
}

function noteLevel({
	condition,
	before,
	after,
	changes,
}: LevelChangeParams): void {
	if (before !== after) changes.push({ condition, before, after })
}

// One completed age-year: each condition the person already has progresses,
// then each one they can develop may begin. Returns the level changes in
// condition order.
function step({
	people,
	person,
	age,
	health,
	prowess,
	led,
}: AgeingStepParams): ConditionChange[] {
	const table = people.persons
	if (age < FIRST_ONSET_AGE && !afflicted({ people, person })) return NO_CHANGES
	const seed = table.nameSeed[person]
	const changes: ConditionChange[] = []
	let blinded = false
	let incapacitated = false
	for (let condition = 0; condition < XP_COLUMNS.length; condition++) {
		const column = table[XP_COLUMNS[condition]]
		const xp = column[person]
		if (xp >= 0) {
			const options = progressOptions({
				condition,
				age,
				health,
				prowess,
				led,
			})
			let total = 0
			for (const option of options) total += Math.max(0, option.weight)
			if (total <= 0) continue
			let roll =
				total *
				HASH.unit({
					seed,
					channel: CHANNEL.progression + condition,
					salt: age,
				})
			let gain = 0
			for (const option of options) {
				roll -= Math.max(0, option.weight)
				if (roll < 0) {
					gain = option.xp
					break
				}
			}
			const next = Math.min(MAX_XP, xp + gain)
			if (condition === CLOUDED_EYES && next >= MAX_XP) {
				column[person] = -1
				blinded = true
				noteLevel({ condition, before: levelOf(xp), after: -1, changes })
				continue
			}
			column[person] = next
			noteLevel({
				condition,
				before: levelOf(xp),
				after: levelOf(next),
				changes,
			})
			if (condition === WITHERING_MIND && next >= MAX_XP && xp < MAX_XP)
				incapacitated = true
			continue
		}
		const onset = ONSET[condition]
		if (age < onset.from) continue
		if (condition === CLOUDED_EYES && table.healthFlags[person] & BLIND_FLAG)
			continue
		if (
			HASH.unit({ seed, channel: CHANNEL.onset + condition, salt: age }) >=
			onsetChance({ condition, age, health })
		)
			continue
		if (
			onset.share < 1 &&
			HASH.unit({
				seed,
				channel: CHANNEL.susceptibility + condition,
				salt: 0,
			}) >= onset.share
		)
			continue
		column[person] = 0
		changes.push({ condition, before: -1, after: 0 })
	}
	if (blinded) {
		table.healthFlags[person] |= BLIND_FLAG
		changes.push({ condition: BLIND, before: -1, after: 0 })
	}
	if (incapacitated) {
		table.healthFlags[person] |= INCAPABLE_FLAG
		changes.push({ condition: INCAPABLE, before: -1, after: 0 })
	}
	return changes
}

function incapable({ people, person }: AgeingPersonParams): boolean {
	return (people.persons.healthFlags[person] & INCAPABLE_FLAG) !== 0
}

function blind({ people, person }: AgeingPersonParams): boolean {
	return (people.persons.healthFlags[person] & BLIND_FLAG) !== 0
}

function heartFailed({ people, person }: AgeingPersonParams): boolean {
	return people.persons.falteringHeartXp[person] >= MAX_XP
}

function spareHeart({ people, person }: AgeingPersonParams): void {
	const column = people.persons.falteringHeartXp
	column[person] = Math.min(column[person], MAX_XP - 1)
}

export const AGEING = {
	conditions: CONDITIONS,
	firstOnsetAge: FIRST_ONSET_AGE,
	noChanges: NO_CHANGES,
	channels: CHANNEL,
	afflicted,
	levels,
	effects,
	effectsOf,
	onsetChance,
	progressOptions,
	step,
	incapable,
	blind,
	heartFailed,
	spareHeart,
}
