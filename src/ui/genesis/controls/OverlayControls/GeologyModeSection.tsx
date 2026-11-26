import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { DepositsView } from "@/ui/genesis/shared/deposits-view/types"
import {
	GEOLOGY_MAP_MODE_OPTIONS,
	isGeologyColorMode,
} from "@/ui/genesis/shared/map-modes"
import { DepositsModeSection } from "./DepositsModeSection"

export interface GeologyModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	geologyExpanded: boolean
	setGeologyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	hasKarst: boolean
	showCaves: boolean
	setShowCaves: (v: boolean) => void
	hasDeposits: boolean
	depositsView: DepositsView
	setDepositsView: (v: DepositsView) => void
}

export const GeologyModeSection: React.FC<GeologyModeSectionProps> = ({
	colorMode,
	setColorMode,
	geologyExpanded,
	setGeologyExpanded,
	hasKarst,
	showCaves,
	setShowCaves,
	hasDeposits,
	depositsView,
	setDepositsView,
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
							([value]) =>
								(hasKarst || value !== "karst") &&
								(hasDeposits || value !== "deposits"),
						).map(([value, label]) => ({
							value,
							label,
						}))}
						value={colorMode}
						onChange={setColorMode}
					/>
					{colorMode === "deposits" && (
						<DepositsModeSection
							hasDeposits={hasDeposits}
							depositsView={depositsView}
							setDepositsView={setDepositsView}
						/>
					)}
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
