import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
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
}

export const GeologyModeSection: React.FC<GeologyModeSectionProps> = ({
	colorMode,
	setColorMode,
	geologyExpanded,
	setGeologyExpanded,
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
						options={GEOLOGY_MAP_MODE_OPTIONS.map(([value, label]) => ({
							value,
							label,
						}))}
						value={colorMode}
						onChange={setColorMode}
					/>
				</div>
			)}
		</div>
	)
}
