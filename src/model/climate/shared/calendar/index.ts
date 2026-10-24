import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import type { CalendarParams } from "@/model/climate/shared/calendar/types"

// A month's length counted in Earth days: daily rates fitted on Earth (PET in mm/day, degree-days) are per Earth day,
// whatever the planet's own day. Earth's day is the main world's own hoursPerDay, so Earth keeps daysPerYear / 12.
function earthDaysPerMonth({
	daysPerYear,
	hoursPerDay,
}: CalendarParams): number {
	return (
		(daysPerYear / 12) *
		(hoursPerDay / SOL_SYSTEM.solMainWorldDefaults.hoursPerDay)
	)
}

export const CALENDAR = { earthDaysPerMonth }
