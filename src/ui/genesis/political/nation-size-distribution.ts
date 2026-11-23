import { PROVINCE_STATUS } from "@/model/history/record/status"
import { TARGET_PROFILE } from "@/model/history/sim/targets"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { DistributionBucket } from "@/ui/genesis/details/shared"

const NATION_BUCKET_COLORS = [
	"rgb(15, 23, 42)",
	"rgb(30, 41, 59)",
	"rgb(51, 65, 85)",
	"rgb(71, 85, 105)",
	"rgb(100, 116, 139)",
	"rgb(148, 163, 184)",
]

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
	frame: WorldFrame,
): DistributionBucket[] {
	const owned = new Map<number, number>()
	for (let province = 0; province < frame.provinceNation.length; province++) {
		const nation = frame.provinceNation[province]
		if (nation < 0) continue
		const status = frame.provinceStatus?.[province]
		if (
			status === PROVINCE_STATUS.code.desolate ||
			status === PROVINCE_STATUS.code.uninhabited ||
			status === PROVINCE_STATUS.code.stateless
		)
			continue
		const root = frame.provinceStatus ? realmRoot(frame, nation) : nation
		owned.set(root, (owned.get(root) ?? 0) + 1)
	}
	const nationsBySize = new Array<number>(TARGET_PROFILE.bucketCount).fill(0)
	for (const size of owned.values())
		nationsBySize[TARGET_PROFILE.bucketOf({ size })]++
	return SIZE_BUCKET_LABELS.map((label, bucket) => ({
		label,
		count: nationsBySize[bucket],
		color: sizeBucketColor(bucket),
	}))
}
