import React, { useEffect, useRef, useState } from "react"
import type { HistoryNote } from "@/model/history"
import { DrawerShell } from "@/ui/components/composites/DrawerShell"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import {
	DEFAULT_NATION_SECTIONS,
	DEFAULT_WORLD_SECTIONS,
	type NationSection,
	resolveDrawerStateOnOpen,
	toggleSection,
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
	planetName,
	planetType,
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
	const [openWorldSections, setOpenWorldSections] =
		useState<ReadonlySet<WorldSection>>(DEFAULT_WORLD_SECTIONS)
	const [openNationSections, setOpenNationSections] =
		useState<ReadonlySet<NationSection>>(DEFAULT_NATION_SECTIONS)
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
			current: { tab, openWorldSections, openNationSections },
			selectedNationId: nation?.id ?? null,
			previousNationId: previousNationIdRef.current,
		})
		if (nextState.tab !== tab) setTab(nextState.tab)
		previousNationIdRef.current = nation?.id ?? null
	}, [open, nation?.id, tab, openWorldSections, openNationSections])

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
				<DrawerShell>
					<div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
						{tab === "world" ? (
							<WorldDetails
								openSections={openWorldSections}
								onSectionToggle={(s) =>
									setOpenWorldSections((prev) => toggleSection(prev, s))
								}
								onClose={onToggle}
								planetName={planetName}
								planetType={planetType}
								planetStats={planetStats}
								worldPopulation={worldPopulation}
								activeWarCount={activeWarCount}
								cultureCount={cultureCount}
								heritageCount={heritageCount}
								religionCount={religionCount}
								nationSizeDistribution={nationSizeDistribution}
								governmentDistribution={governmentDistribution}
								religionDistribution={religionDistribution}
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
								openSections={openNationSections}
								onSectionToggle={(s) =>
									setOpenNationSections((prev) => toggleSection(prev, s))
								}
								onClose={onToggle}
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
