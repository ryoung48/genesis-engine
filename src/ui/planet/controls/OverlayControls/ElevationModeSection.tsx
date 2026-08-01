import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/planet/colors"

export interface ElevationModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	elevationExpanded: boolean
	setElevationExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	elevationSubMode: "colored" | "grayscale"
	setElevationSubMode: (v: "colored" | "grayscale") => void
}

export const ElevationModeSection: React.FC<ElevationModeSectionProps> = ({
	colorMode,
	setColorMode,
	elevationExpanded,
	setElevationExpanded,
	elevationSubMode,
	setElevationSubMode,
}) => {
	if (colorMode !== "terrain" && colorMode !== "landHeightmap") return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Elevation"
				expanded={elevationExpanded}
				onToggle={() => setElevationExpanded((v) => !v)}
			/>
			{elevationExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Elevation mode"
						orientation="horizontal"
						options={[
							{ value: "colored" as const, label: "Colored" },
							{ value: "grayscale" as const, label: "Grayscale" },
						]}
						value={elevationSubMode}
						onChange={(v) => {
							setElevationSubMode(v)
							setColorMode(v === "colored" ? "terrain" : "landHeightmap")
						}}
					/>
				</div>
			)}
		</div>
	)
}
