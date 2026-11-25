import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import {
	GEOLOGY_MAP_MODE_OPTIONS,
	isGeologyColorMode,
} from "@/ui/genesis/shared/map-modes"

export interface GeologyModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	geologyExpanded: boolean
	setGeologyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	hasKarst: boolean
	showCaves: boolean
	setShowCaves: (v: boolean) => void
}

export const GeologyModeSection: React.FC<GeologyModeSectionProps> = ({
	colorMode,
	setColorMode,
	geologyExpanded,
	setGeologyExpanded,
	hasKarst,
	showCaves,
	setShowCaves,
}) => {
	if (!isGeologyColorMode(colorMode)) return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Geology"
				expanded={geologyExpanded}
				onToggle={() => setGeologyExpanded((v) => !v)}
			/>
			{geologyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Geology mode"
						orientation="horizontal"
						options={GEOLOGY_MAP_MODE_OPTIONS.filter(
							([value]) => hasKarst || value !== "karst",
						).map(([value, label]) => ({
							value,
							label,
						}))}
						value={colorMode}
						onChange={setColorMode}
					/>
					{colorMode === "karst" && hasKarst && (
						<ToggleRow
							label="Caves"
							checked={showCaves}
							onChange={setShowCaves}
						/>
					)}
				</div>
			)}
		</div>
	)
}
