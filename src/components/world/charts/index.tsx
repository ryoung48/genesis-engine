import React, { useEffect, useRef, useState } from "react"
import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { TIME } from "@/model/utilities/time"
import { NationTab } from "./NationTab"
import { ProvinceTab } from "./ProvinceTab"
import { SIZE_BUCKETS, SimulationTab } from "./SimulationTab"
import { WarTab } from "./WarTab"

const MAX_HISTORY_POINTS = 500

// Event types in order for stacked chart
export const EVENT_TYPES = [
	"rebellion",
	"succession",
	"war started",
	"battle",
	"war ended",
] as const
export type EventCounts = Record<(typeof EVENT_TYPES)[number], number>

export interface WarOutcomeCounts {
	attackerWin: number
	defenderWin: number
	exhaustion: number
	invalidated: number
}

export interface RebellionOutcomeCounts {
	normal: number
	succession: number
}

interface ChartPanelProps {
	chartTab: "simulation" | "nation" | "province" | "war"
	setChartTab: (tab: "simulation" | "nation" | "province" | "war") => void
	selectedNation: number | null
	selectedProvince: number | null
	selectedWar: number | null
	setSelectedWar: (warIdx: number | null) => void
	currentTime: number
	renderTime: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (provinceIdx: number) => void
	onNationSelect?: (nationIdx: number) => void
}

