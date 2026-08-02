import { DATE } from "@/model/history/earth/date"

export function hydeTimeToEu4Days(label: string): number {
	const match = label.match(/^(-?\d+)-(\d{2})-(\d{2}) /)
	if (!match) throw new Error(`Unsupported HYDE time label: ${label}`)
	const [, year, month, day] = match
	return DATE.eu4DateToDays(`${Number(year)}.${Number(month)}.${Number(day)}`)
}

export function findSortedTimeBracket(
	times: Int32Array,
	target: number,
): { lo: number; hi: number; t: number } | null {
	if (times.length === 0) return null
	if (times.length === 1) return { lo: 0, hi: 0, t: 0 }
	if (target <= times[0]) return { lo: 0, hi: 0, t: 0 }
	const lastIndex = times.length - 1
	if (target >= times[lastIndex]) return { lo: lastIndex, hi: lastIndex, t: 0 }

	let lo = 0
	let hi = lastIndex
	while (lo + 1 < hi) {
		const mid = Math.floor((lo + hi) / 2)
		if (times[mid] <= target) lo = mid
		else hi = mid
	}
	const start = times[lo]
	const end = times[hi]
	if (end <= start) return { lo, hi: lo, t: 0 }
	return { lo, hi, t: (target - start) / (end - start) }
}
