import React, { useMemo, useState } from "react"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import {
	DataTable,
	type DataTableColumn,
} from "@/ui/components/primitives/DataTable"
import { Pagination } from "@/ui/components/primitives/Pagination"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import type { WorldSection } from "../drawer-state"
import type { DetailsDrawerBaseProps } from "../shared"
import { DetailRow, formatPopulation } from "../shared"

// Matches GenerationPanel's own top-level collapsible blocks ("Generate",
// "Moons"/"Orbits", "Climate") exactly -- a Surface sibling in the panel's
// own flow. Kept local to this file rather than added to shared.tsx since
// nothing else needs this accordion look.
function TopLevelSection({
	title,
	open,
	onToggle,
	children,
}: {
	title: string
	open: boolean
	onToggle: () => void
	children: React.ReactNode
}) {
	return (
		<Surface
			tone="panel"
			borderTone="default"
			radius="xl"
			className="border-t border-slate-200 px-3 py-3"
		>
			<div className="space-y-1.5">
				<button
					type="button"
					onClick={onToggle}
					className="flex w-full items-center justify-between gap-3 text-left"
				>
					<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
						{title}
					</span>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{open ? children : null}
			</div>
		</Surface>
	)
}

function hasValue(value: string): boolean {
	const trimmed = value.trim()
	return trimmed !== "" && trimmed !== "—" && trimmed !== "-"
}

function getWorldSections({
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	religionCount,
}: Pick<
	DetailsDrawerBaseProps,
	| "planetStats"
	| "worldPopulation"
	| "activeWarCount"
	| "cultureCount"
	| "religionCount"
>) {
	const stats = new Map(
		planetStats
			.filter((stat) => hasValue(stat.value))
			.map((stat) => [stat.label, stat.value]),
	)

	return {
		// No "Planetary" section here anymore -- Radius/Tilt/Ecc/Perihelion/
		// Year/Sidereal Day/Solar Day/Pressure/Lock are all already shown on
		// the main world's own stat card in GenerationPanel (buildBodyStats),
		// and Habitability/Sun had no other purpose worth a whole section for
		// just two rows. Cell/Land Coverage/Provinces/Avg Province Area/
		// Locations/Avg Location Area are genuinely unique to this panel (not
		// shown anywhere in GenerationPanel) and world-derived, so they moved
		// into Environmental instead of staying in an always-visible section.
		environmental: [
			{ label: "Continents", value: stats.get("Continents") },
			{ label: "Land Area", value: stats.get("Land Area") },
			{ label: "Land Coverage", value: stats.get("Land Coverage") },
			{ label: "Cell", value: stats.get("Cell") },
			{ label: "Provinces", value: stats.get("Provinces") },
			{ label: "Avg Province Area", value: stats.get("Avg Province Area") },
			{ label: "Locations", value: stats.get("Locations") },
			{ label: "Avg Location Area", value: stats.get("Avg Location Area") },
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
				label: "Religion Count",
				value: religionCount != null ? religionCount.toLocaleString() : "N/A",
			},
		],
	}
}

const TRADE_GOODS_PAGE_SIZE = 5

interface WorldDetailsProps extends DetailsDrawerBaseProps {
	openSections: ReadonlySet<WorldSection>
	onSectionToggle: (section: WorldSection) => void
	/** Whether a world has actually finished generating. The Planetary
	 * section's own rows already self-filter (see hasValue above -- a
	 * world-derived stat like Provinces/Land Coverage/Cell just reads "-"
	 * pre-generation and gets dropped), but Environmental/Social/Trade Goods
	 * are ALL world-derived (their rows fall back to "N/A" text or render
	 * empty charts/tables instead of disappearing) -- those three whole
	 * sections are gated on this instead, so they're simply absent rather
	 * than showing empty pre-generation. */
	hasGeneratedWorld: boolean
}

export const WorldDetails: React.FC<WorldDetailsProps> = ({
	openSections,
	onSectionToggle,
	hasGeneratedWorld,
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	religionCount,
	nationSizeDistribution,
	governmentDistribution,
	religionDistribution,
	conflictDistribution,
	relationDistribution,
	climateDistribution,
	vegetationDistribution,
	topographyDistribution,
	showObservedDistributions,
	tradeGoodsDistribution,
}) => {
	const worldSections = getWorldSections({
		planetStats,
		worldPopulation,
		activeWarCount,
		cultureCount,
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

	if (!hasGeneratedWorld) return null

	return (
		<>
			<TopLevelSection
				title="Environmental"
				open={openSections.has("environmental")}
				onToggle={() => onSectionToggle("environmental")}
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
					<DistributionChart
						title={showObservedDistributions ? "Climate (Observed)" : "Climate"}
						buckets={climateDistribution}
					/>
					<DistributionChart
						title={
							showObservedDistributions ? "Vegetation (Observed)" : "Vegetation"
						}
						buckets={vegetationDistribution}
					/>
					<DistributionChart
						title={
							showObservedDistributions ? "Topography (Observed)" : "Topography"
						}
						buckets={topographyDistribution}
					/>
				</div>
			</TopLevelSection>
			<TopLevelSection
				title="Social"
				open={openSections.has("social")}
				onToggle={() => onSectionToggle("social")}
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
			</TopLevelSection>
			<TopLevelSection
				title="Trade Goods"
				open={openSections.has("trade-goods")}
				onToggle={() => onSectionToggle("trade-goods")}
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
			</TopLevelSection>
		</>
	)
}
