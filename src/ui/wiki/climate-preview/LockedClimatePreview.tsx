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
import type { LockedClimatePreviewData } from "@/ui/wiki/climate-preview/types"

interface LockedClimatePreviewProps {
	preview: LockedClimatePreviewData
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
	daysPerYear?: number
}

/** See RegularClimatePreview.tsx's copy of this for why it's normalized
 * per-matrix instead of using temperatureColor's fixed Celsius breakpoints. */
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
		// Tidally locked worlds have no seasonal ice-mass balance; this slot
		// keeps showing daylight for them.
		case "ice":
			return {
				matrix: preview.daylight,
				colorForValue: buildNormalizedDaylightColorFn(preview.daylight),
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
				colorForValue: buildNormalizedTemperatureColorFn(preview.heat),
				legendTitle: `Temperature · ${formatTemperature(preview.avgTemp, unitSystem, 1, { compact: true })}`,
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
		<ContourChart
			matrix={chartProps.matrix}
			rowValues={preview.longitudes}
			columnValues={preview.columnValues}
			columnLabels={preview.columnLabels}
			colorForValue={chartProps.colorForValue}
			rowTickLabel={(lon: number) => `${lon.toFixed(0)}°`}
			tooltipLabel={chartProps.tooltipLabel}
			legendTitle={chartProps.legendTitle}
			formatLegendValue={chartProps.formatLegendValue}
			yTickEvery={3}
			fullHeight={true}
		/>
	)
}
