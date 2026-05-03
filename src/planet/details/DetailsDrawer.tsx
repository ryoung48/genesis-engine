import React, { useEffect, useRef, useState } from "react"
import { DrawerShell, SegmentedControl } from "@/components"
import type { HistoryNote } from "@/model/history"
import {
	type NationSection,
	resolveDrawerStateOnOpen,
	type WorldSection,
} from "./drawer-state"
import { NationDetails } from "./nation/NationDetails"
import type { NationHistoryPoint } from "./nation/NationHistoryChart"
import { type DetailsDrawerBaseProps, type NationDetailsData } from "./shared"
import { WorldDetails } from "./world/WorldDetails"

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
		<DrawerShell
			title="DETAILS"
			onClose={onToggle}
			closeTitle="Hide details"
			icon={
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
			}
		>
			<div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
				<SegmentedControl
					options={[
						{ value: "world", label: "World" },
						{ value: "nation", label: "Nation" },
					]}
					value={tab}
					onChange={setTab}
					tone="panel"
					size="sm"
				/>

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
		</DrawerShell>
	)
}
