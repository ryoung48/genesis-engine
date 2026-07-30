import type { SystemBody } from "@/model/celestial/system/types"
import { resolveOrbitBodyTitle } from "@/ui/wiki/stats/orbit/body-titles"

// Numbers orbits per group once, independent of where each card ends up
// rendered — the main world's own card is interleaved among these by AU,
// which would otherwise reset the counters if numbering were computed
// separately per render group.
export function labelOrbitBodies(
	bodies: SystemBody[],
	showRealSolNames: boolean,
): LabeledOrbitBody[] {
	const groupCounters: Record<SystemBody["group"], number> = {
		"asteroid belt": 0,
		dwarf: 0,
		terrestrial: 0,
		helian: 0,
		jovian: 0,
	}
	return bodies.map((body) => {
		groupCounters[body.group] += 1
		return {
			body,
			title: resolveOrbitBodyTitle(
				body,
				groupCounters[body.group],
				showRealSolNames,
			),
		}
	})
}

export interface LabeledOrbitBody {
	body: SystemBody
	title: string
}
