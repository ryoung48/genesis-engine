import {
	ActiveElement,
	CategoryScale,
	ChartEvent,
	Chart as ChartJS,
	ChartOptions,
	Filler,
	Legend,
	LegendItem,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
	TooltipItem,
	TooltipModel,
} from "chart.js"
import React from "react"
import { World } from "@/model/types"

declare global {
	interface Window {
		world: World
	}
}

import { Line } from "react-chartjs-2"
import type { HistoryNote } from "@/model/history/types"
import { NATION } from "@/model/nations"
import { START_DATE, TIME } from "@/model/utilities/time"
import { EventDetails, eventDotColors } from "./EventDetails"

// Register Chart.js components
ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Filler,
	Legend,
)

const WINDOW_YEARS = 50

interface NationHistoryProps {
	selectedNation: number
	renderTime: number
	currentTime: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (provinceIdx: number) => void
	selectedYearIdx: number | null
	setSelectedYearIdx: (idx: number | null) => void
	onWarSelect?: (warIdx: number) => void
	compact?: boolean
	hideChart?: boolean
}

// Register custom tooltip positioner
declare module "chart.js" {
	interface TooltipPositionerMap {
		side: (
			this: TooltipModel<"line">,
			items: readonly TooltipItem<"line">[],
			eventPosition: { x: number; y: number },
		) =>
			| {
					x: number
					y: number
					xAlign?: "left" | "right" | "center"
					yAlign?: "top" | "bottom" | "center"
			  }
			| false
	}
}

Tooltip.positioners.side = function (
	this: TooltipModel<"line">,
	items: readonly TooltipItem<"line">[],
	_eventPosition: { x: number; y: number },
) {
	if (!items.length) return false
	const chart = this.chart
	const item = items[0]
	const isRightHalf = item.element.x > chart.width / 2

	// Offset horizontally based on which side of the chart we're on
	// and slightly vertically to clear labels
	return {
		x: item.element.x + (isRightHalf ? -25 : 25),
		y: item.element.y - 60,
		xAlign: isRightHalf ? "right" : "left",
		yAlign: "bottom",
	}
}

