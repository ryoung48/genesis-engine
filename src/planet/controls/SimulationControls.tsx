import React from "react"
import { FloatingPanel, IconButton } from "@/components"
import { MONTH_MS } from "@/model/history/state"
import { historyTimeParts } from "../screen/history/history-time"
import { monthLabels } from "../screen/shared/constants"

const TIMELINE_STEP_MS = MONTH_MS

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
	onPlayPause?: () => void
	simPlaying?: boolean
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
	selectedTimeMs,
	minTimeMs,
	maxTimeMs,
	onTimeChange,
	floating = true,
	onPlayPause,
	simPlaying = false,
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
						title="Previous month"
						aria-label="Previous month"
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
						aria-label="Simulation month"
					/>
					<IconButton
						onClick={handleStepForward}
						disabled={selectedTimeMs >= maxTimeMs}
						size="sm"
						shape="rounded"
						className="h-7 w-7 shrink-0 border-white/0 bg-white/5 text-slate-100 shadow-none hover:bg-white/10"
						title="Next month"
						aria-label="Next month"
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
					{onPlayPause !== undefined && (
						<>
							<div className="h-4 w-px shrink-0 bg-white/15" />
							<IconButton
								onClick={onPlayPause}
								size="sm"
								shape="rounded"
								className="h-7 w-7 shrink-0 border-white/0 bg-white/5 text-slate-100 shadow-none hover:bg-white/10"
								title={simPlaying ? "Pause simulation" : "Start simulation"}
								aria-label={
									simPlaying ? "Pause simulation" : "Start simulation"
								}
								selected={simPlaying}
							>
								{simPlaying ? (
									<svg
										width="12"
										height="12"
										viewBox="0 0 12 12"
										fill="currentColor"
										aria-hidden="true"
									>
										<rect x="2" y="1" width="3" height="10" rx="0.5" />
										<rect x="7" y="1" width="3" height="10" rx="0.5" />
									</svg>
								) : (
									<svg
										width="12"
										height="12"
										viewBox="0 0 12 12"
										fill="currentColor"
										aria-hidden="true"
									>
										<path d="M2.5 1L10.5 6L2.5 11V1Z" />
									</svg>
								)}
							</IconButton>
						</>
					)}
				</FloatingPanel>
			</div>
		</div>
	)
}
