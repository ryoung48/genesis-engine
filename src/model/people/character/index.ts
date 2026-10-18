import type {
	Character,
	CharacterAtParams,
	CompatibilityParams,
	CongenitalTrait,
	DrawCharacterParams,
	DrawPersonalityParams,
	GeneResult,
	Grade,
	GradeParams,
	GradeTrait,
	GradeValues,
	InheritParams,
	Ladder,
	LadderDrawParams,
	PersonalityTrait,
	TraitDefinition,
	TraitRow,
} from "@/model/people/character/types"
import { HASH } from "@/model/shared/random/hash"

function definition([name, health, fertility]: TraitRow): TraitDefinition {
	return { name, health, fertility }
}

const PERSONALITY_ROWS: TraitRow[] = [
	["brave", 0, 0],
	["craven", 0, 0],
	["ambitious", 0, 0],
	["content", 0, 0],
	["wrathful", 0, 0],
	["calm", 0, 0],
	["just", 0, 0],
	["arbitrary", 0, 0],
	["diligent", 0, 0],
	["lazy", 0, 0],
	["generous", 0, 0],
	["greedy", 0, 0],
	["lustful", 0, 0.25],
	["chaste", 0, -0.25],
	["temperate", 0.25, 0],
	["gluttonous", 0, 0],
	["patient", 0, 0],
	["impatient", 0, 0],
	["humble", 0, 0],
	["arrogant", 0, 0],
	["honest", 0, 0],
	["deceitful", 0, 0],
	["gregarious", 0, 0],
	["shy", 0, 0],
	["zealous", 0, 0],
	["cynical", 0, 0],
	["trusting", 0, 0],
	["paranoid", 0, 0],
	["forgiving", 0, 0],
	["vengeful", 0, 0],
	["compassionate", 0, 0],
	["callous", 0, 0],
	["sadistic", 0, 0],
	["stubborn", 0, 0],
	["fickle", 0, 0],
	["eccentric", 0, 0],
]
const PERSONALITY = PERSONALITY_ROWS.map(definition)
const CONGENITAL_ROWS: TraitRow[] = [
	["giant", -0.25, 0],
	["dwarf", 0, 0],
	["clubfooted", 0, 0],
	["hunchbacked", 0, 0],
	["spindly", -0.25, 0],
	["lisping", 0, 0],
	["stuttering", 0, 0],
	["bleeder", -1.5, 0],
	["wheezing", -0.15, 0],
	["infertile", 0, -0.5],
	["scaly", 0, -0.2],
	["albino", 0, 0],
	["depressed", -0.5, -0.1],
	["lunatic", -0.25, 0],
	["possessed", -0.5, 0],
]
const CONGENITAL = CONGENITAL_ROWS.map(definition)
const GROUPS = [
	[0, 1],
	[2, 3],
	[4, 5],
	[6, 7],
	[8, 9],
	[10, 11],
	[12, 13],
	[14, 15],
	[16, 17],
	[18, 19],
	[20, 21],
	[22, 23],
	[24, 25],
	[26, 27],
	[28, 29],
	[30, 31, 32],
	[33, 34, 35],
]
const GROUP_OF = new Map<string, number>(
	GROUPS.flatMap((group, index) =>
		group.map((code): [string, number] => [PERSONALITY[code].name, index]),
	),
)
const PERSONALITY_WEIGHTS = PERSONALITY.map((row) =>
	row.name === "eccentric" ? 0.05 : 1,
)
const GROUP_WEIGHTS = GROUPS.map((members) =>
	members.reduce((sum, code) => sum + PERSONALITY_WEIGHTS[code], 0),
)
const LADDERS: readonly Ladder[] = ["intellect", "physique", "beauty"]
const PERSONALITY_HEALTH = PERSONALITY.map((row) => row.health)
const CONGENITAL_HEALTH = CONGENITAL.map((row) => row.health)
const PHYSIQUE_HEALTH = [-1, -0.5, -0.25, 0, 0.25, 0.5, 1, 0]
const ACTIVE_AGES = [9, 11, 13]
const PARENT_BIAS = 0.4
const REPUTATION_PENALTY = -10
const INHERITANCE_CHANCES = {
	activeActive: [0.8, 1],
	activeCarried: [0.5, 1],
	activeNone: [0.25, 0.75],
	carriedCarried: [0.1, 0.5],
	carriedNone: [0.02, 0.25],
} as const
const GRADE_NAMES: Record<Ladder, string[]> = {
	intellect: [
		"Imbecile",
		"Stupid",
		"Slow",
		"",
		"Quick",
		"Intelligent",
		"Genius",
	],
	physique: ["Feeble", "Frail", "Delicate", "", "Hale", "Robust", "Herculean"],
	beauty: ["Hideous", "Ugly", "Homely", "", "Comely", "Handsome", "Beautiful"],
}

