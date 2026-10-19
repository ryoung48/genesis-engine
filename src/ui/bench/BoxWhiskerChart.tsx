import {
	CategoryScale,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	LinearScale,
	LineController,
	LineElement,
	type Plugin,
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
	CategoryScale,
	LinearScale,
	LineController,
	LineElement,
	PointElement,
	Tooltip,
)

const WHISKER_LOW = 0
const BOX_LOW = 1
const MEDIAN = 2
const BOX_HIGH = 3
const WHISKER_HIGH = 4
const MAX = 5
const MAX_MARKER_RADIUS = 3
const BOX_HALF_WIDTH = 8
const CAP_HALF_WIDTH = 4

const boxWhiskerPlugin: Plugin<"line"> = {
	id: "boxWhisker",
	afterDatasetsDraw(chart) {
		const { ctx, data } = chart
		const point = (dataset: number, index: number) =>
			chart.getDatasetMeta(dataset).data[index]
		const count = data.labels?.length ?? 0
		ctx.save()
		ctx.strokeStyle = uiChartPalette.bench.boxStroke
		ctx.fillStyle = uiChartPalette.bench.boxFill
		ctx.lineWidth = 1.5
		for (let index = 0; index < count; index++) {
			const complete = [
				WHISKER_LOW,
				BOX_LOW,
				MEDIAN,
				BOX_HIGH,
				WHISKER_HIGH,
			].every((dataset) => data.datasets[dataset]?.data[index] != null)
			if (!complete) continue
			const x = point(MEDIAN, index).x
			const y = (dataset: number) => point(dataset, index).y
			ctx.beginPath()
			ctx.moveTo(x, y(WHISKER_LOW))
			ctx.lineTo(x, y(BOX_LOW))
			ctx.moveTo(x, y(BOX_HIGH))
			ctx.lineTo(x, y(WHISKER_HIGH))
			ctx.moveTo(x - CAP_HALF_WIDTH, y(WHISKER_LOW))
			ctx.lineTo(x + CAP_HALF_WIDTH, y(WHISKER_LOW))
			ctx.moveTo(x - CAP_HALF_WIDTH, y(WHISKER_HIGH))
			ctx.lineTo(x + CAP_HALF_WIDTH, y(WHISKER_HIGH))
			ctx.stroke()
			const top = y(BOX_HIGH)
			const height = y(BOX_LOW) - top
			ctx.fillRect(x - BOX_HALF_WIDTH, top, BOX_HALF_WIDTH * 2, height)
			ctx.strokeRect(x - BOX_HALF_WIDTH, top, BOX_HALF_WIDTH * 2, height)
			ctx.beginPath()
			if (data.datasets[MAX]?.data[index] != null) {
				ctx.beginPath()
				ctx.arc(x, y(MAX), MAX_MARKER_RADIUS, 0, Math.PI * 2)
				ctx.fillStyle = uiChartPalette.bench.boxStroke
				ctx.fill()
				ctx.fillStyle = uiChartPalette.bench.boxFill
			}
			ctx.beginPath()
			ctx.moveTo(x - BOX_HALF_WIDTH, y(MEDIAN))
			ctx.lineTo(x + BOX_HALF_WIDTH, y(MEDIAN))
			ctx.stroke()
		}
		ctx.restore()
	},
}

interface BoxWhiskerChartProps {
	labels: string[]
	series: ChartSeries[]
	unit: BenchUnit
}

export const BoxWhiskerChart: React.FC<BoxWhiskerChartProps> = ({
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
				showLine: false,
				pointRadius: 0,
				pointHoverRadius: 0,
				borderColor: s.color,
				backgroundColor: s.color,
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
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (item) =>
							`${item.dataset.label} ${formatBenchValue({ value: item.parsed.y, unit })}`,
					},
				},
			},
			scales: {
				x: {
					offset: true,
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
	return (
		<Chart
			type="line"
			data={data}
			options={options}
			plugins={[boxWhiskerPlugin]}
		/>
	)
}
