import React, { useMemo, useState } from "react"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import {
	DataTable,
	type DataTableColumn,
} from "@/ui/components/primitives/DataTable"
import { Pagination } from "@/ui/components/primitives/Pagination"
import { Swatch } from "@/ui/components/primitives/Swatch"
import type { WorldSection } from "../drawer-state"
import type { DetailsDrawerBaseProps } from "../shared"
import { AccordionSection, DetailRow, formatPopulation } from "../shared"

function hasValue(value: string): boolean {
	const trimmed = value.trim()
	return trimmed !== "" && trimmed !== "—" && trimmed !== "-"
}

function getWorldSections({
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	heritageCount,
	religionCount,
}: Pick<
	DetailsDrawerBaseProps,
	| "planetStats"
	| "worldPopulation"
	| "activeWarCount"
	| "cultureCount"
	| "heritageCount"
	| "religionCount"
>) {
	const stats = new Map(
		planetStats
			.filter((stat) => hasValue(stat.value))
			.map((stat) => [stat.label, stat.value]),
	)

	return {
		planetary: [
			{ label: "Radius", value: stats.get("Radius") },
			{ label: "Sun", value: stats.get("Sun") },
			{ label: "Tilt", value: stats.get("Tilt") },
			{ label: "Ecc", value: stats.get("Ecc") },
			{ label: "Periapsis", value: stats.get("Periapsis") },
			{ label: "Year", value: stats.get("Year") },
			{ label: "Day", value: stats.get("Day") },
			{ label: "Pressure", value: stats.get("Pressure") },
			{ label: "Lock", value: stats.get("Lock") },
			{ label: "Habitability", value: stats.get("Habitability") },
			{ label: "Cell", value: stats.get("Cell") },
			{ label: "Land Coverage", value: stats.get("Land Coverage") },
			{ label: "Provinces", value: stats.get("Provinces") },
			{ label: "Avg Province Area", value: stats.get("Avg Province Area") },
			{ label: "Locations", value: stats.get("Locations") },
			{ label: "Avg Location Area", value: stats.get("Avg Location Area") },
		].filter((stat): stat is { label: string; value: string } =>
			Boolean(stat.value),
		),
		environmental: [
			{ label: "Continents", value: stats.get("Continents") },
			{ label: "Land Area", value: stats.get("Land Area") },
			{ label: "Avg Temp", value: stats.get("Avg Temp") },
			{ label: "Pole-Eq Gradient", value: stats.get("Pole-Eq Gradient") },
			{ label: "Avg Rain", value: stats.get("Avg Rain") },
			{ label: "Avg DTR", value: stats.get("Avg DTR") },
			{ label: "Avg Wind", value: stats.get("Avg Wind") },
			{ label: "Max Wind", value: stats.get("Max Wind") },
			{ label: "Major Rivers", value: stats.get("Major Rivers") },
			{ label: "Longest River", value: stats.get("Longest River") },
		].filter((stat): stat is { label: string; value: string } =>
			Boolean(stat.value),
		),
		social: [
			{
				label: "Population",
				value:
					worldPopulation != null ? formatPopulation(worldPopulation) : "N/A",
			},
			{
				label: "Active Wars",
				value: activeWarCount != null ? activeWarCount.toLocaleString() : "N/A",
			},
			{
				label: "Culture Count",
				value: cultureCount != null ? cultureCount.toLocaleString() : "N/A",
			},
			{
				label: "Heritage Count",
				value: heritageCount != null ? heritageCount.toLocaleString() : "N/A",
			},
			{
				label: "Religion Count",
				value: religionCount != null ? religionCount.toLocaleString() : "N/A",
			},
		],
	}
}

const TRADE_GOODS_PAGE_SIZE = 5

interface WorldDetailsProps extends DetailsDrawerBaseProps {
	section: WorldSection
	onSectionChange: (section: WorldSection) => void
}

