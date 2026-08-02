import { type DistributionChartBucket as DistributionBucket } from "@/ui/components/composites/DistributionChart"
import { LabeledValueRow } from "@/ui/components/primitives/LabeledValueRow"
import type { PlanetStat } from "@/ui/genesis/shared/planet-stats"

export type { DistributionBucket }

export interface DetailsDrawerBaseProps {
	planetName: string
	planetStats: PlanetStat[]
	worldPopulation: number | null
	activeWarCount: number | null
	cultureCount: number | null
	religionCount: number | null
	nationSizeDistribution: DistributionBucket[]
	governmentDistribution: DistributionBucket[]
	religionDistribution: DistributionBucket[]
	conflictDistribution: DistributionBucket[]
	relationDistribution: DistributionBucket[]
	climateDistribution: DistributionBucket[]
	vegetationDistribution: DistributionBucket[]
	topographyDistribution: DistributionBucket[]
	/** Whether climate/vegetation/topography above are bucketed from real EU5
	 * observed data rather than the procedural model -- tracks the map
	 * overlay's model/observed dataVariant flag (Earth import only). Used to
	 * label the Environmental charts accordingly. */
	showObservedDistributions: boolean
	tradeGoodsDistribution: DistributionBucket[]
}

export function formatPopulation(value: number): string {
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

export function DetailRow({ label, value }: { label: string; value: string }) {
	return <LabeledValueRow label={label} value={value} />
}
