import type {
	BuildRaidTimelineParams,
	RaidTimelineEntry,
} from "@/ui/genesis/wiki-bridge/raid-timeline/types"
import { formatSilver } from "@/ui/wiki/stats/nation/nation-stats"

const MS_PER_DAY = 86_400_000

function build({
	record,
	nationId,
	nationName,
	nationNameOf,
	provinceName,
}: BuildRaidTimelineParams): RaidTimelineEntry[] {
	const entries: RaidTimelineEntry[] = []
	record.events.raids.forEach((raid, index) => {
		const asRaider = raid.raiderId === nationId
		if (!asRaider && raid.victimId !== nationId) return
		const place = provinceName(raid.provinceId)
		const other = nationNameOf(asRaider ? raid.victimId : raid.raiderId)
		const haul =
			raid.loot > 0
				? `carrying off ${formatSilver(raid.loot)} of silver`
				: "finding little worth taking"
		const description = asRaider
			? raid.success
				? `${nationName} raided ${other}'s lands at ${place}, ${haul}.`
				: `${nationName}'s raid on ${place} was driven off by ${other}.`
			: raid.success
				? `${other} raided ${place}, ${haul}.`
				: `${nationName} drove off a raid by ${other} at ${place}.`
		entries.push({
			id: `raid:${raid.timeMs}:${index}`,
			date: raid.timeMs / MS_PER_DAY,
			type: raid.success === asRaider ? "Raid (+)" : "Raid (-)",
			description,
			otherNationId: asRaider ? raid.victimId : raid.raiderId,
			province: raid.provinceId,
		})
	})
	return entries
}

export const RAID_TIMELINE = { build }
