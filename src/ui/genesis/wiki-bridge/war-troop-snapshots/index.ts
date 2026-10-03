import type {
	SnapshotParams,
	TroopSnapshot,
} from "@/ui/genesis/wiki-bridge/war-troop-snapshots/types"

function latest({
	war,
	startTimeMs,
	cutoffTimeMs,
}: SnapshotParams): TroopSnapshot {
	const snapshots: TroopSnapshot[] = war.battles.map((battle) => ({
		timeMs: battle.timeMs,
		contributions: battle.simulated?.contributions ?? [],
	}))
	for (const siege of war.sieges) {
		snapshots.push({ timeMs: siege.timeMs, contributions: siege.contributions })
		snapshots.push(
			...siege.beats.map((beat) => ({
				timeMs: beat.timeMs,
				contributions: beat.contributions,
			})),
		)
		if (siege.endTimeMs !== null && siege.endContributions !== null)
			snapshots.push({
				timeMs: siege.endTimeMs,
				contributions: siege.endContributions,
			})
	}
	snapshots.sort((a, b) => a.timeMs - b.timeMs)
	return (
		snapshots.findLast((snapshot) => snapshot.timeMs <= cutoffTimeMs) ?? {
			timeMs: startTimeMs,
			contributions: war.mobilization,
		}
	)
}
export const WAR_TROOP_SNAPSHOTS = { latest }
