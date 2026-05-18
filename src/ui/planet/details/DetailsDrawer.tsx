import React, { useEffect, useRef, useState } from "react"
import type { HistoryNote } from "@/model/history"
import { DrawerShell } from "@/ui/components/composites/DrawerShell"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
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
	onProvinceClick?: (provinceId: number) => void
	getNationName?: (nationId: number) => string
	getNationColor?: (nationId: number) => string | null
	getProvinceName?: (provinceId: number) => string
	getProvinceColor?: (provinceId: number) => string | null
	getDynastyName?: (dynastyId: number) => string
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
	open,
	onToggle,
	nation,
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	heritageCount,
	faithCount,
	religionCount,
	nationSizeDistribution,
	conflictDistribution,
	relationDistribution,
	climateDistribution,
	vegetationDistribution,
	topographyDistribution,
	tradeGoodsDistribution,
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
	const [tab, setTab] = useState<"world" | "nation">("world")
	const [worldSection, setWorldSection] = useState<WorldSection>("planetary")
	const [nationSection, setNationSection] = useState<NationSection>("political")
	const previousNationIdRef = useRef<number | null>(null)
	const detailsIcon = (
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
	)

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

	return (
		<>
			<div className="pointer-events-none absolute right-3 top-3 z-20">
				{!open ? (
					<Tooltip content="Show details" position="bottom" align="end">
						<IconButton
							onClick={onToggle}
							tone="overlay"
							shape="rounded"
							size="sm"
							className="pointer-events-auto shadow-lg backdrop-blur-md"
						>
							{detailsIcon}
						</IconButton>
					</Tooltip>
				) : null}
			</div>
			{open ? (
				<DrawerShell
					title="DETAILS"
					onClose={onToggle}
					closeTitle="Hide details"
					icon={detailsIcon}
				>
					<div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
						<div className="flex items-center justify-between">
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
							{tab === "nation" && nation && (
								<span className="font-mono text-[10px] text-slate-400">
									#{nation.id}
								</span>
							)}
						</div>

						{tab === "world" ? (
							<WorldDetails
								section={worldSection}
								onSectionChange={setWorldSection}
								planetStats={planetStats}
								worldPopulation={worldPopulation}
								activeWarCount={activeWarCount}
								cultureCount={cultureCount}
								heritageCount={heritageCount}
								faithCount={faithCount}
								religionCount={religionCount}
								nationSizeDistribution={nationSizeDistribution}
								conflictDistribution={conflictDistribution}
								relationDistribution={relationDistribution}
								climateDistribution={climateDistribution}
								vegetationDistribution={vegetationDistribution}
								topographyDistribution={topographyDistribution}
								tradeGoodsDistribution={tradeGoodsDistribution}
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
								onProvinceClick={onProvinceClick}
								getNationName={getNationName}
								getNationColor={getNationColor}
								getProvinceName={getProvinceName}
								getProvinceColor={getProvinceColor}
								getDynastyName={getDynastyName}
							/>
						)}
					</div>
				</DrawerShell>
			) : null}
		</>
	)
}
