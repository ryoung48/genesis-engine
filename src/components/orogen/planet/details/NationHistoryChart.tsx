import {
	ActiveElement,
	CategoryScale,
	ChartEvent,
	Chart as ChartJS,
	type ChartOptions,
	Filler,
	Legend,
	type LegendItem,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
	type TooltipItem,
} from "chart.js"
import React from "react"
import { Line } from "react-chartjs-2"
import type { HistoryNote } from "@/model/orogen/history"
import { monthLabels } from "../constants"
import { historyTimeParts, historyTimeToYear } from "../history-time"
import {
	type EventCtx,
	eventDotColors,
	eventYear,
	getDisplayTags,
	getEventDescription,
	getEventDotColor,
} from "./event-description"

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

export interface NationHistoryPoint {
	timeMs: number
	size: number
	wealth: number
	optimalWealth: number
}

interface NationHistoryChartProps {
	history: NationHistoryPoint[]
	windowedEvents: HistoryNote[]
	allPastEvents: HistoryNote[]
	viewingNation: number
	selectedTimeMs: number
	currentTimeMs: number
	onTimeSelect: (timeMs: number) => void
	onNationClick?: (nationId: number) => void
}

export const NationHistoryChart: React.FC<NationHistoryChartProps> = ({
	history,
	windowedEvents,
	allPastEvents,
	viewingNation,
	selectedTimeMs,
	currentTimeMs,
	onTimeSelect,
	onNationClick,
}) => {
	const currentLineIdx = history.findIndex((h) => h.timeMs === currentTimeMs)
	const selectedLineIdx = history.findIndex((h) => h.timeMs === selectedTimeMs)
	const currentIdxRef = React.useRef(currentLineIdx)
	const selectedIdxRef = React.useRef(selectedLineIdx)
	currentIdxRef.current = currentLineIdx
	selectedIdxRef.current = selectedLineIdx
	const chartRef = React.useRef<ChartJS<"line">>(null)

	React.useEffect(() => {
		chartRef.current?.update("none")
	}, [])

	const chartPlugins = React.useMemo(
		() => [
			{
				id: "timelineMarkers",
				afterDatasetsDraw: (chart: ChartJS<"line">) => {
					const { ctx, chartArea, scales } = chart
					const drawMarker = (params: {
						lineIdx: number
						color: string
						dashed: boolean
						triangle: boolean
					}) => {
						if (
							params.lineIdx < 0 ||
							!chart.data.labels ||
							params.lineIdx >= chart.data.labels.length
						) {
							return
						}
						const x = scales.x.getPixelForValue(params.lineIdx)
						if (!Number.isFinite(x)) return
						ctx.save()
						ctx.setLineDash(params.dashed ? [5, 5] : [])
						ctx.lineWidth = 2
						ctx.strokeStyle = params.color
						ctx.beginPath()
						ctx.moveTo(x, chartArea.top)
						ctx.lineTo(x, chartArea.bottom)
						ctx.stroke()
						if (params.triangle) {
							ctx.fillStyle = params.color
							ctx.beginPath()
							ctx.moveTo(x - 5, chartArea.top)
							ctx.lineTo(x + 5, chartArea.top)
							ctx.lineTo(x, chartArea.top + 8)
							ctx.fill()
						}
						ctx.restore()
					}

					drawMarker({
						lineIdx: currentIdxRef.current,
						color: "#4f46e5",
						dashed: true,
						triangle: true,
					})
					if (selectedIdxRef.current !== currentIdxRef.current) {
						drawMarker({
							lineIdx: selectedIdxRef.current,
							color: "#f59e0b",
							dashed: false,
							triangle: false,
						})
					}
				},
			},
		],
		[],
	)

	const ctx: EventCtx = React.useMemo(
		() => ({ pastEvents: allPastEvents, viewingNation }),
		[allPastEvents, viewingNation],
	)

	const selectedYear = historyTimeToYear(selectedTimeMs)
	const selectedEvents = React.useMemo(
		() => windowedEvents.filter((e) => eventYear(e) === selectedYear),
		[windowedEvents, selectedYear],
	)

	if (history.length < 2) {
		return (
			<div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-[10px] text-slate-400">
				Tracking history...
			</div>
		)
	}

	const visibleEventTypes = Array.from(
		new Set(windowedEvents.map((e) => e.tag)),
	)
	const eventTypesAtPoint = new Map<number, string[]>()
	for (const e of windowedEvents) {
		const idx = history.findIndex(
			(h) => historyTimeToYear(h.timeMs) === eventYear(e),
		)
		if (idx < 0) continue
		const existing = eventTypesAtPoint.get(idx) ?? []
		if (!existing.includes(e.tag)) {
			existing.push(e.tag)
			eventTypesAtPoint.set(idx, existing)
		}
	}

	const maxWealth = Math.max(1, ...history.map((h) => h.wealth))
	const yOffset = maxWealth * 0.15

	const chartData = {
		labels: history.map((h) => `Y${historyTimeToYear(h.timeMs)}`),
		datasets: [
			{
				label: "Current Wealth",
				data: history.map((h) => h.wealth),
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
				data: history.map((h) => h.optimalWealth),
				borderColor: "#10b981",
				backgroundColor: "transparent",
				borderWidth: 1.5,
				borderDash: [4, 4],
				fill: false,
				tension: 0.3,
				pointRadius: 0,
				pointHoverRadius: 4,
			},
			...visibleEventTypes.map((eventType) => ({
				label: eventType,
				data: history.map((h, i) => {
					const types = eventTypesAtPoint.get(i) ?? []
					const tIdx = types.indexOf(eventType)
					if (tIdx < 0) return null
					const centered = tIdx - (types.length - 1) / 2
					return h.wealth + centered * yOffset
				}),
				borderColor: "transparent",
				backgroundColor: eventDotColors[eventType] ?? "#9ca3af",
				borderWidth: 0,
				fill: false,
				tension: 0,
				pointRadius: 5,
				pointHoverRadius: 7,
				pointBorderColor: "white",
				pointBorderWidth: 1,
				showLine: false,
			})),
		],
	}

	const options: ChartOptions<"line"> = {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: "index", intersect: false },
		plugins: {
			legend: {
				display: true,
				position: "top",
				labels: {
					usePointStyle: true,
					pointStyle: "circle",
					boxWidth: 6,
					boxHeight: 6,
					padding: 8,
					font: { size: 9 },
					filter: (legendItem: LegendItem) =>
						!["Current Wealth", "Optimal Wealth"].includes(legendItem.text),
				},
			},
			tooltip: {
				mode: "index",
				intersect: false,
				displayColors: true,
				backgroundColor: "rgba(17, 24, 39, 0.9)",
				titleFont: { size: 10, weight: "bold" },
				bodyFont: { size: 10 },
				padding: 8,
				cornerRadius: 0,
				callbacks: {
					label: (context: TooltipItem<"line">) => {
						const label = context.dataset.label ?? ""
						if (context.datasetIndex >= 2) {
							return context.raw != null ? `  ${label.toUpperCase()}` : ""
						}
						if (label === "Current Wealth") {
							return `  Wealth: ${context.parsed.y.toFixed(1)}`
						}
						if (label === "Optimal Wealth") {
							return `  Optimal: ${context.parsed.y.toFixed(1)}`
						}
						return `  ${label}: ${context.parsed.y.toFixed(1)}`
					},
					footer: (items) => {
						if (items.length === 0) return ""
						const point = history[items[0].dataIndex]
						return point ? `Size: ${point.size} provinces` : ""
					},
				},
			},
		},
		scales: {
			x: {
				display: true,
				grid: { display: false },
				ticks: { font: { size: 9 }, color: "#6b7280", maxTicksLimit: 5 },
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
		onClick: (_: ChartEvent, elements: ActiveElement[]) => {
			if (elements.length > 0) {
				const point = history[elements[0].index]
				if (point) onTimeSelect(point.timeMs)
			}
		},
	}

	return (
		<div className="space-y-2">
			<div className="rounded-xl border border-slate-200 bg-white/80 p-2">
				<div style={{ height: 140 }}>
					<Line
						ref={chartRef}
						data={chartData}
						options={options}
						plugins={chartPlugins}
					/>
				</div>
				<div className="mt-1 flex justify-between text-[9px] text-slate-400">
					<span>
						Y{historyTimeToYear(history[0].timeMs)}-Y
						{historyTimeToYear(history[history.length - 1].timeMs)}
					</span>
					<span>
						Events:{" "}
						<span className="font-bold text-indigo-600">
							{windowedEvents.length}
						</span>
					</span>
				</div>
			</div>

			<EventCards
				events={selectedEvents}
				year={selectedYear}
				ctx={ctx}
				onTimeSelect={onTimeSelect}
				onNationClick={onNationClick}
			/>
		</div>
	)
}

function renderDescription(
	text: string,
	onNationClick?: (nationId: number) => void,
) {
	const parts: React.ReactNode[] = []
	const re = /#(\d+)/g
	let last = 0
	let match: RegExpExecArray | null
	let key = 0
	match = re.exec(text)
	while (match !== null) {
		if (match.index > last) parts.push(text.slice(last, match.index))
		const id = Number(match[1])
		if (onNationClick) {
			parts.push(
				<button
					key={key++}
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						onNationClick(id)
					}}
					className="font-semibold text-indigo-600 hover:underline"
				>
					#{id}
				</button>,
			)
		} else {
			parts.push(match[0])
		}
		last = match.index + match[0].length
		match = re.exec(text)
	}
	if (last < text.length) parts.push(text.slice(last))
	return parts
}

