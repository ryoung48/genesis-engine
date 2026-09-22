import { GOVERNMENT } from "@/model/history/sim/nations/government"
import {
	SHATTER_PATCHWORK,
	type ShatterPatchworkResult,
} from "@/model/history/sim/organizations/shatter-patchwork"
import type { GenesisProvinces, GovernmentMix } from "@/model/society/types"

export interface TradeLeagueParams {
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
	/** Used only to probe each candidate nation's likely government family
	 * (via GOVERNMENT.assignGovernmentType) when picking a coastal, non-tribal
	 * nation to shatter -- the real, authoritative government for every final
	 * nation (including the new Trade League members this produces) is
	 * still assigned once, later, by the caller's own normal pass. */
	governmentMix: GovernmentMix
	governmentSizeWeight: number
	statehoodFraction: number
	/** [JUSTIFICATION] only eras that cap republic size supply this; others leave it unset */
	maxRepublicSize?: number
	/** [JUSTIFICATION] only eras that cap theocracy size supply this; others leave it unset */
	maxTheocracySize?: number
	/** Nation indices already belonging to some other organization (Imperial
	 * Patchwork, or an earlier Trade League placed this same call) -- never
	 * eligible to be shattered again. */
	excludeNations?: ReadonlySet<number>
}

export type TradeLeagueResult = ShatterPatchworkResult

/** Below this province count a shattered nation reads as noise, not a
 * league -- skip rather than produce a handful of trivial fragments. */
const MIN_TERRITORY_SIZE = 15

/** Members should read as individual trade cities, not princedoms -- capped
 * well under Imperial Patchwork's 24, and skewed even harder toward [1,1]. */
const MEMBER_BUCKETS = [
	{ min: 1, max: 1, fraction: 0.6 },
	{ min: 2, max: 4, fraction: 0.3 },
	{ min: 5, max: 9, fraction: 0.1 },
]

/** Below this the target is preferred over a larger one -- a trade league
 * forming out of an empire-scale nation reads wrong; a modest coastal trade
 * city/small confederacy is the better source. Only exceeded when no
 * eligible nation under this size exists. */
const PREFERRED_MAX_SIZE = 50

/**
 * Picks a coastal, non-tribal nation (majority of its provinces have ocean
 * water access, size >= MIN_TERRITORY_SIZE) and shatters it into a flat,
 * non-hierarchical patchwork of small trade-city members (all capped under
 * 10 provinces -- unlike Imperial Patchwork, there's no reserved larger
 * "leading" domain and no elector-style ranks; membership government types
 * are left to the caller's normal pass, not forced toward any family). Prefers
 * the largest eligible nation under PREFERRED_MAX_SIZE, falling back to the
 * largest eligible nation overall only if none qualifies under that cap.
 * Call again after the caller compacts/remaps to place additional leagues --
 * each call only sees whatever's still standing, so a previous call's fully
 * consumed target (and its new, size-capped members, all below
 * MIN_TERRITORY_SIZE) can't be picked again. See shatter-patchwork's doc
 * comment for the shared mechanics.
 */
function buildTradeLeague(params: TradeLeagueParams): TradeLeagueResult | null {
	const {
		provinces,
		assignment,
		habitability,
		waterAccess,
		migrationWave,
		provinceContinent,
		governmentMix,
		governmentSizeWeight,
		statehoodFraction,
		maxRepublicSize,
		maxTheocracySize,
		seed,
		excludeNations,
	} = params

	// Per-nation {coastal, total} province counts, computed once per call --
	// O(provinceCount) instead of rescanning per candidate.
	const totalByNation = new Map<number, number>()
	const coastalByNation = new Map<number, number>()
	for (let p = 0; p < provinces.count; p++) {
		const n = assignment[p]
		if (n < 0) continue
		totalByNation.set(n, (totalByNation.get(n) ?? 0) + 1)
		if ((waterAccess[p] ?? 0) >= 2) {
			coastalByNation.set(n, (coastalByNation.get(n) ?? 0) + 1)
		}
	}

	const isEligible = (
		i: number,
		seeds: readonly number[],
		sizes: readonly number[],
		coastalThreshold: number,
	) => {
		if (excludeNations?.has(i)) return false
		if (sizes[i] < MIN_TERRITORY_SIZE) return false
		// A Trade League reads wrong seeded from a small island nation -- its
		// capital must sit on a continent landmass (provinceContinent is only
		// tracked when the caller models one; skipped entirely otherwise).
		if (provinceContinent && !provinceContinent[seeds[i]]) return false
		const total = totalByNation.get(i) ?? 0
		const coastal = coastalByNation.get(i) ?? 0
		if (total === 0 || coastal / total <= coastalThreshold) return false
		// Cheap probe -- doesn't commit this as the nation's final government,
		// just checks whether it'd plausibly land on tribal under the era's
		// normal mix. Any settled government (republic, monarchy, theocracy)
		// is an eligible Trade League seed -- only tribal isn't, a stateless
		// frontier polity doesn't found a merchant confederation.
		const probedGovType = GOVERNMENT.assignGovernmentType({
			nationIndex: i,
			capitalProvince: seeds[i],
			nationSize: sizes[i],
			eraMix: governmentMix,
			sizeWeight: governmentSizeWeight,
			habitability,
			waterAccess,
			migrationWave,
			statehoodFraction,
			seed,
			maxRepublicSize,
			maxTheocracySize,
		})
		return GOVERNMENT.govFamilyOfIndex(probedGovType) !== "tribal"
	}

	const pickLargestEligible = (
		seeds: readonly number[],
		sizes: readonly number[],
		sizeLimit: number | null,
		coastalThreshold: number,
	): number => {
		let targetNation = -1
		let targetSize = -1
		for (let i = 0; i < seeds.length; i++) {
			if (sizeLimit !== null && sizes[i] >= sizeLimit) continue
			if (!isEligible(i, seeds, sizes, coastalThreshold)) continue
			if (sizes[i] > targetSize) {
				targetSize = sizes[i]
				targetNation = i
			}
		}
		return targetNation
	}

	return SHATTER_PATCHWORK.shatterPatchwork({
		...params,
		seedSalt: 0x7ea6de00,
		minTerritorySize: MIN_TERRITORY_SIZE,
		memberBuckets: MEMBER_BUCKETS,
		findEligibleNation: ({ seeds, sizes }) => {
			// Majority-coastal first (reads most like a real trade league); only
			// loosened to "at least a quarter coastal" if that finds nothing at
			// all, rather than leaving a Trade League unplaced when a
			// less-thoroughly-coastal candidate was available.
			for (const coastalThreshold of [0.5, 0.25]) {
				const preferred = pickLargestEligible(
					seeds,
					sizes,
					PREFERRED_MAX_SIZE,
					coastalThreshold,
				)
				if (preferred >= 0) return preferred
				const fallback = pickLargestEligible(
					seeds,
					sizes,
					null,
					coastalThreshold,
				)
				if (fallback >= 0) return fallback
			}
			return -1
		},
	})
}

export const TRADE_LEAGUE = {
	buildTradeLeague,
}
