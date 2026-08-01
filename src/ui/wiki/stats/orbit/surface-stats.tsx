import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { Slider } from "@/ui/components/primitives/Slider"
import type { SliderDef } from "@/ui/planet/screen/generation/sliders"

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
								<Slider
									label="Hydrosphere"
									value={`${Math.round(hydrosphere * 100)}%`}
									min={landCoverageSlider.min}
									max={landCoverageSlider.max}
									step={landCoverageSlider.step}
									inputValue={hydrosphere}
									onChange={(value) => landCoverageSlider.set(1 - value)}
								/>
								{compositionSlider ? (
									<Slider
										label={`${compositionLabel} Concentration`}
										value={compositionSlider.display}
										min={compositionSlider.min}
										max={compositionSlider.max}
										step={compositionSlider.step}
										inputValue={compositionSlider.value}
										onChange={compositionSlider.set}
									/>
								) : null}
								{landVariationSlider ? (
									<Slider
										label={`${variationLabel} Variation`}
										value={landVariationSlider.display}
										min={landVariationSlider.min}
										max={landVariationSlider.max}
										step={landVariationSlider.step}
										inputValue={landVariationSlider.value}
										onChange={landVariationSlider.set}
									/>
								) : null}
								{seaLevelSlider ? (
									<Slider
										label="Sea Level"
										value={seaLevelSlider.display}
										min={seaLevelSlider.min}
										max={seaLevelSlider.max}
										step={seaLevelSlider.step}
										inputValue={seaLevelSlider.value}
										onChange={seaLevelSlider.set}
									/>
								) : null}
							</div>
						),
					}
				: undefined,
		},
	]
}
