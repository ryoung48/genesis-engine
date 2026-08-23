import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"
import type {
	NationMapMode,
	SocietyMapMode,
} from "@/ui/genesis/shared/map-modes"
import type { LabelMode } from "./types"

export interface SocietySectionProps {
	societyExpanded: boolean
	setSocietyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	showNationHierarchy: boolean
	setShowNationHierarchy: (v: boolean) => void
	showNationBorders: boolean
	setShowNationBorders: (v: boolean) => void
	showInfrastructure: boolean
	setShowInfrastructure: (v: boolean) => void
	colorMode: ColorMode
	populationMode: SocietyMapMode
	nationMode: NationMapMode
	labelMode: LabelMode
	setLabelMode: (v: LabelMode) => void
	isEarthImport: boolean
}

export const SocietySection: React.FC<SocietySectionProps> = ({
	societyExpanded,
	setSocietyExpanded,
	showNationHierarchy,
	setShowNationHierarchy,
	showNationBorders,
	setShowNationBorders,
	showInfrastructure,
	setShowInfrastructure,
	colorMode,
	populationMode,
	nationMode,
	labelMode,
	setLabelMode,
	isEarthImport,
}) => {
	return (
		<div>
			<CollapsibleSectionHeader
				title="Society"
				expanded={societyExpanded}
				onToggle={() => setSocietyExpanded((v) => !v)}
			/>
			{societyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<ToggleRow
						label="Hierarchy"
						checked={showNationHierarchy}
						onChange={setShowNationHierarchy}
					/>
					<ToggleRow
						label="Borders"
						checked={showNationBorders}
						onChange={setShowNationBorders}
					/>
					<ToggleRow
						label="Infrastructure"
						checked={showInfrastructure}
						onChange={setShowInfrastructure}
					/>
					<ToggleRow
						label="Labels"
						checked={
							labelMode.nations ||
							labelMode.dynasty ||
							labelMode.culture ||
							labelMode.heritage
						}
						onChange={(checked) => {
							const isPopMode = getBaseMapMode(colorMode) === "population"
							const isCulture = isPopMode && populationMode === "culture"
							const isHeritage =
								isPopMode &&
								(populationMode === "heritage" || populationMode === "religion")
							const isDynasty = !isPopMode && nationMode === "dynasty"
							setLabelMode({
								...labelMode,
								nations: checked && !isCulture && !isHeritage && !isDynasty,
								dynasty: checked && isDynasty,
								culture: checked && isCulture,
								heritage: checked && isHeritage,
							})
						}}
					/>
					{!isEarthImport && (
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
					)}
				</div>
			)}
		</div>
	)
}
