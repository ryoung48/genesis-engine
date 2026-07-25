type TimelineEntry<T> = { time: number; value: T }
export type Timeline<T> = TimelineEntry<T>[]

export function read<T>(
	timeline: Timeline<T>,
	defaultValue: T,
	time = Number.POSITIVE_INFINITY,
): T {
	for (let i = timeline.length - 1; i >= 0; i--) {
		const entry = timeline[i]
		if (entry.time <= time) return entry.value
	}
	return defaultValue
}

export function write<T>(timeline: Timeline<T>, time: number, value: T): void {
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
