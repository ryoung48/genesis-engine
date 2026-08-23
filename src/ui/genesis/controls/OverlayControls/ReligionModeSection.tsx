import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type {
	ReligionMapMode,
	SocietyMapMode,
} from "@/ui/genesis/shared/map-modes"

interface ReligionModeSectionProps {
	colorMode: ColorMode
	societyMode: SocietyMapMode
	religionMode: ReligionMapMode
	setReligionMode: (value: ReligionMapMode) => void
	religionExpanded: boolean
	setReligionExpanded: (
		value: boolean | ((previous: boolean) => boolean),
	) => void
}

export const ReligionModeSection: React.FC<ReligionModeSectionProps> = ({
	colorMode,
	societyMode,
	religionMode,
	setReligionMode,
	religionExpanded,
	setReligionExpanded,
}) => {
	if (colorMode !== "population" || societyMode !== "religion") return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Religion"
				expanded={religionExpanded}
				onToggle={() => setReligionExpanded((value) => !value)}
			/>
			{religionExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Religion mode"
						orientation="horizontal"
						options={[
							{ value: "religions" as const, label: "Religions" },
							{ value: "types" as const, label: "Types" },
						]}
						value={religionMode}
						onChange={setReligionMode}
					/>
				</div>
			)}
		</div>
	)
}
