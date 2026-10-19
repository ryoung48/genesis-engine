import {
	BarElement,
	CategoryScale,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	LinearScale,
	Tooltip,
} from "chart.js"
import React, { useMemo } from "react"
import { Bar } from "react-chartjs-2"
import type { BenchUnit } from "@/bench/types"
import { formatBenchValue } from "@/ui/bench/format"
import type { ChartSeries } from "@/ui/bench/types"
import { uiChartPalette } from "@/ui/components/tokens"

ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip)

interface StackedBarChartProps {
	labels: string[]
	series: ChartSeries[]
	unit: BenchUnit
	// [JUSTIFICATION] only the government family card drills down; other stacks are not clickable
	onBandClick?: (label: string) => void
}

export const StackedBarChart: React.FC<StackedBarChartProps> = ({
	labels,
	series,
	unit,
	onBandClick,
}) => {
	const data = useMemo<ChartData<"bar">>(
		() => ({
			labels,
			datasets: series.map((s) => ({
				label: s.label,
				data: s.values,
				backgroundColor: s.color,
				stack: s.group ?? "default",
			})),
		}),
		[labels, series],
	)
	const options = useMemo<ChartOptions<"bar">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: "nearest", intersect: true },
			onClick: (event, elements) => {
				const [element] = elements
				if (event.native && element && onBandClick)
					onBandClick(series[element.datasetIndex]?.label ?? "")
			},
			plugins: {
				legend: {
					position: "bottom",
					labels: { boxWidth: 10, font: { size: 10 } },
				},
				tooltip: {
					callbacks: {
						label: (item) =>
							`${item.dataset.label}: ${formatBenchValue({ value: item.parsed.y, unit })}`,
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
					stacked: true,
					grid: { color: uiChartPalette.gridLineTranslucent },
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: 9, family: "monospace" },
					},
				},
			},
		}),
		[unit, onBandClick, series],
	)
	return <Bar data={data} options={options} />
}
