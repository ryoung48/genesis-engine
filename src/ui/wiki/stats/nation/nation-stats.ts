import type { NationEconomy } from "@/model/history/world-frame/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { uiPalette } from "@/ui/components/tokens"

function treasuryHealthColor(economy: NationEconomy): string {
	if (economy.treasury < 0) return uiPalette.treasury.critical
	if (economy.revenue <= 0) return uiPalette.nationCapital
	const reserveCapacityPercent =
		(economy.treasury / economy.revenue) * (200 / 0.6)
	if (reserveCapacityPercent >= 150) return uiPalette.treasury.healthy
	if (reserveCapacityPercent >= 50) return uiPalette.treasury.caution
	return uiPalette.treasury.critical
}

export function formatCount(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0"
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
	}
	return Math.round(value).toLocaleString()
}

export function formatSilver(grams: number): string {
	const magnitude = Math.abs(grams)
	const sign = grams < 0 ? "-" : ""
	if (magnitude >= 1_000_000)
		return `${sign}${(magnitude / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)} t`
	if (magnitude >= 1_000)
		return `${sign}${Math.round(magnitude / 1_000).toLocaleString("en-US")} kg`
	return `${sign}${Math.round(magnitude)} g`
}

export function formatAreaKm2(areaKm2: number): string {
	if (!Number.isFinite(areaKm2) || areaKm2 <= 0) return "0 km²"
	return `${formatCount(areaKm2)} km²`
}

export function formatDensity(perKm2: number): string {
	if (!Number.isFinite(perKm2) || perKm2 <= 0) return "0 /km²"
	if (perKm2 >= 1000) return `${Math.round(perKm2).toLocaleString()} /km²`
	return `${perKm2.toFixed(perKm2 >= 100 ? 0 : 1)} /km²`
}

function formatUrbanization(
	totalUrbanPopulation: number,
	totalPopulation: number,
) {
	if (
		!Number.isFinite(totalUrbanPopulation) ||
		!Number.isFinite(totalPopulation) ||
		totalUrbanPopulation <= 0 ||
		totalPopulation <= 0
	) {
		return "0%"
	}
	const percent = Math.min(
		100,
		Math.max(0, (totalUrbanPopulation / totalPopulation) * 100),
	)
	return `${percent.toFixed(0)}%`
}

export function buildNationWikiStats(params: {
	territoryBasis: "owned" | "controlled"
	totalAreaKm2: number
	totalPopulation: number
	totalUrbanPopulation: number
	provinceCount: number
	rulerLabel?: string | null
	governmentSubtype: string | null
	governmentColor: string | null
	economy: NationEconomy | null
}): StatEntry[] {
	const {
		territoryBasis,
		totalAreaKm2,
		totalPopulation,
		totalUrbanPopulation,
		provinceCount,
		rulerLabel,
		governmentSubtype,
		governmentColor,
		economy,
	} = params
	const density = totalAreaKm2 > 0 ? totalPopulation / totalAreaKm2 : 0
	return [
		{
			label: territoryBasis === "controlled" ? "Controlled Area" : "Total Area",
			value: `${formatAreaKm2(totalAreaKm2)} · ${provinceCount.toLocaleString()} Province${provinceCount === 1 ? "" : "s"}`,
		},
		{
			label:
				territoryBasis === "controlled"
					? "Controlled Population"
					: "Population",
			valuePrefix: formatCount(totalPopulation),
			value: ` · ${formatDensity(density)} · ${formatUrbanization(totalUrbanPopulation, totalPopulation)} urbanized`,
		},
		...(rulerLabel !== null && rulerLabel !== undefined
			? [{ label: "Ruler", value: rulerLabel }]
			: []),
		{
			label: "Government",
			value: governmentSubtype ?? "Unknown",
			swatchColor: governmentColor,
		},
		...(economy
			? [
					{
						label: "Treasury",
						value:
							economy.revenue > 0
								? `${Math.round((economy.treasury / economy.revenue) * (200 / 0.6))}% of reserve capacity`
								: "No annual revenue",
						help: "Scaled to the treasury's reserve cap, which displays as 200%. Red is debt or under 50%, amber is 50–149%, and green is 150% or more.",
						swatchColor: treasuryHealthColor(economy),
					},
					{ label: "Manpower", value: `${formatCount(economy.manpower)} men` },
				]
			: []),
	]
}
