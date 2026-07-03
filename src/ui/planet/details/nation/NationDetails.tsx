import React, { useEffect, useMemo, useState } from "react"
import type { HistoryNote } from "@/model/history"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import {
	DataTable,
	type DataTableColumn,
} from "@/ui/components/primitives/DataTable"
import { LabeledValueRow } from "@/ui/components/primitives/LabeledValueRow"
import { Pagination } from "@/ui/components/primitives/Pagination"
import { Swatch } from "@/ui/components/primitives/Swatch"
import type { NationSection } from "../drawer-state"
import {
	AccordionSection,
	DetailRow,
	formatPopulation,
	type NationDetailsData,
	WikiHeader,
} from "../shared"
import {
	NationHistoryChart,
	type NationHistoryPoint,
} from "./NationHistoryChart"
import {
	DEFAULT_NEIGHBOR_SORT,
	formatNeighborThreat,
	getRelationColor,
	type NationNeighbor,
	type NeighborSortState,
	nextNeighborSortState,
	sortNationNeighbors,
} from "./nation-neighbors-table"

function WarList({
	items,
	onNationClick,
}: {
	items: NationDetailsData["activeWars"]
	onNationClick?: (nationId: number) => void
}) {
	if (items.length === 0) {
		return <span className="font-mono text-[11px] text-slate-950">None</span>
	}

	return (
		<div className="flex flex-col items-end gap-y-1">
			{items.map((item) => (
				<button
					type="button"
					key={item.id}
					onClick={() => onNationClick?.(item.opponentId)}
					className="flex items-center gap-1.5 font-mono text-[11px] text-slate-950 hover:underline"
				>
					<Swatch color={item.opponentColor} />
					<span>
						vs {item.opponentName} · {item.role}
						{item.rebel ? " · Rebel" : ""}
					</span>
				</button>
			))}
		</div>
	)
}

function PoliticalNeighborsTable({
	neighbors,
	visibleNeighbors,
	sort,
	onSort,
	pageIndex,
	onPageChange,
	onNationClick,
}: {
	neighbors: NationDetailsData["neighbors"]
	visibleNeighbors: ReadonlyArray<NationNeighbor>
	sort: NeighborSortState
	onSort: (columnId: string) => void
	pageIndex: number
	onPageChange: (pageIndex: number) => void
	onNationClick?: (nationId: number) => void
}) {
	const columns: ReadonlyArray<DataTableColumn<NationNeighbor>> = [
		{
			id: "name",
			header: "Nation",
			sortable: true,
			sortLabel: "Sort neighbors by nation",
			cell: (item) => (
				<button
					type="button"
					onClick={() => onNationClick?.(item.id)}
					className="inline-flex items-center gap-1.5 text-left hover:underline"
				>
					<Swatch color={item.color} />
					<span>{item.name}</span>
				</button>
			),
		},
		{
			id: "relation",
			header: "Relation",
			sortable: true,
			sortLabel: "Sort neighbors by relation",
			cell: (item) => (
				<span className="inline-flex items-center gap-1.5">
					<Swatch color={getRelationColor(item.relation)} />
					<span>{item.relation}</span>
				</span>
			),
		},
		{
			id: "threat",
			header: "Threat",
			align: "end",
			sortable: true,
			sortLabel: "Sort neighbors by threat",
			cell: (item) => formatNeighborThreat(item.threat),
		},
	]

	return (
		<div className="space-y-2">
			<DataTable
				columns={columns}
				rows={visibleNeighbors}
				rowKey={(item) => item.id}
				sort={{
					columnId: sort.key,
					direction: sort.direction,
				}}
				onSort={onSort}
				empty="No political neighbors"
			/>
			<Pagination
				pageIndex={pageIndex}
				pageSize={NEIGHBORS_PAGE_SIZE}
				totalItems={neighbors.length}
				onPageChange={onPageChange}
			/>
		</div>
	)
}

const NEIGHBORS_PAGE_SIZE = 6

interface NationDetailsProps {
	nation: NationDetailsData | null
	openSections: ReadonlySet<NationSection>
	onSectionToggle: (section: NationSection) => void
	onClose?: () => void
	nationHistory?: NationHistoryPoint[]
	windowedEvents?: HistoryNote[]
	allPastEvents?: HistoryNote[]
	selectedTimeMs?: number
	currentTimeMs?: number
	onTimeSelect?: (timeMs: number) => void
	onNationClick?: (nationId: number) => void
	onProvinceClick?: (provinceId: number) => void
	getNationName?: (nationId: number) => string
	getNationColor?: (nationId: number) => string | null
	getProvinceName?: (provinceId: number) => string
	getProvinceColor?: (provinceId: number) => string | null
	getDynastyName?: (dynastyId: number) => string
}

