import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"

export interface PoliticalSectionProps {
	politicalExpanded: boolean
	setPoliticalExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	showNationHierarchy: boolean
	setShowNationHierarchy: (v: boolean) => void
	showLandBorders: boolean
	setShowLandBorders: (v: boolean) => void
	showNationBorders: boolean
	setShowNationBorders: (v: boolean) => void
}

export const PoliticalSection: React.FC<PoliticalSectionProps> = ({
	politicalExpanded,
	setPoliticalExpanded,
	showNationHierarchy,
	setShowNationHierarchy,
	showLandBorders,
	setShowLandBorders,
	showNationBorders,
	setShowNationBorders,
}) => {
	return (
		<div>
			<CollapsibleSectionHeader
				title="Political"
				expanded={politicalExpanded}
				onToggle={() => setPoliticalExpanded((v) => !v)}
			/>
			{politicalExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<ToggleRow
						label="Hierarchy"
						checked={showNationHierarchy}
						onChange={setShowNationHierarchy}
					/>
					<ToggleRow
						label="Land Borders"
						checked={showLandBorders}
						onChange={setShowLandBorders}
					/>
					<ToggleRow
						label="Borders"
						checked={showNationBorders}
						onChange={setShowNationBorders}
					/>
				</div>
			)}
		</div>
	)
}
