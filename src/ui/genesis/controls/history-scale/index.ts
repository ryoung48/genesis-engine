import { DATE } from "@/model/history/earth/date"
import type {
	DecodeParams,
	ScaleParams,
	StepParams,
} from "@/ui/genesis/controls/history-scale/types"

const years = [-79999, -9999, -3300, 2025],
	fractions = [0, 0.2, 0.3, 1]
function encode({ scale, timeMs }: ScaleParams): number {
	if (scale.kind === "linear") return timeMs
	const year = DATE.historyTimeMsToYear(timeMs)
	let i = 0
	while (i < 2 && year > years[i + 1]) i++
	return (
		fractions[i] +
		((Math.max(years[0], Math.min(years[3], year)) - years[i]) /
			(years[i + 1] - years[i])) *
			(fractions[i + 1] - fractions[i])
	)
}
function decode({ scale, value, minTimeMs, maxTimeMs }: DecodeParams): number {
	if (scale.kind === "linear")
		return Math.max(minTimeMs, Math.min(maxTimeMs, value))
	const fraction = Math.max(0, Math.min(1, value))
	let i = 0
	while (i < 2 && fraction > fractions[i + 1]) i++
	const year = Math.round(
		years[i] +
			((fraction - fractions[i]) / (fractions[i + 1] - fractions[i])) *
				(years[i + 1] - years[i]),
	)
	return Math.max(
		minTimeMs,
		Math.min(maxTimeMs, DATE.eu4DateToTimeMs(`${year}.1.1`)),
	)
}
function step({
	scale,
	timeMs,
	direction,
	stepMs,
	minTimeMs,
	maxTimeMs,
}: StepParams): number {
	if (scale.kind === "linear")
		return Math.max(minTimeMs, Math.min(maxTimeMs, timeMs + direction * stepMs))
	const year = DATE.historyTimeMsToYear(timeMs),
		probe = year + (direction < 0 ? -1 : 0)
	const phase = probe < -9999 ? 0 : probe < -3300 ? 1 : 2
	const next = Math.max(
		years[phase],
		Math.min(years[phase + 1], year + direction * [500, 100, 1][phase]),
	)
	return Math.max(
		minTimeMs,
		Math.min(maxTimeMs, DATE.eu4DateToTimeMs(`${next}.1.1`)),
	)
}
export const HISTORY_SCALE = { encode, decode, step }
