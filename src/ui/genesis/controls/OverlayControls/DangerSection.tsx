import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { DangerSubMode } from "./types"

export interface DangerSectionProps {
	colorMode: ColorMode
	dangerExpanded: boolean
	setDangerExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	dangerSubMode: DangerSubMode
	setDangerSubMode: (v: DangerSubMode) => void
	hasCycloneRisk: boolean
	hasTornadoRisk: boolean
	hasTidalRisk: boolean
}

export const DangerSection: React.FC<DangerSectionProps> = ({
	colorMode,
	dangerExpanded,
	setDangerExpanded,
	dangerSubMode,
	setDangerSubMode,
	hasCycloneRisk,
	hasTornadoRisk,
	hasTidalRisk,
}) => {
	if (colorMode !== "dangerZones") return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Danger"
				expanded={dangerExpanded}
				onToggle={() => setDangerExpanded((v) => !v)}
			/>
			{dangerExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Danger mode"
						orientation="horizontal"
						options={[
							{ value: "earthquake" as const, label: "Earthquakes" },
							{ value: "volcanic" as const, label: "Volcanic" },
							{
								value: "cyclone" as const,
								label: "Cyclones",
								disabled: !hasCycloneRisk,
							},
							{
								value: "tornado" as const,
								label: "Tornadoes",
								disabled: !hasTornadoRisk,
							},
							{
								value: "tidal" as const,
								label: "Tidal Range",
								disabled: !hasTidalRisk,
							},
						]}
						value={dangerSubMode}
						onChange={setDangerSubMode}
					/>
				</div>
			)}
		</div>
	)
}
