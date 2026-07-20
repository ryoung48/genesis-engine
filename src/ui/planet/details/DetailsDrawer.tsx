import React, { useState } from "react"
import type { HistoryNote } from "@/model/history"
import { DrawerShell } from "@/ui/components/composites/DrawerShell"
import {
	DEFAULT_NATION_SECTIONS,
	type NationSection,
	toggleSection,
} from "./drawer-state"
import { NationDetails } from "./nation/NationDetails"
import type { NationHistoryPoint } from "./nation/NationHistoryChart"
import { type NationDetailsData } from "./shared"

// World Details now lives inline in the left GenerationPanel (see
// controls/GenerationPanel.tsx's `worldDetails` prop) rather than a tab
// here -- this drawer is Nation Details only, unchanged apart from that:
// still opens on nation selection.
interface DetailsDrawerProps {
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
	const [openNationSections, setOpenNationSections] = useState<
		ReadonlySet<NationSection>
	>(DEFAULT_NATION_SECTIONS)

	return (
		<>
			{open ? (
				<DrawerShell title={nation?.name ?? "Nation"}>
					<div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
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
					</div>
				</DrawerShell>
			) : null}
		</>
	)
}
