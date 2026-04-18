import React from "react"
import { YEAR_MS } from "@/model/orogen/history/state"
import { monthLabels } from "./constants"
import { historyTimeParts } from "./history-time"

export const TIMELINE_STEP_MS = YEAR_MS

interface SimControlsProps {
	canSimulate: boolean
	playing: boolean
	onPlay: () => void
	onPause: () => void
	selectedTimeMs: number
	currentTimeMs: number
	minTimeMs: number
	maxTimeMs: number
	onTimeChange: (timeMs: number) => void
	floating?: boolean
}

export const SimControls: React.FC<SimControlsProps> = ({
	canSimulate,
	playing,
	onPlay,
	onPause,
	selectedTimeMs,
	currentTimeMs,
	minTimeMs,
	maxTimeMs,
	onTimeChange,
	floating = true,
}) => {
	const hasHistory = playing || maxTimeMs > minTimeMs
	const wrapperClassName = floating
		? "absolute bottom-3 left-1/2 z-20 -translate-x-1/2 pointer-events-none"
		: "pointer-events-none"
	const { year, month, day } = historyTimeParts(selectedTimeMs)
	const currentYear = historyTimeParts(currentTimeMs).year
	const timelineLabel = `Y${year} ${monthLabels[month] ?? `M${month}`} ${day}`

	return (
		<div className={wrapperClassName}>
			<div className="pointer-events-auto flex flex-col items-center gap-2">
				{hasHistory && (
					<div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-2 text-white shadow-2xl backdrop-blur-md">
						{/* Step back */}
						<button
							onClick={() =>
								onTimeChange(
									Math.max(minTimeMs, selectedTimeMs - TIMELINE_STEP_MS),
								)
							}
							disabled={selectedTimeMs <= minTimeMs}
							className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
							title="Previous year"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M8 2L4 6L8 10" />
							</svg>
						</button>

						{/* Year slider */}
						<input
							type="range"
							min={minTimeMs}
							max={maxTimeMs}
							step={TIMELINE_STEP_MS}
							value={selectedTimeMs}
							onChange={(e) => onTimeChange(Number(e.target.value))}
							className="w-48 accent-slate-100"
						/>

						{/* Step forward */}
						<button
							onClick={() =>
								onTimeChange(
									Math.min(maxTimeMs, selectedTimeMs + TIMELINE_STEP_MS),
								)
							}
							disabled={selectedTimeMs >= maxTimeMs}
							className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
							title="Next year"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M4 2L8 6L4 10" />
							</svg>
						</button>

						{/* Year display */}
						<span className="min-w-24 text-center font-mono text-[11px] text-slate-300">
							{timelineLabel}
						</span>
						{currentTimeMs !== selectedTimeMs && (
							<span className="font-mono text-[9px] text-slate-500">
								Now Y{currentYear}
							</span>
						)}
					</div>
				)}

				{/* Play/Pause button */}
				<button
					onClick={playing ? onPause : onPlay}
					disabled={!canSimulate && !playing}
					title={playing ? "Pause simulation" : "Start simulation"}
					className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] shadow-lg transition-all ${
						playing
							? "border-amber-500/30 bg-amber-500/15 text-amber-200"
							: "border-white/10 bg-slate-950/80 text-slate-200 hover:bg-slate-950/95"
					} backdrop-blur-md disabled:opacity-30 disabled:cursor-not-allowed`}
				>
					{playing ? (
						<>
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="currentColor"
							>
								<rect x="2" y="1" width="3" height="10" rx="0.5" />
								<rect x="7" y="1" width="3" height="10" rx="0.5" />
							</svg>
							<span>Pause</span>
						</>
					) : (
						<>
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="currentColor"
							>
								<path d="M2.5 1L10.5 6L2.5 11V1Z" />
							</svg>
							<span>Simulate</span>
						</>
					)}
				</button>
			</div>
		</div>
	)
}
