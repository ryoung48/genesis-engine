import {
	BarController,
	BarElement,
	CategoryScale,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js"
import React, { useMemo } from "react"
import { Chart } from "react-chartjs-2"
import type { BenchUnit } from "@/bench/types"
import { formatBenchValue } from "@/ui/bench/format"
import type { ChartSeries } from "@/ui/bench/types"
import { uiChartPalette } from "@/ui/components/tokens"

ChartJS.register(
	BarController,
	BarElement,
	CategoryScale,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PointElement,
	Tooltip,
)

interface ComboChartProps {
	labels: string[]
	bars: ChartSeries[]
	lines: ChartSeries[]
	barUnit: BenchUnit
	lineUnit: BenchUnit
	// [JUSTIFICATION] only the wars card drills down; other combo charts are not clickable
	onBandClick?: (label: string) => void
}

function axis(params: {
	position: "left" | "right"
	grid: boolean
	unit: BenchUnit
}) {
	return {
		position: params.position,
		beginAtZero: true,
		grid: params.grid
			? { color: uiChartPalette.gridLineTranslucent }
			: { display: false },
		ticks: {
			color: uiChartPalette.axisText,
			font: { size: 9, family: "monospace" },
			callback: (value: string | number) =>
				formatBenchValue({ value: Number(value), unit: params.unit }),
		},
	} as const
}

export const ComboChart: React.FC<ComboChartProps> = ({
	labels,
	bars,
	lines,
	barUnit,
	lineUnit,
	onBandClick,
}) => {
	const barCount = bars.length
	const data = useMemo<ChartData<"bar" | "line">>(
		() => ({
			labels,
			datasets: [
				...bars.map((s) => ({
					type: "bar" as const,
					label: s.label,
					data: s.values,
					backgroundColor: s.color,
					yAxisID: "y",
					stack: "outcome",
					order: 2,
				})),
				...lines.map((s) => ({
					type: "line" as const,
					label: s.label,
					data: s.values,
					borderColor: s.color,
					backgroundColor: s.color,
					borderWidth: 2,
					pointRadius: 3,
					tension: 0.2,
					yAxisID: "y1",
					order: 1,
				})),
			],
		}),
		[labels, bars, lines],
	)
	const options = useMemo<ChartOptions<"bar" | "line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: "nearest", intersect: true },
			onClick: (event, elements) => {
				const [element] = elements
				if (
					event.native &&
					element &&
					onBandClick &&
					element.datasetIndex < barCount
				)
					onBandClick(bars[element.datasetIndex]?.label ?? "")
			},
			plugins: {
				legend: {
					position: "bottom",
					labels: { boxWidth: 10, font: { size: 10 } },
				},
				tooltip: {
					callbacks: {
						label: (item) =>
							`${item.dataset.label}: ${formatBenchValue({
								value: item.parsed.y,
								unit: item.dataset.yAxisID === "y1" ? lineUnit : barUnit,
							})}`,
					},
				},
			},
			scales: {
				x: {
					stacked: true,
					grid: { display: false },
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: 9, family: "monospace" },
						maxTicksLimit: 10,
					},
				},
				y: {
					...axis({ position: "left", grid: true, unit: barUnit }),
					stacked: true,
				},
				y1: axis({ position: "right", grid: false, unit: lineUnit }),
			},
		}),
		[barUnit, lineUnit, onBandClick, barCount, bars],
	)
	return <Chart type="bar" data={data} options={options} />
}