export const WorldDetails: React.FC<WorldDetailsProps> = ({
	section,
	onSectionChange,
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	heritageCount,
	religionCount,
	nationSizeDistribution,
	governmentDistribution,
	religionDistribution,
	conflictDistribution,
	relationDistribution,
	climateDistribution,
	vegetationDistribution,
	topographyDistribution,
	tradeGoodsDistribution,
}) => {
	const worldSections = getWorldSections({
		planetStats,
		worldPopulation,
		activeWarCount,
		cultureCount,
		heritageCount,
		religionCount,
	})

	const tradeGoodsTotal = tradeGoodsDistribution.reduce(
		(sum, row) => sum + row.count,
		0,
	)

	const [tradeGoodsPage, setTradeGoodsPage] = useState(0)
	const pagedTradeGoods = useMemo(() => {
		const start = tradeGoodsPage * TRADE_GOODS_PAGE_SIZE
		return tradeGoodsDistribution.slice(start, start + TRADE_GOODS_PAGE_SIZE)
	}, [tradeGoodsDistribution, tradeGoodsPage])
	type TradeGoodRow = (typeof tradeGoodsDistribution)[number]
	const tradeGoodsColumns: ReadonlyArray<DataTableColumn<TradeGoodRow>> = [
		{
			id: "name",
			header: "Trade Good",
			cell: (row) => (
				<span className="inline-flex items-center gap-1.5">
					<Swatch color={row.color} />
					<span>{row.label}</span>
				</span>
			),
		},
		{
			id: "count",
			header: "Count",
			align: "end",
			cell: (row) => row.count.toLocaleString(),
		},
		{
			id: "pct",
			header: "Dist%",
			align: "end",
			cell: (row) =>
				tradeGoodsTotal > 0
					? `${((row.count / tradeGoodsTotal) * 100).toFixed(1)}%`
					: "—",
		},
	]

	return (
		<div className="space-y-2">
			<AccordionSection
				title="Planetary"
				open={section === "planetary"}
				onToggle={() => onSectionChange("planetary")}
			>
				<div className="space-y-1.5">
					{worldSections.planetary.map((stat) => (
						<DetailRow key={stat.label} label={stat.label} value={stat.value} />
					))}
				</div>
			</AccordionSection>
			<AccordionSection
				title="Environmental"
				open={section === "environmental"}
				onToggle={() => onSectionChange("environmental")}
			>
				<div className="space-y-2">
					<div className="space-y-1.5">
						{worldSections.environmental.map((stat) => (
							<DetailRow
								key={stat.label}
								label={stat.label}
								value={stat.value}
							/>
						))}
					</div>
					<DistributionChart title="Climate" buckets={climateDistribution} />
					<DistributionChart
						title="Vegetation"
						buckets={vegetationDistribution}
					/>
					<DistributionChart
						title="Topography"
						buckets={topographyDistribution}
					/>
				</div>
			</AccordionSection>
			<AccordionSection
				title="Social"
				open={section === "social"}
				onToggle={() => onSectionChange("social")}
			>
				<div className="space-y-2">
					<div className="space-y-1.5">
						{worldSections.social.map((stat) => (
							<DetailRow
								key={stat.label}
								label={stat.label}
								value={stat.value}
							/>
						))}
					</div>
					<DistributionChart
						title="Nation Size"
						buckets={nationSizeDistribution}
					/>
					<DistributionChart
						title="Government"
						buckets={governmentDistribution}
					/>
					<DistributionChart title="Religion" buckets={religionDistribution} />
					<DistributionChart title="Conflicts" buckets={conflictDistribution} />
					<DistributionChart title="Relations" buckets={relationDistribution} />
				</div>
			</AccordionSection>
			<AccordionSection
				title="Trade Goods"
				open={section === "trade-goods"}
				onToggle={() => onSectionChange("trade-goods")}
			>
				<DataTable
					columns={tradeGoodsColumns}
					rows={pagedTradeGoods}
					rowKey={(row) => row.label}
					empty="No trade goods assigned"
				/>
				<Pagination
					pageIndex={tradeGoodsPage}
					pageSize={TRADE_GOODS_PAGE_SIZE}
					totalItems={tradeGoodsDistribution.length}
					onPageChange={setTradeGoodsPage}
				/>
			</AccordionSection>
		</div>
	)
}
