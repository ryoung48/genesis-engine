import {
	CategoryScale,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	LinearScale,
	LineElement,
	type Plugin,
	PointElement,
	Tooltip,
} from "chart.js"
import React, { useMemo } from "react"
import { Line } from "react-chartjs-2"
import type { SpaceEngineDiurnalField } from "@/model/climate/temperature/spaceengine/types"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"
import { ContourChart } from "@/ui/components/composites/charts/ContourChart"
import { uiChartPalette } from "@/ui/components/tokens"
import {
	formatTemperature,
	formatTemperatureDelta,
	rgbToCss,
	type UnitSystem,
} from "@/ui/genesis/shared/ui-format"
import {
	type SpaceEnginePreviewConfig,
	useSpaceEnginePreview,
} from "@/ui/wiki/climate-preview/useSpaceEnginePreview"

ChartJS.register(
	CategoryScale,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
	Legend,
)

/** Dashed verticals at midnight / noon / midnight behind the diurnal curves. */
const dayPhaseLines: Plugin<"line"> = {
	id: "seDayPhaseLines",
	afterDraw(chart, _args, opts: { indices?: number[]; color?: string }) {
		const { ctx, chartArea, scales } = chart
		const indices = opts.indices ?? []
		ctx.save()
		ctx.strokeStyle = opts.color ?? uiChartPalette.referenceLine
		ctx.setLineDash([3, 3])
		ctx.lineWidth = 1
		for (const index of indices) {
			const x = scales.x.getPixelForValue(index)
			ctx.beginPath()
			ctx.moveTo(x, chartArea.top)
			ctx.lineTo(x, chartArea.bottom)
			ctx.stroke()
		}
		ctx.restore()
	},
}

/** South-to-north diverging colours for the [-80,-40,0,40,80] latitude curves. */
const LATITUDE_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#dc2626"]

interface SpaceEngineClimatePreviewProps {
	config: SpaceEnginePreviewConfig
	unitSystem: UnitSystem
	daysPerYear: number
}

function latitudeLabel(latDeg: number): string {
	if (latDeg === 0) return "0°"
	return `${Math.abs(latDeg)}°${latDeg > 0 ? "N" : "S"}`
}

