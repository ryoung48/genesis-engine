import { type EarthHistoryData, type FoldedState, fold } from "./fold"

const DAYS_PER_CHECKPOINT = 25 * 365 // 25 years, matches typical EU4 scrub granularity

export interface CheckpointCache {
	data: EarthHistoryData
	provinceIds: string[]
	nationTags: string[]
	checkpoints: Map<number, FoldedState>
}

export function createCheckpointCache(data: EarthHistoryData): CheckpointCache {
	return {
		data,
		provinceIds: Object.keys(data.provinceEvents),
		nationTags: Object.keys(data.nationEvents),
		checkpoints: new Map(),
	}
}

function checkpointFloor(time: number): number {
	return Math.floor(time / DAYS_PER_CHECKPOINT) * DAYS_PER_CHECKPOINT
}

/** Returns folded state at `time`, replaying only the delta since the
 * nearest preceding checkpoint (built and cached on first use) instead of
 * refolding from epoch every query -- this is what lets the UI slider scrub
 * without an O(all events since year 2) cost on every drag frame. */
export function foldAtCheckpoint(
	cache: CheckpointCache,
	time: number,
): FoldedState {
	const floor = checkpointFloor(time)
	let checkpoint = cache.checkpoints.get(floor)
	if (!checkpoint) {
		// Build the checkpoint by chaining from the previous one, so the
		// *cumulative* work across many scrubs is still linear in events
		// touched, not quadratic in checkpoint count.
		const prevFloor = floor - DAYS_PER_CHECKPOINT
		const prev = cache.checkpoints.get(prevFloor)
		checkpoint = fold(cache.data, floor, {
			base: prev,
			provinceIds: cache.provinceIds,
			nationTags: cache.nationTags,
		})
		cache.checkpoints.set(floor, checkpoint)
	}
	if (time === floor) return checkpoint
	return fold(cache.data, time, {
		base: checkpoint,
		provinceIds: cache.provinceIds,
		nationTags: cache.nationTags,
	})
}
