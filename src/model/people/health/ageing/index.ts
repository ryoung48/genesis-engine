import type {
	AgeingState,
	AgeingStepParams,
	ConditionChange,
	ConditionEffects,
	ConditionRow,
	HealthCondition,
	LevelChangeParams,
	OnsetChanceParams,
	ProgressOption,
	ProgressParams,
} from "@/model/people/health/ageing/types"
import { HASH } from "@/model/shared/random/hash"

const CONDITIONS: readonly HealthCondition[] = [
	"infirm",
	"clouded_eyes",
	"fragile_bones",
	"withering_mind",
	"faltering_heart",
	"blind",
	"incapable",
]
const CLOUDED_EYES = 1
const FRAGILE_BONES = 2
const WITHERING_MIND = 3
const FALTERING_HEART = 4
const BLIND = 5
const INCAPABLE = 6
const AGEING_COUNT = 5
const LEVEL_XP = 25
const MAX_XP = 100
const CHANNEL = { susceptibility: 1010, progression: 1020, onset: 1030 }
const PULSE_CHANCE = 0.75
const POOL_WEIGHT = 885
const ONSET = [
	{ from: 45, weight: 20, share: 1 },
	{ from: 45, weight: 20, share: 0.8 },
	{ from: 45, weight: 30, share: 0.8 },
	{ from: 50, weight: 30, share: 0.8 },
	{ from: 45, weight: 30, share: 0.8 },
]
const FIRST_ONSET_AGE = 45

function row(values: Partial<ConditionRow>): ConditionRow {
	return { health: 0, fertility: 0, life: 0, ...values }
}

const INFIRM = row({ fertility: -0.1, health: -0.25 })
const NO_EFFECT = row({})
const FRAGILE = row({ life: 3 })
const FRAGILE_THIRD = row({ life: 5 })
const FRAGILE_FOURTH = row({ life: 10 })
const HEART = row({ health: -0.1 })
const ROWS: readonly (readonly ConditionRow[])[] = [
	[INFIRM, INFIRM, INFIRM, INFIRM, INFIRM],
	[NO_EFFECT, NO_EFFECT, NO_EFFECT, NO_EFFECT],
	[FRAGILE, FRAGILE, FRAGILE, FRAGILE_THIRD, FRAGILE_FOURTH],
	[NO_EFFECT, NO_EFFECT, NO_EFFECT, NO_EFFECT, NO_EFFECT],
	[HEART, HEART, HEART, HEART],
	[row({ health: -0.25 })],
	[row({ health: -2 })],
]
const EFFECTS = new Map<number, ConditionEffects>()
const NO_CHANGES: ConditionChange[] = []

function levelOf(xp: number): number {
	return xp < 0 ? -1 : Math.min(4, Math.floor(xp / LEVEL_XP))
}

function fresh(): AgeingState {
	return { xp: Array(AGEING_COUNT).fill(-1), blind: false, incapable: false }
}

function levels(state: AgeingState): number[] {
	return [
		...state.xp.map(levelOf),
		state.blind ? 0 : -1,
		state.incapable ? 0 : -1,
	]
}

function afflicted(state: AgeingState): boolean {
	return state.blind || state.incapable || state.xp.some((xp) => xp >= 0)
}

function sumRows(all: readonly number[]): ConditionEffects {
	const total: ConditionEffects = { health: 0, fertility: 0, ageingShift: 0 }
	for (const [condition, level] of all.entries()) {
		const rows = ROWS[condition]
		for (let index = 0; index <= Math.min(level, rows.length - 1); index++) {
			total.health += rows[index].health
			total.fertility += rows[index].fertility
			total.ageingShift += rows[index].life
		}
	}
	total.fertility = Math.max(0, 1 + total.fertility)
	return total
}

function effectsOfLevels(all: readonly number[]): ConditionEffects | null {
	if (all.every((level) => level < 0)) return null
	let key = 0
	for (const [condition, level] of all.entries())
		key |= (level + 1) << (3 * condition)
	let total = EFFECTS.get(key)
	if (!total) {
		total = sumRows(all)
		EFFECTS.set(key, total)
	}
	return total
}

function effects(state: AgeingState): ConditionEffects | null {
	return afflicted(state) ? effectsOfLevels(levels(state)) : null
}

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

function progressOptions({
	condition,
	age,
	health,
}: ProgressParams): ProgressOption[] {
	if (condition === 0) {
		const fine = health >= 3 ? 25 : 0
		return [
			{ xp: 8, weight: 50 + (age >= 50 ? 25 : 0) - fine },
			{ xp: 4, weight: 60 },
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

function step({
	state,
	seed,
	age,
	health,
}: AgeingStepParams): ConditionChange[] {
	if (age < FIRST_ONSET_AGE && !afflicted(state)) return NO_CHANGES
	const changes: ConditionChange[] = []
	let blinded = false
	let incapacitated = false
	for (let condition = 0; condition < AGEING_COUNT; condition++) {
		const xp = state.xp[condition]
		if (xp >= 0) {
			const options = progressOptions({ condition, age, health })
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
				state.xp[condition] = -1
				blinded = true
				noteLevel({ condition, before: levelOf(xp), after: -1, changes })
				continue
			}
			state.xp[condition] = next
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
		if (condition === CLOUDED_EYES && state.blind) continue
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
		state.xp[condition] = 0
		changes.push({ condition, before: -1, after: 0 })
	}
	if (blinded) {
		state.blind = true
		changes.push({ condition: BLIND, before: -1, after: 0 })
	}
	if (incapacitated) {
		state.incapable = true
		changes.push({ condition: INCAPABLE, before: -1, after: 0 })
	}
	return changes
}

function heartFailed(state: AgeingState): boolean {
	return state.xp[FALTERING_HEART] >= MAX_XP
}

function spareHeart(state: AgeingState): void {
	state.xp[FALTERING_HEART] = Math.min(state.xp[FALTERING_HEART], MAX_XP - 1)
}

export const AGEING = {
	conditions: CONDITIONS,
	fresh,
	levels,
	effects,
	effectsOfLevels,
	step,
	heartFailed,
	spareHeart,
	firstOnsetAge: FIRST_ONSET_AGE,
	noChanges: NO_CHANGES,
}
