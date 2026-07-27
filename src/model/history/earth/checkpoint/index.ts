import type {
	CheckpointCache,
	FoldAtCheckpointParams,
} from "@/model/history/earth/checkpoint/types"
import { FOLD } from "@/model/history/earth/fold"
import type {
	EarthHistoryData,
	FoldedState,
} from "@/model/history/earth/fold/types"

const DAYS_PER_CHECKPOINT = 25 * 365

function createCheckpointCache(data: EarthHistoryData): CheckpointCache {
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

function foldAtCheckpoint({
	cache,
	time,
}: FoldAtCheckpointParams): FoldedState {
	const floor = checkpointFloor(time)
	let checkpoint = cache.checkpoints.get(floor)
	if (!checkpoint) {
		// Build the checkpoint by chaining from the previous one, so the
		// *cumulative* work across many scrubs is still linear in events
		// touched, not quadratic in checkpoint count.
		const prevFloor = floor - DAYS_PER_CHECKPOINT
		const prev = cache.checkpoints.get(prevFloor)
		checkpoint = FOLD.fold({
			data: cache.data,
			time: floor,
			options: {
				base: prev,
				provinceIds: cache.provinceIds,
				nationTags: cache.nationTags,
			},
		})
		cache.checkpoints.set(floor, checkpoint)
	}
	if (time === floor) return checkpoint
	return FOLD.fold({
		data: cache.data,
		time,
		options: {
			base: checkpoint,
			provinceIds: cache.provinceIds,
			nationTags: cache.nationTags,
		},
	})
}

export const CHECKPOINT = {
	createCheckpointCache,
	foldAtCheckpoint,
}
