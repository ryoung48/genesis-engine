import type { RainfallSeasonalityParams } from "@/ui/genesis/shared/rainfall-seasonality/types"

export function getRainfallSeasonality({
	monthly,
	numRegions,
	region,
}: RainfallSeasonalityParams): number {
	let wettest = -Infinity
	let driest = Infinity
	for (let month = 0; month < 12; month++) {
		const rain = monthly[month * numRegions + region]
		wettest = Math.max(wettest, rain)
		driest = Math.min(driest, rain)
	}
	return wettest - driest
}
