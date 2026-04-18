import React, { useEffect, useRef, useState } from "react"
import type { HistoryNote } from "@/model/orogen/history"
import {
	type NationSection,
	resolveDrawerStateOnOpen,
	type WorldSection,
} from "./drawer-state"
import { NationDetails } from "./NationDetails"
import type { NationHistoryPoint } from "./NationHistoryChart"
import { type DetailsDrawerBaseProps, type NationDetailsData } from "./shared"
import { WorldDetails } from "./WorldDetails"

interface DetailsDrawerProps extends DetailsDrawerBaseProps {
	open: boolean
	onToggle: () => void
	nation: NationDetailsData | null
	nationHistory?: NationHistoryPoint[]
	windowedEvents?: HistoryNote[]
	allPastEvents?: HistoryNote[]
	selectedTimeMs?: number
	currentTimeMs?: number
	onTimeSelect?: (timeMs: number) => void
	onNationClick?: (nationId: number) => void
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
	open,
	onToggle,
	nation,
	planetStats,
	worldPopulation,
	activeWarCount,
	averageDevelopment,
	nationAverageDevelopment,
	developmentDistribution,
	nationDevelopmentDistribution,
	nationSizeDistribution,
	conflictDistribution,
	relationDistribution,
	climateDistribution,
	vegetationDistribution,
	topographyDistribution,
	nationHistory,
	windowedEvents,
	allPastEvents,
	selectedTimeMs,
	currentTimeMs,
	onTimeSelect,
	onNationClick,
}) => {
	const [tab, setTab] = useState<"world" | "nation">("world")
	const [worldSection, setWorldSection] = useState<WorldSection>("planetary")
	const [nationSection, setNationSection] = useState<NationSection>("political")
	const previousNationIdRef = useRef<number | null>(null)

	useEffect(() => {
		if (!open) return
		const nextState = resolveDrawerStateOnOpen({
			current: { tab, worldSection, nationSection },
			selectedNationId: nation?.id ?? null,
			previousNationId: previousNationIdRef.current,
		})
		if (nextState.tab !== tab) setTab(nextState.tab)
		if (nextState.worldSection !== worldSection) {
			setWorldSection(nextState.worldSection)
		}
		if (nextState.nationSection !== nationSection) {
			setNationSection(nextState.nationSection)
		}
		previousNationIdRef.current = nation?.id ?? null
	}, [open, nation?.id, tab, worldSection, nationSection])

	if (!open) {
		return null
	}

	return (
		<div className="flex h-auto w-full shrink-0 flex-col border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-sm xl:h-full xl:w-[340px] xl:max-w-[28vw] xl:border-t-0 xl:border-l">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						className="text-white"
					>
						<path
							d="M4 5h16M4 12h16M4 19h10"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</div>
				<span className="text-xs font-bold tracking-tight">DETAILS</span>
				<button
					onClick={onToggle}
					className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
					title="Hide details"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
				<div className="inline-flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
					{(
						[
							["world", "World"],
							["nation", "Nation"],
						] as const
					).map(([nextTab, label]) => (
						<button
							key={nextTab}
							onClick={() => setTab(nextTab)}
							className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition-all ${
								tab === nextTab
									? "bg-white text-slate-900 shadow-sm"
									: "text-slate-500 hover:text-slate-700"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				{tab === "world" ? (
					<WorldDetails
						section={worldSection}
						onSectionChange={setWorldSection}
						planetStats={planetStats}
						worldPopulation={worldPopulation}
						activeWarCount={activeWarCount}
						averageDevelopment={averageDevelopment}
						nationAverageDevelopment={nationAverageDevelopment}
						developmentDistribution={developmentDistribution}
						nationDevelopmentDistribution={nationDevelopmentDistribution}
						nationSizeDistribution={nationSizeDistribution}
						conflictDistribution={conflictDistribution}
						relationDistribution={relationDistribution}
						climateDistribution={climateDistribution}
						vegetationDistribution={vegetationDistribution}
						topographyDistribution={topographyDistribution}
					/>
				) : (
					<NationDetails
						nation={nation}
						section={nationSection}
						onSectionChange={setNationSection}
						nationHistory={nationHistory}
						windowedEvents={windowedEvents}
						allPastEvents={allPastEvents}
						selectedTimeMs={selectedTimeMs}
						currentTimeMs={currentTimeMs}
						onTimeSelect={onTimeSelect}
						onNationClick={onNationClick}
					/>
				)}
			</div>
		</div>
	)
}
