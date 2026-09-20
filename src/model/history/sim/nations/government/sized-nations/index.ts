import type {
	AssignSizedNationsParams,
	NationScoreParams,
	RankedNation,
} from "@/model/history/sim/nations/government/sized-nations/types"
import { RNG } from "@/model/shared/random/rng"
import { DEJURE } from "@/model/society/dejure"
import { ERAS } from "@/model/society/eras"

const TRIBAL = ERAS.governmentTypes.indexOf("tribal_government")
const FEUDAL = ERAS.governmentTypes.indexOf("feudal_government")
const BUREAUCRATIC = ERAS.governmentTypes.indexOf("bureaucratic_government")
const GUARANTEED_BUREAUCRATIC_SIZE = 50
const TRIBAL_JITTER = 0.05

function meanOver({ members, values }: NationScoreParams): number {
	let sum = 0
	for (let i = 0; i < members.length; i++) sum += values[members[i]]
	return members.length > 0 ? sum / members.length : 0
}

function rankDescending(ranked: RankedNation[]): number[] {
	return ranked
		.sort((a, b) => b.score - a.score || a.nation - b.nation)
		.map((entry) => entry.nation)
}

function assign({
	sizeShares,
	sizes,
	seeds,
	nationMembers,
	urbanPop,
	habitability,
	waterAccess,
	migrationWave,
	seed,
}: AssignSizedNationsParams): Uint8Array {
	const nationCount = sizes.length
	const result = new Uint8Array(nationCount).fill(FEUDAL)
	const provinceCount = habitability.length
	const seatScore = new Float32Array(provinceCount)
	const wave = new Float32Array(provinceCount)
	const water = new Float32Array(provinceCount)
	for (let p = 0; p < provinceCount; p++) {
		seatScore[p] = DEJURE.seatScore({
			province: p,
			habitability,
			urbanPop,
			waterAccess,
		})
		wave[p] = Math.max(0, migrationWave?.[p] ?? 0)
		water[p] = waterAccess[p] / 2
	}

	const buckets: number[][] = sizeShares.map((): number[] => [])
	for (let nation = 0; nation < nationCount; nation++) {
		const row = sizeShares.findIndex((share) => sizes[nation] <= share.maxSize)
		buckets[row >= 0 ? row : sizeShares.length - 1].push(nation)
	}
	const hasGuaranteedSize = sizes.some(
		(size) => size >= GUARANTEED_BUREAUCRATIC_SIZE,
	)
	let lastBureaucraticRow = -1
	sizeShares.forEach((share, row) => {
		if (share.bureaucratic > 0) lastBureaucraticRow = row
	})

	const bureaucratic = new Set<number>()
	for (let row = 0; row < sizeShares.length; row++) {
		const { bureaucratic: share } = sizeShares[row]
		if (share <= 0) continue
		let quota = Math.round(share * buckets[row].length)
		if (row === lastBureaucraticRow && hasGuaranteedSize)
			quota = Math.max(quota, 1)
		const ranked = rankDescending(
			buckets[row].map((nation) => ({
				nation,
				score:
					meanOver({ members: nationMembers[nation], values: seatScore }) -
					meanOver({ members: nationMembers[nation], values: wave }),
			})),
		)
		for (let i = 0; i < Math.min(quota, ranked.length); i++) {
			bureaucratic.add(ranked[i])
			result[ranked[i]] = BUREAUCRATIC
		}
	}

	for (let row = 0; row < sizeShares.length; row++) {
		const remaining = buckets[row].filter((nation) => !bureaucratic.has(nation))
		const tribalCount = Math.min(
			Math.round(sizeShares[row].tribal * buckets[row].length),
			remaining.length,
		)
		const ranked = rankDescending(
			remaining.map((nation) => {
				const members = nationMembers[nation]
				const jitter = RNG.createRng({ seed: seed + seeds[nation] * 7919 })
				return {
					nation,
					score:
						meanOver({ members, values: wave }) +
						1 -
						meanOver({ members, values: habitability }) -
						meanOver({ members, values: water }) +
						jitter.random() * TRIBAL_JITTER,
				}
			}),
		)
		for (let i = 0; i < tribalCount; i++) result[ranked[i]] = TRIBAL
	}
	return result
}

export const SIZED_NATIONS = {
	assign,
}
