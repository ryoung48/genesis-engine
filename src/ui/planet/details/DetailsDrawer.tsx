import React, { useState } from "react"
import { DrawerShell } from "@/ui/components/composites/DrawerShell"
import {
	DEFAULT_NATION_SECTIONS,
	type NationSection,
	toggleSection,
} from "./drawer-state"
import { NationDetails } from "./nation/NationDetails"
import { type NationDetailsData } from "./shared"

// World Details now lives inline in the left GenerationPanel (see
// controls/GenerationPanel.tsx's `worldDetails` prop) rather than a tab
// here -- this drawer is Nation Details only, unchanged apart from that:
// still opens on nation selection.
interface DetailsDrawerProps {
	open: boolean
	onToggle: () => void
	nation: NationDetailsData | null
	onNationClick?: (nationId: number) => void
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
	open,
	onToggle,
	nation,
	onNationClick,
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
							onNationClick={onNationClick}
						/>
					</div>
				</DrawerShell>
			) : null}
		</>
	)
}
