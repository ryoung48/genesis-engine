import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/planet/colors"
import { getBaseMapMode } from "@/ui/planet/screen/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/planet/screen/shared/map-modes"
import type { LabelMode } from "./types"

export interface LabelsSectionProps {
	labelsExpanded: boolean
	setLabelsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	colorMode: ColorMode
	populationMode: PopulationMapMode
	nationMode: NationMapMode
	labelMode: LabelMode
	setLabelMode: (v: LabelMode) => void
}

export const LabelsSection: React.FC<LabelsSectionProps> = ({
	labelsExpanded,
	setLabelsExpanded,
	colorMode,
	populationMode,
	nationMode,
	labelMode,
	setLabelMode,
}) => {
	return (
		<div>
			<CollapsibleSectionHeader
				title="Labels"
				expanded={labelsExpanded}
				onToggle={() => setLabelsExpanded((v) => !v)}
			/>
			{labelsExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<ToggleRow
						label={
							getBaseMapMode(colorMode) === "population" &&
							populationMode === "culture"
								? "Culture"
								: getBaseMapMode(colorMode) === "population" &&
										(populationMode === "heritage" ||
											populationMode === "religion")
									? "Heritage"
									: nationMode === "dynasty"
										? "Dynasty"
										: "Nations"
						}
						checked={
							labelMode.nations ||
							labelMode.dynasty ||
							labelMode.culture ||
							labelMode.heritage
						}
						onChange={(checked) => {
							const isPopMode = getBaseMapMode(colorMode) === "population"
							const isDynasty = nationMode === "dynasty"
							setLabelMode({
								...labelMode,
								nations: checked && !isPopMode && !isDynasty,
								dynasty: checked && !isPopMode && isDynasty,
								culture: checked && isPopMode && populationMode === "culture",
								heritage:
									checked &&
									isPopMode &&
									(populationMode === "heritage" ||
										populationMode === "religion"),
							})
						}}
					/>
					<ToggleRow
						label="Settlements"
						checked={labelMode.settlements}
						onChange={(checked) =>
							setLabelMode({
								...labelMode,
								settlements: checked,
							})
						}
					/>
					<ToggleRow
						label="Script"
						checked={labelMode.script}
						onChange={(checked) =>
							setLabelMode({
								...labelMode,
								script: checked,
							})
						}
					/>
				</div>
			)}
		</div>
	)
}