function buildTemperatureColorFn(
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

/** Nearest sample index to a given local hour. */
function hourIndex(localHours: number[], hour: number): number {
	const step = localHours[1] - localHours[0]
	return Math.round(hour / step)
}

function buildDiurnalDatasets(diurnal: SpaceEngineDiurnalField) {
	return diurnal.curves.map((curve, seriesIndex) => {
		const color = LATITUDE_COLORS[seriesIndex % LATITUDE_COLORS.length]
		return {
			label: latitudeLabel(curve.latitudeDeg),
			// Deviation from this latitude's own daily mean, so the day/night
			// shape is readable regardless of the absolute spread between curves.
			data: curve.temperatureC.map((t) => t - curve.meanC),
			borderColor: color,
			backgroundColor: color,
			borderWidth: 1.25,
			tension: 0.35,
			pointRadius: 0,
			pointHoverRadius: 0,
		}
	})
}

export const SpaceEngineClimatePreview: React.FC<
	SpaceEngineClimatePreviewProps
> = ({ config, unitSystem, daysPerYear }) => {
	const { seasonal, diurnal } = useSpaceEnginePreview(config)

	const colorForValue = useMemo(
		() => buildTemperatureColorFn(seasonal.zonalMeanC),
		[seasonal.zonalMeanC],
	)
	const columnValues = useMemo(
		() => seasonal.yearFractions.map((_, index) => index),
		[seasonal.yearFractions],
	)
	const columnLabels = useMemo(
		() =>
			seasonal.yearFractions.map((frac, index) =>
				index % 8 === 0 ? `${Math.round(frac * daysPerYear)}` : "",
			),
		[seasonal.yearFractions, daysPerYear],
	)

	const diurnalData = useMemo(
		() => ({
			labels: diurnal.localHours.map((h) => h.toFixed(0)),
			datasets: buildDiurnalDatasets(diurnal),
		}),
		[diurnal],
	)

	const phaseLineIndices = useMemo(
		() => [0, hourIndex(diurnal.localHours, 12), diurnal.localHours.length - 1],
		[diurnal.localHours],
	)

	const diurnalOptions = useMemo<ChartOptions<"line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			plugins: {
				legend: {
					display: true,
					position: "top" as const,
					align: "end" as const,
					labels: {
						color: uiChartPalette.axisText,
						boxWidth: 14,
						boxHeight: 2,
						padding: 6,
						font: { size: 8, family: "monospace" },
					},
				},
				tooltip: {
					mode: "index" as const,
					intersect: false,
					backgroundColor: uiChartPalette.tooltipBg,
					titleColor: uiChartPalette.axisTextStrong,
					bodyColor: uiChartPalette.total,
					borderColor: uiChartPalette.gridLine,
					borderWidth: 1,
					callbacks: {
						title: (items) => `${items[0]?.label ?? ""} h local`,
						label: (item) => {
							const delta = Number(item.raw)
							const sign = delta > 0 ? "+" : ""
							return `${item.dataset.label}: ${sign}${formatTemperatureDelta(
								delta,
								unitSystem,
								1,
								{ compact: true },
							)}`
						},
					},
				},
				// biome-ignore lint/suspicious/noExplicitAny: local plugin option bag isn't in chart.js's typed plugin map.
				seDayPhaseLines: { indices: phaseLineIndices } as any,
			},
			scales: {
				x: {
					type: "category" as const,
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: 8, family: "monospace" },
						callback: (_v, index) => {
							if (index === 0 || index === diurnal.localHours.length - 1)
								return "00"
							if (index === hourIndex(diurnal.localHours, 6)) return "06"
							if (index === hourIndex(diurnal.localHours, 12)) return "noon"
							if (index === hourIndex(diurnal.localHours, 18)) return "18"
							return ""
						},
						maxRotation: 0,
					},
					grid: { display: false },
				},
				y: {
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: 8, family: "monospace" },
						maxTicksLimit: 5,
						callback: (v) => {
							const delta = Number(v)
							const sign = delta > 0 ? "+" : ""
							return `${sign}${formatTemperatureDelta(delta, unitSystem, 1, {
								compact: true,
							})}`
						},
					},
					grid: { color: uiChartPalette.gridLineTranslucent },
				},
			},
		}),
		[diurnal.localHours, phaseLineIndices, unitSystem],
	)

	return (
		<div className="flex h-full min-h-0 flex-col gap-1">
			<div className="flex min-h-0 flex-1 flex-col">
				<ContourChart
					matrix={seasonal.zonalMeanC}
					rowValues={seasonal.latsDeg}
					columnValues={columnValues}
					columnLabels={columnLabels}
					colorForValue={colorForValue}
					datasetLabel={(lat: number) => `Lat ${lat.toFixed(1)}°`}
					rowTickLabel={(lat: number) => `${lat.toFixed(0)}°`}
					tooltipLabel={({ rowValue, columnIndex, value }) =>
						`Lat ${rowValue.toFixed(1)}°, day ${Math.round(
							seasonal.yearFractions[columnIndex] * daysPerYear,
						)}: ${formatTemperature(value, unitSystem, 1, { compact: true })}`
					}
					legendTitle={`Zonal mean · time of year · x̄ ${formatTemperature(
						seasonal.globalMeanC,
						unitSystem,
						1,
						{ compact: true },
					)}`}
					formatLegendValue={(value: number) =>
						formatTemperature(value, unitSystem, 1, { compact: true })
					}
					yTickEvery={3}
					fullHeight={true}
				/>
			</div>
			<div className="shrink-0">
				<div className="flex items-baseline justify-between px-1 text-[9px] text-slate-500">
					<span>Diurnal cycle · Δ from daily mean · N. summer solstice</span>
					<span className="font-mono text-slate-700">
						f={diurnal.redistribution.toFixed(2)}
					</span>
				</div>
				<div style={{ position: "relative", height: 132 }}>
					<Line
						data={diurnalData}
						options={diurnalOptions}
						plugins={[dayPhaseLines]}
					/>
				</div>
			</div>
		</div>
	)
}
