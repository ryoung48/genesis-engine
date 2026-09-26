import type { NationEconomy } from "@/model/history/world-frame/types"

export interface BuildNationWikiStatsParams {
	territoryBasis: "owned" | "controlled"
	totalAreaKm2: number
	totalPopulation: number
	totalUrbanPopulation: number
	provinceCount: number
	// [JUSTIFICATION] A nation can have no recorded ruler at the selected date.
	rulerLabel?: string | null
	governmentSubtype: string | null
	governmentColor: string | null
	economy: NationEconomy | null
	yearLabel: string
}