export const NationHistory: React.FC<NationHistoryProps> = ({
	selectedNation,
	renderTime,
	currentTime,
	onTimeSelect,
	onZoomToProvince,
	selectedYearIdx,
	setSelectedYearIdx,
	onWarSelect,
	compact = false,
	hideChart = false,
}) => {
	// Smart sliding window: center on renderTime, but slide to maximize visible data
	// when near boundaries (start = year 0, end = currentTime)
	const halfWindow = TIME.delta.year(WINDOW_YEARS / 2)
	const startBoundary = START_DATE

	// Calculate ideal centered window
	let windowStart = renderTime - halfWindow
	let windowEnd = renderTime + halfWindow

	// If window goes before start, shift it forward
	if (windowStart < startBoundary) {
		windowStart = startBoundary
		windowEnd = startBoundary + TIME.delta.year(WINDOW_YEARS)
	}

	// If window goes past modern day, shift it backward
	if (windowEnd > currentTime) {
		windowEnd = currentTime
		windowStart = Math.max(
			startBoundary,
			currentTime - TIME.delta.year(WINDOW_YEARS),
		)
	}

	// Compute nation history for each year in the window
	const province = window.world?.provinces?.[selectedNation]
	const windowedNationHistory = React.useMemo(() => {
		if (!province) return []

		const startYear = TIME.date.toYear(windowStart)
		const endYear = TIME.date.toYear(windowEnd)
		const history: {
			time: number
			size: number
			wealth: number
			optimalWealth: number
		}[] = []

		for (let year = startYear; year <= endYear; year++) {
			const time = TIME.date.fromYear(year)
			const provinces = NATION.provinces(province, time)
			const size = provinces.length
			const wealth = NATION.wealth.current({ nation: province, time })
			const optimalWealth = NATION.wealth.optimal(province, time)
			history.push({ time, size, wealth, optimalWealth })
		}

		return history
	}, [province, windowStart, windowEnd])

	// Get events in time range
	const filteredEvents = (window.world?.past || []).filter(
		(e: HistoryNote) =>
			e.agents.includes(selectedNation) &&
			e.time >= windowStart &&
			e.time <= windowEnd,
	) as HistoryNote[]

	// Calculate the year range for display
	const startYearText = TIME.date.toYear(windowStart)
	const endYearText = TIME.date.toYear(windowEnd)

	// --- Refs for seamless chart synchronization ---
	// 1. Calculate the target index for the vertical line
	const currentYear = TIME.date.toYear(renderTime)
	const liveIdx = windowedNationHistory.findIndex(
		(h) => TIME.date.toYear(h.time) === currentYear,
	)
	const activeLineIdx = liveIdx // Always track renderTime for the vertical line

	// 2. Store it in a ref for the plugin to read
	const activeIdxRef = React.useRef(activeLineIdx)
	activeIdxRef.current = activeLineIdx

	// 3. Ref to the chart instance
	const chartRef = React.useRef<ChartJS<"line">>(null)

	// 4. Effect to force a visual update when the line index changes
	React.useEffect(() => {
		const chart = chartRef.current
		if (chart) {
			chart.update("none")
		}
	}, [])

	// 5. Stable plugin definition
	const chartPlugins = React.useMemo(
		() => [
			{
				id: "verticalLine",
				afterDatasetsDraw: (chart: ChartJS<"line">) => {
					// Read from ref, not closure
					const lineIdx = activeIdxRef.current

					if (
						lineIdx !== null &&
						lineIdx >= 0 &&
						lineIdx < chart.data.labels.length
					) {
						const { ctx, chartArea, scales } = chart
						const x = scales.x.getPixelForValue(lineIdx)

						if (Number.isFinite(x)) {
							ctx.save()
							ctx.setLineDash([5, 5])
							ctx.lineWidth = 2
							ctx.strokeStyle = "#4f46e5"

							ctx.beginPath()
							ctx.moveTo(x, chartArea.top)
							ctx.lineTo(x, chartArea.bottom)
							ctx.stroke()

							// Triangle indicator
							ctx.fillStyle = "#4f46e5"
							ctx.beginPath()
							ctx.moveTo(x - 5, chartArea.top)
							ctx.lineTo(x + 5, chartArea.top)
							ctx.lineTo(x, chartArea.top + 8)
							ctx.fill()
							ctx.restore()
						}
					}
				},
			},
		],
		[],
	)

	return (
		<>
			{/* Header with year range */}
			{!hideChart && (
				<div className="flex items-center justify-between mb-2">
					<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
						History
					</span>
					<span className="text-[9px] text-gray-500 font-mono">
						Y{startYearText}-Y{endYearText}
					</span>
				</div>
			)}

			{/* Integrated Chart */}
			{!hideChart && (
				<div className="mb-3">
					<div className="bg-gray-50 rounded-none p-3 border border-gray-200 relative">
						{windowedNationHistory.length > 1 ? (
							(() => {
								// Get unique event types from filtered events
								const visibleEventTypes = Array.from(
									new Set(filteredEvents.map((e) => e.tag)),
								)

								// Build a map of point index -> unique event types at that point
								const eventTypesAtPoint: Map<number, string[]> = new Map()
								filteredEvents.forEach((e) => {
									const eventYear = TIME.date.toYear(e.time)
									const closestIdx = windowedNationHistory.findIndex(
										(ph) => TIME.date.toYear(ph.time) === eventYear,
									)
									if (closestIdx >= 0) {
										const existing = eventTypesAtPoint.get(closestIdx) || []
										if (!existing.includes(e.tag)) {
											existing.push(e.tag)
											eventTypesAtPoint.set(closestIdx, existing)
										}
									}
								})

								// Chart.js data with vertically stacked event datasets
								const chartData = {
									labels: windowedNationHistory.map(
										(h) => `Y${TIME.date.toYear(h.time)}`,
									),
									datasets: [
										{
											label: "Current Wealth",
											data: windowedNationHistory.map((h) => h.wealth),
											borderColor: "#f59e0b",
											backgroundColor: "rgba(245, 158, 11, 0.1)",
											borderWidth: 2,
											fill: true,
											tension: 0.3,
											pointRadius: 0,
											pointHoverRadius: 5,
										},
										{
											label: "Optimal Wealth",
											data: windowedNationHistory.map((h) => h.optimalWealth),
											borderColor: "#10b981",
											backgroundColor: "transparent",
											borderWidth: 1.5,
											borderDash: [4, 4],
											fill: false,
											tension: 0.3,
											pointRadius: 0,
											pointHoverRadius: 4,
										},
										// Add a dataset for each visible event type with vertical stacking
										// Y offset separates multiple events at the same point
										...visibleEventTypes.map((eventType) => {
											// Find max wealth for offset calculation
											const maxWealth = Math.max(
												...windowedNationHistory.map((h) => h.wealth),
											)
											const yOffset = maxWealth * 0.15 // 15% of max wealth per stack level

											return {
												label: eventType,
												data: windowedNationHistory.map((h, i) => {
													const typesAtPoint = eventTypesAtPoint.get(i) || []
													const typeIndex = typesAtPoint.indexOf(eventType)
													if (typeIndex < 0) return null
													// Center stack on the wealth line
													const numTypes = typesAtPoint.length
													const centeredIndex = typeIndex - (numTypes - 1) / 2
													return h.wealth + centeredIndex * yOffset
												}),
												borderColor: "transparent",
												backgroundColor: eventDotColors[eventType] || "#9ca3af",
												borderWidth: 0,
												fill: false,
												tension: 0,
												pointRadius: 5,
												pointHoverRadius: 7,
												pointBorderColor: "white",
												pointBorderWidth: 1,
												showLine: false, // Don't connect the dots with lines
											}
										}),
									],
								}

								const options: ChartOptions<"line"> = {
									responsive: true,
									maintainAspectRatio: false,
									interaction: {
										mode: "index",
										intersect: false,
									},
									plugins: {
										legend: {
											display: true,
											position: "top" as const,
											labels: {
												usePointStyle: true,
												pointStyle: "circle",
												boxWidth: 6,
												boxHeight: 6,
												padding: 8,
												font: { size: 9 },
												filter: (legendItem: LegendItem) =>
													!["Current Wealth", "Optimal Wealth"].includes(
														legendItem.text,
													),
											},
										},
										tooltip: {
											mode: "index",
											intersect: false,
											position: "side",
											caretPadding: 20,
											displayColors: true,
											caretSize: 0,
											backgroundColor: "rgba(17, 24, 39, 0.9)",
											titleFont: { size: 10, weight: "bold" },
											bodyFont: { size: 10 },
											footerFont: { size: 10, weight: "bold" },
											padding: 8,
											cornerRadius: 0,
											callbacks: {
												label: (context: TooltipItem<"line">) => {
													const datasetLabel = context.dataset.label || ""
													if (context.datasetIndex >= 2) {
														return context.raw !== null &&
															typeof context.raw !== "undefined"
															? `  ${datasetLabel.toUpperCase()}`
															: ""
													}
													if (datasetLabel === "Current Wealth") {
														return `  💰 Wealth: ${context.parsed.y.toFixed(1)}`
													}
													if (datasetLabel === "Optimal Wealth") {
														return `  ✨ Optimal: ${context.parsed.y.toFixed(1)}`
													}
													return `  ${datasetLabel}: ${context.parsed.y.toFixed(1)}`
												},
												footer: (tooltipItems) => {
													if (tooltipItems.length === 0) return ""
													const idx = tooltipItems[0].dataIndex
													const historyPoint = windowedNationHistory[idx]
													if (!historyPoint) return ""
													return `📍 Size: ${historyPoint.size} provinces`
												},
											},
										},
									},
									scales: {
										x: {
											display: true,
											grid: { display: false },
											ticks: {
												font: { size: 9 },
												color: "#6b7280",
												maxTicksLimit: 5,
											},
										},
										y: {
											display: true,
											beginAtZero: true,
											grace: "50%",
											grid: { color: "#e5e7eb" },
											ticks: {
												font: { size: 8 },
												color: "#9ca3af",
												callback: (value: string | number) =>
													typeof value === "number"
														? value >= 1000
															? `${(value / 1000).toFixed(0)}k`
															: value.toFixed(0)
														: value,
											},
										},
									},
									onClick: (
										_: ChartEvent,
										elements: ActiveElement[],
										_chart: ChartJS,
									) => {
										if (elements.length > 0) {
											const dataIdx = elements[0].index
											setSelectedYearIdx(dataIdx)
											if (onTimeSelect && windowedNationHistory[dataIdx]) {
												onTimeSelect(windowedNationHistory[dataIdx].time)
											}
										} else {
											setSelectedYearIdx(null)
										}
									},
								}

								return (
									<div style={{ height: "140px" }}>
										<Line
											ref={chartRef}
											data={chartData}
											options={options}
											plugins={chartPlugins}
										/>
									</div>
								)
							})()
						) : (
							<div className="text-[10px] text-gray-400 text-center py-6">
								Tracking...
							</div>
						)}
					</div>
					{/* Summary stats */}
					{!compact && windowedNationHistory.length > 0 && (
						<div className="flex justify-between mt-1 text-[9px]">
							<span className="text-gray-400">
								Current:{" "}
								<span className="font-bold text-amber-600">
									{windowedNationHistory[
										windowedNationHistory.length - 1
									]?.wealth.toFixed(1) || 0}
								</span>
							</span>
							<span className="text-gray-400">
								Events:{" "}
								<span className="font-bold text-indigo-600">
									{filteredEvents.length}
								</span>
							</span>
							<span className="text-gray-400">
								Max:{" "}
								<span className="font-bold text-amber-600">
									{Math.max(
										...windowedNationHistory.map((h) => h.wealth),
									).toFixed(1)}
								</span>
							</span>
						</div>
					)}
				</div>
			)}

			{/* Selected Year Events */}
			{!compact &&
				selectedYearIdx !== null &&
				windowedNationHistory[selectedYearIdx] &&
				(() => {
					const selectedHistoryPoint = windowedNationHistory[selectedYearIdx]
					const selectedYear = TIME.date.toYear(selectedHistoryPoint.time)
					const eventsAtPoint = filteredEvents.filter((e) => {
						const eventYear = TIME.date.toYear(e.time)
						return eventYear === selectedYear
					})

					return (
						<EventDetails
							events={eventsAtPoint}
							selectedYear={selectedYear}
							viewingNation={selectedNation}
							onTimeSelect={onTimeSelect}
							onZoomToProvince={onZoomToProvince}
							onWarSelect={onWarSelect}
						/>
					)
				})()}

			{/* No events message */}
			{!compact && filteredEvents.length === 0 && (
				<div className="text-[10px] text-gray-400 text-center py-2">
					No events in this time range
				</div>
			)}
		</>
	)
}
