import { DATE } from "@/model/history/earth/date"
import { STATE } from "@/model/history/generated/state"

function historyMsToEu4Days(ms: number): number {
	return (ms / STATE.yearMs - DATE.earthHistoryStartYear) * 365
}

export const EU4_DAYS = {
	historyMsToEu4Days,
}
