import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { LabeledSlider } from "@/ui/components/primitives/LabeledSlider"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import {
	CLOCK_DIAL_HOURS,
	clampClockDialHour,
	formatClockTimeDisplay,
	scaleClockDialHourToDayLength,
} from "@/ui/genesis/shared/clock"

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
	const clockModeValue: "current" | "annual" | "monthly" = clockCurrent
		? "current"
		: clockMonthMode === "monthly"
			? "monthly"
			: "annual"
	return (
		<div>
			<CollapsibleSectionHeader
				title="Clock"
				expanded={clockExpanded}
				onToggle={() => setClockExpanded((v) => !v)}
			/>
			{clockExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<SegmentedControl
						options={[
							{ value: "current" as const, label: "Current" },
							{ value: "annual" as const, label: "Annual" },
							{ value: "monthly" as const, label: "Monthly" },
						]}
						value={clockModeValue}
						onChange={(v) => {
							if (v === "current") {
								setClockCurrent(true)
								return
							}
							setClockCurrent(false)
							setClockMonthMode(v)
						}}
						tone="overlay"
					/>
					<div className="border-t border-white/10" />
					<div
						className={
							clockCurrent || clockMonthMode === "annual"
								? "space-y-1.5 opacity-50 pointer-events-none"
								: "space-y-1.5"
						}
					>
						<LabeledSlider
							label="Month"
							value={MONTH_LABELS[clockMonth] ?? clockMonth + 1}
							min={0}
							max={11}
							step={1}
							numericValue={clockMonth}
							onChange={setClockMonth}
							disabled={clockCurrent || clockMonthMode === "annual"}
						/>
						<LabeledSlider
							label="Day"
							value={`#${clampedClockDay + 1}`}
							min={0}
							max={daysPerMonth - 1}
							step={1}
							numericValue={clampedClockDay}
							onChange={setClockDay}
							disabled={clockCurrent || clockMonthMode === "annual"}
						/>
					</div>
					{!tidallyLocked && (
						<div className="space-y-1">
							<LabeledSlider
								label="Hour"
								value={formatClockTimeDisplay(
									scaledClockHour,
									hoursPerDay,
									clockUseMeridiem,
								)}
								min={0}
								max={CLOCK_DIAL_HOURS}
								step={0.5}
								numericValue={clampedClockHour}
								onChange={setClockHour}
								sliderClassName="m-0 block"
							/>
							<ToggleRow
								label="AM / PM"
								checked={clockUseMeridiem}
								onChange={setClockUseMeridiem}
								className="mt-1.5"
							/>
						</div>
					)}
					{setShowDaylight && (
						<ToggleRow
							label="Daylight"
							checked={showDaylight}
							onChange={setShowDaylight}
							className="mt-1.5"
						/>
					)}
				</div>
			)}
		</div>
	)
}
