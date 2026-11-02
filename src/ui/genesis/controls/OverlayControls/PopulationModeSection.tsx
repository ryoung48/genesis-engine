import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"
import {
	isPopulationSocietyMode,
	POPULATION_MAP_MODE_OPTIONS,
} from "@/ui/genesis/shared/map-modes"
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
		!isPopulationSocietyMode(societyMode)
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
				<div className="mt-1.5">
					<RadioGroup
						label="Population mode"
						orientation="horizontal"
						options={POPULATION_MAP_MODE_OPTIONS.map(([value, label]) => ({
							value,
							label,
						}))}
						value={societyMode}
						onChange={setSocietyMode}
					/>
				</div>
			)}
		</div>
	)
}
