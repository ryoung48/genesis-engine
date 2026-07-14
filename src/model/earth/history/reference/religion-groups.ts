import { loadReligionGroups, type RawReligionGroup } from "../data-source"

interface ReligionIndex {
	groups: RawReligionGroup[]
	/** religion id -> [r, g, b] 0-255 */
	religionColor: Map<string, [number, number, number]>
	/** religion id -> religion group id */
	religionToGroup: Map<string, string>
}

let indexPromise: Promise<ReligionIndex> | null = null

export function getReligionIndex(): Promise<ReligionIndex> {
	if (!indexPromise) {
		indexPromise = loadReligionGroups().then((groups) => {
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
