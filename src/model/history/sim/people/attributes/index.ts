import type {
	Attribute,
	AttributeDrawParams,
	AttributeTier,
	BaseParams,
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
	diplomacy: 5.5,
	martial: 5.4,
	stewardship: 5.4,
	intrigue: 5.7,
	learning: 6.0,
	prowess: 5,
}
function draw({ table, person }: AttributeDrawParams) {
	const seed = table.nameSeed[person]
	let bases = 0
	const father = table.father[person]
	const mother = table.mother[person]
	const founders = father < 0 && mother < 0
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
	}
	return { bases }
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
			: value <= 10
				? "Average"
				: value <= 13
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
}
