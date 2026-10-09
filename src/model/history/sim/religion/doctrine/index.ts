import { MARRIAGE_LAW } from "@/model/history/sim/people/marriage-law"
import type {
	ConsanguinityBar,
	MarriageLaw,
} from "@/model/history/sim/people/marriage-law/types"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { PersonalityTrait } from "@/model/history/sim/people/traits/types"
import type {
	AssignDoctrinesParams,
	DoctrineGroup,
	DoctrineProbabilityParams,
	MarriageLawParams,
	PickParams,
	ReligionDoctrine,
	WeightsParams,
} from "@/model/history/sim/religion/doctrine/types"
import { RNG } from "@/model/shared/random/rng"

const groups: readonly DoctrineGroup[] = [
	{ name: "marriage_type", options: ["monogamy", "polygamy", "concubines"] },
	{ name: "divorce", options: ["disallowed", "approval", "allowed"] },
	{ name: "bastardry", options: ["none", "legitimization"] },
	{
		name: "consanguinity",
		options: [
			"restricted",
			"cousins",
			"aunt_nephew_and_uncle_niece",
			"unrestricted",
		],
	},
	{ name: "homosexuality", options: ["crime", "shunned", "accepted"] },
	{ name: "adultery", options: ["crime", "shunned", "accepted"] },
	{ name: "witchcraft", options: ["crime", "shunned", "accepted"] },
	{
		name: "kinslaying",
		options: [
			"extended_family_crime",
			"close_kin_crime",
			"shunned",
			"accepted",
		],
	},
	{ name: "gender", options: ["male_dominated", "equal"] },
	{
		name: "pluralism",
		options: ["fundamentalist", "righteous", "pluralistic"],
	},
	{ name: "head_of_faith", options: ["none", "spiritual", "temporal"] },
	{ name: "theocracy", options: ["temporal", "lay_clergy"] },
	{
		name: "pilgrimage",
		options: ["forbidden", "encouraged", "local_rites", "mandatory"],
	},
	{
		name: "funeral",
		options: [
			"stoic",
			"bewailment",
			"cremation",
			"sky_burial",
			"mummification",
			"family_rites",
		],
	},
	{
		name: "monasticism",
		options: ["encouraged", "accepted", "absent", "forbidden"],
	},
]
const DOCTRINE_COUNTS = [
	[
		[5, 0, 5, 22, 0],
		[6, 6, 2, 12, 5],
		[28, 1, 5, 3, 3],
	],
	[
		[1, 0, 2, 0, 0],
		[1, 0, 6, 18, 0],
		[37, 7, 4, 19, 8],
	],
	[
		[12, 7, 12, 16, 7],
		[27, 0, 0, 21, 1],
	],
	[
		[1, 5, 1, 0, 3],
		[35, 2, 10, 16, 5],
		[3, 0, 0, 20, 0],
		[0, 0, 1, 1, 0],
	],
	[
		[7, 0, 4, 8, 0],
		[21, 0, 7, 28, 1],
		[11, 7, 1, 1, 7],
	],
	[
		[19, 0, 0, 28, 2],
		[15, 6, 11, 8, 6],
		[5, 1, 1, 1, 0],
	],
	[
		[9, 0, 0, 25, 1],
		[1, 1, 8, 11, 4],
		[29, 6, 4, 1, 3],
	],
	[
		[3, 2, 4, 8, 7],
		[36, 5, 8, 19, 1],
		[0, 0, 0, 1, 0],
		[0, 0, 0, 9, 0],
	],
	[
		[26, 6, 10, 35, 8],
		[13, 1, 2, 2, 0],
	],
	[
		[2, 0, 0, 3, 0],
		[6, 0, 3, 22, 2],
		[31, 7, 9, 12, 6],
	],
	[
		[37, 7, 2, 9, 7],
		[2, 0, 10, 21, 1],
		[0, 0, 0, 7, 0],
	],
	[
		[38, 7, 12, 25, 7],
		[1, 0, 0, 12, 1],
	],
	[
		[1, 0, 0, 2, 0],
		[36, 6, 12, 29, 5],
		[2, 1, 0, 0, 3],
		[0, 0, 0, 6, 0],
	],
	[
		[16, 2, 4, 36, 2],
		[8, 0, 0, 0, 0],
		[9, 5, 0, 1, 5],
		[5, 0, 8, 0, 0],
		[1, 0, 0, 0, 0],
		[0, 0, 0, 0, 1],
	],
	[
		[1, 4, 4, 1, 5],
		[0, 1, 0, 16, 2],
		[38, 2, 0, 20, 1],
		[0, 0, 8, 0, 0],
	],
]
const FLIP_RATE = [
	0.132, 0.044, 0.015, 0.044, 0.088, 0.088, 0.088, 0.044, 0.118, 0.221, 0.294,
	0.044, 0.029, 0, 0.059,
]
const VIRTUE_COUNTS: Partial<Record<PersonalityTrait, number[]>> = {
	brave: [26, 0, 0, 2, 0],
	just: [18, 0, 1, 5, 1],
	honest: [16, 1, 2, 1, 3],
	compassionate: [2, 2, 0, 3, 4],
	humble: [4, 2, 1, 0, 1],
	temperate: [5, 1, 0, 2, 0],
	content: [4, 3, 0, 0, 1],
	generous: [4, 0, 0, 2, 1],
	calm: [4, 0, 0, 0, 2],
	diligent: [5, 0, 1, 0, 0],
	gregarious: [6, 0, 0, 0, 0],
	forgiving: [5, 0, 0, 1, 0],
	patient: [2, 0, 1, 1, 0],
	stubborn: [2, 0, 0, 0, 0],
	chaste: [0, 0, 0, 1, 0],
	wrathful: [1, 0, 0, 0, 0],
	vengeful: [1, 0, 0, 0, 0],
}
const SIN_COUNTS: Partial<Record<PersonalityTrait, number[]>> = {
	craven: [25, 0, 0, 2, 0],
	deceitful: [14, 0, 2, 2, 3],
	arbitrary: [17, 0, 0, 3, 0],
	greedy: [10, 1, 0, 3, 1],
	wrathful: [6, 1, 0, 0, 2],
	arrogant: [5, 2, 1, 0, 1],
	lazy: [5, 0, 1, 0, 1],
	sadistic: [1, 2, 1, 1, 2],
	ambitious: [3, 3, 0, 0, 1],
	vengeful: [4, 0, 0, 1, 0],
	impatient: [2, 0, 1, 0, 1],
	lustful: [1, 0, 0, 2, 0],
	gluttonous: [1, 0, 0, 2, 0],
	shy: [3, 0, 0, 0, 0],
	callous: [1, 0, 0, 1, 0],
	fickle: [2, 0, 0, 0, 0],
	forgiving: [1, 0, 0, 0, 0],
	cynical: [0, 0, 0, 1, 0],
}
const CONDUCT = new Set(["adultery", "homosexuality", "witchcraft"])
const HEAD = groups.findIndex((group) => group.name === "head_of_faith")
const CLERGY = groups.findIndex((group) => group.name === "theocracy")
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
}: AssignDoctrinesParams): ReligionDoctrine {
	const width = groups.length
	const familyOptions = new Uint8Array(familyCount * width)
	const options = new Uint8Array(religionTypes.length * width)
	const familyVirtues: PersonalityTrait[][] = []
	const familySins: PersonalityTrait[][] = []
	const familyTypes = new Uint8Array(familyCount)
	for (let religion = 0; religion < religionTypes.length; religion++)
		familyTypes[religionFamilies[religion]] = religionTypes[religion]
	const probabilities = Array.from({ length: 5 }, (_, type) =>
		DOCTRINE_COUNTS.map((counts) => weights({ counts, type })),
	)
	const conditionalClergy = Array.from({ length: 5 }, (_, type) =>
		weights({
			counts: [
				[38, 7, 12, 25, 7],
				[1, 0, 0, 5, 1],
			],
			type,
		}),
	)
	const virtueTraits = Object.keys(VIRTUE_COUNTS) as PersonalityTrait[]
	const sinTraits = [
		...new Set([
			...(Object.keys(SIN_COUNTS) as PersonalityTrait[]),
			...virtueTraits.flatMap((trait) => TRAITS.opposites({ trait })),
		]),
	]
	for (let family = 0; family < familyCount; family++) {
		const type = familyTypes[family]
		const rng = RNG.createRng({ seed: seed + 7411 + family * 8191 })
		const shared = rng.random()
		for (let group = 0; group < width; group++) {
			const own = rng.random(),
				coin = rng.random()
			const roll = CONDUCT.has(groups[group].name) && coin < 0.55 ? shared : own
			const temporal = familyOptions[family * width + HEAD] === 2
			familyOptions[family * width + group] =
				group === CLERGY
					? temporal
						? 1
						: pick({ weights: conditionalClergy[type], roll })
					: pick({ weights: probabilities[type][group], roll })
		}
		const traitRng = RNG.createRng({ seed: seed + 7413 + family * 8191 })
		const virtueWeights = weights({
			counts: virtueTraits.map((trait) => VIRTUE_COUNTS[trait]!),
			type,
		})
		const sinWeights = weights({
			counts: sinTraits.map((trait) => SIN_COUNTS[trait] ?? [0, 0, 0, 0, 0]),
			type,
		})
		const virtues: PersonalityTrait[] = [],
			sins: PersonalityTrait[] = []
		for (let slot = 0; slot < 3; slot++) {
			const eligible = virtueTraits.filter(
				(trait) =>
					!virtues.some(
						(virtue) =>
							virtue === trait ||
							TRAITS.opposites({ trait: virtue }).includes(trait),
					),
			)
			virtues.push(
				eligible[
					pick({
						weights: eligible.map(
							(trait) => virtueWeights[virtueTraits.indexOf(trait)],
						),
						roll: traitRng.random(),
					})
				],
			)
		}
		for (const virtue of virtues) {
			const coin = traitRng.random(),
				roll = traitRng.random()
			const eligible = sinTraits.filter(
				(trait) => !virtues.includes(trait) && !sins.includes(trait),
			)
			const opposites = TRAITS.opposites({ trait: virtue }).filter((trait) =>
				eligible.includes(trait),
			)
			const candidates = coin < 0.82 && opposites.length ? opposites : eligible
			sins.push(
				candidates[
					pick({
						weights: candidates.map(
							(trait) => sinWeights[sinTraits.indexOf(trait)],
						),
						roll,
					})
				],
			)
		}
		familyVirtues.push(virtues)
		familySins.push(sins)
	}
	const virtues: PersonalityTrait[][] = [],
		sins: PersonalityTrait[][] = []
	for (let religion = 0; religion < religionTypes.length; religion++) {
		const family = religionFamilies[religion],
			type = religionTypes[religion]
		const rng = RNG.createRng({ seed: seed + 7412 + religion * 8191 })
		for (let group = 0; group < width; group++) {
			const attempt = rng.random() < FLIP_RATE[group],
				roll = rng.random()
			const original = familyOptions[family * width + group]
			const temporal = options[religion * width + HEAD] === 2
			options[religion * width + group] =
				group === CLERGY && temporal
					? 1
					: attempt
						? pick({
								weights: probabilities[type][group].map((weight, index) =>
									index === original ? 0 : weight,
								),
								roll,
							})
						: original
		}
		virtues.push(familyVirtues[family])
		sins.push(familySins[family])
	}
	return { options, familyOptions, virtues, sins }
}
function probabilities({ group, type }: DoctrineProbabilityParams): number[] {
	return weights({ counts: DOCTRINE_COUNTS[group], type })
}

function marriageLaw({ doctrine, religion }: MarriageLawParams): MarriageLaw {
	if (
		!doctrine ||
		religion < 0 ||
		religion * groups.length >= doctrine.options.length
	)
		return MARRIAGE_LAW.defaultLaw
	const marriage =
		doctrine.options[
			religion * groups.length +
				groups.findIndex((group) => group.name === "marriage_type")
		]
	const group = groups.findIndex((group) => group.name === "consanguinity")
	return {
		consort: marriage === 1 ? "wife" : marriage === 2 ? "concubine" : "none",
		consortMax: marriage === 0 ? 0 : 3,
		bar: groups[group].options[
			doctrine.options[religion * groups.length + group]
		] as ConsanguinityBar,
	}
}
export const RELIGION_DOCTRINE = { groups, assign, probabilities, marriageLaw }
