import React from "react"
import { FloatingPanel, IconButton } from "@/components"
import { YEAR_MS } from "@/model/history/state"
import { historyTimeParts } from "../screen/history/history-time"
import { monthLabels } from "../screen/shared/constants"

const TIMELINE_STEP_MS = YEAR_MS

function clampTimelineTime(
	timeMs: number,
	minTimeMs: number,
	maxTimeMs: number,
) {
	return Math.min(maxTimeMs, Math.max(minTimeMs, timeMs))
}

interface SimulationControlsProps {
	selectedTimeMs: number
	minTimeMs: number
	maxTimeMs: number
	onTimeChange: (timeMs: number) => void
	floating?: boolean
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
	selectedTimeMs,
	minTimeMs,
	maxTimeMs,
	onTimeChange,
	floating = true,
}) => {
	const wrapperClassName = floating
		? "absolute bottom-3 left-1/2 z-20 -translate-x-1/2 pointer-events-none"
		: "pointer-events-none"
	const { year, month, day } = historyTimeParts(selectedTimeMs)
	const timelineLabel = `Y${year} ${monthLabels[month] ?? `M${month}`} ${day}`

	const handleStepBackward = () =>
		onTimeChange(
			clampTimelineTime(
				selectedTimeMs - TIMELINE_STEP_MS,
				minTimeMs,
				maxTimeMs,
			),
		)

	const handleStepForward = () =>
		onTimeChange(
			clampTimelineTime(
				selectedTimeMs + TIMELINE_STEP_MS,
				minTimeMs,
				maxTimeMs,
			),
		)

	return (
		<div className={wrapperClassName}>
			<div className="pointer-events-auto">
				<FloatingPanel
					className="flex min-w-[18rem] items-center gap-1.5 px-2.5 py-1.5 sm:min-w-[22rem]"
					padding="none"
				>
					<IconButton
						onClick={handleStepBackward}
						disabled={selectedTimeMs <= minTimeMs}
						size="sm"
						shape="rounded"
						className="h-7 w-7 shrink-0 border-white/0 bg-white/5 text-slate-100 shadow-none hover:bg-white/10"
						title="Previous year"
						aria-label="Previous year"
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
					</IconButton>
					<div className="min-w-[5.5rem] shrink-0 font-mono text-[11px] text-slate-100">
						{timelineLabel}
					</div>
					<input
						type="range"
						min={minTimeMs}
						max={maxTimeMs}
						step={TIMELINE_STEP_MS}
						value={selectedTimeMs}
						onChange={(e) => onTimeChange(Number(e.target.value))}
						className="min-w-0 flex-1 accent-slate-100"
						aria-label="Simulation year"
					/>
					<IconButton
						onClick={handleStepForward}
						disabled={selectedTimeMs >= maxTimeMs}
						size="sm"
						shape="rounded"
						className="h-7 w-7 shrink-0 border-white/0 bg-white/5 text-slate-100 shadow-none hover:bg-white/10"
						title="Next year"
						aria-label="Next year"
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
					</IconButton>
				</FloatingPanel>
			</div>
		</div>
	)
}
