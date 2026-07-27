import { GRAPH_PARTITION } from "@/model/society/graph-partition"
import type { ComputeReligionsParams } from "@/model/society/religion/types"
import type { GenesisPartition } from "@/model/society/types"

const religionTypeNames = [
	"Animistic",
	"Polytheistic",
	"Dualistic",
	"Monotheistic",
	"Non-theistic",
	"Non-religious",
	"Syncretic",
] as const

const religionTypeColors: readonly (readonly [number, number, number])[] = [
	[0.401, 0.839, 0.401], // 0: animistic
	[1.0, 0.691, 0.42], // 1: polytheistic
	[0.336, 0.732, 0.864], // 2: dualistic
	[0.478, 0.61, 0.782], // 3: monotheistic
	[0.908, 0.848, 0.652], // 4: non-theistic
	[1.0, 0.44, 0.44], // 5: non-religious
	[0.392, 0.628, 0.526], // 6: syncretic
]

const GOV_PRIORS: readonly (readonly number[])[] = [
	//  anim  poly  dual  mono   nth  ath  sync
	[50, 15, 4, 5, 2, 1, 17], // tribal
	[1, 12, 12, 33, 27, 1, 14], // monarchy
	[1, 5, 8, 24, 43, 8, 19], // republic
	[1, 2, 14, 54, 12, 1, 11], // theocracy
]

const INDUSTRIAL_SIZE_WEIGHT_MAX = 0.3

function govTypeToCategory(gov: number): number {
	if (gov <= 3) return 0 // tribal
	if (gov <= 7) return 1 // monarchy
	if (gov <= 12 || gov === 17 || gov === 18) return 2 // republic
	if (gov <= 16) return 3 // theocracy
	return 2 // colonial → republic-ish
}

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
	return GRAPH_PARTITION.computeGraphPartition({
		nodeCount: cultures.count,
		adjOffset: cultures.adjOffset,
		adjList: cultures.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 4)),
		seed: seed + 4104,
	})
}

function assignReligionTypes(params: {
	religionCount: number
	cultureToReligion: Int32Array
	cultureCount: number
	provinceCount: number
	cultureAssignment: Int32Array
	governmentType?: Uint8Array
	migrationWave?: Float32Array
	/** 1.0 = ancient era, 0.0 = information era */
	sizeWeight: number
	seed: number
}): Uint8Array {
	const {
		religionCount,
		cultureToReligion,
		cultureCount,
		provinceCount,
		cultureAssignment,
		governmentType,
		migrationWave,
		sizeWeight,
		seed,
	} = params

	const religionGovSum = new Float32Array(religionCount)
	const religionMigSum = new Float32Array(religionCount)
	const religionProvCount = new Int32Array(religionCount)

	for (let p = 0; p < provinceCount; p++) {
		const culture = cultureAssignment[p]
		if (culture < 0 || culture >= cultureCount) continue
		const religion = cultureToReligion[culture]
		if (religion < 0 || religion >= religionCount) continue
		religionGovSum[religion] += govTypeToCategory(governmentType?.[p] ?? 0)
		religionMigSum[religion] += migrationWave?.[p] ?? 0.5
		religionProvCount[religion]++
	}

	const eraAncient = Math.max(0, Math.min(1, (sizeWeight - 0.55) / 0.45))
	const eraModern = Math.max(0, Math.min(1, (0.4 - sizeWeight) / 0.4))

	const result = new Uint8Array(religionCount)
	const prior = new Float32Array(7)

	for (let religion = 0; religion < religionCount; religion++) {
		const count = religionProvCount[religion]
		const avgGov = count > 0 ? religionGovSum[religion] / count : 1.0
		const avgMig = count > 0 ? religionMigSum[religion] / count : 0.5

		const gFloor = Math.min(3, Math.floor(avgGov))
		const gCeil = Math.min(3, gFloor + 1)
		const gFrac = avgGov - gFloor
		const rowA = GOV_PRIORS[gFloor]
		const rowB = GOV_PRIORS[gCeil]
		for (let type = 0; type < 7; type++) {
			prior[type] = rowA[type] * (1 - gFrac) + rowB[type] * gFrac
		}
		if (avgMig > 0.55) {
			const s = (avgMig - 0.55) / 0.45
			prior[0] *= 1 + s * 2.0
			prior[6] *= 1 + s * 1.0
			prior[3] *= Math.max(0.3, 1 - s)
		} else if (avgMig < 0.25) {
			const s = (0.25 - avgMig) / 0.25
			prior[3] *= 1 + s * 0.8
			prior[1] *= 1 + s * 0.5
			prior[0] *= Math.max(0.4, 1 - s * 0.5)
		}

		if (eraAncient > 0) {
			prior[0] *= 1 + eraAncient * 1.5
			prior[1] *= 1 + eraAncient * 0.8
			prior[4] *= Math.max(0.2, 1 - eraAncient)
			prior[5] *= Math.max(0.1, 1 - eraAncient)
		}
		if (eraModern > 0) {
			prior[4] *= 1 + eraModern * 2.5
			prior[5] *= 1 + eraModern * 3.0
			prior[0] *= Math.max(0.1, 1 - eraModern * 0.8)
		}
		if (sizeWeight > INDUSTRIAL_SIZE_WEIGHT_MAX) {
			prior[5] = 0
		}

		let total = 0
		for (let type = 0; type < 7; type++) total += prior[type]
		if (total <= 0) total = 1

		let religionSeed = ((seed + 9337) ^ (religion * 2654435761)) >>> 0
		religionSeed ^= religionSeed >>> 16
		religionSeed = Math.imul(religionSeed, 0x45d9f3b)
		religionSeed ^= religionSeed >>> 16
		const r = ((religionSeed >>> 0) / 0xffffffff) * total

		let cumulative = 0
		let chosen = 0
		for (let type = 0; type < 7; type++) {
			cumulative += prior[type]
			if (r < cumulative) {
				chosen = type
				break
			}
			chosen = type
		}
		result[religion] = chosen
	}

	return result
}

function buildReligionColors(params: {
	religionCount: number
	religionTypes: Uint8Array
}): Float32Array {
	const { religionCount, religionTypes } = params
	const colors = new Float32Array(religionCount * 3)
	const groups = new Map<number, number[]>()

	for (let religion = 0; religion < religionCount; religion++) {
		const type = religionTypes[religion] ?? 0
		const siblings = groups.get(type)
		if (siblings) siblings.push(religion)
		else groups.set(type, [religion])
	}

	for (const [type, siblings] of groups) {
		const [r, g, b] = religionTypeColors[type] ?? religionTypeColors[0]
		for (const religion of siblings) {
			colors[3 * religion] = r
			colors[3 * religion + 1] = g
			colors[3 * religion + 2] = b
		}
	}

	return colors
}

export const RELIGION = {
	religionTypeNames,
	religionTypeColors,
	computeReligions,
	assignReligionTypes,
	buildReligionColors,
}
