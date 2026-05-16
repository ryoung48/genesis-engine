export function getNearestHistoryPointIndex(
	history: ReadonlyArray<{ timeMs: number }>,
	targetTimeMs: number,
): number {
	if (history.length === 0) return -1

	let low = 0
	let high = history.length - 1

	while (low <= high) {
		const mid = Math.floor((low + high) / 2)
		const timeMs = history[mid].timeMs
		if (timeMs === targetTimeMs) return mid
		if (timeMs < targetTimeMs) low = mid + 1
		else high = mid - 1
	}

	if (low >= history.length) return history.length - 1
	if (high < 0) return 0

	return targetTimeMs - history[high].timeMs <=
		history[low].timeMs - targetTimeMs
		? high
		: low
}
