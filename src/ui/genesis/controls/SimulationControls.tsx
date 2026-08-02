import React from "react"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { historyTimeParts } from "@/ui/genesis/generation/history-time"
import { monthLabels } from "@/ui/genesis/shared/constants"

/** One 30-day month on the history time axis. */
const TIMELINE_STEP_MS = 30 * 24 * 60 * 60 * 1000

function clampTimelineTime(
	timeMs: number,
	minTimeMs: number,
	maxTimeMs: number,
) {
	return Math.min(maxTimeMs, Math.max(minTimeMs, timeMs))
}

function formatTimelineYear(year: number): string {
	if (year <= 0) return `${1 - year} BC`
	return `Y${year}`
}

interface SimulationControlsProps {
	selectedTimeMs: number
	minTimeMs: number
	maxTimeMs: number
	onTimeChange: (timeMs: number) => void
	floating?: boolean
	onPlayPause?: () => void
	simPlaying?: boolean
	/** Overrides the default YEAR_MS-based month label and step (used for
	 * Earth-imported history, whose timeline runs in the earth-history
	 * engine's own day units rather than genesis.worker.ts's YEAR_MS ticks).
	 * See docs/earth-history-plan.md "Reuse the existing scrubber". */
	formatLabel?: (timeValue: number) => string
	stepValue?: number
	/** Extra content rendered after the play/pause button, e.g. the
	 * Earth-history bookmark popup trigger. */
	extraControls?: React.ReactNode
	playPauseLabels?: {
		play: string
		pause: string
	}
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
	selectedTimeMs,
	minTimeMs,
	maxTimeMs,
	onTimeChange,
	floating = true,
	onPlayPause,
	simPlaying = false,
	formatLabel,
	stepValue,
	extraControls,
	playPauseLabels,
}) => {
	const wrapperClassName = floating
		? "absolute bottom-3 left-1/2 z-20 -translate-x-1/2 pointer-events-none"
		: "pointer-events-none"
	const timelineLabel = formatLabel
		? formatLabel(selectedTimeMs)
		: (() => {
				const { year, month, day } = historyTimeParts(selectedTimeMs)
				return `${formatTimelineYear(year)} ${monthLabels[month] ?? `M${month}`} ${day}`
			})()
	const step = stepValue ?? TIMELINE_STEP_MS
	const resolvedPlayPauseLabels = playPauseLabels ?? {
		play: "Start simulation",
		pause: "Pause simulation",
	}

	const handleStepBackward = () =>
		onTimeChange(clampTimelineTime(selectedTimeMs - step, minTimeMs, maxTimeMs))

	const handleStepForward = () =>
		onTimeChange(clampTimelineTime(selectedTimeMs + step, minTimeMs, maxTimeMs))

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
						step={step}
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
								title={
									simPlaying
										? resolvedPlayPauseLabels.pause
										: resolvedPlayPauseLabels.play
								}
								aria-label={
									simPlaying
										? resolvedPlayPauseLabels.pause
										: resolvedPlayPauseLabels.play
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
					{extraControls}
				</FloatingPanel>
			</div>
		</div>
	)
}
