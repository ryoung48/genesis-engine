import type {
	TitleUnit,
	TitleUnitParams,
} from "@/model/history/sim/nations/title-claim/types"
import { DEJURE } from "@/model/society/dejure"

const TIER_SLOTS = 4

function unitFor({
	titles,
	members,
	provinceCount,
	assignment,
	province,
	remaining,
}: TitleUnitParams): TitleUnit {
	for (let tier = TIER_SLOTS; tier >= 1; tier--) {
		const title = DEJURE.titleAt({ titles, provinceCount, tier, province })
		if (title < 0) continue
		const start = members.offset[title]
		const end = members.offset[title + 1]
		if (end - start > remaining || end - start < 2) continue
		let free = true
		for (let i = start; i < end && free; i++)
			if (assignment[members.list[i]] >= 0) free = false
		if (free)
			return { provinces: Array.from(members.list.subarray(start, end)), title }
	}
	return { provinces: [province], title: -1 }
}

export const TITLE_CLAIM = { unitFor }
