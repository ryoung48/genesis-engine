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
import React, { useMemo, useRef } from "react"
import { Bar } from "react-chartjs-2"
import { uiChartPalette } from "@/ui/components/tokens"
import {
	formatTimingSeconds,
	type TimingEntry,
} from "@/ui/wiki/timing/timing-summary"

ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip)

export const GenerationTimingChart: React.FC<{
	entries: TimingEntry[]
	onBarClick?: (label: string) => void
}> = ({ entries, onBarClick }) => {
	const chartRef = useRef<ChartJS<"bar">>(null)
	const chartState = useMemo(() => {
		if (!entries.length) return null

		const labels = entries.map((entry) => entry.label)
		const values = entries.map((entry) => entry.ms)
		const backgroundColor = entries.map((_, idx) =>
			idx === 0
				? uiChartPalette.timingTiers[0]
				: idx < 4
					? uiChartPalette.timingTiers[1]
					: uiChartPalette.timingTiers[2],
		)

		const data: ChartData<"bar"> = {
			labels,
			datasets: [
				{
					label: "ms",
					data: values,
					backgroundColor,
					borderSkipped: false,
					borderRadius: 6,
					maxBarThickness: 18,
				},
			],
		}

		const options: ChartOptions<"bar"> = {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						title: (items) => {
							const idx = items[0]?.dataIndex ?? 0
							return entries[idx]?.label ?? ""
						},
						label: (item) => `${formatTimingSeconds(Number(item.raw))}`,
					},
				},
			},
			scales: {
				x: {
					beginAtZero: true,
					grid: { color: "rgba(148, 163, 184, 0.18)" },
					ticks: {
						font: { size: 9, family: "monospace" },
						callback: (value) => formatTimingSeconds(Number(value)),
					},
				},
				y: {
					grid: { display: false },
					ticks: {
						font: { size: 9, family: "monospace" },
					},
				},
			},
			onClick: (_event, elements) => {
				if (elements.length > 0 && onBarClick) {
					const idx = elements[0].index
					onBarClick(entries[idx]?.label ?? "")
				}
			},
		}

		return {
			data,
			options,
			height: Math.max(180, Math.min(420, entries.length * 24 + 56)),
		}
	}, [entries, onBarClick])

	const onBarDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
		const chart = chartRef.current
		if (!chart || !onBarClick) return

		const [element] = chart.getElementsAtEventForMode(
			event.nativeEvent,
			"nearest",
			{ intersect: true },
			false,
		)
		if (element) onBarClick(entries[element.index]?.label ?? "")
	}

	if (!chartState) {
		return (
			<div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
				<p className="text-[11px] leading-relaxed text-slate-400">
					Run a generation or import to collect stage timings.
				</p>
			</div>
		)
	}

	return (
		<div onDoubleClick={onBarDoubleClick} style={{ height: chartState.height }}>
			<Bar ref={chartRef} data={chartState.data} options={chartState.options} />
		</div>
	)
}
