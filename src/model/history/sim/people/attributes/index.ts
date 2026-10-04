import type {
	Attribute,
	AttributeDrawParams,
	AttributeTier,
	BaseParams,
	Education,
	EducationParams,
	EffectiveParams,
} from "@/model/history/sim/people/attributes/types"
import { TRAITS } from "@/model/history/sim/people/traits"
import { HASH } from "@/model/shared/random/hash"

const NAMES = [
	"diplomacy",
	"martial",
	"stewardship",
	"intrigue",
	"learning",
	"prowess",
] as const
const NEUTRAL = {
	diplomacy: 6.3,
	martial: 6.2,
	stewardship: 6.2,
	intrigue: 6.5,
	learning: 6.8,
	prowess: 5,
}
function draw({ table, person, character }: AttributeDrawParams) {
	const seed = table.nameSeed[person]
	let bases = 0
	const father = table.father[person]
	const mother = table.mother[person]
	const founders = father < 0 && mother < 0
	let best = -1
	const focuses: number[] = []
	for (let index = 0; index < NAMES.length; index++) {
		const u = HASH.unit({ seed, channel: 1 + index, salt: 0 })
		const mid =
			((father < 0 ? 5 : (table.bases[father] >>> (index * 4)) & 15) +
				(mother < 0 ? 5 : (table.bases[mother] >>> (index * 4)) & 15)) /
			2
		const value = founders
			? Math.floor(11 * u)
			: Math.max(
					0,
					Math.min(10, Math.round(5 + 0.5 * (mid - 5) + (2 * u - 1) * 5.1)),
				)
		bases |= value << (index * 4)
		if (index >= 5) continue
		if (value > best) {
			best = value
			focuses.length = 0
		}
		if (value === best) focuses.push(index)
	}
	const focus =
		focuses[
			Math.floor(HASH.unit({ seed, channel: 10, salt: 0 }) * focuses.length)
		]
	const intellect = TRAITS.grade({ character, ladder: "intellect" }).active
	const bonus = [0, 10, 15, 20][Math.abs(intellect)]
	const success = 60 + (intellect > 0 ? bonus : 0)
	const failure = 60 + (intellect < 0 ? bonus : 0)
	let successes = 0
	for (let i = 0; i < 10; i++)
		if (
			HASH.unit({ seed, channel: 20 + i, salt: 0 }) <
			success / (success + failure)
		)
			successes++
	const level = successes <= 3 ? 1 : successes <= 6 ? 2 : successes <= 8 ? 3 : 4
	return { bases, education: focus | (level << 3) }
}
function education({ character }: EducationParams): Education {
	return {
		focus: NAMES[character.education & 7] as Education["focus"],
		level: (character.education >>> 3) as Education["level"],
	}
}
function base({ character, attribute }: BaseParams): number {
	return (character.bases >>> (NAMES.indexOf(attribute) * 4)) & 15
}
function effective({
	character,
	attribute,
	age,
	conditions,
}: EffectiveParams): number {
	let value = base({ character, attribute })
	const focus = NAMES[character.education & 7]
	const level = character.education >>> 3
	if (age >= 16) {
		if (focus === attribute) value += 2 * level
		if (attribute === "prowess" && focus === "martial") value += level
	}
	if (conditions.some((condition) => condition.incapable)) return 0
	value += TRAITS.modifier({ character, age, modifier: attribute })
	let percentage = 0
	for (const condition of conditions) {
		value += condition.additions[attribute]
		percentage += condition.percentages[attribute]
	}
	return Math.max(0, value * Math.max(0, 1 + percentage))
}
function tier(value: number): AttributeTier {
	return value <= 4
		? "Terrible"
		: value <= 8
			? "Poor"
			: value <= 12
				? "Average"
				: value <= 16
					? "Good"
					: "Excellent"
}
function neutral(attribute: Attribute): number {
	return NEUTRAL[attribute]
}
export const ATTRIBUTES = {
	base,
	draw,
	effective,
	tier,
	neutral,
	education,
}
