import React from "react"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import { ContourChart } from "@/ui/components/composites/charts/ContourChart"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import {
	formatTemperature,
	rgbToCss,
	type UnitSystem,
} from "@/ui/genesis/shared/ui-format"
import type {
	HeatmapTooltipParams,
	RegularClimatePreviewData,
} from "@/ui/wiki/climate-preview/types"

interface RegularClimatePreviewProps {
	preview: RegularClimatePreviewData
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
	daysPerYear?: number
}

// Spans the full gradient across whatever range is on screen (not a fixed
// Celsius scale), so an extreme body doesn't render as one solid color.
function buildNormalizedTemperatureColorFn(
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
			COLOR_INTERPOLATION.sampleBasisColorStops({
				stops: COLOR_PALETTES.spectralStops,
				t: COLOR_INTERPOLATION.mapLinear({
					value,
					domainStart: min,
					domainEnd: max,
					rangeStart: 0,
					rangeEnd: 1,
					clamp: true,
				}),
			}),
		)
}

function buildPreviewChartProps(params: {
	preview: RegularClimatePreviewData
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
}) {
	const { preview, activeTab, unitSystem } = params
	const dayLabel = (columnIndex: number) =>
		preview.columnLabels[columnIndex] ?? `${columnIndex}`
	switch (activeTab) {
		case "insolation":
			return {
				matrix: preview.insolation,
				columnValues: preview.columnValues,
				columnLabels: preview.columnLabels,
				colorForValue: preview.insolColorFn,
				legendTitle: "Insolation",
				formatLegendValue: (value: number) => `${value.toFixed(0)} W/m²`,
				tooltipLabel: ({
					rowValue,
					columnIndex,
					value,
				}: HeatmapTooltipParams) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${dayLabel(columnIndex)}: ${value.toFixed(1)} W/m²`,
			}
		case "ice":
			return {
				matrix: preview.iceMassBalance,
				columnValues: preview.columnValues,
				columnLabels: preview.columnLabels,
				colorForValue: preview.iceBalanceColorFn,
				legendTitle: `Ice mass balance${preview.converged ? "" : " · not converged"}`,
				formatLegendValue: (value: number) =>
					`${value.toExponential(1)} kg/m²/s`,
				tooltipLabel: ({
					rowValue,
					columnIndex,
					value,
				}: HeatmapTooltipParams) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${dayLabel(columnIndex)}: ${value.toExponential(2)} kg/m²/s`,
			}
		default:
			return {
				matrix: preview.heat,
				columnValues: preview.columnValues,
				columnLabels: preview.columnLabels,
				colorForValue: buildNormalizedTemperatureColorFn(preview.heat),
				legendTitle: `Temperature · ${formatTemperature(preview.avgTemp, unitSystem, 1, { compact: true })}`,
				formatLegendValue: (value: number) =>
					formatTemperature(value, unitSystem, 1, { compact: true }),
				tooltipLabel: ({
					rowValue,
					columnIndex,
					value,
				}: HeatmapTooltipParams) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${dayLabel(columnIndex)}: ${formatTemperature(value, unitSystem, 1, { compact: true })}`,
			}
	}
}

export const RegularClimatePreview: React.FC<RegularClimatePreviewProps> = ({
	preview,
	activeTab,
	unitSystem,
}) => {
	const chartProps = buildPreviewChartProps({ preview, activeTab, unitSystem })

	return (
		<ContourChart
			matrix={chartProps.matrix}
			rowValues={preview.lats}
			columnValues={chartProps.columnValues}
			columnLabels={chartProps.columnLabels}
			colorForValue={chartProps.colorForValue}
			rowTickLabel={(lat: number) => `${lat.toFixed(0)}°`}
			tooltipLabel={chartProps.tooltipLabel}
			legendTitle={chartProps.legendTitle}
			formatLegendValue={chartProps.formatLegendValue}
			yTickEvery={3}
			fullHeight={true}
		/>
	)
}
