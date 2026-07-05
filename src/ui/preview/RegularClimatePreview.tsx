import React from "react"
import {
	mapLinear,
	sampleBasisColorStops,
} from "@/model/shared/color-interpolation"
import { SPECTRAL_STOPS } from "@/model/shared/color-palettes"
import { HeatmapChart } from "@/ui/components/composites/charts/HeatmapChart"
import type { GenerationPreviewTab } from "@/ui/planet/screen/generation/generation-preview"
import {
	formatTemperature,
	rgbToCss,
	type UnitSystem,
} from "@/ui/planet/screen/shared/ui-format"
import type { RegularClimatePreviewData } from "./types"

interface RegularClimatePreviewProps {
	preview: RegularClimatePreviewData
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
	daysPerYear?: number
}

/**
 * Normalized (min..max of this specific matrix, not a fixed Celsius scale)
 * Spectral color function -- unlike temperatureColor's fixed absolute
 * breakpoints (tuned for Earth-like -73..80C), this always spans the full
 * gradient across whatever range is actually on screen, so an extreme body
 * (Mercury, Venus) doesn't just render as a solid block of the hottest color.
 */
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
			sampleBasisColorStops(
				SPECTRAL_STOPS,
				mapLinear(value, min, max, 0, 1, true),
			),
		)
}

function buildPreviewChartProps(
	preview: RegularClimatePreviewData,
	activeTab: GenerationPreviewTab,
	unitSystem: UnitSystem,
) {
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
					columnValue,
					value,
				}: {
					rowValue: number
					columnValue: number
					value: number
				}) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} W/m²`,
			}
		case "daylight":
			return {
				matrix: preview.daylight,
				columnValues: preview.columnValues,
				columnLabels: preview.columnLabels,
				colorForValue: preview.daylightColorFn,
				legendTitle: "Daylight",
				formatLegendValue: (value: number) => `${value.toFixed(1)} hrs`,
				tooltipLabel: ({
					rowValue,
					columnValue,
					value,
				}: {
					rowValue: number
					columnValue: number
					value: number
				}) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} hrs`,
			}
		default:
			return {
				matrix: preview.heat,
				columnValues: preview.columnValues,
				columnLabels: preview.columnLabels,
				colorForValue: buildNormalizedTemperatureColorFn(preview.heat),
				legendTitle: "Temperature",
				formatLegendValue: (value: number) =>
					formatTemperature(value, unitSystem, 1, { compact: true }),
				tooltipLabel: ({
					rowValue,
					columnValue,
					value,
				}: {
					rowValue: number
					columnValue: number
					value: number
				}) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${formatTemperature(value, unitSystem, 1, { compact: true })}`,
			}
	}
}

export const RegularClimatePreview: React.FC<RegularClimatePreviewProps> = ({
	preview,
	activeTab,
	unitSystem,
}) => {
	const chartProps = buildPreviewChartProps(preview, activeTab, unitSystem)

	return (
		<HeatmapChart
			matrix={chartProps.matrix}
			rowValues={preview.lats}
			columnValues={chartProps.columnValues}
			columnLabels={chartProps.columnLabels}
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
