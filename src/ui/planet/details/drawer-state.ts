export type WorldSection = "environmental" | "social" | "trade-goods"
export type NationSection = "political" | "demographics" | "history"

export const DEFAULT_WORLD_SECTIONS: ReadonlySet<WorldSection> = new Set([])
export const DEFAULT_NATION_SECTIONS: ReadonlySet<NationSection> = new Set([
	"political",
])

export function toggleSection<T>(
	sections: ReadonlySet<T>,
	section: T,
): ReadonlySet<T> {
	const next = new Set(sections)
	if (next.has(section)) {
		next.delete(section)
	} else {
		next.add(section)
	}
	return next
}
