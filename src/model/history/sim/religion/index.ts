import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import type {
	AssignReligionTypesParams,
	ComputeReligionFamiliesParams,
	ComputeReligionsParams,
} from "@/model/history/sim/religion/types"
import type { GenesisPartition } from "@/model/society/types"

const religionTypeNames = [
	"Animistic",
	"Polytheistic",
	"Dualistic",
	"Monotheistic",
	"Non-theistic",
] as const

const religionTypeColors: readonly (readonly [number, number, number])[] = [
	[0.401, 0.839, 0.401], // 0: animistic
	[1.0, 0.691, 0.42], // 1: polytheistic
	[0.336, 0.732, 0.864], // 2: dualistic
	[0.478, 0.61, 0.782], // 3: monotheistic
	[0.908, 0.848, 0.652], // 4: non-theistic
]

const ERA_TYPE_WEIGHTS = {
	paleolithic: [84.0, 9.7, 0.7, 5.4, 0.3],
	neolithic: [79.8, 10.1, 0.9, 8.7, 0.5],
	bronze: [59.6, 10.3, 1.5, 24.5, 4.1],
	iron: [50.0, 10.0, 1.8, 30.9, 7.3],
	lateMedieval: [34.7, 9.3, 2.2, 40.5, 13.2],
	earlyModern: [34.4, 8.9, 2.1, 40.6, 14.0],
	industrial: [9.6, 6.3, 2.0, 50.0, 32.1],
	information: [2.5, 3.5, 1.2, 43.1, 49.7],
}

const CULTURES_PER_RELIGION = 6
const RELIGIONS_PER_FAMILY = 3

function computeReligions({
	cultures,
	seed,
}: ComputeReligionsParams): GenesisPartition {
	const active = new Uint8Array(cultures.count)
	let activeCount = 0
	for (let i = 0; i < cultures.count; i++) {
		if (cultures.size[i] > 0) {
			active[i] = 1
			activeCount++
		}
	}
	// Border-bleed stripes are computed at province level (not here, over the
	// culture graph) once religionTypes is known -- see derive-province-society,
	// which has provinces.adjOffset/adjList available. Blending over this
	// culture-graph partition would bleed entire culture regions into a
	// neighboring religion instead of just the border provinces.
	return GRAPH_PARTITION.computeGraphPartition({
		nodeCount: cultures.count,
		adjOffset: cultures.adjOffset,
		adjList: cultures.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / CULTURES_PER_RELIGION)),
		seed: seed + 4104,
	})
}

function computeReligionFamilies({
	religions,
	seed,
}: ComputeReligionFamiliesParams): GenesisPartition {
	const active = new Uint8Array(religions.count)
	let activeCount = 0
	for (let religion = 0; religion < religions.count; religion++) {
		if (religions.size[religion] > 0) {
			active[religion] = 1
			activeCount++
		}
	}
	return GRAPH_PARTITION.computeGraphPartition({
		nodeCount: religions.count,
		adjOffset: religions.adjOffset,
		adjList: religions.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / RELIGIONS_PER_FAMILY)),
		seed: seed + 6281,
	})
}

function assignReligionTypes(params: AssignReligionTypesParams): Uint8Array {
	const {
		religionCount,
		religionFamilies,
		religionFamilyCount,
		cultureToReligion,
		cultureCount,
		provinceCount,
		cultureAssignment,
		era,
		migrationWave,
		seed,
	} = params

	const familyMigSum = new Float32Array(religionFamilyCount)
	const familyProvCount = new Int32Array(religionFamilyCount)

	for (let p = 0; p < provinceCount; p++) {
		const culture = cultureAssignment[p]
		if (culture < 0 || culture >= cultureCount) continue
		const religion = cultureToReligion[culture]
		if (religion < 0 || religion >= religionCount) continue
		const family = religionFamilies[religion]
		if (family < 0 || family >= religionFamilyCount) continue
		familyMigSum[family] += migrationWave?.[p] ?? 0.5
		familyProvCount[family]++
	}

	const result = new Uint8Array(religionCount)
	const familyTypes = new Uint8Array(religionFamilyCount)
	const prior = new Float32Array(religionTypeNames.length)

	for (let family = 0; family < religionFamilyCount; family++) {
		const count = familyProvCount[family]
		const avgMig = count > 0 ? familyMigSum[family] / count : 0.5

		prior.set(ERA_TYPE_WEIGHTS[era])
		if (avgMig > 0.55) {
			const s = (avgMig - 0.55) / 0.45
			prior[0] *= 1 + s * 2.0
			prior[3] *= Math.max(0.3, 1 - s)
		} else if (avgMig < 0.25) {
			const s = (0.25 - avgMig) / 0.25
			prior[3] *= 1 + s * 0.8
			prior[1] *= 1 + s * 0.5
			prior[0] *= Math.max(0.4, 1 - s * 0.5)
		}

		let total = 0
		for (let type = 0; type < religionTypeNames.length; type++) {
			total += prior[type]
		}
		if (total <= 0) total = 1

		let familySeed = ((seed + 9337) ^ (family * 2654435761)) >>> 0
		familySeed ^= familySeed >>> 16
		familySeed = Math.imul(familySeed, 0x45d9f3b)
		familySeed ^= familySeed >>> 16
		const r = ((familySeed >>> 0) / 0xffffffff) * total

		let cumulative = 0
		let chosen = 0
		for (let type = 0; type < religionTypeNames.length; type++) {
			cumulative += prior[type]
			if (r < cumulative) {
				chosen = type
				break
			}
			chosen = type
		}
		familyTypes[family] = chosen
	}

	for (let religion = 0; religion < religionCount; religion++) {
		const family = religionFamilies[religion]
		if (family >= 0 && family < religionFamilyCount) {
			result[religion] = familyTypes[family]
		}
	}

	return result
}

export const RELIGION = {
	religionTypeNames,
	religionTypeColors,
	computeReligions,
	computeReligionFamilies,
	assignReligionTypes,
}
