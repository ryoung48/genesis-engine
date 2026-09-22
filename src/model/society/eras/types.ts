import type { GovernmentMix, SocietyEra } from "@/model/society/types"

export interface WavePercentileThresholdParams {
	migrationWave: Float32Array
	desolate: Uint8Array
	fraction: number
}

export interface EraConfig {
	id: SocietyEra
	label: string
	/** Target world population at habitabilityScore = 1 */
	targetPopulation: number
	/**
	 * Fraction (0–1) of non-desolate provinces that are settled, taken from
	 * the lowest-wave end of the migration wave distribution. 1.0 = everywhere.
	 */
	settlementFraction: number
	/**
	 * Strength of the migration-distance falloff applied to population density.
	 */
	migrationFalloff: number
	/**
	 * Fraction (0–1) of settled provinces that are statehood-eligible.
	 */
	statehoodFraction: number
	/** Whether to generate any nations */
	hasNations: boolean
	/** Normalized budget weights across NATION_BUCKETS (or nationBuckets) */
	nationPercentages: number[]
	/** Province-count size ranges; aligns with nationPercentages indices */
	nationBuckets: [number, number][]
	/**
	 * Fraction of nations assigned each government type.
	 * Tribal nations tend to be small (1–4 provinces); state governments larger.
	 * Based on EU4 extended-timeline nation-count distributions.
	 */
	governmentMix: GovernmentMix
	/**
	 * How much nation size drives government type vs. era ideology (0–1).
	 * 1.0 = size alone determines government (ancient world: large=monarchy, tiny=tribal).
	 * 0.0 = era mix alone determines government (modern world: ideology transcends size).
	 * Also scales spatial modifier strength — geography matters less in modernity.
	 */
	governmentSizeWeight: number
	/**
	 * Max province count allowed a republic-family government; larger nations
	 * fall back to the remaining families.
	 * [JUSTIFICATION] only lateMedieval caps republic size; other eras leave it unset
	 */
	maxRepublicSize?: number
	/**
	 * Max province count allowed a theocracy-family government; larger nations
	 * fall back to the remaining families.
	 * [JUSTIFICATION] only lateMedieval caps theocracy size; other eras leave it unset
	 */
	maxTheocracySize?: number
	/**
	 * Procedural organizations to generate for this era, layered on top of the
	 * normal nation partition. imperialPatchwork: shatter the largest eligible
	 * (settled, wave >= 0) nation into an HRE-style patchwork of small member
	 * states — see src/model/history/sim/organizations/imperial-patchwork.
	 * tradeLeague: shatter the largest eligible coastal republic into a flat
	 * Hansa-style patchwork of small trade-city members — see
	 * src/model/history/sim/organizations/trade-league.
	 */
	organizations?: {
		imperialPatchwork?: boolean
		tradeLeague?: boolean
	}
}
