import type { GovernmentMix, SocietyEra } from "@/model/society/types"

export interface EraOfParams {
	techLevel: number
}

export interface EraConfig {
	id: SocietyEra
	label: string
	techLevel: number
	/**
	 * Strength of the migration-distance falloff applied to population density.
	 */
	migrationFalloff: number
	/** Whether to generate any nations */
	hasNations: boolean
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
}