function inherit({
	seed,
	channel,
	first,
	second,
	birth,
	reduction,
}: InheritParams): GeneResult {
	const a = Number(first === "active") + Number(second === "active")
	const c = Number(first === "carried") + Number(second === "carried")
	const chances =
		a === 2
			? INHERITANCE_CHANCES.activeActive
			: a === 1
				? c === 1
					? INHERITANCE_CHANCES.activeCarried
					: INHERITANCE_CHANCES.activeNone
				: c === 2
					? INHERITANCE_CHANCES.carriedCarried
					: c === 1
						? INHERITANCE_CHANCES.carriedNone
						: null
	const active =
		HASH.unit({ seed, channel, salt: 0 }) <
		(chances ? chances[0] : birth) * reduction
	return {
		active,
		carried:
			!active &&
			HASH.unit({ seed, channel: channel + 1, salt: 0 }) <
				(chances ? chances[1] : 0),
	}
}

function grade({ character, ladder }: GradeParams): GradeValues {
	const bits = (character.grades >>> (LADDERS.indexOf(ladder) * 7)) & 127
	return {
		active: ((bits & 7) - 3) as Grade,
		good: (bits >>> 3) & 3,
		bad: (bits >>> 5) & 3,
	}
}

function drawLadder({
	seed,
	channel,
	first,
	second,
	birth,
}: LadderDrawParams): GradeValues {
	let active = 0
	let good = 0
	let bad = 0
	for (const side of [1, -1]) {
		let carried = 0
		for (let tier = 3; tier >= 1; tier--) {
			const parents = [first, second].map((parent) => {
				const showing = Math.max(0, parent.active * side)
				const hidden = side === 1 ? parent.good : parent.bad
				const value = Math.max(showing, hidden)
				return {
					state:
						showing >= tier
							? ("active" as const)
							: value > 0
								? ("carried" as const)
								: ("none" as const),
					reduction:
						value > 0 && value < tier
							? 0.2 ** Math.max(0, tier - value - 1)
							: 1,
				}
			})
			const rollChannel = channel + (side === 1 ? 0 : 12) + (3 - tier) * 3
			const result = inherit({
				seed,
				channel: rollChannel,
				first: parents[0].state,
				second: parents[1].state,
				birth: birth[tier - 1],
				reduction: parents[0].reduction * parents[1].reduction,
			})
			if (result.active) {
				active = tier
				if (
					tier < 3 &&
					parents.every((parent) => parent.state === "active") &&
					HASH.unit({ seed, channel: rollChannel + 2, salt: 0 }) < 0.5
				)
					active++
				if (carried <= active) carried = 0
				active *= side
				break
			}
			if (result.carried) carried = Math.max(carried, tier)
		}
		if (side === 1) good = carried
		else bad = carried
		if (active > 0) break
	}
	return { active: active as Grade, good, bad }
}

function activeTraits({
	character,
	age,
}: CharacterAtParams): PersonalityTrait[] {
	const traits: PersonalityTrait[] = []
	for (let slot = 0; slot < 3; slot++)
		if (age >= ACTIVE_AGES[slot])
			traits.push(
				PERSONALITY[(character.personality >>> (slot * 6)) & 63]
					.name as PersonalityTrait,
			)
	return traits
}

function drawPersonality({ seed, parents }: DrawPersonalityParams): number {
	let parentLow = 0
	let parentHigh = 0
	for (const parent of parents) {
		if (!parent) continue
		for (let shift = 0; shift < 18; shift += 6) {
			const code = (parent.personality >>> shift) & 63
			if (code < 32) parentLow |= 1 << code
			else parentHigh |= 1 << (code - 32)
		}
	}
	const groups = [-1, -1, -1]
	const rolls = [Infinity, Infinity, Infinity]
	for (let index = 0; index < GROUPS.length; index++) {
		const roll = HASH.unit({ seed, channel: 100 + index, salt: 0 })
		if (roll >= rolls[2]) continue
		let slot = 2
		while (slot > 0 && roll < rolls[slot - 1]) {
			rolls[slot] = rolls[slot - 1]
			groups[slot] = groups[slot - 1]
			slot--
		}
		rolls[slot] = roll
		groups[slot] = index
	}
	let packed = 0
	for (let slot = 0; slot < groups.length; slot++) {
		const group = groups[slot]
		const members = GROUPS[group]
		let boosted = -1
		let inherited = 0
		for (const code of members)
			if (
				(code < 32
					? parentLow & (1 << code)
					: parentHigh & (1 << (code - 32))) !== 0
			) {
				boosted = code
				inherited++
			}
		if (inherited !== 1) boosted = -1
		let roll = HASH.unit({ seed, channel: 130 + slot, salt: 0 })
		for (let index = 0; index < members.length; index++) {
			const code = members[index]
			const share = PERSONALITY_WEIGHTS[code] / GROUP_WEIGHTS[group]
			roll -=
				boosted < 0
					? share
					: code === boosted
						? share + PARENT_BIAS * (1 - share)
						: share * (1 - PARENT_BIAS)
			if (roll < 0 || index === members.length - 1) {
				packed |= code << (slot * 6)
				break
			}
		}
	}
	return packed
}

