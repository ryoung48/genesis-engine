import type { RawReligionGroup } from "@/model/history/earth/data-source/types"

export interface ReligionIndex {
	groups: RawReligionGroup[]
	/** religion id -> [r, g, b] 0-255 */
	religionColor: Map<string, [number, number, number]>
	/** religion id -> religion group id */
	religionToGroup: Map<string, string>
}
