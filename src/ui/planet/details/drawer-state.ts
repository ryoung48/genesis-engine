type DrawerTab = "world" | "nation"
export type WorldSection =
	| "planetary"
	| "environmental"
	| "social"
	| "trade-goods"
export type NationSection = "political" | "demographics" | "history"

interface DrawerState {
	tab: DrawerTab
	openWorldSections: ReadonlySet<WorldSection>
	openNationSections: ReadonlySet<NationSection>
}

export const DEFAULT_WORLD_SECTIONS: ReadonlySet<WorldSection> = new Set([
	"planetary",
])
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

export function resolveDrawerStateOnOpen(params: {
	current: DrawerState
	selectedNationId: number | null
	previousNationId: number | null
}): DrawerState {
	const { current, selectedNationId, previousNationId } = params
	if (selectedNationId !== null && selectedNationId !== previousNationId) {
		return { ...current, tab: "nation" }
	}
	if (selectedNationId === null && current.tab === "nation") {
		return { ...current, tab: "world" }
	}
	return current
}
