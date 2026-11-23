import { UNITS } from "@/model/shared/units"
import type { WithinParams } from "@/model/society/farming/neighborhood/types"

function within({
	graph,
	r_xyz,
	planetRadiusKm,
	province,
	radiusKm,
}: WithinParams): number[] {
	const found = [province]
	const seen = new Set<number>(found)
	for (let i = 0; i < found.length; i++) {
		const source = found[i]
		for (
			let j = graph.adjOffset[source];
			j < graph.adjOffset[source + 1];
			j++
		) {
			const q = graph.adjList[j]
			if (seen.has(q)) continue
			const distanceKm = UNITS.regionDistanceKm({
				r_xyz,
				fromRegion: graph.seeds[province],
				toRegion: graph.seeds[q],
				planetRadiusKm,
			})
			if (distanceKm > radiusKm) continue
			seen.add(q)
			found.push(q)
		}
	}
	return found
}

export const FARMING_NEIGHBORHOOD = { within }
