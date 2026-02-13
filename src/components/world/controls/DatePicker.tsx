import React, { useRef, useState } from "react"
import { START_DATE, TIME } from "@/model/utilities/time"
import { DRAW_BORDERS } from "../coloration"
import { CalendarWidget } from "./CalendarWidget"

interface DatePickerProps {
	selectedTime: number | undefined
	setSelectedTime: (time: number | undefined) => void
	currentTime: number
	setIsPlaying: (playing: boolean) => void
}

export const DatePicker: React.FC<DatePickerProps> = ({
	selectedTime,
	setSelectedTime,
	currentTime,
	setIsPlaying,
}) => {
	const [calendarOpen, setCalendarOpen] = useState(false)
	const calendarButtonRef = useRef<HTMLButtonElement>(null)

	const displayTime = selectedTime ?? currentTime
	const isLiveMode = selectedTime === undefined

	const adjustDate = (unit: "year" | "month" | "day", delta: number) => {
		const date = new Date(displayTime)
		if (unit === "year") date.setFullYear(date.getFullYear() + delta)
		else if (unit === "month") date.setMonth(date.getMonth() + delta)
		else if (unit === "day") date.setDate(date.getDate() + delta)

		const newTime = date.getTime()
		const epochTime = START_DATE
		// Clamp to valid range [epochTime, currentTime]
		if (newTime >= currentTime) {
			setSelectedTime(undefined) // Go to live mode
		} else if (newTime < epochTime) {
			setSelectedTime(epochTime)
			setIsPlaying(false)
		} else {
			setSelectedTime(newTime)
			setIsPlaying(false)
		}
		DRAW_BORDERS.clearNationCache()
	}

	const handleCalendarSelect = (time: number) => {
		if (time >= currentTime) {
			setSelectedTime(undefined)
		} else if (time < START_DATE) {
			setSelectedTime(START_DATE)
			setIsPlaying(false)
		} else {
			setSelectedTime(time)
			setIsPlaying(false)
		}
		DRAW_BORDERS.clearNationCache()
		setCalendarOpen(false)
	}

	return (
		<div
			className="relative flex items-center gap-2 px-2 py-1 bg-white border border-slate-200"
			style={{ overflow: "visible" }}
		>
			<button
				ref={calendarButtonRef}
				onClick={() => setCalendarOpen(!calendarOpen)}
				className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 transition-colors cursor-pointer"
			>
				<span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
					DATE
				</span>
				<span className="font-mono text-[10px] font-bold text-slate-900">
					{TIME.date.format(displayTime)}
				</span>
				{isLiveMode && (
					<span className="font-mono text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5">
						LIVE
					</span>
				)}
			</button>

			{/* Calendar popup */}
			{calendarOpen && (
				<CalendarWidget
					displayTime={displayTime}
					currentTime={currentTime}
					onSelectDate={handleCalendarSelect}
					onAdjustDate={(unit, delta) => {
						adjustDate(unit, delta)
					}}
					onClose={() => setCalendarOpen(false)}
					anchorRect={
						calendarButtonRef.current?.getBoundingClientRect() ?? null
					}
				/>
			)}
		</div>
	)
}
