import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
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
	availableModes,
	showMigrationRoutes,
	setShowMigrationRoutes,
}) => {
	const [expanded, setExpanded] = React.useState(true)
	if (
		getBaseMapMode(colorMode) !== "population" ||
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
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Population mode"
						orientation="horizontal"
						options={POPULATION_MAP_MODE_OPTIONS.filter(([value]) =>
							availableModes.includes(value),
						).map(([value, label]) => ({
							value,
							label,
						}))}
						value={societyMode}
						onChange={setSocietyMode}
					/>
					<ToggleRow
						label="Migration route"
						checked={showMigrationRoutes}
						onChange={setShowMigrationRoutes}
					/>
				</div>
			)}
		</div>
	)
}
