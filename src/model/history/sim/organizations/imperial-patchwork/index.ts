import {
	SHATTER_PATCHWORK,
	type ShatterPatchworkResult,
} from "@/model/history/sim/organizations/shatter-patchwork"
import type { GenesisProvinces } from "@/model/society/types"

export interface ImperialPatchworkParams {
	provinces: GenesisProvinces
	/** Mutated in place: territory reassigned from the shattered nation to its
	 * new member nations. */
	assignment: Int32Array
	/** Mutated in place: new member nations are appended. The shattered
	 * nation's own entry is zeroed to size 0 (left for the caller to compact). */
	seeds: number[]
	sizes: number[]
	habitability: Float32Array
	waterAccess: Uint8Array
	r_xyz: Float32Array
	migrationWave: Float32Array | undefined
	provinceContinent: Uint8Array | undefined
	maxSpreadRad: number
	seed: number
}

export type ImperialPatchworkResult = ShatterPatchworkResult

/** Below this province count a "shattered empire" reads as noise, not a
 * patchwork -- skip rather than produce a handful of trivial fragments. */
const MIN_TERRITORY_SIZE = 15

// Skewed heavily toward [1,1] -- against a real HRE member-list reference,
// too few members overall (and too small an Imperial Prince share) came out
// of a flatter split. More single-province members both raises the total
// member count toward HRE's ~80 subjects and grows every size-1-derived
// category (Free City, singleton Imperial Princes) relative to the mid-size
// buckets.
const MEMBER_BUCKETS = [
	{ min: 1, max: 1, fraction: 0.55 },
	{ min: 2, max: 4, fraction: 0.28 },
	{ min: 5, max: 9, fraction: 0.12 },
	{ min: 10, max: 24, fraction: 0.05 },
]

/**
 * Picks the single largest settled (migrationWave >= 0) nation and shatters
 * it into an HRE-style patchwork (every member, including whichever ends up
 * largest and becomes the Emperor, capped at 24 provinces -- no reserved
 * larger "emperor domain"). See shatter-patchwork's doc comment for the
 * shared mechanics.
 */
function buildImperialPatchwork(
	params: ImperialPatchworkParams,
): ImperialPatchworkResult | null {
	if (!params.migrationWave) return null
	const migrationWave = params.migrationWave

	return SHATTER_PATCHWORK.shatterPatchwork({
		...params,
		seedSalt: 0x0decaf00,
		minTerritorySize: MIN_TERRITORY_SIZE,
		memberBuckets: MEMBER_BUCKETS,
		findEligibleNation: ({ seeds, sizes }) => {
			let targetNation = -1
			let targetSize = -1
			for (let i = 0; i < seeds.length; i++) {
				if (sizes[i] < MIN_TERRITORY_SIZE) continue
				const wave = migrationWave[seeds[i]]
				if (wave < 0) continue
				if (sizes[i] > targetSize) {
					targetSize = sizes[i]
					targetNation = i
				}
			}
			return targetNation
		},
	})
}

export const IMPERIAL_PATCHWORK = {
	buildImperialPatchwork,
}
