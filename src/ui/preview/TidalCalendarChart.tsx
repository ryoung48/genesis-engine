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
import { EARTH_MOON_TIDE_REFERENCE } from "@/model/climate/tidal-force"
import type { TidalSchedule } from "@/model/climate/tidal-schedule"

ChartJS.register(
	CategoryScale,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
	Legend,
)

const MOON_COLORS = [
	"#0ea5e9", // sky-500
	"#8b5cf6", // violet-500
	"#10b981", // emerald-500
]

interface TidalCalendarChartProps {
	schedule: TidalSchedule
	daysPerYear: number
	compact?: boolean
}

export const TidalCalendarChart: React.FC<TidalCalendarChartProps> = ({
	schedule,
	daysPerYear: _daysPerYear,
	compact = false,
}) => {
	const { events, maxForce } = schedule
	const moonCount = events[0]?.moonForces.length ?? 0
	const contributorLabels = schedule.contributorLabels

	const chartData = useMemo<ChartData<"line">>(() => {
		const labels = events.map((e) => String(e.dayOfYear))
		const datasets: ChartData<"line">["datasets"] = []

		for (let m = 0; m < moonCount; m++) {
			datasets.push({
				label: contributorLabels[m] ?? `Moon ${m + 1}`,
				data: events.map(
					(e) => (e.moonForces[m] ?? 0) * EARTH_MOON_TIDE_REFERENCE,
				),
				borderColor: MOON_COLORS[m % MOON_COLORS.length],
				backgroundColor: "transparent",
				borderWidth: compact ? 1 : 1.5,
				pointRadius: 0,
				tension: 0.3,
			})
		}

		datasets.push({
			label: "Solar",
			data: events.map((e) => e.starForce * EARTH_MOON_TIDE_REFERENCE),
			borderColor: "#f59e0b", // amber-400
			backgroundColor: "transparent",
			borderWidth: compact ? 1 : 1.5,
			borderDash: [4, 2],
			pointRadius: 0,
			tension: 0.3,
		})

		datasets.push({
			label: "Total",
			data: events.map((e) => e.tidalForce * EARTH_MOON_TIDE_REFERENCE),
			borderColor: "#1e293b", // slate-800
			backgroundColor: "transparent",
			borderWidth: compact ? 1.5 : 2.5,
			pointRadius: 0,
			tension: 0.3,
			order: -1,
		})

		return { labels, datasets }
	}, [events, moonCount, compact, contributorLabels])

	const options = useMemo<ChartOptions<"line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			plugins: {
				legend: {
					display: true,
					position: "top" as const,
					labels: {
						color: "#475569",
						boxWidth: 16,
						boxHeight: 2,
						font: { size: 9, family: "monospace" },
						padding: 8,
					},
				},
				tooltip: {
					mode: "index" as const,
					intersect: false,
					backgroundColor: "#ffffff",
					titleColor: "#475569",
					bodyColor: "#1e293b",
					borderColor: "#e2e8f0",
					borderWidth: 1,
					callbacks: {
						title: (items) => `Day ${items[0]?.label ?? ""}`,
						label: (item) =>
							`${item.dataset.label}: ${Number(item.raw).toFixed(3)} m`,
					},
				},
			},
			scales: {
				x: {
					type: "category" as const,
					ticks: {
						color: "#64748b",
						font: { size: compact ? 8 : 9, family: "monospace" },
						maxTicksLimit: compact ? 6 : 10,
						maxRotation: 0,
					},
					grid: { color: "rgba(148,163,184,0.2)" },
					title: compact
						? { display: false }
						: {
								display: true,
								text: "Day of year",
								color: "#64748b",
								font: { size: 10 },
							},
				},
				y: {
					ticks: {
						color: "#64748b",
						font: { size: compact ? 8 : 9, family: "monospace" },
						callback: (v) => `${Number(v).toFixed(3)} m`,
						maxTicksLimit: compact ? 4 : 6,
					},
					grid: { color: "rgba(148,163,184,0.2)" },
					title: compact
						? { display: false }
						: {
								display: true,
								text: "Equilibrium tidal height (m)",
								color: "#64748b",
								font: { size: 10 },
							},
				},
			},
		}),
		[compact],
	)

	if (events.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-[11px] text-slate-400">
				No tidal data
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-1 h-full bg-white">
			<div
				style={{
					flex: 1,
					minHeight: compact ? 120 : 300,
					position: "relative",
				}}
			>
				<Line data={chartData} options={options} />
			</div>
			<div className="flex gap-4 text-[9px] text-slate-500 px-1 pb-1">
				<span>
					Spring:{" "}
					<span className="font-mono text-slate-700">
						{(maxForce * EARTH_MOON_TIDE_REFERENCE).toFixed(3)} m
					</span>
				</span>
				<span>
					Neap:{" "}
					<span className="font-mono text-slate-700">
						{(schedule.minForce * EARTH_MOON_TIDE_REFERENCE).toFixed(3)} m
					</span>
				</span>
				{!compact && schedule.moonsClamped && (
					<span className="text-amber-600">
						⚠ Moon orbit adjusted for stability
					</span>
				)}
			</div>
		</div>
	)
}
