import type { NationDetailsData } from "../shared"

export type NationNeighbor = NationDetailsData["neighbors"][number]
type NeighborSortKey = "name" | "relation" | "threat"
type NeighborSortDirection = "asc" | "desc"

export interface NeighborSortState {
	key: NeighborSortKey
	direction: NeighborSortDirection
}

// Consistent with buildRelationDistribution palette in nation-details-model.ts
const RELATION_LABEL_COLORS: Record<string, string> = {
	Overlord: "rgb(168, 85, 247)",
	Vassal: "rgb(168, 85, 247)",
	"PU Senior": "rgb(99, 102, 241)",
	"PU Junior": "rgb(99, 102, 241)",
	Ally: "rgb(59, 130, 246)",
	Friendly: "rgb(34, 197, 94)",
	Neutral: "rgb(201, 201, 201)",
	Suspicious: "rgb(234, 179, 8)",
	Rival: "rgb(249, 115, 22)",
	War: "rgb(249, 56, 22)",
}

export function getRelationColor(relation: string): string | null {
	return RELATION_LABEL_COLORS[relation] ?? null
}

export const DEFAULT_NEIGHBOR_SORT: NeighborSortState = {
	key: "threat",
	direction: "desc",
}

export function formatNeighborThreat(threat: number | null): string {
	return threat !== null ? `${Math.round(threat * 100)}%` : "N/A"
}

export function nextNeighborSortState(
	current: NeighborSortState,
	key: NeighborSortKey,
): NeighborSortState {
	if (current.key === key) {
		return {
			key,
			direction: current.direction === "asc" ? "desc" : "asc",
		}
	}

	return {
		key,
		direction: key === "threat" ? "desc" : "asc",
	}
}

export function sortNationNeighbors(
	items: ReadonlyArray<NationNeighbor>,
	sort: NeighborSortState,
): NationNeighbor[] {
	const direction = sort.direction === "asc" ? 1 : -1

	return [...items].sort((left, right) => {
		if (sort.key === "threat") {
			if (left.threat === null && right.threat === null) return 0
			if (left.threat === null) return 1
			if (right.threat === null) return -1
			return (left.threat - right.threat) * direction
		}

		const leftValue = left[sort.key]
		const rightValue = right[sort.key]
		return leftValue.localeCompare(rightValue) * direction
	})
}
