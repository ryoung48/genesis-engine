import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"
import type { DangerSubMode } from "./types"

export interface DangerSectionProps {
	colorMode: ColorMode
	dangerExpanded: boolean
	setDangerExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	dangerSubMode: DangerSubMode
	setDangerSubMode: (v: DangerSubMode) => void
	hasCycloneRisk: boolean
	hasTornadoRisk: boolean
	hasTidalRisk: boolean
}

export const DangerSection: React.FC<DangerSectionProps> = ({
	colorMode,
	dangerExpanded,
	setDangerExpanded,
	dangerSubMode,
	setDangerSubMode,
	hasCycloneRisk,
	hasTornadoRisk,
	hasTidalRisk,
}) => {
	if (colorMode !== "dangerZones") return null
	return (
		<div>
			<button
				type="button"
				onClick={() => setDangerExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Danger</span>
				<ChevronIcon
					direction={dangerExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{dangerExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Earthquakes</span>
						<input
							type="radio"
							name="danger-sub"
							checked={dangerSubMode === "earthquake"}
							onChange={() => setDangerSubMode("earthquake")}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Volcanic</span>
						<input
							type="radio"
							name="danger-sub"
							checked={dangerSubMode === "volcanic"}
							onChange={() => setDangerSubMode("volcanic")}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label
						className={`flex items-center justify-between gap-3 text-[11px] font-medium ${hasCycloneRisk ? "text-slate-300" : "text-slate-600"}`}
					>
						<span>Cyclones</span>
						<input
							type="radio"
							name="danger-sub"
							checked={dangerSubMode === "cyclone"}
							onChange={() => setDangerSubMode("cyclone")}
							disabled={!hasCycloneRisk}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20 disabled:cursor-not-allowed"
						/>
					</label>
					<label
						className={`flex items-center justify-between gap-3 text-[11px] font-medium ${hasTornadoRisk ? "text-slate-300" : "text-slate-600"}`}
					>
						<span>Tornadoes</span>
						<input
							type="radio"
							name="danger-sub"
							checked={dangerSubMode === "tornado"}
							onChange={() => setDangerSubMode("tornado")}
							disabled={!hasTornadoRisk}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20 disabled:cursor-not-allowed"
						/>
					</label>
					<label
						className={`flex items-center justify-between gap-3 text-[11px] font-medium ${hasTidalRisk ? "text-slate-300" : "text-slate-600"}`}
					>
						<span>Tidal Range</span>
						<input
							type="radio"
							name="danger-sub"
							checked={dangerSubMode === "tidal"}
							onChange={() => setDangerSubMode("tidal")}
							disabled={!hasTidalRisk}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20 disabled:cursor-not-allowed"
						/>
					</label>
				</div>
			)}
		</div>
	)
}
