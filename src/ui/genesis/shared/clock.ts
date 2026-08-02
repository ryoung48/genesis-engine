export const CLOCK_DIAL_HOURS = 24

export function clampClockDialHour(clockHour: number): number {
	return Math.max(0, Math.min(clockHour, CLOCK_DIAL_HOURS))
}

function wrapClockHourToDayLength(
	clockHour: number,
	hoursPerDay: number,
): number {
	const safeHoursPerDay = Math.max(hoursPerDay, 0.001)
	return ((clockHour % safeHoursPerDay) + safeHoursPerDay) % safeHoursPerDay
}

export function scaleClockDialHourToDayLength(
	clockHour: number,
	hoursPerDay: number,
): number {
	return (
		(clampClockDialHour(clockHour) / CLOCK_DIAL_HOURS) *
		Math.max(hoursPerDay, 0)
	)
}

export function formatClockTimeDisplay(
	clockHour: number,
	hoursPerDay: number,
	useMeridiem: boolean,
): string {
	const wrappedClockHour = wrapClockHourToDayLength(clockHour, hoursPerDay)
	const totalMinutes = Math.round(wrappedClockHour * 60)
	if (!useMeridiem) {
		const hours = Math.floor(totalMinutes / 60)
		const minutes = totalMinutes % 60
		return `${hours}:${String(minutes).padStart(2, "0")}`
	}

	const halfDayMinutes = Math.max(Math.round((hoursPerDay * 60) / 2), 1)
	const meridiem = totalMinutes < halfDayMinutes ? "AM" : "PM"
	const wrappedHalfDayMinutes = totalMinutes % halfDayMinutes
	const displayMinutes =
		wrappedHalfDayMinutes === 0 ? halfDayMinutes : wrappedHalfDayMinutes
	const hours = Math.floor(displayMinutes / 60)
	const minutes = displayMinutes % 60
	return `${hours}:${String(minutes).padStart(2, "0")} ${meridiem}`
}
