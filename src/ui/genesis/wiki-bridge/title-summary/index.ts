import { TITLES } from "@/model/society/titles"
import { TITLE_TIER_LABELS } from "@/ui/genesis/shared/title-colors"
import { TITLE_NAMES } from "@/ui/genesis/wiki-bridge/title-names"
import type {
	DescribeNationTitlesParams,
	NationTitleSummary,
} from "@/ui/genesis/wiki-bridge/title-summary/types"

const TIER_SLOTS = 4

function describe({
	record,
	frame,
	nationId,
	provinceName,
}: DescribeNationTitlesParams): NationTitleSummary {
	const { titles } = frame
	const nation = frame.nations.get(nationId)
	const nationName = (id: number) =>
		frame.nations.get(id)?.name ?? `nation ${id}`
	if (!titles) return { tier: "Nation", liege: null }
	const seats = TITLE_NAMES.nameSeats({ record })
	const label = (title: number) =>
		`${TITLE_TIER_LABELS[TITLES.tierOrder[titles.tier[title]]]} of ${provinceName(seats[title])}`

	const capital = nation?.capitalProvince ?? -1
	const held: number[] = []
	for (let title = 0; title < titles.count; title++)
		if (titles.holder[title] === nationId) held.push(title)
	let top = -1
	for (const title of held) {
		const better =
			top < 0 ||
			titles.tier[title] > titles.tier[top] ||
			(titles.tier[title] === titles.tier[top] &&
				capital >= 0 &&
				titles.regionOf[
					(titles.tier[title] - 1) * frame.provinceCount + capital
				] === title)
		if (better) top = title
	}

	const tier =
		top >= 0
			? TITLE_TIER_LABELS[TITLES.tierOrder[titles.tier[top]]]
			: TITLE_TIER_LABELS.county

	const overlord = nation?.relations.overlord ?? -1
	if (overlord >= 0)
		return { tier, liege: `${nationName(overlord)} (overlord)` }
	const anchor = top >= 0 ? titles.seat[top] : capital
	const topTier = top >= 0 ? titles.tier[top] : 0
	for (let level = topTier + 1; level <= TIER_SLOTS && anchor >= 0; level++) {
		const parent = titles.regionOf[(level - 1) * frame.provinceCount + anchor]
		if (parent < 0) continue
		const holder = titles.holder[parent]
		if (holder >= 0 && holder !== nationId)
			return {
				tier,
				liege: `${nationName(holder)} (${label(parent)})`,
			}
	}
	return { tier, liege: null }
}

export const TITLE_SUMMARY = { describe }
