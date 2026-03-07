import {
	CategoryScale,
	Chart as ChartJS,
	ChartOptions,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
	TooltipItem,
} from "chart.js"
import React from "react"
import { Line } from "react-chartjs-2"
import type { HistoryNote } from "@/model/history/types"
import { NATION } from "@/model/nations"
import { WAR } from "@/model/nations/wars"
import { TIME } from "@/model/utilities/time"
import {
	getDisplayTags,
	getEventDescription,
	getEventDotColor,
} from "./NationTab/EventDetails"
import { NationLink } from "./NationTab/NationLink"

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
	Filler,
)

interface WarTabProps {
	selectedWar: number
	renderTime: number
	currentTime: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (provinceIdx: number) => void
	onNationSelect?: (nationIdx: number) => void
}

export const WarTab: React.FC<WarTabProps> = ({
	selectedWar,
	renderTime,
	currentTime,
	onTimeSelect,
	onZoomToProvince,
	onNationSelect,
}) => {
	const war = window.world.wars[selectedWar]

	const participants = WAR.participants({ war, time: renderTime })

	const startTime = war?.startTime ?? 0
	const endTime = war?.endTime ?? currentTime

	// Get events related to this war
	const warEvents = (window.world.past || []).filter(
		(e) => "war" in e && (e as { war: number }).war === selectedWar,
	) as HistoryNote[]

	// Compute wealth history for both sides
	const windowedHistory = React.useMemo(() => {
		const startYear = TIME.date.toYear(startTime)
		const endYear = TIME.date.toYear(endTime)
		const history: {
			time: number
			attackerWealth: number
			defenderWealth: number
		}[] = []

		for (let year = startYear; year <= endYear; year++) {
			const time = TIME.date.fromYear(year)
			const aWealth = NATION.wealth.current({
				nation: participants.attacker.leader,
				time,
			})
			const dWealth = NATION.wealth.current({
				nation: participants.defender.leader,
				time,
			})
			history.push({ time, attackerWealth: aWealth, defenderWealth: dWealth })
		}

		return history
	}, [participants, startTime, endTime])

	// Match "Wealth & Events" aesthetic from history
	const attackerColor = participants.attacker.leader.color
	const defenderColor = participants.defender.leader.color

	const getTransparentColor = (color: string, opacity: number) => {
		if (color.startsWith("#")) {
			const r = parseInt(color.slice(1, 3), 16)
			const g = parseInt(color.slice(3, 5), 16)
			const b = parseInt(color.slice(5, 7), 16)
			return `rgba(${r}, ${g}, ${b}, ${opacity})`
		}
		return color
	}

	const chartData = {
		labels: windowedHistory.map((h) => `Y${TIME.date.toYear(h.time)}`),
		datasets: [
			{
				label: "Attacker",
				data: windowedHistory.map((h) => h.attackerWealth),
				borderColor: attackerColor,
				backgroundColor: getTransparentColor(attackerColor, 0.1),
				borderWidth: 2,
				fill: true,
				tension: 0.3,
				pointRadius: 0,
			},
			{
				label: "Defender",
				data: windowedHistory.map((h) => h.defenderWealth),
				borderColor: defenderColor,
				backgroundColor: getTransparentColor(defenderColor, 0.1),
				borderWidth: 2,
				fill: true,
				tension: 0.3,
				pointRadius: 0,
			},
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
					boxWidth: 6,
					font: { size: 9 },
				},
			},
			tooltip: {
				cornerRadius: 0,
				padding: 8,
				titleFont: { size: 10 },
				bodyFont: { size: 10 },
				callbacks: {
					label: (context: TooltipItem<"line">) => {
						return `  ${context.dataset.label}: ${context.parsed.y.toFixed(1)}`
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
				grace: "20%",
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
	}

	return (
		<div className="space-y-3">
			{/* War Header */}
			<div className="bg-amber-50 border border-amber-200 rounded-none p-3">
				<div className="flex items-center justify-between mb-2">
					<span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">
						War #{selectedWar} {war.rebel ? "(Rebellion)" : ""}
					</span>
					<span className="text-[9px] font-mono text-amber-600">
						Y{TIME.date.toYear(startTime)} -{" "}
						{war.endTime ? `Y${TIME.date.toYear(war.endTime)}` : "Ongoing"}
					</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="flex-1 text-center">
						<div
							className="cursor-pointer hover:bg-white/50 p-1 rounded-none transition-colors"
							onClick={() => onNationSelect?.(war.attacker)}
						>
							<div
								className="w-2 h-2 rounded-none mx-auto mb-1"
								style={{ backgroundColor: attackerColor }}
							/>
							<div className="text-[10px] font-bold truncate">
								Nation #{war.attacker}
							</div>
							<div className="text-[8px] text-gray-500 uppercase">Attacker</div>
						</div>
						{participants.attacker.allies.length > 0 && (
							<div className="mt-1 space-y-0.5">
								{participants.attacker.allies.map((ally) => (
									<div key={ally.idx} className="text-[8px] text-gray-500">
										<NationLink
											id={ally.idx}
											onZoomToProvince={onZoomToProvince}
											onNationSelect={onNationSelect}
											className="text-[8px]"
										/>
									</div>
								))}
							</div>
						)}
					</div>
					<div className="text-xl font-black text-amber-200">VS</div>
					<div className="flex-1 text-center">
						<div
							className="cursor-pointer hover:bg-white/50 p-1 rounded-none transition-colors"
							onClick={() => onNationSelect?.(war.defender)}
						>
							<div
								className="w-2 h-2 rounded-none mx-auto mb-1"
								style={{ backgroundColor: defenderColor }}
							/>
							<div className="text-[10px] font-bold truncate">
								Nation #{war.defender}
							</div>
							<div className="text-[8px] text-gray-500 uppercase">Defender</div>
						</div>
						{participants.defender.allies.length > 0 && (
							<div className="mt-1 space-y-0.5">
								{participants.defender.allies.map((ally) => (
									<div key={ally.idx} className="text-[8px] text-gray-500">
										<NationLink
											id={ally.idx}
											onZoomToProvince={onZoomToProvince}
											onNationSelect={onNationSelect}
											className="text-[8px]"
										/>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Wealth Component */}
			<div className="bg-gray-50 border border-gray-200 rounded-none p-3 shadow-sm relative">
				<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
					Wealth Comparison
				</div>
				<div style={{ height: "120px" }}>
					<Line data={chartData} options={options} />
				</div>
			</div>

			{/* Event List */}
			<div className="bg-white border border-gray-200 rounded-none p-3 shadow-sm max-h-[250px] overflow-y-auto">
				<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
					War Events ({warEvents.length})
				</div>
				<div className="space-y-2">
					{warEvents.length === 0 ? (
						<div className="text-[10px] text-gray-400 text-center py-4">
							No logged events
						</div>
					) : (
						warEvents.map((event, i) => {
							const dotColor = getEventDotColor(event, war.attacker) // Defaulting perspective to attacker
							const tags = getDisplayTags(event, war.attacker)

							return (
								<div
									key={i}
									className="border-l-2 pl-2"
									style={{ borderColor: dotColor }}
								>
									<div className="flex items-center gap-2">
										<div
											className="w-1.5 h-1.5 rounded-none flex-shrink-0"
											style={{ backgroundColor: dotColor }}
										/>
										{tags.secondary ? (
											<div className="flex truncate border rounded-sm overflow-hidden flex-shrink-0" style={{ borderColor: dotColor }}>
												<span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-gray-100 text-gray-600">
													{tags.primary}
												</span>
												<span className="text-[8px] font-bold uppercase px-1.5 py-0.5 text-white" style={{ backgroundColor: dotColor }}>
													{tags.secondary}
												</span>
											</div>
										) : (
											<span className="text-[8px] font-bold text-gray-700 uppercase flex-shrink-0">
												{tags.primary}
											</span>
										)}
										{tags.title && (
											<span className="text-[9px] font-bold text-gray-800 ml-1">
												— {tags.title}
											</span>
										)}
										<span className="text-[8px] font-mono text-gray-400 ml-auto whitespace-nowrap">
											{TIME.date.format(event.time)}
										</span>
										<button
											className="text-[8px] font-mono px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded-none hover:bg-indigo-100 cursor-pointer"
											onClick={() => onTimeSelect?.(event.time)}
										>
											Go
										</button>
									</div>
									<div className="text-[9px] text-gray-600 mt-1">
										{getEventDescription(
											event,
											war.attacker,
											onZoomToProvince,
											() => {
												/* Already in war tab */
											},
											onNationSelect,
										)}
									</div>
								</div>
							)
						})
					)}
				</div>
			</div>
		</div>
	)
}
