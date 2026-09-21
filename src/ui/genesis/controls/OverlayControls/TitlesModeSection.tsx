import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import {
	isTitlesNationMode,
	type NationMapMode,
	TITLE_BORDER_TIERS,
	type TitleBorderTier,
} from "@/ui/genesis/shared/map-modes"

export interface TitlesModeSectionProps {
	colorMode: ColorMode
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	nationsExpanded: boolean
	setNationsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	titleBorderTiers: readonly TitleBorderTier[]
	setTitleBorderTiers: (tiers: TitleBorderTier[]) => void
}

const TIER_LABELS: Record<TitleBorderTier, string> = {
	barony: "Barony",
	county: "County",
	duchy: "Duchy",
	kingdom: "Kingdom",
	empire: "Empire",
	hegemony: "Hegemony",
}

export const TitlesModeSection: React.FC<TitlesModeSectionProps> = ({
	colorMode,
	nationMode,
	setNationMode,
	nationsExpanded,
	setNationsExpanded,
	titleBorderTiers,
	setTitleBorderTiers,
}) => {
	if (colorMode !== "nations" || !isTitlesNationMode(nationMode)) return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Titles"
				expanded={nationsExpanded}
				onToggle={() => setNationsExpanded((v) => !v)}
			/>
			{nationsExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<RadioGroup
						label="Title tier"
						orientation="horizontal"
						options={[
							{ value: "titlesBarony" as const, label: "Barony" },
							{ value: "titlesCounty" as const, label: "County" },
							{ value: "titlesDuchy" as const, label: "Duchy" },
							{ value: "titlesKingdom" as const, label: "Kingdom" },
							{ value: "titlesEmpire" as const, label: "Empire" },
							{ value: "titlesHegemony" as const, label: "Hegemony" },
							{ value: "titlesRanks" as const, label: "Ranks" },
						]}
						value={nationMode}
						onChange={(v) => setNationMode(v)}
					/>
					<div className="border-t border-white/10 pt-1.5">
						<div className="mb-1 text-[11px] font-medium text-slate-400">
							Borders
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1">
							{TITLE_BORDER_TIERS.map((tier) => (
								<ToggleRow
									key={tier}
									label={TIER_LABELS[tier]}
									checked={titleBorderTiers.includes(tier)}
									onChange={(checked) =>
										setTitleBorderTiers(
											TITLE_BORDER_TIERS.filter((entry) =>
												entry === tier
													? checked
													: titleBorderTiers.includes(entry),
											),
										)
									}
								/>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
