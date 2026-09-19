import type { DistributionBucket } from "@/ui/genesis/details/shared"

const NATION_BUCKETS: [number, number | null][] = [
	[50, null],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]

const NATION_BUCKET_COLORS = [
	"rgb(15, 23, 42)",
	"rgb(30, 41, 59)",
	"rgb(51, 65, 85)",
	"rgb(71, 85, 105)",
	"rgb(100, 116, 139)",
	"rgb(148, 163, 184)",
]

/** Settled land belonging to no nation, distinct from the nation bars. */
const UNCLAIMED_BUCKET_COLOR = "rgb(203, 213, 225)"

export function buildNationSizeDistribution(
	nationProvinceCounts: Map<number, number>,
	/**
	 * Count of habitable provinces held by no nation. Rendered as a trailing
	 * bar. Note this counts *provinces* where every other bar counts *nations*
	 * — there is no nation to count for unclaimed land, so the bar answers
	 * "how much land is stateless" alongside "how many nations are this big".
	 */
	unclaimedProvinceCount = 0,
): DistributionBucket[] {
	const buckets = NATION_BUCKETS.map(([min, max], index) => ({
		label: max === null ? `${min}+` : min === max ? `${min}` : `${min}-${max}`,
		count: Array.from(nationProvinceCounts.values()).filter(
			(size) => size >= min && (max === null || size <= max),
		).length,
		color: NATION_BUCKET_COLORS[index],
	}))
	buckets.push({
		label: "0",
		count: unclaimedProvinceCount,
		color: UNCLAIMED_BUCKET_COLOR,
	})
	return buckets
}
