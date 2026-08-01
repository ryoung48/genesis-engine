import { DATE } from "@/model/history/earth/date"
import { STATE } from "@/model/history/generated/state"

function historyMsToDays(ms: number): number {
	return (ms / STATE.yearMs - DATE.earthHistoryStartYear) * 365
}

export const HISTORY_DAYS = {
	historyMsToDays,
}
