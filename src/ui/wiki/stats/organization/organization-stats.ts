import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import {
	formatAreaKm2,
	formatCount,
	formatDensity,
} from "../nation/nation-stats"

/** Same "Total Area"/"Population" shape as buildNationWikiStats, but summed
 * over an organization's current member territory (see
 * collectOrgMemberProvinceRawIds) instead of a single nation. The member
 * *list* (with counts) is shown by its own "Members" wiki section, not
 * duplicated here as a stat. */
export function buildOrganizationWikiStats(params: {
	totalAreaKm2: number
	totalPopulation: number
	provinceCount: number
}): StatEntry[] {
	const { totalAreaKm2, totalPopulation, provinceCount } = params
	const density = totalAreaKm2 > 0 ? totalPopulation / totalAreaKm2 : 0
	return [
		{
			label: "Total Area",
			value: `${formatAreaKm2(totalAreaKm2)} · ${provinceCount.toLocaleString()} Province${provinceCount === 1 ? "" : "s"}`,
		},
		{
			label: "Population",
			valuePrefix: formatCount(totalPopulation),
			value: ` · ${formatDensity(density)}`,
		},
	]
}
