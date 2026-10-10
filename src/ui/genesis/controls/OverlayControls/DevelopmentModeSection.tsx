import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { DevelopmentModeSectionProps } from "./types"

export const DevelopmentModeSection: React.FC<DevelopmentModeSectionProps> = ({
	colorMode,
	societyMode,
	setSocietyMode,
	isEarthImport,
}) => {
	const [expanded, setExpanded] = React.useState(true)
	if (
		colorMode !== "population" ||
		isEarthImport ||
		(societyMode !== "development" && societyMode !== "knowledge")
	)
		return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Development"
				expanded={expanded}
				onToggle={() => setExpanded((value) => !value)}
			/>
			{expanded && (
				<RadioGroup
					label="Development mode"
					orientation="horizontal"
					options={[
						{ value: "development" as const, label: "Development" },
						{ value: "knowledge" as const, label: "Knowledge" },
					]}
					value={societyMode}
					onChange={setSocietyMode}
				/>
			)}
		</div>
	)
}