export const ChartPanel: React.FC<ChartPanelProps> = (props) => {
	const {
		chartTab,
		setChartTab,
		selectedNation,
		selectedProvince,
		selectedWar,
		setSelectedWar,
		currentTime,
		renderTime,
		onTimeSelect,
		onZoomToProvince,
	} = props

	// Distribution state - kept here so it persists across tab switches
	const [nationDistribution, setNationDistribution] = useState<number[]>(() =>
		SIZE_BUCKETS.map(() => 0),
	)
	const [distributionHistory, setDistributionHistory] = useState<
		{
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
	>([])
	const lastRecordedTimeRef = useRef<number>(-Infinity)

	// Update distribution when currentTime changes
	useEffect(() => {
		if (!window.world?.provinces) return

		const nations = NATION.nations()
		const sizes = nations.map((n) => NATION.provinces(n).length)
		const dist = SIZE_BUCKETS.map(
			([min, max]) => sizes.filter((s) => s >= min && s < max).length,
		)

		setNationDistribution(dist)

		// Count active wars (wars with no endTime), split by type
		const allActiveWars =
			window.world.wars?.filter((w) => w.endTime === undefined) ?? []
		const activeWars = allActiveWars.filter((w) => !w.rebel).length
		const activeCivilWars = allActiveWars.filter((w) => w.rebel).length

		// Count events by type for the current year
		const currentYear = TIME.date.toYear(currentTime)
		const past = window.world.past ?? []
		const eventCounts: EventCounts = {
			rebellion: 0,
			succession: 0,
			"war started": 0,
			battle: 0,
			"war ended": 0,
		}
		const warOutcomes: WarOutcomeCounts = {
			attackerWin: 0,
			defenderWin: 0,
			exhaustion: 0,
			invalidated: 0,
		}
		const rebellionOutcomes: RebellionOutcomeCounts = {
			normal: 0,
			succession: 0,
		}

		for (const note of past) {
			if (TIME.date.toYear(note.time) === currentYear) {
				eventCounts[note.tag]++

				if (note.tag === "war ended") {
					if (note.stalemate === "both nations exhausted") {
						warOutcomes.exhaustion++
					} else if (note.stalemate) {
						warOutcomes.invalidated++
					} else if (note.winner === note.attacker) {
						warOutcomes.attackerWin++
					} else {
						warOutcomes.defenderWin++
					}
				}

				if (note.tag === "rebellion") {
					if (note.succession) {
						rebellionOutcomes.succession++
					} else {
						rebellionOutcomes.normal++
					}
				}
			}
		}

		// Record history at each time tick (only for new time points)
		// Removed Year > 0 check - we want to record from the start
		if (currentTime > lastRecordedTimeRef.current) {
			lastRecordedTimeRef.current = currentTime

			// Compute development distribution
			// Buckets: 0-0.1, 0.1-0.2 ... 0.9-1.0 (10 buckets)
			const devDist = new Array(10).fill(0)
			let totalDev = 0
			let countDev = 0
			window.world.provinces.forEach((p) => {
				if (p.desolate) return
				const dev = PROVINCE.development.get(p, currentTime)
				totalDev += dev
				countDev++
				const bucket = Math.min(9, Math.floor(dev * 10))
				devDist[bucket]++
			})
			const avgDev = countDev > 0 ? totalDev / countDev : 0

			setDistributionHistory((prev) => {
				const newHistory = [
					...prev,
					{
						time: currentTime,
						dist,
						devDist,
						avgDev,
						activeWars,
						activeCivilWars,
						eventCounts,
						warOutcomes,
						rebellionOutcomes,
					},
				]
				return newHistory.slice(-MAX_HISTORY_POINTS)
			})
		}
	}, [currentTime])

	const selectedNationProvince =
		selectedNation !== null ? window.world.provinces[selectedNation] : null

	return (
		<div className="mt-4">
			{/* Tab Buttons */}
			<div className="flex gap-0.5 mb-3">
				<button
					onClick={() => setChartTab("simulation")}
					className={`flex-1 font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 px-2 transition-colors cursor-pointer ${
						chartTab === "simulation"
							? "bg-slate-900 text-white"
							: "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					}`}
				>
					SIMULATION
				</button>
				<button
					onClick={() => setChartTab("nation")}
					className={`flex-1 flex items-center justify-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 px-2 transition-colors cursor-pointer border ${
						chartTab === "nation"
							? "text-slate-900 border-slate-900 bg-slate-50"
							: "text-slate-400 border-transparent hover:bg-slate-100 hover:text-slate-600"
					}`}
					style={
						chartTab === "nation" && selectedNationProvince
							? {
									borderColor: selectedNationProvince.color,
								}
							: {}
					}
				>
					<div className="flex items-center gap-1.5">
						{selectedNationProvince && (
							<div
								className="w-2 h-2 border border-black/10"
								style={{ backgroundColor: selectedNationProvince.color }}
							/>
						)}
						<span>
							NATION {selectedNation !== null ? `#${selectedNation}` : ""}
						</span>
					</div>
				</button>
				<button
					onClick={() => setChartTab("province")}
					className={`flex-1 font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 px-2 transition-colors cursor-pointer ${
						chartTab === "province"
							? "bg-slate-900 text-white"
							: "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					}`}
				>
					PROVINCE
				</button>
				{selectedWar !== null && (
					<button
						onClick={() => setChartTab("war")}
						className={`flex-1 font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 px-2 transition-colors cursor-pointer ${
							chartTab === "war"
								? "bg-slate-900 text-white"
								: "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
						}`}
					>
						WAR
					</button>
				)}
			</div>

			{/* Simulation Tab Content */}
			{chartTab === "simulation" && (
				<SimulationTab
					distributionHistory={distributionHistory}
					nationDistribution={nationDistribution}
					renderTime={renderTime}
					currentTime={currentTime}
					onTimeSelect={onTimeSelect}
				/>
			)}

			{chartTab === "nation" && (
				<NationTab
					selectedNation={selectedNation}
					renderTime={renderTime}
					currentTime={currentTime}
					onTimeSelect={onTimeSelect}
					onZoomToProvince={onZoomToProvince}
					onWarSelect={(warIdx: number) => {
						setSelectedWar(warIdx)
						setChartTab("war")
					}}
				/>
			)}

			{chartTab === "province" && (
				<ProvinceTab selectedProvince={selectedProvince} />
			)}

			{chartTab === "war" && selectedWar !== null && (
				<WarTab
					selectedWar={selectedWar}
					renderTime={renderTime}
					currentTime={currentTime}
					onTimeSelect={onTimeSelect}
					onZoomToProvince={onZoomToProvince}
					onNationSelect={(nationIdx: number) => {
						// Assuming we have a way to select nation from parent if needed
						// For now, ClickableLink in WarTab will handle it if we pass onNationSelect
						props.onNationSelect?.(nationIdx)
						setChartTab("nation")
					}}
				/>
			)}
		</div>
	)
}
