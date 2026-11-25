import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { TopographySubMode } from "./types"

export interface TopographyModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	topographyExpanded: boolean
	setTopographyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	topographySubMode: TopographySubMode
	setTopographySubMode: (v: TopographySubMode) => void
	hasGroundwater: boolean
	showWaterSymbols: boolean
	setShowWaterSymbols: (v: boolean) => void
}

const SUB_MODE_COLOR_MODE: Record<TopographySubMode, ColorMode> = {
	classification: "topography",
	slope: "slope",
	waterTable: "waterTable",
	wetlands: "wetlands",
	eu5: "eu5Topography",
}

export const TopographyModeSection: React.FC<TopographyModeSectionProps> = ({
	colorMode,
	setColorMode,
	topographyExpanded,
	setTopographyExpanded,
	topographySubMode,
	setTopographySubMode,
	hasGroundwater,
	showWaterSymbols,
	setShowWaterSymbols,
}) => {
	if (
		colorMode !== "topography" &&
		colorMode !== "slope" &&
		colorMode !== "eu5Topography" &&
		colorMode !== "waterTable" &&
		colorMode !== "wetlands"
	) {
		return null
	}
	const options: Array<{ value: TopographySubMode; label: string }> = [
		{ value: "classification", label: "Classification" },
		{ value: "slope", label: "Slope" },
	]
	if (hasGroundwater) {
		options.push(
			{ value: "waterTable", label: "Water table" },
			{ value: "wetlands", label: "Wetlands" },
		)
	}
	const groundwaterMode = colorMode === "waterTable" || colorMode === "wetlands"
	return (
		<div>
			<CollapsibleSectionHeader
				title="Topography"
				expanded={topographyExpanded}
				onToggle={() => setTopographyExpanded((v) => !v)}
			/>
			{topographyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Topography mode"
						orientation="horizontal"
						options={options}
						value={topographySubMode}
						onChange={(v) => {
							setTopographySubMode(v)
							setColorMode(SUB_MODE_COLOR_MODE[v])
						}}
					/>
					{groundwaterMode && hasGroundwater && (
						<ToggleRow
							label="Springs and oases"
							checked={showWaterSymbols}
							onChange={setShowWaterSymbols}
						/>
					)}
				</div>
			)}
		</div>
	)
}
