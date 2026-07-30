import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { UnitSystem } from "@/ui/planet/screen/shared/ui-format"
import { formatDistance } from "@/ui/planet/screen/shared/ui-format"
import type { MeasureMode } from "./types"

const LAND_TRAVEL_KM_PER_DAY = 30
const SEA_TRAVEL_KM_PER_DAY = 100

function formatTravelTime(days: number): string {
	if (days < 30) return `${days}d`
	const months = Math.floor(days / 30)
	const remainingDays = days % 30
	if (months < 12) {
		return remainingDays > 0 ? `${months}m ${remainingDays}d` : `${months}m`
	}
	const years = Math.floor(months / 12)
	const remainingMonths = months % 12
	const parts: string[] = []
	if (years > 0) parts.push(`${years}y`)
	if (remainingMonths > 0) parts.push(`${remainingMonths}m`)
	if (remainingDays > 0) parts.push(`${remainingDays}d`)
	return parts.join(" ")
}

function formatTravelRateLabel(
	kmPerDay: number,
	unitSystem: UnitSystem,
): string {
	return `(${formatDistance(kmPerDay, unitSystem)}/day)`
}

export interface MeasureSectionProps {
	measureExpanded: boolean
	setMeasureExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	measureMode: MeasureMode
	setMeasureMode: (v: MeasureMode) => void
	pathfindingLand: boolean
	setPathfindingLand: (v: boolean) => void
	pathfindingSea: boolean
	setPathfindingSea: (v: boolean) => void
	pathfindingResult: {
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
	} | null
	unitSystem: UnitSystem
}

export const MeasureSection: React.FC<MeasureSectionProps> = ({
	measureExpanded,
	setMeasureExpanded,
	measureMode,
	setMeasureMode,
	pathfindingLand,
	setPathfindingLand,
	pathfindingSea,
	setPathfindingSea,
	pathfindingResult,
	unitSystem,
}) => {
	return (
		<>
			<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
				<span>Measure</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setMeasureExpanded((v) => !v)}
						className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
					>
						<ChevronIcon
							direction={measureExpanded ? "up" : "down"}
							className="h-3 w-3 text-slate-400"
						/>
					</button>
					<input
						type="checkbox"
						checked={measureMode !== "off"}
						onChange={(e) => {
							if (!e.target.checked) {
								setMeasureMode("off")
							} else if (measureMode === "off") {
								setMeasureMode("ruler")
							}
						}}
						className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
					/>
				</div>
			</label>
			{measureExpanded && (
				<div className="space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Ruler</span>
						<input
							type="radio"
							name="measure-mode"
							checked={measureMode === "ruler"}
							onChange={() => setMeasureMode("ruler")}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Pathfinding</span>
						<input
							type="radio"
							name="measure-mode"
							checked={measureMode === "pathfinding"}
							onChange={() => setMeasureMode("pathfinding")}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					{measureMode === "pathfinding" && (
						<div className="space-y-1.5">
							<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
								<span>
									Land Travel{" "}
									{formatTravelRateLabel(LAND_TRAVEL_KM_PER_DAY, unitSystem)}
								</span>
								<input
									type="checkbox"
									checked={pathfindingLand}
									onChange={(e) => setPathfindingLand(e.target.checked)}
									className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
							</label>
							<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
								<span>
									Sea Travel{" "}
									{formatTravelRateLabel(SEA_TRAVEL_KM_PER_DAY, unitSystem)}
								</span>
								<input
									type="checkbox"
									checked={pathfindingSea}
									onChange={(e) => setPathfindingSea(e.target.checked)}
									className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
							</label>
							{pathfindingResult && (
								<div className="rounded bg-white/5 px-2 py-1.5 font-mono text-[10px] text-slate-300">
									<div>
										Distance:{" "}
										{formatDistance(pathfindingResult.distanceKm, unitSystem)}
									</div>
									<div>
										Land: {formatDistance(pathfindingResult.landKm, unitSystem)}
									</div>
									<div>
										Sea: {formatDistance(pathfindingResult.seaKm, unitSystem)}
									</div>
									<div>
										Travel time: ~
										{formatTravelTime(pathfindingResult.travelDays)}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</>
	)
}
