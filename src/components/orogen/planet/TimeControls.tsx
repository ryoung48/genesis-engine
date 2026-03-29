import React from "react"
import { monthLabels } from "./constants"

interface TimeControlsProps {
	timeExpanded: boolean
	setTimeExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	globalMonth: number
	setGlobalMonth: (v: number) => void
	timeOfDay: number
	setTimeOfDay: (v: number) => void
	tidallyLocked: boolean
	hoursPerDay: number
}

export const TimeControls: React.FC<TimeControlsProps> = ({
	timeExpanded, setTimeExpanded,
	globalMonth, setGlobalMonth,
	timeOfDay, setTimeOfDay,
	tidallyLocked, hoursPerDay,
}) => (
	<div className="absolute bottom-3 right-3 z-20 pointer-events-none">
		<div className="pointer-events-auto flex flex-col items-end gap-2">
			{timeExpanded && (
				<div className="w-64 rounded-2xl border border-white/10 bg-slate-950/85 p-3 text-white shadow-2xl backdrop-blur-md">
					<div className="mb-3 flex items-center justify-between gap-3">
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
							Time
						</span>
						<button
							onClick={() => setTimeExpanded(false)}
							className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 transition hover:bg-white/10 hover:text-white"
						>
							Close
						</button>
					</div>
					<div className="space-y-3">
						<div>
							<div className="mb-1 flex justify-between items-baseline">
								<span className="text-[11px] font-medium text-slate-300">Month</span>
								<span className="font-mono text-[11px] text-slate-400">{monthLabels[globalMonth]}</span>
							</div>
							<input
								type="range"
								min={1}
								max={12}
								step={1}
								value={globalMonth}
								onChange={(e) => setGlobalMonth(Number(e.target.value))}
								className="w-full accent-slate-100"
							/>
						</div>
						<div className={tidallyLocked ? "opacity-50" : ""}>
							<div className="mb-1 flex justify-between items-baseline">
								<span className="text-[11px] font-medium text-slate-300">Time of Day</span>
								<span className="font-mono text-[11px] text-slate-400">{tidallyLocked ? "Locked" : `${Math.floor(timeOfDay)}:${String(Math.floor((timeOfDay % 1) * 60)).padStart(2, "0")}`}</span>
							</div>
							<input
								type="range"
								min={0}
								max={hoursPerDay}
								step={0.25}
								value={tidallyLocked ? hoursPerDay / 2 : timeOfDay}
								onChange={(e) => setTimeOfDay(Number(e.target.value))}
								disabled={tidallyLocked}
								className="w-full accent-slate-100 disabled:cursor-not-allowed"
							/>
						</div>
					</div>
				</div>
			)}
			<button
				onClick={() => setTimeExpanded((value) => !value)}
				title={timeExpanded ? "Hide time controls" : "Show time controls"}
				className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] shadow-lg transition-all ${
					timeExpanded
						? "border-white/20 bg-white/15 text-white"
						: "border-white/10 bg-slate-950/80 text-slate-200 hover:bg-slate-950/95"
				} backdrop-blur-md`}
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<circle cx="8" cy="8" r="5.5" />
					<path d="M8 4.75V8l2.25 1.5" />
				</svg>
				<span>Time</span>
			</button>
		</div>
	</div>
)
