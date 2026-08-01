import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/planet/colors"
import type { ClimateSubMode } from "./types"

export interface ClimateModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	climateExpanded: boolean
	setClimateExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	climateSubMode: ClimateSubMode
	setClimateSubMode: (v: ClimateSubMode) => void
	showGdd: boolean
	setShowGdd: (v: boolean) => void
	showGint: boolean
	setShowGint: (v: boolean) => void
	showPet: boolean
	setShowPet: (v: boolean) => void
	showAet: boolean
	setShowAet: (v: boolean) => void
}

/** "Climate" colorMode block (basic/pasta/koppen submodes + GDD/GInt/PET/AET
 * overlay toggles). Distinct from ClimateToggleSection, which handles the
 * separate temperature/rainfall/wind colorMode header block. */
export const ClimateModeSection: React.FC<ClimateModeSectionProps> = ({
	colorMode,
	setColorMode,
	climateExpanded,
	setClimateExpanded,
	climateSubMode,
	setClimateSubMode,
	showGdd,
	setShowGdd,
	showGint,
	setShowGint,
	showPet,
	setShowPet,
	showAet,
	setShowAet,
}) => {
	if (
		colorMode !== "climate" &&
		colorMode !== "pastaClimate" &&
		colorMode !== "koppenClimate" &&
		colorMode !== "realPastaClimate" &&
		colorMode !== "realKoppenClimate" &&
		colorMode !== "eu5Climate"
	) {
		return null
	}
	return (
		<div>
			<CollapsibleSectionHeader
				title="Climate"
				expanded={climateExpanded}
				onToggle={() => setClimateExpanded((v) => !v)}
			/>
			{climateExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<SegmentedControl
						options={[
							{ value: "basic" as const, label: "Basic" },
							{ value: "pasta" as const, label: "Pasta" },
							{ value: "koppen" as const, label: "Koppen" },
						]}
						value={climateSubMode}
						onChange={(v) => {
							setClimateSubMode(v)
							setColorMode(
								v === "basic"
									? "climate"
									: v === "pasta"
										? "pastaClimate"
										: "koppenClimate",
							)
						}}
						tone="overlay"
					/>
					<div className="border-t border-white/10" />
					<ToggleRow label="GDD" checked={showGdd} onChange={setShowGdd} />
					<ToggleRow label="GInt" checked={showGint} onChange={setShowGint} />
					<ToggleRow label="PET" checked={showPet} onChange={setShowPet} />
					<ToggleRow label="AET" checked={showAet} onChange={setShowAet} />
				</div>
			)}
		</div>
	)
}
