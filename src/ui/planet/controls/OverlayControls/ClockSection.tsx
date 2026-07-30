import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import {
	CLOCK_DIAL_HOURS,
	clampClockDialHour,
	formatClockTimeDisplay,
	scaleClockDialHourToDayLength,
} from "@/ui/planet/clock"

const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
]

export interface ClockSectionProps {
	clockExpanded: boolean
	setClockExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	clockCurrent: boolean
	setClockCurrent: (v: boolean) => void
	clockMonthMode: "annual" | "monthly"
	setClockMonthMode: (v: "annual" | "monthly") => void
	clockMonth: number
	setClockMonth: (v: number) => void
	clockDay: number
	setClockDay: (v: number) => void
	clockHour: number
	setClockHour: (v: number) => void
	clockUseMeridiem: boolean
	setClockUseMeridiem: (v: boolean) => void
	hoursPerDay: number
	tidallyLocked: boolean
	daysPerYear: number
	showDaylight?: boolean
	setShowDaylight?: (v: boolean) => void
}

export const ClockSection: React.FC<ClockSectionProps> = ({
	clockExpanded,
	setClockExpanded,
	clockCurrent,
	setClockCurrent,
	clockMonthMode,
	setClockMonthMode,
	clockMonth,
	setClockMonth,
	clockDay,
	setClockDay,
	clockHour,
	setClockHour,
	clockUseMeridiem,
	setClockUseMeridiem,
	hoursPerDay,
	tidallyLocked,
	daysPerYear,
	showDaylight = false,
	setShowDaylight,
}) => {
	const clampedClockHour = clampClockDialHour(clockHour)
	const scaledClockHour = scaleClockDialHourToDayLength(clockHour, hoursPerDay)
	const daysPerMonth = Math.max(1, Math.round(daysPerYear / 12))
	const clampedClockDay = Math.max(0, Math.min(clockDay, daysPerMonth - 1))
	return (
		<div>
			<button
				type="button"
				onClick={() => setClockExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Clock</span>
				<ChevronIcon
					direction={clockExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{clockExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<div className="flex items-center gap-4 text-[11px] font-medium">
						<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
							<input
								type="radio"
								name="clock-mode"
								checked={clockCurrent}
								onChange={() => setClockCurrent(true)}
								className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
							Current
						</label>
						<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
							<input
								type="radio"
								name="clock-mode"
								checked={!clockCurrent && clockMonthMode === "annual"}
								onChange={() => {
									setClockCurrent(false)
									setClockMonthMode("annual")
								}}
								className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
							Annual
						</label>
						<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
							<input
								type="radio"
								name="clock-mode"
								checked={!clockCurrent && clockMonthMode === "monthly"}
								onChange={() => {
									setClockCurrent(false)
									setClockMonthMode("monthly")
								}}
								className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
							Monthly
						</label>
					</div>
					<div className="border-t border-white/10" />
					<div
						className={
							clockCurrent || clockMonthMode === "annual"
								? "space-y-1.5 opacity-50 pointer-events-none"
								: "space-y-1.5"
						}
					>
						<div className="flex items-center justify-between">
							<label className="text-[11px] font-medium text-slate-300">
								Month
							</label>
							<span className="font-mono text-[11px] text-slate-400">
								{MONTH_LABELS[clockMonth] ?? clockMonth + 1}
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={11}
							step={1}
							value={clockMonth}
							onChange={(e) => setClockMonth(Number(e.target.value))}
							disabled={clockCurrent || clockMonthMode === "annual"}
							className="w-full accent-slate-100 disabled:cursor-not-allowed"
						/>
						<div className="flex items-center justify-between">
							<label className="text-[11px] font-medium text-slate-300">
								Day
							</label>
							<span className="font-mono text-[11px] text-slate-400">
								#{clampedClockDay + 1}
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={daysPerMonth - 1}
							step={1}
							value={clampedClockDay}
							onChange={(e) => setClockDay(Number(e.target.value))}
							disabled={clockCurrent || clockMonthMode === "annual"}
							className="w-full accent-slate-100 disabled:cursor-not-allowed"
						/>
					</div>
					{!tidallyLocked && (
						<div className="space-y-1">
							<div className="flex items-center justify-between">
								<label className="text-[11px] font-medium text-slate-300">
									Hour
								</label>
								<span className="font-mono text-[11px] text-slate-400">
									{formatClockTimeDisplay(
										scaledClockHour,
										hoursPerDay,
										clockUseMeridiem,
									)}
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={CLOCK_DIAL_HOURS}
								step={0.5}
								value={clampedClockHour}
								onChange={(e) => setClockHour(Number(e.target.value))}
								className="m-0 block w-full accent-slate-100"
							/>
							<label className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
								<span>AM / PM</span>
								<input
									type="checkbox"
									checked={clockUseMeridiem}
									onChange={(e) => setClockUseMeridiem(e.target.checked)}
									className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
							</label>
						</div>
					)}
					{setShowDaylight && (
						<label className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
							<span>Daylight</span>
							<input
								type="checkbox"
								checked={showDaylight}
								onChange={(e) => setShowDaylight(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
					)}
				</div>
			)}
		</div>
	)
}
