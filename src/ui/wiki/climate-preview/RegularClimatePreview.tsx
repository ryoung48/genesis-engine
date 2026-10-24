import React from "react"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import { ContourChart } from "@/ui/components/composites/charts/ContourChart"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { RegularClimatePreviewData } from "@/ui/wiki/climate-preview/types"

interface RegularClimatePreviewProps {
	preview: RegularClimatePreviewData
	activeTab: GenerationPreviewTab
}

function buildNormalizedDaylightColorFn(
	matrix: readonly (readonly number[])[],
): (value: number) => string {
	let min = Infinity
	let max = -Infinity
	for (const row of matrix) {
		for (const value of row) {
			if (value < min) min = value
			if (value > max) max = value
		}
	}
	return (value: number) =>
		rgbToCss(
			COLOR_INTERPOLATION.sampleColorStops({
				stops: COLOR_PALETTES.purplesStops,
				t: COLOR_INTERPOLATION.mapLinear({
					value,
					domainStart: min,
					domainEnd: max,
					rangeStart: 1,
					rangeEnd: 0,
					clamp: true,
				}),
			}),
		)
}

type CellLabel = { rowValue: number; columnValue: number; value: number }

function buildPreviewChartProps(
	preview: RegularClimatePreviewData,
	activeTab: GenerationPreviewTab,
) {
	if (activeTab === "daylight")
		return {
			matrix: preview.daylight,
			colorForValue: buildNormalizedDaylightColorFn(preview.daylight),
			legendTitle: "Daylight",
			formatLegendValue: (value: number) => `${value.toFixed(1)} hrs`,
			tooltipLabel: ({ rowValue, columnValue, value }: CellLabel) =>
				`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} hrs`,
		}
	return {
		matrix: preview.insolation,
		colorForValue: preview.insolColorFn,
		legendTitle: "Insolation",
		formatLegendValue: (value: number) => `${value.toFixed(0)} W/m²`,
		tooltipLabel: ({ rowValue, columnValue, value }: CellLabel) =>
			`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} W/m²`,
	}
}

export const RegularClimatePreview: React.FC<RegularClimatePreviewProps> = ({
	preview,
	activeTab,
}) => {
	const chartProps = buildPreviewChartProps(preview, activeTab)

	return (
		<ContourChart
			matrix={chartProps.matrix}
			rowValues={preview.lats}
			columnValues={preview.columnValues}
			columnLabels={preview.columnLabels}
			colorForValue={chartProps.colorForValue}
			datasetLabel={(lat: number) => `Lat ${lat.toFixed(1)}°`}
			rowTickLabel={(lat: number) => `${lat.toFixed(0)}°`}
			tooltipLabel={chartProps.tooltipLabel}
			legendTitle={chartProps.legendTitle}
			formatLegendValue={chartProps.formatLegendValue}
			yTickEvery={3}
			fullHeight={true}
		/>
	)
}
