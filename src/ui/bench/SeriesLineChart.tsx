import {
	CategoryScale,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js"
import React, { useMemo } from "react"
import { Line } from "react-chartjs-2"
import type { BenchUnit } from "@/bench/types"
import { formatBenchValue } from "@/ui/bench/format"
import type { ChartSeries } from "@/ui/bench/types"
import { uiChartPalette } from "@/ui/components/tokens"

ChartJS.register(
	CategoryScale,
	LinearScale,
	LineElement,
	PointElement,
	Legend,
	Tooltip,
)

interface SeriesLineChartProps {
	labels: string[]
	series: ChartSeries[]
	unit: BenchUnit
}

export const SeriesLineChart: React.FC<SeriesLineChartProps> = ({
	labels,
	series,
	unit,
}) => {
	const data = useMemo<ChartData<"line">>(
		() => ({
			labels,
			datasets: series.map((s) => ({
				label: s.label,
				data: s.values,
				borderColor: s.color,
				backgroundColor: s.color,
				borderWidth: 2,
				pointRadius: labels.length > 40 ? 0 : 3,
				tension: 0.2,
				spanGaps: false,
			})),
		}),
		[labels, series],
	)
	const options = useMemo<ChartOptions<"line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: "index", intersect: false },
			plugins: {
				legend: {
					position: "bottom",
					labels: {
						boxWidth: 10,
						font: { size: 10 },
					},
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
					grid: { display: false },
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: 9, family: "monospace" },
						maxTicksLimit: 10,
					},
				},
				y: {
					beginAtZero: true,
					grid: { color: uiChartPalette.gridLineTranslucent },
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: 9, family: "monospace" },
					},
				},
			},
		}),
		[unit],
	)
	return <Line data={data} options={options} />
}
