import { ChartData, ChartOptions, TooltipItem } from "chart.js"
import * as d3 from "d3"
import React, { useState } from "react"
import { TIME } from "@/model/utilities/time"
import {
	EVENT_TYPES,
	EventCounts,
	RebellionOutcomeCounts,
	WarOutcomeCounts,
} from "../index"
import { EBM } from "@/model/cells/ebm"
import SeasonalTempByLat from "./SeasonalTempByLat"

const OUTCOME_COLORS: Record<string, string> = {
	attackerWin: "#22c55e", // green-500
	defenderWin: "#3b82f6", // blue-500
	exhaustion: "#9ca3af", // gray-400
	invalidated: "#d1d5db", // gray-300
}

const OUTCOME_LABELS: Record<string, string> = {
	attackerWin: "Attacker Win",
	defenderWin: "Defender Win",
	exhaustion: "Stalemate (Exhaustion)",
	invalidated: "Stalemate (Invalidated)",
}

const REBELLION_COLORS: Record<string, string> = {
	normal: "#fb923c", // orange-400
	succession: "#a855f7", // purple-500
}

const REBELLION_LABELS: Record<string, string> = {
	normal: "Normal Rebellion",
	succession: "Succession Triggered",
}

import { Tabs } from "../Tabs"
import { TrendChartBase } from "./TrendChartBase"

export const SIZE_BUCKETS = [
	[1, 2],
	[2, 5],
	[5, 10],
	[10, 25],
	[25, 50],
	[50, 100],
] as const

export const BUCKET_COLORS = [
	"#818cf8", // 1-2: light indigo
	"#6366f1", // 2-5: indigo
	"#4f46e5", // 5-10: darker indigo
	"#4338ca", // 10-25: deep indigo
	"#3730a3", // 25-50: very deep
	"#312e81", // 50-100: deepest
]

export const DEV_BUCKETS = [
	"0.0-0.1",
	"0.1-0.2",
	"0.2-0.3",
	"0.3-0.4",
	"0.4-0.5",
	"0.5-0.6",
	"0.6-0.7",
	"0.7-0.8",
	"0.8-0.9",
	"0.9-1.0",
]

// Generate purples/blues for development
export const DEV_COLORS = DEV_BUCKETS.map((_, i) =>
	d3.interpolateBuPu(0.2 + (i / (DEV_BUCKETS.length - 1)) * 0.8),
)

interface ActiveTrendsChartProps {
	windowedHistory: {
		time: number
		dist: number[]
		devDist: number[]
		avgDev: number
		activeWars: number
		activeCivilWars: number
		eventCounts: EventCounts
		warOutcomes: WarOutcomeCounts
		rebellionOutcomes: RebellionOutcomeCounts
	}[]
	labels: string[]
	rangeStartLabel: string
	rangeEndLabel: string
	renderTime: number
	onTimeSelect?: (time: number) => void
}

const EVENT_COLORS: Record<string, string> = {
	rebellion: "#fb923c", // orange-400
	succession: "#a855f7", // purple-500
	"war started": "#ef4444", // red-500
	battle: "#b91c1c", // red-700
	"war ended": "#22c55e", // green-500
}

type SimulationTabID =
	| "nations"
	| "development"
	| "events"
	| "wars"
	| "outcomes"
	| "rebellions"
	| "seasonal_temp"

