import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import type { ColorMode } from "@/ui/planet/colors"
import type { VegetationSubMode } from "./types"

export interface VegetationModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	vegetationExpanded: boolean
	setVegetationExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	vegetationSubMode: VegetationSubMode
	setVegetationSubMode: (v: VegetationSubMode) => void
}

export const VegetationModeSection: React.FC<VegetationModeSectionProps> = ({
	colorMode,
	setColorMode,
	vegetationExpanded,
	setVegetationExpanded,
	vegetationSubMode,
	setVegetationSubMode,
}) => {
	if (
		colorMode !== "vegetation" &&
		colorMode !== "vegetationMaps" &&
		colorMode !== "vegetationSatellite" &&
		colorMode !== "eu5Vegetation"
	) {
		return null
	}
	return (
		<div>
			<CollapsibleSectionHeader
				title="Vegetation"
				expanded={vegetationExpanded}
				onToggle={() => setVegetationExpanded((v) => !v)}
			/>
			{vegetationExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<SegmentedControl
						options={[
							{ value: "base" as const, label: "Base" },
							{ value: "maps" as const, label: "Maps" },
							{ value: "satellite" as const, label: "Satellite" },
						]}
						value={vegetationSubMode}
						onChange={(v) => {
							setVegetationSubMode(v)
							setColorMode(
								v === "base"
									? "vegetation"
									: v === "maps"
										? "vegetationMaps"
										: "vegetationSatellite",
							)
						}}
						tone="overlay"
					/>
				</div>
			)}
		</div>
	)
}
