import type { Attribute } from "@/model/history/sim/people/attributes/types"
import type {
	Character,
	CongenitalTrait,
	DrawTraitsParams,
	GeneResult,
	Grade,
	GradeParams,
	GradeValues,
	IncomeParams,
	InheritParams,
	LadderDrawParams,
	PersonalityTrait,
	ScalarTraitModifier,
	StressFactorsParams,
	TraitAtParams,
	TraitDefinition,
	TraitHasParams,
	TraitModifierParams,
	TraitRow,
} from "@/model/history/sim/people/traits/types"
import { HASH } from "@/model/shared/random/hash"

function definition(row: TraitRow): TraitDefinition {
	const [
		name,
		diplomacy,
		martial,
		stewardship,
		intrigue,
		learning,
		prowess,
		health,
		fertility,
		attraction,
		opinion,
		vassalOpinion,
		stressGain,
		stressLoss,
		warChance,
		income,
	] = row
	return {
		name,
		values: [diplomacy, martial, stewardship, intrigue, learning, prowess],
		health,
		fertility,
		attraction,
		opinion,
		vassalOpinion,
		stressGain,
		stressLoss,
		warChance,
		income,
	}
}
const PERSONALITY_ROWS: TraitRow[] = [
	["brave", 0, 2, 0, 0, 0, 3, 0, 0, 10, 0, 0, 0, 0, 0, 0],
	["craven", 0, -2, 0, 2, 0, -3, 0, 0, -10, 0, 0, 0, 0, 0, 0],
	["ambitious", 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0.25, 0, 1, 0],
	["content", 0, 0, 0, -1, 2, 0, 0, 0, 0, 0, 0, 0, 0.1, -0.25, 0],
	["wrathful", -1, 3, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0],
	["calm", 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, -0.25, 0],
	["just", 0, 0, 2, -3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["arbitrary", 0, 0, -2, 3, -1, 0, 0, 0, 0, 0, -5, -0.5, 0, 0, 0],
	["diligent", 2, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, -0.5, 0, 0],
	["lazy", -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0],
	["generous", 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.1],
	["greedy", -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.05],
	["lustful", 0, 0, 0, 2, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0],
	["chaste", 0, 0, 0, 0, 2, 0, 0, -0.25, 0, 0, 0, 0, 0, 0, 0],
	["temperate", 0, 0, 2, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0],
	["gluttonous", 0, 0, -2, 0, 0, 0, 0, 0, -5, 0, 0, 0, 0.1, 0, 0],
	["patient", 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["impatient", 0, 0, 0, 0, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["humble", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["arrogant", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["honest", 2, 0, 0, -4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["deceitful", -2, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["gregarious", 2, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0],
	["shy", -2, 0, 0, 0, 1, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0],
	["zealous", 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["cynical", 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["trusting", 2, 0, 0, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["paranoid", -1, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
	["forgiving", 2, 0, 0, -2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["vengeful", -2, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["compassionate", 2, 0, 0, -2, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0],
	["callous", -2, 0, 0, 2, 0, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0],
	["sadistic", 0, 0, 0, 2, 0, 4, 0, 0, 0, -10, 0, 0, 0, 0, 0],
	["stubborn", 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["fickle", 2, 0, -2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["eccentric", -2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0, 0],
]
const PERSONALITY = PERSONALITY_ROWS.map(definition)
const CONGENITAL_ROWS: TraitRow[] = [
	["giant", 0, 0, 0, 0, 0, 6, -0.25, 0, 0, 0, 0, 0, 0, 0, 0],
	["dwarf", 0, 0, 0, 0, 0, -4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["clubfooted", 0, 0, 0, 0, 0, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["hunchbacked", 0, 0, 0, 0, 0, -2, 0, 0, 0, 0, -10, 0, 0, 0, 0],
	["spindly", 0, 0, 0, 0, 0, -1, -0.25, 0, 0, 0, 0, 0, 0, 0, 0],
	["lisping", -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["stuttering", -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	["bleeder", 0, 0, 0, 0, 0, 0, -1.5, 0, 0, 0, -10, 0, 0, 0, 0],
	["wheezing", 0, 0, 0, 0, 0, 0, -0.15, 0, 0, 0, -10, 0, 0, 0, 0],
	["infertile", 0, 0, 0, 0, 0, 0, 0, -0.5, 0, 0, 0, 0, 0, 0, 0],
	["scaly", 0, 0, 0, 0, 0, 0, 0, -0.2, 0, 0, -10, 0, 0, 0, 0],
	["albino", 0, 0, 0, 0, 0, 0, 0, 0, 0, -10, 0, 0, 0, 0, 0],
	["depressed", -1, -1, -1, -1, 0, 0, -0.5, -0.1, 0, 0, 0, 0, 0, 0, 0],
	["lunatic", 0, 0, 0, 0, 0, 0, -0.25, 0, 0, 0, -10, 0, 0, 0, 0],
	["possessed", 0, 0, 0, 0, 0, 0, -0.5, 0, 0, 0, 0, 0, 0, 0, 0],
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
const PERSONALITY_WEIGHTS = PERSONALITY.map((row) =>
	row.name === "eccentric" ? 0.05 : 1,
)
const GROUP_WEIGHTS = GROUPS.map((members) =>
	members.reduce((sum, code) => sum + PERSONALITY_WEIGHTS[code], 0),
)
const ATTRIBUTES = [
	"diplomacy",
	"martial",
	"stewardship",
	"intrigue",
	"learning",
	"prowess",
] as const
const LADDERS = ["intellect", "physique", "beauty"] as const
const INHERITANCE_CHANCES = {
	activeActive: [0.8, 1],
	activeCarried: [0.5, 1],
	activeNone: [0.25, 0.75],
	carriedCarried: [0.1, 0.5],
	carriedNone: [0.02, 0.25],
} as const
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
function active({ character, age }: TraitAtParams): PersonalityTrait[] {
	const traits: PersonalityTrait[] = []
	for (let slot = 0; slot < 3; slot++)
		if (age >= 9 + slot * 2)
			traits.push(
				PERSONALITY[(character.personality >>> (slot * 6)) & 63]
					.name as PersonalityTrait,
			)
	return traits
}
function draw({
	table,
	person,
}: DrawTraitsParams): Pick<
	Character,
	"personality" | "grades" | "congenital" | "carried"
> {
	const seed = table.nameSeed[person]
	const parents = [table.father[person], table.mother[person]]
	let parentLow = 0
	let parentHigh = 0
	for (const parent of parents) {
		if (parent < 0) continue
		for (let shift = 0; shift < 18; shift += 6) {
			const code = (table.personality[parent] >>> shift) & 63
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
						? share + 0.4 * (1 - share)
						: share * 0.6
			if (roll < 0 || index === members.length - 1) {
				packed |= code << (slot * 6)
				break
			}
		}
	}
	let grades = 0
	for (const [index, ladder] of LADDERS.entries()) {
		const p = parents.map((parent) =>
			parent < 0
				? { active: 0 as Grade, good: 0, bad: 0 }
				: grade({
						character: { grades: table.grades[parent] },
						ladder,
					}),
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
			parent < 0
				? ("none" as const)
				: table.congenital[parent] & bit
					? ("active" as const)
					: table.carried[parent] & bit
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
		if (result.active && !(index === 1 && congenital & 1)) congenital |= bit
		else if (result.carried) carried |= bit
	}
	return { personality: packed, grades, congenital, carried }
}
function modifier({ character, age, modifier }: TraitModifierParams): number {
	const index = ATTRIBUTES.indexOf(modifier as Attribute)
	let value = 0
	for (let slot = 0; slot < 3; slot++) {
		if (age < 9 + slot * 2) continue
		const row = PERSONALITY[(character.personality >>> (slot * 6)) & 63]
		if (row)
			value +=
				index < 0 ? row[modifier as ScalarTraitModifier] : row.values[index]
	}
	let bits = character.congenital
	while (bits !== 0) {
		const row = CONGENITAL[31 - Math.clz32(bits & -bits)]
		value +=
			index < 0 ? row[modifier as ScalarTraitModifier] : row.values[index]
		bits &= bits - 1
	}
	if (index >= 0 && index < 5) {
		const intellect = grade({ character, ladder: "intellect" }).active
		value +=
			intellect < 0 ? [0, -2, -4, -8][-intellect] : [0, 1, 3, 5][intellect]
	}
	if (modifier === "prowess" || modifier === "health") {
		const physique = grade({ character, ladder: "physique" }).active
		value +=
			modifier === "health"
				? Math.sign(physique) * [0, 0.25, 0.5, 1][Math.abs(physique)]
				: physique < 0
					? [0, -2, -4, -6][-physique]
					: [0, 2, 4, 8][physique]
	}
	if (modifier === "diplomacy" || modifier === "fertility") {
		const beauty = grade({ character, ladder: "beauty" }).active
		value += modifier === "diplomacy" ? beauty : beauty * 0.1
	}
	return value
}
function has({ character, age, trait }: TraitHasParams): boolean {
	for (let slot = 0; slot < 3; slot++)
		if (
			age >= 9 + slot * 2 &&
			PERSONALITY[(character.personality >>> (slot * 6)) & 63]?.name === trait
		)
			return true
	return false
}
function stressFactors(params: StressFactorsParams) {
	return {
		gain: Math.max(
			0,
			1 +
				modifier({
					character: params.character,
					age: params.age,
					modifier: "stressGain",
				}) +
				params.conditions.reduce((sum, condition) => sum + condition.gain, 0),
		),
		loss: Math.max(
			0,
			1 +
				modifier({
					character: params.character,
					age: params.age,
					modifier: "stressLoss",
				}) +
				params.conditions.reduce((sum, condition) => sum + condition.loss, 0),
		),
	}
}
function warChance(params: TraitAtParams): number {
	return (
		(1 +
			modifier({
				character: params.character,
				age: params.age,
				modifier: "warChance",
			})) /
		1.11
	)
}
function incomeFactor(params: IncomeParams): number {
	return (
		1 +
		modifier({
			character: params.character,
			age: params.age,
			modifier: "income",
		}) +
		(has({ character: params.character, age: params.age, trait: "greedy" })
			? 0.1 * params.stressLevel
			: 0)
	)
}
function fertility(params: TraitAtParams): number {
	return Math.max(
		0,
		1 +
			modifier({
				character: params.character,
				age: params.age,
				modifier: "fertility",
			}),
	)
}
function visibleCongenital(character: Character): TraitDefinition[] {
	return CONGENITAL.flatMap((row, index) =>
		character.congenital & (1 << index) ? [row] : [],
	)
}
function congenital({ character }: TraitAtParams) {
	return visibleCongenital(character).map((row) => row.name as CongenitalTrait)
}
function labels({ character }: TraitAtParams): string[] {
	const names = {
		intellect: [
			"Imbecile",
			"Stupid",
			"Slow",
			"",
			"Quick",
			"Intelligent",
			"Genius",
		],
		physique: [
			"Feeble",
			"Frail",
			"Delicate",
			"",
			"Hale",
			"Robust",
			"Herculean",
		],
		beauty: [
			"Hideous",
			"Ugly",
			"Homely",
			"",
			"Comely",
			"Handsome",
			"Beautiful",
		],
	}
	return LADDERS.flatMap((ladder) => {
		const value = grade({ character, ladder }).active
		return value === 0 ? [] : [names[ladder][value + 3]]
	})
}
export const TRAITS = {
	congenital,
	labels,
	draw,
	active,
	modifier,
	has,
	stressFactors,
	warChance,
	incomeFactor,
	fertility,
	grade,
}
