import React from "react"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import { ContourChart } from "@/ui/components/composites/charts/ContourChart"
import {
	formatTemperature,
	rgbToCss,
	type UnitSystem,
} from "@/ui/genesis/shared/ui-format"
import type { LockedClimatePreviewData } from "@/ui/wiki/climate-preview/types"

interface LockedClimatePreviewProps {
	preview: LockedClimatePreviewData
	unitSystem: UnitSystem
}

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

export const LockedClimatePreview: React.FC<LockedClimatePreviewProps> = ({
	preview,
	unitSystem,
}) => {
	const chartProps = {
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

	return (
		<ContourChart
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
			yTickEvery={3}
			fullHeight={true}
		/>
	)
}
