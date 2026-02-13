import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { START_DATE, TIME } from "@/model/utilities/time"

interface CalendarWidgetProps {
	displayTime: number
	currentTime: number
	onSelectDate: (time: number) => void
	onAdjustDate: (unit: "year" | "month" | "day", delta: number) => void
	onClose: () => void
	anchorRect: DOMRect | null
}

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
	displayTime,
	currentTime,
	onSelectDate,
	onAdjustDate,
	onClose,
	anchorRect,
}) => {
	const displayDate = new Date(displayTime)
	const [viewYear, setViewYear] = useState(displayDate.getFullYear())
	const [viewMonth, setViewMonth] = useState(displayDate.getMonth())
	const calendarRef = useRef<HTMLDivElement>(null)

	// Close on click outside - delay registration to prevent immediate close
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				calendarRef.current &&
				!calendarRef.current.contains(e.target as Node)
			) {
				onClose()
			}
		}
		// Delay adding the listener to ensure opening click is fully processed
		const timeout = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside)
		}, 100)
		return () => {
			clearTimeout(timeout)
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [onClose])

	const monthNames = TIME.month.names
	const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
	const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()

	const days: (number | null)[] = []
	// Add empty cells for days before the first day of month
	for (let i = 0; i < firstDayOfWeek; i++) {
		days.push(null)
	}
	// Add the days of the month
	for (let d = 1; d <= daysInMonth; d++) {
		days.push(d)
	}

	const handleDayClick = (day: number) => {
		// Create date using simulation epoch, not raw JavaScript Date
		const baseTime = TIME.date.fromYear(viewYear)
		const date = new Date(baseTime)
		date.setMonth(viewMonth)
		date.setDate(day)
		onSelectDate(date.getTime())
	}

	const currentDate = new Date(currentTime)
	const selectedDate = new Date(displayTime)

	// Calculate position centered above the anchor button
	const calendarStyle: React.CSSProperties = anchorRect
		? {
				bottom: `${window.innerHeight - anchorRect.top + 20}px`,
				left: `${anchorRect.left + anchorRect.width / 2}px`,
				transform: "translateX(-50%)",
			}
		: {
				bottom: "80px",
				left: "50%",
				transform: "translateX(-50%)",
			}

	return (
		<>
			{/* Backdrop to capture clicks outside - rendered at body level via portal */}
			{createPortal(
				<div className="fixed inset-0 z-[9998]" onClick={onClose} />,
				document.body,
			)}
			{createPortal(
				<div
					ref={calendarRef}
					className="fixed bg-white border border-slate-200 shadow-sm p-3 z-[9999] min-w-[280px]"
					style={calendarStyle}
				>
					{/* Header with month/year navigation */}
					<div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
						<button
							onClick={() => {
								if (viewMonth === 0) {
									setViewMonth(11)
									setViewYear(viewYear - 1)
								} else {
									setViewMonth(viewMonth - 1)
								}
							}}
							className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors font-mono font-bold"
						>
							◀
						</button>
						<div className="flex items-center gap-2">
							<select
								value={viewMonth}
								onChange={(e) => setViewMonth(parseInt(e.target.value))}
								className="font-mono text-sm font-bold text-slate-900 bg-transparent border-none cursor-pointer focus:outline-none"
							>
								{monthNames.map((name, i) => (
									<option key={i} value={i}>
										{name}
									</option>
								))}
							</select>
							<input
								type="number"
								value={viewYear}
								onChange={(e) => setViewYear(parseInt(e.target.value) || 0)}
								className="w-16 font-mono text-sm font-bold text-slate-900 bg-transparent border border-slate-200 px-1 text-center focus:outline-none focus:border-slate-900"
							/>
						</div>
						<button
							onClick={() => {
								if (viewMonth === 11) {
									setViewMonth(0)
									setViewYear(viewYear + 1)
								} else {
									setViewMonth(viewMonth + 1)
								}
							}}
							className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors font-mono font-bold"
						>
							▶
						</button>
					</div>

					{/* Days of week header */}
					<div className="grid grid-cols-7 gap-1 mb-1">
						{["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((d) => (
							<div
								key={d}
								className="font-mono text-[10px] font-bold text-slate-400 text-center py-1"
							>
								{d}
							</div>
						))}
					</div>

					{/* Days grid */}
					<div className="grid grid-cols-7 gap-1">
						{days.map((day, i) => {
							if (day === null) {
								return <div key={i} className="w-8 h-8" />
							}

							const startDate = new Date(START_DATE)
							// Compare using date components, not raw timestamps (simulation uses custom epoch)
							const isSelected =
								selectedDate.getFullYear() === viewYear &&
								selectedDate.getMonth() === viewMonth &&
								selectedDate.getDate() === day
							const isCurrent =
								currentDate.getFullYear() === viewYear &&
								currentDate.getMonth() === viewMonth &&
								currentDate.getDate() === day
							// Check if this day is after the current simulation date
							const isFuture =
								viewYear > currentDate.getFullYear() ||
								(viewYear === currentDate.getFullYear() &&
									viewMonth > currentDate.getMonth()) ||
								(viewYear === currentDate.getFullYear() &&
									viewMonth === currentDate.getMonth() &&
									day > currentDate.getDate())
							// Check if this day is before START_DATE
							const isPast =
								viewYear < startDate.getFullYear() ||
								(viewYear === startDate.getFullYear() &&
									viewMonth < startDate.getMonth()) ||
								(viewYear === startDate.getFullYear() &&
									viewMonth === startDate.getMonth() &&
									day < startDate.getDate())
							const isDisabled = isFuture || isPast

							return (
								<button
									key={i}
									onClick={() => !isDisabled && handleDayClick(day)}
									disabled={isDisabled}
									className={`w-8 h-8 flex items-center justify-center font-mono text-xs font-bold transition-colors cursor-pointer ${
										isSelected
											? "bg-slate-900 text-white"
											: isCurrent
												? "bg-slate-100 text-slate-900 ring-1 ring-slate-900"
												: isDisabled
													? "text-slate-200 cursor-not-allowed"
													: "hover:bg-slate-100 text-slate-700"
									}`}
								>
									{day}
								</button>
							)
						})}
					</div>

					{/* Quick actions */}
					<div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200">
						<button
							onClick={() => onSelectDate(START_DATE)}
							className="flex-1 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
						>
							START
						</button>
						<button
							onClick={() => onSelectDate(currentTime)}
							className="flex-1 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-black cursor-pointer transition-colors"
						>
							LIVE
						</button>
					</div>

					{/* Quick navigation and adjust buttons */}
					<div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-200">
						<div className="flex items-center gap-1">
							<button
								onClick={() => {
									setViewYear(viewYear - 1)
									onAdjustDate("year", -1)
								}}
								className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono font-bold text-xs cursor-pointer"
							>
								−
							</button>
							<span className="font-mono text-[10px] font-bold text-slate-400 w-4 text-center">
								Y
							</span>
							<button
								onClick={() => {
									setViewYear(viewYear + 1)
									onAdjustDate("year", 1)
								}}
								className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono font-bold text-xs cursor-pointer"
							>
								+
							</button>
						</div>
						<div className="flex items-center gap-1">
							<button
								onClick={() => {
									if (viewMonth === 0) {
										setViewMonth(11)
										setViewYear(viewYear - 1)
									} else {
										setViewMonth(viewMonth - 1)
									}
									onAdjustDate("month", -1)
								}}
								className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono font-bold text-xs cursor-pointer"
							>
								−
							</button>
							<span className="font-mono text-[10px] font-bold text-slate-400 w-4 text-center">
								M
							</span>
							<button
								onClick={() => {
									if (viewMonth === 11) {
										setViewMonth(0)
										setViewYear(viewYear + 1)
									} else {
										setViewMonth(viewMonth + 1)
									}
									onAdjustDate("month", 1)
								}}
								className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono font-bold text-xs cursor-pointer"
							>
								+
							</button>
						</div>
						<div className="flex items-center gap-1">
							<button
								onClick={() => {
									// Adjust date and sync calendar view
									const newDate = new Date(displayTime)
									newDate.setDate(newDate.getDate() - 1)
									setViewYear(newDate.getFullYear())
									setViewMonth(newDate.getMonth())
									onAdjustDate("day", -1)
								}}
								className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono font-bold text-xs cursor-pointer"
							>
								−
							</button>
							<span className="font-mono text-[10px] font-bold text-slate-400 w-4 text-center">
								D
							</span>
							<button
								onClick={() => {
									// Adjust date and sync calendar view
									const newDate = new Date(displayTime)
									newDate.setDate(newDate.getDate() + 1)
									setViewYear(newDate.getFullYear())
									setViewMonth(newDate.getMonth())
									onAdjustDate("day", 1)
								}}
								className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono font-bold text-xs cursor-pointer"
							>
								+
							</button>
						</div>
					</div>
				</div>,
				document.body,
			)}
		</>
	)
}