export const ActiveTrendsChart: React.FC<ActiveTrendsChartProps> = ({
	windowedHistory,
	labels,
	rangeStartLabel,
	rangeEndLabel,
	renderTime,
	onTimeSelect,
}) => {
	const [tab, setTab] = useState<SimulationTabID>("nations")
	const [seasonalTab, setSeasonalTab] = useState<"absolute" | "dy">("absolute")

	const isEmpty = windowedHistory.length <= 1
	const yearRange = isEmpty ? "" : `${rangeStartLabel}-${rangeEndLabel}`

	const activeLineYear = TIME.date.toYear(renderTime)
	const activeLineIdx = windowedHistory.findIndex(
		(h) => TIME.date.toYear(h.time) === activeLineYear,
	)

	const handleIdxSelect = (idx: number) => {
		if (onTimeSelect && windowedHistory[idx]) {
			onTimeSelect(windowedHistory[idx].time)
		}
	}

	// Find the distribution entry closest to renderTime for footer counts
	const renderEntry = windowedHistory.reduce(
		(prev, curr) => {
			if (curr.time > renderTime) return prev
			return Math.abs(curr.time - renderTime) < Math.abs(prev.time - renderTime)
				? curr
				: prev
		},
		windowedHistory[0] || {
			time: 0,
			dist: [],
			devDist: [],
			avgDev: 0,
			activeWars: 0,
			activeCivilWars: 0,
			eventCounts: {
				rebellion: 0,
				succession: 0,
				"war started": 0,
				battle: 0,
				"war ended": 0,
			} as EventCounts,
			warOutcomes: {
				attackerWin: 0,
				defenderWin: 0,
				exhaustion: 0,
				invalidated: 0,
			} as WarOutcomeCounts,
			rebellionOutcomes: {
				normal: 0,
				succession: 0,
			} as RebellionOutcomeCounts,
		},
	)

	const commonOptions: ChartOptions<"line"> = {
		responsive: true,
		maintainAspectRatio: false,
		layout: {
			padding: { top: 15, bottom: 5, left: 5, right: 5 },
		},
		plugins: {
			legend: { display: false },
			tooltip: {
				mode: "index",
				intersect: false,
				position: "nearest",
				displayColors: true,
				caretSize: 0,
				backgroundColor: "rgba(17, 24, 39, 0.95)",
				titleFont: { size: 10, weight: "bold" },
				bodyFont: { size: 10 },
				footerFont: { size: 10, weight: "bold" },
				padding: 8,
				cornerRadius: 0,
				itemSort: (a: TooltipItem<"line">, b: TooltipItem<"line">) =>
					b.datasetIndex - a.datasetIndex,
			},
		},
		scales: {
			x: {
				display: true,
				grid: { display: false },
				ticks: { font: { size: 8 }, color: "#9ca3af", maxTicksLimit: 5 },
			},
			y: {
				display: true,
				beginAtZero: true,
				grid: { color: "rgba(0, 0, 0, 0.05)" },
				ticks: { font: { size: 8 }, color: "#9ca3af", maxTicksLimit: 5 },
			},
		},
		interaction: { mode: "index", intersect: false },
	}

	const renderChart = () => {
		if (tab === "nations") {
			const nationsData: ChartData<"line"> = {
				labels,
				datasets: SIZE_BUCKETS.map(([min, max], idx) => ({
					label: `${min}-${max} Provinces`,
					data: windowedHistory.map((h) => h.dist[idx] || 0),
					fill: true,
					backgroundColor: BUCKET_COLORS[idx],
					borderColor: BUCKET_COLORS[idx],
					pointRadius: 0,
					tension: 0.2,
				})),
			}
			return (
				<TrendChartBase
					yearRange={yearRange}
					isEmpty={isEmpty}
					data={nationsData}
					options={{
						...commonOptions,
						scales: {
							...commonOptions.scales,
							y: { ...commonOptions.scales?.y, stacked: true },
						},
						plugins: {
							...commonOptions.plugins,
							tooltip: {
								...commonOptions.plugins?.tooltip,
								callbacks: {
									footer: (items) => {
										const total = items.reduce(
											(sum, item) => sum + (item.raw as number),
											0,
										)
										return `Total Nations: ${total}`
									},
								},
							},
						},
					}}
					footerItems={SIZE_BUCKETS.map(([min, max], idx) => ({
						label: `${min}-${max}`,
						color: BUCKET_COLORS[idx],
						value: renderEntry.dist[idx] || 0,
					}))}
					totalValue={renderEntry.dist.reduce((a, b) => a + b, 0)}
					activeLineIdx={activeLineIdx}
					onIdxSelect={handleIdxSelect}
				/>
			)
		}
		if (tab === "development") {
			const activeDatasets = DEV_BUCKETS.map((label, idx) => ({
				label: `${label} Development`,
				data: windowedHistory.map((h) => h.devDist?.[idx] || 0),
				fill: true,
				backgroundColor: DEV_COLORS[idx],
				borderColor: DEV_COLORS[idx],
				pointRadius: 0,
				tension: 0.2,
			})).filter((ds) => ds.data.some((v) => v > 0))

			const devData: ChartData<"line"> = {
				labels,
				datasets: activeDatasets,
			}
			return (
				<TrendChartBase
					yearRange={yearRange}
					isEmpty={isEmpty}
					data={devData}
					options={{
						...commonOptions,
						scales: {
							...commonOptions.scales,
							y: { ...commonOptions.scales?.y, stacked: true },
						},
						plugins: {
							...commonOptions.plugins,
							tooltip: {
								...commonOptions.plugins?.tooltip,
								callbacks: {
									footer: (items) => {
										const total = items.reduce(
											(sum, item) => sum + (item.raw as number),
											0,
										)
										return `Total Provinces: ${total}`
									},
								},
							},
						},
					}}
					footerItems={DEV_BUCKETS.map((label, idx) => ({
						label,
						color: DEV_COLORS[idx],
						value: renderEntry.devDist?.[idx] || 0,
					})).filter((item) => item.value > 0)}
					totalValue={renderEntry.avgDev?.toFixed(2) || "0.00"}
					totalLabel="Average"
					activeLineIdx={activeLineIdx}
					onIdxSelect={handleIdxSelect}
				/>
			)
		}
		if (tab === "events") {
			const eventsData: ChartData<"line"> = {
				labels,
				datasets: EVENT_TYPES.map((type) => ({
					label: type.charAt(0).toUpperCase() + type.slice(1),
					data: windowedHistory.map((h) => h.eventCounts[type] || 0),
					fill: true,
					backgroundColor: EVENT_COLORS[type],
					borderColor: EVENT_COLORS[type],
					pointRadius: 0,
					tension: 0.2,
				})),
			}
			return (
				<TrendChartBase
					yearRange={yearRange}
					isEmpty={isEmpty}
					data={eventsData}
					options={{
						...commonOptions,
						scales: {
							...commonOptions.scales,
							y: { ...commonOptions.scales?.y, stacked: true },
						},
						plugins: {
							...commonOptions.plugins,
							tooltip: {
								...commonOptions.plugins?.tooltip,
								callbacks: {
									footer: (items) => {
										const total = items.reduce(
											(sum, item) => sum + (item.raw as number),
											0,
										)
										return `Total Events: ${total}`
									},
								},
							},
						},
					}}
					footerItems={EVENT_TYPES.map((type) => ({
						label: type.charAt(0).toUpperCase() + type.slice(1),
						color: EVENT_COLORS[type],
						value: renderEntry.eventCounts[type] || 0,
					}))}
					totalValue={EVENT_TYPES.reduce(
						(sum, type) => sum + (renderEntry.eventCounts[type] || 0),
						0,
					)}
					activeLineIdx={activeLineIdx}
					onIdxSelect={handleIdxSelect}
				/>
			)
		}
		if (tab === "wars") {
			const warsData: ChartData<"line"> = {
				labels,
				datasets: [
					{
						label: "Wars",
						data: windowedHistory.map((h) => h.activeWars),
						fill: true,
						backgroundColor: "rgba(248, 113, 113, 0.3)",
						borderColor: "#dc2626",
						borderWidth: 1.5,
						pointRadius: 0,
						tension: 0.2,
					},
					{
						label: "Civil Wars",
						data: windowedHistory.map((h) => h.activeCivilWars),
						fill: true,
						backgroundColor: "rgba(251, 146, 60, 0.3)",
						borderColor: "#f97316",
						borderWidth: 1.5,
						pointRadius: 0,
						tension: 0.2,
					},
				],
			}
			return (
				<TrendChartBase
					yearRange={yearRange}
					isEmpty={isEmpty}
					data={warsData}
					options={{
						...commonOptions,
						plugins: {
							...commonOptions.plugins,
							tooltip: {
								...commonOptions.plugins?.tooltip,
								callbacks: {
									footer: (items) => {
										const total = items.reduce(
											(sum, item) => sum + (item.raw as number),
											0,
										)
										return `Total: ${total}`
									},
								},
							},
						},
					}}
					footerItems={[
						{
							label: "Wars",
							color: "#dc2626",
							value: renderEntry.activeWars || 0,
						},
						{
							label: "Civil Wars",
							color: "#f97316",
							value: renderEntry.activeCivilWars || 0,
						},
					]}
					totalValue={
						(renderEntry.activeWars || 0) + (renderEntry.activeCivilWars || 0)
					}
					activeLineIdx={activeLineIdx}
					onIdxSelect={handleIdxSelect}
				/>
			)
		}
		if (tab === "outcomes") {
			const outcomeTypes: (keyof WarOutcomeCounts)[] = [
				"attackerWin",
				"defenderWin",
				"exhaustion",
				"invalidated",
			]
			const outcomesData: ChartData<"line"> = {
				labels,
				datasets: outcomeTypes.map((type) => ({
					label: OUTCOME_LABELS[type],
					data: windowedHistory.map((h) => h.warOutcomes[type] || 0),
					fill: true,
					backgroundColor: OUTCOME_COLORS[type],
					borderColor: OUTCOME_COLORS[type],
					pointRadius: 0,
					tension: 0.2,
				})),
			}
			return (
				<TrendChartBase
					yearRange={yearRange}
					isEmpty={isEmpty}
					data={outcomesData}
					options={{
						...commonOptions,
						scales: {
							...commonOptions.scales,
							y: { ...commonOptions.scales?.y, stacked: true },
						},
						plugins: {
							...commonOptions.plugins,
							tooltip: {
								...commonOptions.plugins?.tooltip,
								callbacks: {
									footer: (items) => {
										const total = items.reduce(
											(sum, item) => sum + (item.raw as number),
											0,
										)
										return `Total Ended: ${total}`
									},
								},
							},
						},
					}}
					footerItems={outcomeTypes.map((type) => ({
						label: OUTCOME_LABELS[type],
						color: OUTCOME_COLORS[type],
						value: renderEntry.warOutcomes[type] || 0,
					}))}
					totalValue={outcomeTypes.reduce(
						(sum, type) => sum + (renderEntry.warOutcomes[type] || 0),
						0,
					)}
					activeLineIdx={activeLineIdx}
					onIdxSelect={handleIdxSelect}
				/>
			)
		}
		if (tab === "rebellions") {
			const rebellionTypes: (keyof RebellionOutcomeCounts)[] = [
				"normal",
				"succession",
			]
			const rebellionsData: ChartData<"line"> = {
				labels,
				datasets: rebellionTypes.map((type) => ({
					label: REBELLION_LABELS[type],
					data: windowedHistory.map((h) => h.rebellionOutcomes[type] || 0),
					fill: true,
					backgroundColor: REBELLION_COLORS[type],
					borderColor: REBELLION_COLORS[type],
					pointRadius: 0,
					tension: 0.2,
				})),
			}
			return (
				<TrendChartBase
					yearRange={yearRange}
					isEmpty={isEmpty}
					data={rebellionsData}
					options={{
						...commonOptions,
						scales: {
							...commonOptions.scales,
							y: { ...commonOptions.scales?.y, stacked: true },
						},
						plugins: {
							...commonOptions.plugins,
							tooltip: {
								...commonOptions.plugins?.tooltip,
								callbacks: {
									footer: (items) => {
										const total = items.reduce(
											(sum, item) => sum + (item.raw as number),
											0,
										)
										return `Total: ${total}`
									},
								},
							},
						},
					}}
					footerItems={rebellionTypes.map((type) => ({
						label: REBELLION_LABELS[type],
						color: REBELLION_COLORS[type],
						value: renderEntry.rebellionOutcomes[type] || 0,
					}))}
					totalValue={rebellionTypes.reduce(
						(sum, type) => sum + (renderEntry.rebellionOutcomes[type] || 0),
						0,
					)}
					activeLineIdx={activeLineIdx}
					onIdxSelect={handleIdxSelect}
				/>
			)
		}
		if (tab === "seasonal_temp") {
			const { heat, lats } = EBM.model
			const { time } = EBM.constants

			const sampledDays = []
			const dayLabels = []
			// Sample every 10 days
			for (let i = 0; i < time.DAYS_PER_YEAR; i += 10) {
				sampledDays.push(i)
				dayLabels.push(`${i}`)
			}

			let displayHeat = heat
			let colorFn: ((t: number) => string) | undefined = undefined

			if (seasonalTab === "dy") {
				displayHeat = heat.map((row, latIdx) => {
					if (latIdx === 0) return row.map(() => 0)
					const prevRow = heat[latIdx - 1]
					return row.map((val, timeIdx) => val - prevRow[timeIdx])
				})

				// Red = Warmer (Positive), Blue = Colder (Negative)
				// interpolateRdBu: 0=Red, 1=Blue
				// Domain [5, -5]: 5 -> 0 (Red), -5 -> 1 (Blue)
				const scale = d3.scaleSequential(d3.interpolateRdBu).domain([5, -5])
				colorFn = (t: number) => scale(t)
			}

			return (
				<div className="flex flex-col">
					<div className="flex justify-end gap-2 mb-2">
						<button
							className={`px-2 py-1 text-xs border rounded ${seasonalTab === "absolute"
									? "bg-gray-800 text-white border-gray-800"
									: "text-gray-600 border-gray-300 hover:bg-gray-50"
								}`}
							onClick={() => setSeasonalTab("absolute")}
						>
							Absolute
						</button>
						<button
							className={`px-2 py-1 text-xs border rounded ${seasonalTab === "dy"
									? "bg-gray-800 text-white border-gray-800"
									: "text-gray-600 border-gray-300 hover:bg-gray-50"
								}`}
							onClick={() => setSeasonalTab("dy")}
						>
							Delta (dY)
						</button>
					</div>
					<SeasonalTempByLat
						key={seasonalTab} // Force re-mount or re-render when tab changes
						heat={displayHeat}
						latRange={lats}
						sampledDays={sampledDays}
						dayLabels={dayLabels}
						colorFn={colorFn}
					/>
				</div>
			)
		}
		return null
	}

	return (
		<div className="mt-4">
			<Tabs
				tabs={[
					{ id: "nations", label: "Nations" },
					{ id: "development", label: "Development" },
					{ id: "events", label: "Events" },
					{ id: "wars", label: "Active Wars" },
					{ id: "outcomes", label: "War Results" },
					{ id: "rebellions", label: "Rebellions" },
					{ id: "seasonal_temp", label: "Seasonal Temp" },
				]}
				activeTab={tab}
				onTabSelect={(id) => setTab(id as SimulationTabID)}
			/>

			<div className="min-h-[250px]">{renderChart()}</div>
		</div>
	)
}
