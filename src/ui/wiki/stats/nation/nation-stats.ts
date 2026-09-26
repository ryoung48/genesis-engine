import type { NationEconomy } from "@/model/history/world-frame/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"

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
			label: "Total Area",
			value: `${formatAreaKm2(totalAreaKm2)} · ${provinceCount.toLocaleString()} Province${provinceCount === 1 ? "" : "s"}`,
		},
		{
			label: "Population",
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
							economy.treasury < 0
								? `${formatSilver(-economy.treasury)} of silver in debt`
								: `${formatSilver(economy.treasury)} of silver`,
					},
					{
						label: "Revenue",
						value: `${formatSilver(economy.revenue)} of silver per year`,
					},
					{ label: "Manpower", value: `${formatCount(economy.manpower)} men` },
				]
			: []),
	]
}
