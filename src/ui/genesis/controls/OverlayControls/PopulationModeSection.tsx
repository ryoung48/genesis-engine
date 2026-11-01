import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"
import type { PopulationModeSectionProps } from "./types"

export const PopulationModeSection: React.FC<PopulationModeSectionProps> = ({
	colorMode,
	societyMode,
	setSocietyMode,
	isEarthImport,
}) => {
	const [expanded, setExpanded] = React.useState(true)
	if (
		getBaseMapMode(colorMode) !== "population" ||
		isEarthImport ||
		(societyMode !== "density" && societyMode !== "migration")
	)
		return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Population"
				expanded={expanded}
				onToggle={() => setExpanded((value) => !value)}
			/>
			{expanded && (
				<RadioGroup
					label="Population mode"
					orientation="horizontal"
					options={[
						{ value: "density" as const, label: "Density" },
						{ value: "migration" as const, label: "Migration" },
					]}
					value={societyMode}
					onChange={setSocietyMode}
				/>
			)}
		</div>
	)
}
