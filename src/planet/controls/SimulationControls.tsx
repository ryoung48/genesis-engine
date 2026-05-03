import React from "react"
import { Button, cx, FloatingPanel, IconButton } from "@/components"
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

export const SimulationControls: React.FC<SimulationControlsProps> = ({
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
	const isViewingLatest = selectedTimeMs === currentTimeMs
	const wrapperClassName = floating
		? "absolute bottom-3 left-1/2 z-20 -translate-x-1/2 pointer-events-none"
		: "pointer-events-none"
	const { year, month, day } = historyTimeParts(selectedTimeMs)
	const currentYear = historyTimeParts(currentTimeMs).year
	const timelineLabel = `Y${year} ${monthLabels[month] ?? `M${month}`} ${day}`
	const playLabel = playing
		? "Pause simulation"
		: isViewingLatest
			? "Start simulation"
			: "Resume live simulation"
	const playTitle = playing
		? "Pause simulation"
		: isViewingLatest
			? "Start simulation"
			: "Resume simulation from the latest year"

	const handlePlayToggle = () => {
		if (playing) {
			onPause()
			return
		}
		if (!isViewingLatest) onTimeChange(currentTimeMs)
		onPlay()
	}

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
			<div className="pointer-events-auto flex flex-col items-center gap-2">
				{hasHistory && (
					<FloatingPanel
						className="flex min-w-[18rem] flex-col gap-1.5 px-2.5 py-2 sm:min-w-[22rem]"
						padding="none"
					>
						<div className="flex items-center justify-between gap-1.5">
							<div className="min-w-0 font-mono text-[11px] text-slate-100">
								{timelineLabel}
							</div>
							<div className="flex shrink-0 items-center gap-1.5">
								<Button
									onClick={() => onTimeChange(currentTimeMs)}
									disabled={isViewingLatest}
									tone="overlay"
									shape="pill"
									size="sm"
									title="Go to the latest year"
									className={cx(
										"px-1.5 py-1 font-mono text-[9px] shadow-none",
										isViewingLatest
											? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
											: "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15",
									)}
								>
									Latest Y{currentYear}
								</Button>
								<IconButton
									onClick={handlePlayToggle}
									disabled={!canSimulate && !playing}
									title={playLabel}
									selected={playing}
									shape="rounded"
									size="sm"
									className={cx(
										"h-7 w-7 border-white/0 bg-white/5 text-slate-100 shadow-none hover:bg-white/10",
										playing &&
											"border-amber-500/30 bg-amber-500/15 text-amber-200",
										!playing &&
											!isViewingLatest &&
											"border-sky-400/30 bg-sky-400/15 text-sky-100",
									)}
								>
									{playing ? (
										<svg
											width="10"
											height="10"
											viewBox="0 0 12 12"
											fill="currentColor"
										>
											<rect x="2" y="1" width="3" height="10" rx="0.5" />
											<rect x="7" y="1" width="3" height="10" rx="0.5" />
										</svg>
									) : (
										<svg
											width="10"
											height="10"
											viewBox="0 0 12 12"
											fill="currentColor"
										>
											<path d="M2.5 1L10.5 6L2.5 11V1Z" />
										</svg>
									)}
								</IconButton>
							</div>
						</div>

						<div className="flex items-center gap-1.5">
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

							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<input
									type="range"
									min={minTimeMs}
									max={maxTimeMs}
									step={TIMELINE_STEP_MS}
									value={selectedTimeMs}
									onChange={(e) => onTimeChange(Number(e.target.value))}
									className="w-full accent-slate-100"
									aria-label="Simulation year"
								/>
							</div>

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
						</div>
					</FloatingPanel>
				)}

				{!hasHistory && (
					<Button
						onClick={handlePlayToggle}
						disabled={!canSimulate && !playing}
						title={playTitle}
						tone="overlay"
						selected={playing}
						shape="rounded"
						size="sm"
						className="h-7 w-7 border-white/0 bg-white/5 px-0 py-0 shadow-lg backdrop-blur-md hover:bg-white/10"
					>
						{playing ? (
							<svg
								width="10"
								height="10"
								viewBox="0 0 12 12"
								fill="currentColor"
							>
								<rect x="2" y="1" width="3" height="10" rx="0.5" />
								<rect x="7" y="1" width="3" height="10" rx="0.5" />
							</svg>
						) : (
							<svg
								width="10"
								height="10"
								viewBox="0 0 12 12"
								fill="currentColor"
							>
								<path d="M2.5 1L10.5 6L2.5 11V1Z" />
							</svg>
						)}
					</Button>
				)}
			</div>
		</div>
	)
}
