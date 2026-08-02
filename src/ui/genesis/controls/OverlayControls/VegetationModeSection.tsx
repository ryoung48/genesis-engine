import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"
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
		colorMode !== "realVegetation" &&
		colorMode !== "realVegetationMaps" &&
		colorMode !== "realVegetationSatellite" &&
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
					<RadioGroup
						label="Vegetation mode"
						orientation="horizontal"
						options={[
							{ value: "base" as const, label: "Base" },
							{ value: "maps" as const, label: "Maps" },
							{ value: "satellite" as const, label: "Satellite" },
							{ value: "eu5" as const, label: "Alt" },
						]}
						value={vegetationSubMode}
						onChange={(v) => {
							setVegetationSubMode(v)
							if (v === "eu5") {
								setColorMode("eu5Vegetation")
								return
							}
							const observed =
								colorMode === "realVegetation" ||
								colorMode === "realVegetationMaps" ||
								colorMode === "realVegetationSatellite"
							setColorMode(
								v === "base"
									? observed
										? "realVegetation"
										: "vegetation"
									: v === "maps"
										? observed
											? "realVegetationMaps"
											: "vegetationMaps"
										: observed
											? "realVegetationSatellite"
											: "vegetationSatellite",
							)
						}}
					/>
				</div>
			)}
		</div>
	)
}