function EventCards({
	events,
	year,
	ctx,
	onTimeSelect,
	onNationClick,
}: {
	events: HistoryNote[]
	year: number
	ctx: EventCtx
	onTimeSelect: (timeMs: number) => void
	onNationClick?: (nationId: number) => void
}) {
	if (events.length === 0) {
		return (
			<div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
				<div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
					Year {year}
				</div>
				<div className="text-[10px] text-slate-400">No events this year</div>
			</div>
		)
	}

	return (
		<div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
			<div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
				Year {year} · {events.length} event{events.length === 1 ? "" : "s"}
			</div>
			<div className="space-y-2">
				{events.map((event, i) => {
					const tags = getDisplayTags(event, ctx.viewingNation)
					const dotColor = getEventDotColor(event, ctx.viewingNation)
					const { month, day } = historyTimeParts(event.time)
					const monthLabel = monthLabels[month] ?? `M${month}`
					return (
						<div
							key={i}
							role="button"
							tabIndex={0}
							onClick={() => onTimeSelect(event.time)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onTimeSelect(event.time)
								}
							}}
							className="block w-full cursor-pointer border-l-2 pl-2 text-left transition-colors hover:bg-slate-50"
							style={{ borderColor: dotColor }}
						>
							<div className="flex items-center gap-2">
								<span
									className="h-2 w-2 shrink-0 rounded-full"
									style={{ backgroundColor: dotColor }}
								/>
								{tags.secondary ? (
									<div
										className="flex overflow-hidden rounded-sm border"
										style={{ borderColor: dotColor }}
									>
										<span className="bg-gray-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-gray-600">
											{tags.primary}
										</span>
										<span
											className="px-1.5 py-0.5 text-[8px] font-bold uppercase text-white"
											style={{ backgroundColor: dotColor }}
										>
											{tags.secondary}
										</span>
									</div>
								) : (
									<span className="text-[9px] font-bold uppercase text-gray-700">
										{tags.primary}
									</span>
								)}
								{tags.title && (
									<span className="ml-1 text-[9px] font-bold text-gray-800">
										- {tags.title}
									</span>
								)}
								<span className="ml-auto text-[8px] font-mono uppercase tracking-[0.12em] text-slate-400">
									{monthLabel} {day}
								</span>
							</div>
							<div
								className="mt-1 text-[9px] leading-tight text-gray-600"
								style={{ overflowWrap: "anywhere" }}
							>
								{renderDescription(
									getEventDescription(event, ctx),
									onNationClick,
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
