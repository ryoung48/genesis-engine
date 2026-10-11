import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { ElevationSubMode } from "@/ui/genesis/shared/map-modes"
import {
	ELEVATION_SUB_MODE_COLOR_MODE,
	isElevationColorMode,
} from "@/ui/genesis/shared/map-modes"

export interface ElevationModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	elevationExpanded: boolean
	setElevationExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	elevationSubMode: ElevationSubMode
	setElevationSubMode: (v: ElevationSubMode) => void
}

export const ElevationModeSection: React.FC<ElevationModeSectionProps> = ({
	colorMode,
	setColorMode,
	elevationExpanded,
	setElevationExpanded,
	elevationSubMode,
	setElevationSubMode,
}) => {
	if (!isElevationColorMode(colorMode)) return null
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
							{ value: "alt" as const, label: "Alt" },
						]}
						value={elevationSubMode}
						onChange={(v) => {
							setElevationSubMode(v)
							setColorMode(ELEVATION_SUB_MODE_COLOR_MODE[v])
						}}
					/>
				</div>
			)}
		</div>
	)
}
