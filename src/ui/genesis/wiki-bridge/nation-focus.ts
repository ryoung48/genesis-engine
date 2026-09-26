import { nationFocusDistanceScale } from "@/ui/genesis/renderer/focus"
import type {
	FocusWikiNationParams,
	RebelControlledNationIdsParams,
} from "@/ui/genesis/wiki-bridge/types"

export function rebelControlledNationIds({
	frame,
	wars,
}: RebelControlledNationIdsParams): Set<number> {
	return new Set(
		frame.wars
			.filter((war) => war.rebel)
			.map((war) => wars[war.id]?.warGoalId)
			.filter((id) => id !== undefined && id >= 0),
	)
}

export function focusWikiNation({
	frame,
	wars,
	targetId,
	sceneRef,
}: FocusWikiNationParams): void {
	const isRebel = rebelControlledNationIds({ frame, wars }).has(targetId)
	const assignments = isRebel ? frame.provinceController : frame.provinceNation
	const seedProvince = isRebel
		? assignments.findIndex((assigned) => assigned === targetId)
		: (frame.nations.get(targetId)?.capitalProvince ?? -1)
	if (seedProvince < 0) return
	let provinceCount = 0
	for (const assigned of assignments) {
		if (assigned === targetId) provinceCount++
	}
	sceneRef.current?.focusOnProvince(seedProvince, {
		distanceScale: nationFocusDistanceScale(provinceCount),
		pulseTarget: "nation",
		pulseAssignment: isRebel ? frame.provinceController : undefined,
	})
}
