import React, { useEffect, useMemo, useState } from "react"
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

type NationNeighbor = NationDetailsData["neighbors"][number]

const NEIGHBORS_PAGE_SIZE = 6

function PoliticalNeighborsTable({
	neighbors,
	visibleNeighbors,
	pageIndex,
	onPageChange,
	onNationClick,
}: {
	neighbors: NationDetailsData["neighbors"]
	visibleNeighbors: ReadonlyArray<NationNeighbor>
	pageIndex: number
	onPageChange: (pageIndex: number) => void
	onNationClick?: (nationId: number) => void
}) {
	const columns: ReadonlyArray<DataTableColumn<NationNeighbor>> = [
		{
			id: "name",
			header: "Nation",
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
	]

	return (
		<div className="space-y-2">
			<DataTable
				columns={columns}
				rows={visibleNeighbors}
				rowKey={(item) => item.id}
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

interface NationDetailsProps {
	nation: NationDetailsData | null
	openSections: ReadonlySet<NationSection>
	onSectionToggle: (section: NationSection) => void
	onClose?: () => void
	onNationClick?: (nationId: number) => void
}

export const NationDetails: React.FC<NationDetailsProps> = ({
	nation,
	openSections,
	onSectionToggle,
	onClose,
	onNationClick,
}) => {
	const [neighborPageIndex, setNeighborPageIndex] = useState(0)

	useEffect(() => {
		setNeighborPageIndex(0)
	}, [])

	const sortedNeighbors = useMemo(
		() =>
			nation
				? [...nation.neighbors].sort((left, right) =>
						left.name.localeCompare(right.name),
					)
				: [],
		[nation],
	)

	const pagedNeighbors = useMemo(() => {
		const start = neighborPageIndex * NEIGHBORS_PAGE_SIZE
		return sortedNeighbors.slice(start, start + NEIGHBORS_PAGE_SIZE)
	}, [neighborPageIndex, sortedNeighbors])

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
					{nation ? (
						<PoliticalNeighborsTable
							neighbors={sortedNeighbors}
							visibleNeighbors={pagedNeighbors}
							pageIndex={neighborPageIndex}
							onPageChange={setNeighborPageIndex}
							onNationClick={onNationClick}
						/>
					) : (
						<span className="font-mono text-[11px] text-slate-950">N/A</span>
					)}
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
		</div>
	)
}
