type DrawerTab = "world" | "nation"
export type WorldSection =
	| "planetary"
	| "environmental"
	| "social"
	| "trade-goods"
export type NationSection = "political" | "demographics" | "history"

interface DrawerState {
	tab: DrawerTab
	worldSection: WorldSection
	nationSection: NationSection
}

export function resolveDrawerStateOnOpen(params: {
	current: DrawerState
	selectedNationId: number | null
	previousNationId: number | null
}): DrawerState {
	const { current, selectedNationId, previousNationId } = params
	if (selectedNationId !== null && selectedNationId !== previousNationId) {
		return {
			...current,
			tab: "nation",
		}
	}

	if (selectedNationId === null && current.tab === "nation") {
		return {
			...current,
			tab: "world",
		}
	}

	return current
}
