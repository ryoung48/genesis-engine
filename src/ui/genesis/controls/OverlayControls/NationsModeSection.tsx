import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { NationMapMode } from "@/ui/genesis/shared/map-modes"

export interface NationsModeSectionProps {
	colorMode: ColorMode
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	nationsExpanded: boolean
	setNationsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
}

/** "Nations" (borders) colorMode submode toggle -- Normal vs. Organizations
 * (colors provinces purple for an Imperial Patchwork member, green for a
 * Trade League member; see region-colors.ts's nationMode === "organizations"
 * branch). Deliberately not a ModeBar tray button (no DEFAULT_POLITICAL_MODE_
 * OPTIONS entry, see map-modes.ts's NationMapMode "organizations" doc
 * comment) -- same RadioGroup-submode pattern as TopographyModeSection/
 * ClimateModeSection, just keyed on nationMode instead of colorMode since
 * "Nations" itself doesn't have colorMode variants the way climate/topography
 * do. */
export const NationsModeSection: React.FC<NationsModeSectionProps> = ({
	colorMode,
	nationMode,
	setNationMode,
	nationsExpanded,
	setNationsExpanded,
}) => {
	if (colorMode !== "nations") return null
	if (nationMode !== "borders" && nationMode !== "organizations") return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Nations"
				expanded={nationsExpanded}
				onToggle={() => setNationsExpanded((v) => !v)}
			/>
			{nationsExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Nations mode"
						orientation="horizontal"
						options={[
							{ value: "borders" as const, label: "Territory" },
							{ value: "organizations" as const, label: "Organizations" },
						]}
						value={nationMode}
						onChange={(v) => setNationMode(v)}
					/>
				</div>
			)}
		</div>
	)
}
