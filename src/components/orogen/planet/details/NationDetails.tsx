import React from "react"
import type { HistoryNote } from "@/model/orogen/history"
import {
	NationHistoryChart,
	type NationHistoryPoint,
} from "./NationHistoryChart"
import {
	AccordionSection,
	DetailRow,
	formatPopulation,
	type NationDetailsData,
} from "./shared"

type NationSection = "political" | "demographics" | "history"

function SwatchList({
	items,
	onNationClick,
}: {
	items: NationDetailsData["neighbors"]
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
					onClick={() => onNationClick?.(item.id)}
					className="flex items-center gap-1.5 font-mono text-[11px] text-slate-950 hover:underline"
				>
					{item.color ? (
						<span
							className="h-2 w-2 rounded-sm border border-slate-300"
							style={{ backgroundColor: item.color }}
						/>
					) : null}
					<span>
						#{item.id} · {item.relation} ·{" "}
						{item.threat !== null ? `${Math.round(item.threat * 100)}%` : "N/A"}
					</span>
				</button>
			))}
		</div>
	)
}

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
					{item.opponentColor ? (
						<span
							className="h-2 w-2 rounded-sm border border-slate-300"
							style={{ backgroundColor: item.opponentColor }}
						/>
					) : null}
					<span>
						vs #{item.opponentId} · {item.role}
						{item.rebel ? " · Rebel" : ""}
					</span>
				</button>
			))}
		</div>
	)
}

interface NationDetailsProps {
	nation: NationDetailsData | null
	section: NationSection
	onSectionChange: (section: NationSection) => void
	nationHistory?: NationHistoryPoint[]
	windowedEvents?: HistoryNote[]
	allPastEvents?: HistoryNote[]
	selectedTimeMs?: number
	currentTimeMs?: number
	onTimeSelect?: (timeMs: number) => void
	onNationClick?: (nationId: number) => void
}

export const NationDetails: React.FC<NationDetailsProps> = ({
	nation,
	section,
	onSectionChange,
	nationHistory,
	windowedEvents,
	allPastEvents,
	selectedTimeMs,
	currentTimeMs,
	onTimeSelect,
	onNationClick,
}) => {
	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
					Nation ID
				</span>
				{nation ? (
					<button
						type="button"
						onClick={() => onNationClick?.(nation.id)}
						className="inline-flex items-center gap-1.5 text-right font-mono text-[11px] text-slate-950 hover:underline"
					>
						{nation.color ? (
							<span
								className="h-2 w-2 rounded-sm border border-slate-300"
								style={{ backgroundColor: nation.color }}
							/>
						) : null}
						<span>#{nation.id}</span>
					</button>
				) : (
					<span className="text-right font-mono text-[11px] text-slate-950">
						N/A
					</span>
				)}
			</div>
			<AccordionSection
				title="Political"
				open={section === "political"}
				onToggle={() => onSectionChange("political")}
			>
				<div className="space-y-2">
					<DetailRow
						label="Provinces"
						value={nation ? nation.provinceCount.toLocaleString() : "N/A"}
					/>
					<div className="flex items-start justify-between gap-2">
						<span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
							Neighbors
						</span>
						{nation ? (
							<SwatchList
								items={nation.neighbors}
								onNationClick={onNationClick}
							/>
						) : (
							<span className="font-mono text-[11px] text-slate-950">N/A</span>
						)}
					</div>
					<div className="flex items-start justify-between gap-2">
						<span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
							Active Wars
						</span>
						{nation ? (
							<WarList
								items={nation.activeWars}
								onNationClick={onNationClick}
							/>
						) : (
							<span className="font-mono text-[11px] text-slate-950">N/A</span>
						)}
					</div>
				</div>
			</AccordionSection>

			<AccordionSection
				title="Demographics"
				open={section === "demographics"}
				onToggle={() => onSectionChange("demographics")}
			>
				<div className="space-y-2">
					<DetailRow
						label="Population"
						value={nation ? formatPopulation(nation.totalPopulation) : "N/A"}
					/>
				</div>
			</AccordionSection>

			{nation &&
			nationHistory &&
			selectedTimeMs != null &&
			currentTimeMs != null &&
			onTimeSelect ? (
				<AccordionSection
					title="History"
					open={section === "history"}
					onToggle={() => onSectionChange("history")}
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
					/>
				</AccordionSection>
			) : null}
		</div>
	)
}
