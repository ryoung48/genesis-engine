import { DATE } from "@/model/history/earth/date"
import { PROVINCE_STATUS } from "@/model/history/record/status"
import { TARGET_PROFILE } from "@/model/history/sim/targets"
import type { WorldFrame } from "@/model/history/world-frame/types"
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

const UNINHABITED_BUCKET_COLOR = "rgb(226, 232, 240)"

export const SIZE_BUCKET_LABELS = [
	"1",
	"2-4",
	"5-9",
	"10-24",
	"25-49",
	"50-100",
	"101+",
]

export function sizeBucketColor(bucket: number): string {
	return NATION_BUCKET_COLORS[
		NATION_BUCKET_COLORS.length - 1 - Math.min(bucket, 5)
	]
}

const MAX_OVERLORD_DEPTH = 8

function realmRoot(frame: WorldFrame, nation: number): number {
	let current = nation
	for (let depth = 0; depth < MAX_OVERLORD_DEPTH; depth++) {
		const overlord = frame.nations.get(current)?.relations.overlord ?? -1
		if (overlord < 0) return current
		current = overlord
	}
	return current
}

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

/**
 * Procedural worlds report land by status: every bar counts provinces, so each
 * segment reads as a share of the habitable provinces, with the target profile's
 * share for the scrubbed year marked beside it.
 */
export function buildLandStatusDistribution(
	frame: WorldFrame,
	provinceStatus: Uint8Array,
): DistributionBucket[] {
	let habitable = 0
	let uninhabited = 0
	let stateless = 0
	const owned = new Map<number, number>()
	for (let province = 0; province < provinceStatus.length; province++) {
		const status = provinceStatus[province]
		if (status === PROVINCE_STATUS.code.desolate) continue
		habitable++
		if (status === PROVINCE_STATUS.code.uninhabited) uninhabited++
		else if (status === PROVINCE_STATUS.code.stateless) stateless++
		else {
			const nation = frame.provinceNation[province]
			if (nation >= 0) {
				const root = realmRoot(frame, nation)
				owned.set(root, (owned.get(root) ?? 0) + 1)
			}
		}
	}
	const provincesBySize = new Array<number>(TARGET_PROFILE.bucketCount).fill(0)
	for (const size of owned.values())
		provincesBySize[TARGET_PROFILE.bucketOf({ size })] += size
	const profile = TARGET_PROFILE.at({
		year: DATE.historyTimeMsToYear(frame.timeMs),
		habitableProvinces: habitable,
	})
	const percent = (count: number) => (100 * count) / Math.max(1, habitable)
	return [
		{
			label: "Uninhabited",
			count: uninhabited,
			color: UNINHABITED_BUCKET_COLOR,
		},
		{
			label: "Stateless",
			count: stateless,
			color: UNCLAIMED_BUCKET_COLOR,
			target: 100 * (1 - profile.stateHeld) - percent(uninhabited),
		},
		...SIZE_BUCKET_LABELS.map((label, b) => ({
			label,
			count: provincesBySize[b],
			color: sizeBucketColor(b),
			target: 100 * profile.stateHeld * profile.sizeShares[b],
		})),
	]
}