export const NationDetails: React.FC<NationDetailsProps> = ({
	nation,
	openSections,
	onSectionToggle,
	onClose,
	nationHistory,
	windowedEvents,
	allPastEvents,
	selectedTimeMs,
	currentTimeMs,
	onTimeSelect,
	onNationClick,
	onProvinceClick,
	getNationName,
	getNationColor,
	getProvinceName,
	getProvinceColor,
	getDynastyName,
}) => {
	const [neighborSort, setNeighborSort] = useState<NeighborSortState>(
		DEFAULT_NEIGHBOR_SORT,
	)
	const [neighborPageIndex, setNeighborPageIndex] = useState(0)

	useEffect(() => {
		setNeighborPageIndex(0)
	}, [])

	const sortedNeighbors = useMemo(
		() => (nation ? sortNationNeighbors(nation.neighbors, neighborSort) : []),
		[nation, neighborSort],
	)

	const pagedNeighbors = useMemo(() => {
		const start = neighborPageIndex * NEIGHBORS_PAGE_SIZE
		return sortedNeighbors.slice(start, start + NEIGHBORS_PAGE_SIZE)
	}, [neighborPageIndex, sortedNeighbors])

	const handleNeighborSort = (columnId: string) => {
		switch (columnId) {
			case "name":
			case "relation":
			case "threat":
				setNeighborSort((current) => nextNeighborSortState(current, columnId))
				break
		}
	}

	return (
		<div className="space-y-2">
			{nation ? (
				<WikiHeader
					title={nation.name}
					subtitle="Nation"
					color={nation.color}
					onClose={onClose}
				/>
			) : (
				<WikiHeader
					title="No nation selected"
					subtitle="Nation"
					onClose={onClose}
				/>
			)}

			<AccordionSection
				title="Political"
				open={openSections.has("political")}
				onToggle={() => onSectionToggle("political")}
			>
				<div className="space-y-2">
					<LabeledValueRow
						label="Government"
						value={
							nation?.governmentType ? (
								<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-950">
									<Swatch color={nation.governmentColor} />
									<span>{nation.governmentType}</span>
								</span>
							) : (
								"N/A"
							)
						}
					/>
					<DetailRow
						label="Provinces"
						value={nation ? nation.provinceCount.toLocaleString() : "N/A"}
					/>
					<DetailRow
						label="Ruler"
						value={
							nation?.ruler
								? [
										nation.ruler.name,
										nation.ruler.genderSymbol,
										nation.ruler.age !== null ? `${nation.ruler.age}` : null,
									]
										.filter(Boolean)
										.join(" · ")
								: "N/A"
						}
					/>
					<LabeledValueRow
						label="Dynasty"
						value={
							nation?.ruler?.dynasty ? (
								<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-950">
									<Swatch color={nation.ruler.dynastyColor} />
									<span>{nation.ruler.dynasty}</span>
								</span>
							) : (
								"N/A"
							)
						}
					/>
					{nation ? (
						<PoliticalNeighborsTable
							neighbors={sortedNeighbors}
							visibleNeighbors={pagedNeighbors}
							sort={neighborSort}
							onSort={handleNeighborSort}
							pageIndex={neighborPageIndex}
							onPageChange={setNeighborPageIndex}
							onNationClick={onNationClick}
						/>
					) : (
						<span className="font-mono text-[11px] text-slate-950">N/A</span>
					)}
					<LabeledValueRow
						label="Active Wars"
						align="start"
						value={
							nation ? (
								<WarList
									items={nation.activeWars}
									onNationClick={onNationClick}
								/>
							) : (
								"N/A"
							)
						}
						valueClassName="text-right"
					/>
				</div>
			</AccordionSection>

			<AccordionSection
				title="Demographics"
				open={openSections.has("demographics")}
				onToggle={() => onSectionToggle("demographics")}
			>
				<div className="space-y-2">
					<DetailRow
						label="Population"
						value={nation ? formatPopulation(nation.totalPopulation) : "N/A"}
					/>
					<LabeledValueRow
						label="Ruling Culture"
						value={
							nation?.cultureDistribution?.[0] ? (
								<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-950">
									<Swatch color={nation.cultureDistribution[0].color} />
									<span>{nation.cultureDistribution[0].label}</span>
								</span>
							) : (
								"N/A"
							)
						}
					/>
					<DistributionChart
						title="Cultures"
						buckets={nation?.cultureDistribution ?? []}
					/>
					<DistributionChart
						title="Heritages"
						buckets={nation?.heritageDistribution ?? []}
					/>
					{(nation?.religionDistribution.length ?? 0) > 0 ? (
						<DistributionChart
							title="Religions"
							buckets={nation?.religionDistribution ?? []}
						/>
					) : null}
				</div>
			</AccordionSection>

			{nation &&
			nationHistory &&
			selectedTimeMs != null &&
			currentTimeMs != null &&
			onTimeSelect ? (
				<AccordionSection
					title="History"
					open={openSections.has("history")}
					onToggle={() => onSectionToggle("history")}
				>
					<NationHistoryChart
						history={nationHistory}
						windowedEvents={windowedEvents ?? []}
						allPastEvents={allPastEvents ?? []}
						viewingNation={nation.id}
						selectedTimeMs={selectedTimeMs}
						currentTimeMs={currentTimeMs}
						onTimeSelect={onTimeSelect}
						onNationClick={onNationClick}
						onProvinceClick={onProvinceClick}
						getNationName={getNationName}
						getNationColor={getNationColor}
						getProvinceName={getProvinceName}
						getProvinceColor={getProvinceColor}
						getDynastyName={getDynastyName}
					/>
				</AccordionSection>
			) : null}
		</div>
	)
}
