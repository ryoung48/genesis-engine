import React from "react"
import { HeatmapChart } from "@/ui/components/composites/charts/HeatmapChart"
import { temperatureColor } from "@/ui/planet/colors"
import type { GenerationPreviewTab } from "@/ui/planet/screen/generation/generation-preview"
import {
	formatTemperature,
	rgbToCss,
	type UnitSystem,
} from "@/ui/planet/screen/shared/ui-format"
import type { LockedClimatePreviewData } from "./types"

interface LockedClimatePreviewProps {
	preview: LockedClimatePreviewData
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
}

function buildPreviewChartProps(
	preview: LockedClimatePreviewData,
	activeTab: GenerationPreviewTab,
	unitSystem: UnitSystem,
) {
	switch (activeTab) {
		case "insolation":
			return {
				matrix: preview.insolation,
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
					`Eq Lon ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} W/m²`,
			}
		case "daylight":
			return {
				matrix: preview.daylight,
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
					`Eq Lon ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} hrs`,
			}
		default:
			return {
				matrix: preview.heat,
				colorForValue: (value: number) => rgbToCss(temperatureColor(value)),
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
					`Eq Lon ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${formatTemperature(value, unitSystem, 1, { compact: true })}`,
			}
	}
}

export const LockedClimatePreview: React.FC<LockedClimatePreviewProps> = ({
	preview,
	activeTab,
	unitSystem,
}) => {
	const chartProps = buildPreviewChartProps(preview, activeTab, unitSystem)

	return (
		<HeatmapChart
			matrix={chartProps.matrix}
			rowValues={preview.longitudes}
			columnValues={preview.columnValues}
			columnLabels={preview.columnLabels}
			colorForValue={chartProps.colorForValue}
			datasetLabel={(lon: number) => `Eq Lon ${lon.toFixed(1)}°`}
			rowTickLabel={(lon: number) => `${lon.toFixed(0)}°`}
			tooltipLabel={chartProps.tooltipLabel}
			legendTitle={chartProps.legendTitle}
			formatLegendValue={chartProps.formatLegendValue}
			xAxisTitle="Day of Year"
			yAxisTitle="Equatorial Longitude"
			fullHeight={true}
		/>
	)
}
