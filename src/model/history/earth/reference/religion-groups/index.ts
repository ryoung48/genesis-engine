import { DATA_SOURCE } from "@/model/history/earth/data-source"
import type { ReligionIndex } from "@/model/history/earth/reference/religion-groups/types"

let indexPromise: Promise<ReligionIndex> | null = null

function getReligionIndex(): Promise<ReligionIndex> {
	if (!indexPromise) {
		indexPromise = DATA_SOURCE.loadReligionGroups().then((groups) => {
			const religionColor = new Map<string, [number, number, number]>()
			const religionToGroup = new Map<string, string>()
			for (const group of groups) {
				for (const religion of group.religions) {
					religionColor.set(religion.id, religion.color)
					religionToGroup.set(religion.id, group.id)
				}
			}
			return { groups, religionColor, religionToGroup }
		})
	}
	return indexPromise
}

export const RELIGION_GROUPS = {
	getReligionIndex,
}
