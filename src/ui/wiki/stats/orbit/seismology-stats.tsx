import type { SeismologyProfile } from "@/model/celestial/orbit-body"
import type { SurfaceTidesBreakdown } from "@/model/climate/tidal-schedule"
import { ContributionTooltipContent } from "@/ui/components/composites/ContributionTooltipContent"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { formatClassificationLabel } from "./formatters"

export function buildSeismologyStats(
	seismology: SeismologyProfile | undefined,
	surfaceTidesM?: SurfaceTidesBreakdown,
): StatEntry[] {
	if (!seismology) return []
	const surfaceTideItems =
		surfaceTidesM && surfaceTidesM.contributions.length > 0
			? surfaceTidesM.contributions
					.slice()
					.sort((a, b) => b.valueM - a.valueM)
					.map((contribution) => ({
						label: contribution.label,
						value: `${contribution.valueM.toFixed(3)} m`,
						tone: "cool" as const,
					}))
			: []
	return [
		{
			label: "Seismology",
			valuePrefix: seismology.totalHeating.toFixed(3),
			value: `· ${formatClassificationLabel(seismology.regime)}`,
			valueHelp: (
				<div className="space-y-3">
					<ContributionTooltipContent
						title="Seismology Sources"
						items={[
							{
								label: "Residual",
								value: seismology.residualHeating.toFixed(2),
								tone: "neutral" as const,
							},
							{
								label: "Tidal Heating",
								value: seismology.tidalHeating.toFixed(2),
								tone: "warm" as const,
							},
							{
								label: "Surface Tides",
								value: seismology.surfaceTidesHeating.toFixed(3),
								tone: "cool" as const,
							},
						]}
					/>
					{surfaceTideItems.length > 0 ? (
						<ContributionTooltipContent
							title="Surface Tide Sources"
							items={surfaceTideItems}
						/>
					) : null}
				</div>
			),
			valueHelpTarget: "prefix",
		},
	]
}
