import type {
	AssignGenderParams,
	PickParams,
	WeightsParams,
} from "@/model/history/sim/religion/gender/types"
import { HASH } from "@/model/shared/random/hash"

const preference = {
	MALE_DOMINATED: 0,
	EQUAL: 1,
} as const

const GENDER_COUNTS = [
	[26, 6, 10, 35, 8],
	[13, 1, 2, 2, 0],
]
const FLIP_RATE = 0.118
// Hash channels of the family draw and of the per-religion flip draws.
const FAMILY_CHANNEL = 7415
const FLIP_CHANNEL = 7416

function weights({ counts, type }: WeightsParams): number[] {
	const totals = counts.reduce((sum, row) => sum + row[type], 0)
	const pooledTotal = counts.reduce(
		(sum, row) => sum + row.reduce((a, b) => a + b, 0),
		0,
	)
	return counts.map(
		(row) =>
			(row[type] + row.reduce((a, b) => a + b, 0) / pooledTotal) / (totals + 1),
	)
}

function pick({ weights, roll }: PickParams): number {
	const total = weights.reduce((a, b) => a + b, 0)
	if (total === 0)
		return Math.min(weights.length - 1, Math.floor(roll * weights.length))
	let remaining = roll * total
	for (let index = 0; index < weights.length; index++) {
		remaining -= weights[index]
		if (remaining < 0) return index
	}
	return weights.length - 1
}

function assign({
	religionTypes,
	religionFamilies,
	familyCount,
	seed,
}: AssignGenderParams): Uint8Array {
	const probabilities = Array.from({ length: 5 }, (_, type) =>
		weights({ counts: GENDER_COUNTS, type }),
	)
	const familyTypes = new Uint8Array(familyCount)
	for (let religion = 0; religion < religionTypes.length; religion++)
		familyTypes[religionFamilies[religion]] = religionTypes[religion]
	const familyPreference = new Uint8Array(familyCount)
	for (let family = 0; family < familyCount; family++)
		familyPreference[family] = pick({
			weights: probabilities[familyTypes[family]],
			roll: HASH.unit({ seed, channel: FAMILY_CHANNEL, salt: family }),
		})
	const result = new Uint8Array(religionTypes.length)
	for (let religion = 0; religion < religionTypes.length; religion++) {
		const attempt =
			HASH.unit({ seed, channel: FLIP_CHANNEL, salt: religion * 2 }) < FLIP_RATE
		const roll = HASH.unit({
			seed,
			channel: FLIP_CHANNEL,
			salt: religion * 2 + 1,
		})
		const original = familyPreference[religionFamilies[religion]]
		result[religion] = attempt
			? pick({
					weights: probabilities[religionTypes[religion]].map(
						(weight, index) => (index === original ? 0 : weight),
					),
					roll,
				})
			: original
	}
	return result
}

export const RELIGION_GENDER = { preference, assign }
