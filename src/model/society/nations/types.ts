import type { GenesisProvinces } from "@/model/society/types"

export interface IntegerMassParams {
	total: number
	weights: number[]
}

export interface BuildNationPlanParams {
	total: number
	nationPercentages?: number[]
	nationBuckets?: [number, number][]
}

export interface SpreadBucketSizesParams {
	budget: number
	minSize: number
	maxSize: number
	count: number
}

export interface GovernmentMix {
	tribal: number
	monarchy: number
	republic: number
	theocracy: number
	/**
	 * Target fraction of total province mass to convert to colonial government
	 * via the post-pass. Drawn from tribal nations on different landmasses.
	 * Does not need to be included in the tribal/monarchy/republic/theocracy sum.
	 */
	colonial?: number
}

export interface ComputeNationsParams {
	provinces: GenesisProvinces
	coastal: Uint8Array
	riverVisible: Uint8Array
	/** [JUSTIFICATION] callers rarely have water access pre-computed; when omitted it's derived from coastal/riverVisible via WATER_ACCESS.computeProvinceWaterAccess */
	waterAccess?: Uint8Array
	/** [JUSTIFICATION] the large-nation continent-spread bonus only applies to planets that track per-province continent ids; not every caller supplies one */
	provinceContinent?: Uint8Array
	habitability: Float32Array
	r_xyz: Float32Array
	seed: number
	/** [JUSTIFICATION] defaults to UNITS.defaultPlanetRadiusKm when the caller doesn't model a custom planet size */
	planetRadiusKm?: number
	/** [JUSTIFICATION] when provided, only provinces where eraActiveMask[p] === 1 are eligible for nations; omitted entirely outside era-gated pipelines */
	eraActiveMask?: Uint8Array
	/** [JUSTIFICATION] era-specific nation budget percentages (must align with nationBuckets); omitted callers fall back to the default NATION_PERCENTAGES */
	nationPercentages?: number[]
	/** [JUSTIFICATION] era-specific province-size ranges for nation buckets; omitted callers fall back to ERAS.nationBuckets */
	nationBuckets?: [number, number][]
	/** [JUSTIFICATION] government assignment is an optional feature — omitted entirely for callers that don't model government type */
	governmentMix?: GovernmentMix
	/**
	 * 0–1: how much nation size drives government type vs. era ideology.
	 * 1.0 = size prior dominates (ancient). 0.0 = era mix dominates (modern).
	 * Also scales spatial modifier strength.
	 * [JUSTIFICATION] only meaningful when governmentMix is supplied; defaults to 0.55 otherwise
	 */
	governmentSizeWeight?: number
	/**
	 * Per-province migration wave (0 = settlement cradle, 1 = frontier).
	 * Frontier nations skew tribal; core nations skew toward established states.
	 * [JUSTIFICATION] not every pipeline computes a migration wave; the frontier/core tribal skew is simply skipped when absent
	 */
	migrationWave?: Float32Array
	/**
	 * Era statehood fraction (0–1). The frontier→tribal skew represents proximity
	 * to stateless societies; as statehood approaches 1.0 (no stateless land left,
	 * e.g. information age) the skew fades to zero.
	 * [JUSTIFICATION] only meaningful when governmentMix is supplied; defaults to 0.75 otherwise
	 */
	statehoodFraction?: number
	/**
	 * When true (and governmentMix is supplied), shatter the largest eligible
	 * nation into an HRE-style Imperial Patchwork organization after the main
	 * partition finishes. See src/model/society/organizations/imperial-patchwork.
	 * [JUSTIFICATION] most eras don't want this; era config opts in explicitly
	 */
	buildImperialPatchwork?: boolean
	/**
	 * When true (and governmentMix is supplied), shatter the largest eligible
	 * coastal republic into a flat, non-hierarchical Trade League organization
	 * after the main partition finishes (and after any Imperial Patchwork --
	 * see the buildImperialPatchwork branch, which runs first). See
	 * src/model/society/organizations/trade-league.
	 * [JUSTIFICATION] most eras don't want this; era config opts in explicitly
	 */
	buildTradeLeague?: boolean
}
