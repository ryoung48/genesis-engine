import { EARTH_HISTORY_START_YEAR } from "../earth"
import { YEAR_MS } from "./state"

/** Converts the procedural sim's historyTime/frame.timeMs (ms, where
 * ms / YEAR_MS is the absolute calendar year) onto the same EU4-days axis
 * SimulationControls/WikiTimeline use for Earth-import worlds (see
 * src/model/earth/history/date.ts's eu4DateToDays/eu4DaysToYear convention:
 * day 0 = year EARTH_HISTORY_START_YEAR, 365-day years). */
export function historyMsToEu4Days(ms: number): number {
	return (ms / YEAR_MS - EARTH_HISTORY_START_YEAR) * 365
}