function draw({ seed, first, second }: DrawCharacterParams): Character {
	const parents = [first, second]
	const personality = drawPersonality({ seed, parents })
	let grades = 0
	for (const [index, ladder] of LADDERS.entries()) {
		const p = parents.map((parent) =>
			parent
				? grade({ character: parent, ladder })
				: { active: 0 as Grade, good: 0, bad: 0 },
		)
		const result = drawLadder({
			seed,
			channel: 200 + index * 30,
			first: p[0],
			second: p[1],
			birth:
				ladder === "intellect"
					? [0.005, 0.0025, 0.0005]
					: [0.005, 0.0025, 0.0015],
		})
		grades |=
			((result.active + 3) | (result.good << 3) | (result.bad << 5)) <<
			(index * 7)
	}
	let congenital = 0
	let carried = 0
	for (let index = 0; index < CONGENITAL.length; index++) {
		const bit = 1 << index
		const p = parents.map((parent) =>
			!parent
				? ("none" as const)
				: parent.congenital & bit
					? ("active" as const)
					: parent.carried & bit
						? ("carried" as const)
						: ("none" as const),
		)
		const result = inherit({
			seed,
			channel: 300 + index * 2,
			first: p[0],
			second: p[1],
			birth: 0.005,
			reduction: 1,
		})
		if (result.active) congenital |= bit
		else if (result.carried) carried |= bit
	}
	return { personality, grades, congenital, carried }
}

function healthModifier({ character, age }: CharacterAtParams): number {
	let value = 0
	for (let slot = 0; slot < 3; slot++)
		if (age >= ACTIVE_AGES[slot])
			value +=
				PERSONALITY_HEALTH[(character.personality >>> (slot * 6)) & 63] ?? 0
	let bits = character.congenital
	while (bits !== 0) {
		value += CONGENITAL_HEALTH[31 - Math.clz32(bits & -bits)]
		bits &= bits - 1
	}
	return value + PHYSIQUE_HEALTH[(character.grades >>> 7) & 7]
}

function fertilityMultiplier(character: Character): number {
	let value = 0
	for (let slot = 0; slot < 3; slot++)
		value += PERSONALITY[(character.personality >>> (slot * 6)) & 63].fertility
	let bits = character.congenital
	while (bits !== 0) {
		value += CONGENITAL[31 - Math.clz32(bits & -bits)].fertility
		bits &= bits - 1
	}
	value += grade({ character, ladder: "beauty" }).active * 0.1
	return Math.max(0, 1 + value)
}

function congenitalTraits(character: Character): CongenitalTrait[] {
	return CONGENITAL.flatMap((row, index) =>
		character.congenital & (1 << index) ? [row.name as CongenitalTrait] : [],
	)
}

function gradeTraits(character: Character): GradeTrait[] {
	return LADDERS.flatMap((ladder) => {
		const value = grade({ character, ladder }).active
		return value === 0
			? []
			: [{ label: GRADE_NAMES[ladder][value + 3], grade: value }]
	})
}

function compatibility({ first, second }: CompatibilityParams): number {
	const a = activeTraits(first)
	const b = activeTraits(second)
	let value = 0
	for (const trait of a)
		for (const other of b) {
			if (trait === other) value += 5
			else if (GROUP_OF.get(trait) === GROUP_OF.get(other)) value -= 5
		}
	return value
}

function opposites({ trait }: { trait: PersonalityTrait }): PersonalityTrait[] {
	const group = GROUP_OF.get(trait)
	return group === undefined
		? []
		: GROUPS[group]
				.map((code) => PERSONALITY[code].name as PersonalityTrait)
				.filter((name) => name !== trait)
}

function reputation({ character, age }: CharacterAtParams): number {
	let value = 0
	if (activeTraits({ character, age }).includes("sadistic"))
		value += REPUTATION_PENALTY
	if (congenitalTraits(character).includes("albino"))
		value += REPUTATION_PENALTY
	return value
}

export const CHARACTER = {
	draw,
	activeTraits,
	healthModifier,
	fertilityMultiplier,
	congenitalTraits,
	gradeTraits,
	compatibility,
	reputation,
	opposites,
}
