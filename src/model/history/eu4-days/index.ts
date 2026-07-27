import { DATE } from "@/model/earth/history/date"
import { STATE } from "@/model/history/state"

function historyMsToEu4Days(ms: number): number {
	return (ms / STATE.yearMs - DATE.earthHistoryStartYear) * 365
}

export const EU4_DAYS = {
	historyMsToEu4Days,
}
