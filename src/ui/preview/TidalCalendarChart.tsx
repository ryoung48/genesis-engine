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
import React, { useEffect, useMemo, useState } from "react"
import { Line } from "react-chartjs-2"
import { TIDAL_FORCE } from "@/model/climate/tidal-force"
import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"
import { uiChartPalette } from "@/ui/components/tokens"

ChartJS.register(
	CategoryScale,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
	Legend,
)

const MOON_COLORS = uiChartPalette.moon

interface TidalCalendarChartProps {
	schedule: TidalSchedule
	daysPerYear: number
	compact?: boolean
}

export const TidalCalendarChart: React.FC<TidalCalendarChartProps> = ({
	schedule,
	daysPerYear,
	compact = false,
}) => {
	const { events, maxForce } = schedule
	const moonCount = events[0]?.moonForces.length ?? 0
	const moonPairCount = events[0]?.moonMoonForces.length ?? 0
	const contributorLabels = schedule.contributorLabels
	const moonMoonPairLabels = schedule.moonMoonPairLabels

	// Zoom/pan window over the year, expressed in days -- lets a long year
	// (or a fine-grained tidal beat pattern) be inspected without cramming
	// every sample onto one axis. Resets whenever the underlying schedule's
	// span changes so a stale window doesn't linger from a previous body.
	const [zoomWindowDays, setZoomWindowDays] = useState(daysPerYear)
	const [zoomStartDay, setZoomStartDay] = useState(0)
	useEffect(() => {
		setZoomWindowDays(daysPerYear)
		setZoomStartDay(0)
	}, [daysPerYear])

	const visibleEvents = useMemo(() => {
		if (zoomWindowDays >= daysPerYear) return events
		const end = zoomStartDay + zoomWindowDays
		return events.filter(
			(e) => e.dayOfYear >= zoomStartDay && e.dayOfYear < end,
		)
	}, [events, zoomStartDay, zoomWindowDays, daysPerYear])

	const chartData = useMemo<ChartData<"line">>(() => {
		const events = visibleEvents
		const labels = events.map((e) => String(e.dayOfYear))
		const datasets: ChartData<"line">["datasets"] = []

		for (let m = 0; m < moonCount; m++) {
			datasets.push({
				label: contributorLabels[m] ?? `Moon ${m + 1}`,
				data: events.map(
					(e) => (e.moonForces[m] ?? 0) * TIDAL_FORCE.earthMoonTideReference,
				),
				borderColor: MOON_COLORS[m % MOON_COLORS.length],
				backgroundColor: "transparent",
				borderWidth: compact ? 1 : 1.5,
				pointRadius: 0,
				tension: 0.3,
			})
		}

		for (let p = 0; p < moonPairCount; p++) {
			datasets.push({
				label: moonMoonPairLabels[p] ?? `Moon pair ${p + 1}`,
				data: events.map(
					(e) =>
						(e.moonMoonForces[p] ?? 0) * TIDAL_FORCE.earthMoonTideReference,
				),
				borderColor: MOON_COLORS[p % MOON_COLORS.length],
				backgroundColor: "transparent",
				borderWidth: compact ? 1 : 1.5,
				borderDash: [2, 2],
				pointRadius: 0,
				tension: 0.3,
			})
		}

		datasets.push({
			label: "Solar",
			data: events.map((e) => e.starForce * TIDAL_FORCE.earthMoonTideReference),
			borderColor: uiChartPalette.solar,
			backgroundColor: "transparent",
			borderWidth: compact ? 1 : 1.5,
			borderDash: [4, 2],
			pointRadius: 0,
			tension: 0.3,
		})

		datasets.push({
			label: "Total",
			data: events.map(
				(e) => e.tidalForce * TIDAL_FORCE.earthMoonTideReference,
			),
			borderColor: uiChartPalette.total,
			backgroundColor: "transparent",
			borderWidth: compact ? 1.5 : 2.5,
			pointRadius: 0,
			tension: 0.3,
			order: -1,
		})

		return { labels, datasets }
	}, [
		visibleEvents,
		moonCount,
		moonPairCount,
		compact,
		contributorLabels,
		moonMoonPairLabels,
	])

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
						color: uiChartPalette.axisTextStrong,
						boxWidth: 16,
						boxHeight: 2,
						font: { size: 9, family: "monospace" },
						padding: 8,
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
						color: uiChartPalette.axisText,
						font: { size: compact ? 8 : 9, family: "monospace" },
						maxTicksLimit: compact ? 6 : 10,
						maxRotation: 0,
					},
					grid: { color: uiChartPalette.gridLineTranslucent },
					title: compact
						? { display: false }
						: {
								display: true,
								text: "Day of year",
								color: uiChartPalette.axisText,
								font: { size: 10 },
							},
				},
				y: {
					ticks: {
						color: uiChartPalette.axisText,
						font: { size: compact ? 8 : 9, family: "monospace" },
						callback: (v) => `${Number(v).toFixed(3)} m`,
						maxTicksLimit: compact ? 4 : 6,
					},
					grid: { color: uiChartPalette.gridLineTranslucent },
					title: compact
						? { display: false }
						: {
								display: true,
								text: "Equilibrium tidal height (m)",
								color: uiChartPalette.axisText,
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

	const maxZoomStartDay = Math.max(0, daysPerYear - zoomWindowDays)

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
			{daysPerYear > 1 && (
				<div className="flex items-center gap-2 px-1 text-[9px] text-slate-500">
					<span className="shrink-0">Zoom</span>
					<input
						type="range"
						min={Math.min(7, daysPerYear)}
						max={daysPerYear}
						value={Math.min(zoomWindowDays, daysPerYear)}
						onChange={(event) => {
							const next = Math.max(1, Number(event.target.value))
							setZoomWindowDays(next)
							setZoomStartDay((start) => Math.min(start, daysPerYear - next))
						}}
						className="flex-1"
					/>
					<input
						type="range"
						min={0}
						max={maxZoomStartDay}
						value={Math.min(zoomStartDay, maxZoomStartDay)}
						disabled={zoomWindowDays >= daysPerYear}
						onChange={(event) => setZoomStartDay(Number(event.target.value))}
						className="flex-1"
					/>
					<span className="shrink-0 font-mono text-slate-700">
						{Math.round(zoomStartDay)}–
						{Math.round(Math.min(zoomStartDay + zoomWindowDays, daysPerYear))}d
					</span>
				</div>
			)}
			<div className="flex gap-4 text-[9px] text-slate-500 px-1 pb-1">
				<span>
					Spring:{" "}
					<span className="font-mono text-slate-700">
						{(maxForce * TIDAL_FORCE.earthMoonTideReference).toFixed(3)} m
					</span>
				</span>
				<span>
					Neap:{" "}
					<span className="font-mono text-slate-700">
						{(schedule.minForce * TIDAL_FORCE.earthMoonTideReference).toFixed(
							3,
						)}{" "}
						m
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
