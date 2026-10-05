import { FRAME } from "@/model/history/world-frame"
import { TITLES } from "@/model/society/titles"
import {
	TITLE_TIER_COLORS,
	TITLE_TIER_LABELS,
} from "@/ui/genesis/shared/title-colors"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type {
	DescribeNationTitlesParams,
	NationTitleSummary,
} from "@/ui/genesis/wiki-bridge/title-summary/types"

function describe({
	frame,
	nationId,
	provinceName,
}: DescribeNationTitlesParams): NationTitleSummary {
	const { titles } = frame
	if (!titles) return { tier: "Nation", regions: [] }
	const capital = frame.nations.get(nationId)?.capitalProvince ?? -1
	let top = -1
	for (const title of FRAME.heldTitles({ frame, nationId })) {
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

	const regions = FRAME.directReports({ frame })
		.filter((report) => report.nation === nationId)
		.sort(
			(a, b) =>
				b.tier - a.tier ||
				provinceName(a.seat).localeCompare(provinceName(b.seat)),
		)
		.map(({ seat, tier }) => {
			const tierName = TITLES.tierOrder[tier]
			return {
				province: seat,
				provinceName: provinceName(seat),
				tier: tierName,
				color: rgbToCss(TITLE_TIER_COLORS[tierName]),
			}
		})
	return { tier, regions }
}

export const TITLE_SUMMARY = { describe }
