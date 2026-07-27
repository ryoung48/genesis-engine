import type {
	ReadTimelineParams,
	WriteTimelineParams,
} from "@/model/history/timeline/types"

function read<T>({ timeline, defaultValue, time }: ReadTimelineParams<T>): T {
	for (let i = timeline.length - 1; i >= 0; i--) {
		const entry = timeline[i]
		if (entry.time <= time) return entry.value
	}
	return defaultValue
}

function write<T>({ timeline, time, value }: WriteTimelineParams<T>): void {
	const last = timeline[timeline.length - 1]
	if (last && Object.is(last.value, value)) return

	if (last && last.time === time) {
		last.value = value
		const prior = timeline[timeline.length - 2]
		if (prior && Object.is(prior.value, value)) {
			timeline.pop()
		}
		return
	}

	timeline.push({ time, value })
}

export const TIMELINE = {
	read,
	write,
}
