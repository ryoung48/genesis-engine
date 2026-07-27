import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import type { SliderDef } from "@/ui/planet/screen/generation/sliders"
import { renderMiniSlider } from "@/ui/wiki/shared/ui-atoms"

export function buildSurfaceStats(
	planetSliders: SliderDef[],
	terrainSliders: SliderDef[],
): StatEntry[] {
	const landCoverageSlider = planetSliders.find(
		(slider) => slider.label === "Land Coverage",
	)
	const compositionSlider = planetSliders.find(
		(slider) =>
			slider.label === "Land Concentration" ||
			slider.label === "Ocean Concentration",
	)
	const landVariationSlider = terrainSliders.find(
		(slider) => slider.label === "Size Variety",
	)
	const seaLevelSlider = terrainSliders.find(
		(slider) => slider.label === "Sea Level",
	)
	const landCoverage = landCoverageSlider ? landCoverageSlider.value : 0.5
	// Displayed as "Hydrosphere" even though the underlying slider/state is
	// landCoverage -- the shown value is the water fraction (1 - landCoverage).
	const hydrosphere = 1 - landCoverage
	const compositionLabel = landCoverage < 0.5 ? "Land" : "Water"
	const variationLabel = landCoverage < 0.5 ? "Land" : "Water"

	return [
		{
			label: "Hydrosphere",
			value: landCoverageSlider ? `${Math.round(hydrosphere * 100)}%` : "50%",
			help: "Sets the overall land-to-water balance for the world.",
			editor: landCoverageSlider
				? {
						label: "Hydrosphere",
						value: hydrosphere,
						min: 1 - landCoverageSlider.max,
						max: 1 - landCoverageSlider.min,
						step: landCoverageSlider.step,
						display: `${Math.round(hydrosphere * 100)}%`,
						set: (value: number) => landCoverageSlider.set(1 - value),
						content: (
							<div className="flex w-44 flex-col gap-3 px-1 pt-0.5 pb-2">
								{renderMiniSlider(
									{
										...landCoverageSlider,
										value: hydrosphere,
										display: `${Math.round(hydrosphere * 100)}%`,
										set: (value: number) => landCoverageSlider.set(1 - value),
									},
									"Hydrosphere",
									`${Math.round(hydrosphere * 100)}%`,
								)}
								{compositionSlider
									? renderMiniSlider(
											compositionSlider,
											`${compositionLabel} Concentration`,
										)
									: null}
								{landVariationSlider
									? renderMiniSlider(
											landVariationSlider,
											`${variationLabel} Variation`,
										)
									: null}
								{seaLevelSlider
									? renderMiniSlider(seaLevelSlider, "Sea Level")
									: null}
							</div>
						),
					}
				: undefined,
		},
	]
}
