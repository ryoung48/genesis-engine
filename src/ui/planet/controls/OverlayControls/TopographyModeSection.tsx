import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import type { ColorMode } from "@/ui/planet/colors"
import type { TopographySubMode } from "./types"

export interface TopographyModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	topographyExpanded: boolean
	setTopographyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	topographySubMode: TopographySubMode
	setTopographySubMode: (v: TopographySubMode) => void
}

export const TopographyModeSection: React.FC<TopographyModeSectionProps> = ({
	colorMode,
	setColorMode,
	topographyExpanded,
	setTopographyExpanded,
	topographySubMode,
	setTopographySubMode,
}) => {
	if (
		colorMode !== "topography" &&
		colorMode !== "slope" &&
		colorMode !== "eu5Topography"
	) {
		return null
	}
	return (
		<div>
			<CollapsibleSectionHeader
				title="Topography"
				expanded={topographyExpanded}
				onToggle={() => setTopographyExpanded((v) => !v)}
			/>
			{topographyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<SegmentedControl
						options={[
							{ value: "classification" as const, label: "Classification" },
							{ value: "slope" as const, label: "Slope" },
						]}
						value={topographySubMode}
						onChange={(v) => {
							setTopographySubMode(v)
							setColorMode(v === "classification" ? "topography" : "slope")
						}}
						tone="overlay"
					/>
				</div>
			)}
		</div>
	)
}
