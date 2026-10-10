import { BUCKET_QUEUE } from "@/model/shared/bucket-queue"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"
import type {
	BackwardWorkspace,
	FindPathParams,
	NextNodeParams,
} from "@/model/society/infrastructure/trade/routing/search/types"
import type { SearchWorkspace } from "@/model/society/infrastructure/trade/routing/types"

const cached = new WeakMap<SearchWorkspace, BackwardWorkspace>()

function findPath({
	state,
	workspace,
	startRegion,
	endRegion,
	groupId,
	groupIds,
	edgeUsed,
	waterDepthPenalty,
	kind,
}: FindPathParams): number[] {
	let back = cached.get(workspace)
	if (!back) {
		const distance = new Float32Array(state.regionProvince.length)
		back = {
			distance,
			prev: new Int32Array(distance.length),
			queued: new Int32Array(distance.length),
			settled: new Int32Array(distance.length),
			landQueue: BUCKET_QUEUE.create({
				distance,
				bucketCount: ROUTE_TUNING.search.landBucketCount,
			}),
			seaQueue: BUCKET_QUEUE.create({
				distance,
				bucketCount: ROUTE_TUNING.search.seaBucketCount,
			}),
		}
		cached.set(workspace, back)
	}
	workspace.stamp++
	if (workspace.stamp === 0x7fffffff) {
		for (const array of [
			workspace.queued,
			workspace.settled,
			back.queued,
			back.settled,
		]) {
			array.fill(0)
		}
		workspace.stamp = 1
	}
	const stamp = workspace.stamp
	if (startRegion < 0 || endRegion < 0) return []
	const isLand = kind === "land"
	const passable = (region: number) =>
		isLand
			? groupIds[region] === groupId
			: state.landmarks.regionLandmark[region] === groupId
	if (!passable(startRegion) || !passable(endRegion)) return []
	const forwardQueue = isLand ? workspace.landQueue : workspace.seaQueue
	const backwardQueue = isLand ? back.landQueue : back.seaQueue
	forwardQueue.clear()
	backwardQueue.clear()
	workspace.distance[startRegion] = 0
	workspace.prev[startRegion] = startRegion
	workspace.queued[startRegion] = stamp
	back.distance[endRegion] = 0
	back.prev[endRegion] = endRegion
	back.queued[endRegion] = stamp
	forwardQueue.push(startRegion)
	backwardQueue.push(endRegion)
	const { regionAdjOffset, regionAdjList } = state
	const { costScale } = ROUTE_TUNING.search
	const newEdgeCost = ROUTE_TUNING[kind].newEdgeCost * costScale
	const existingEdgeCost = ROUTE_TUNING[kind].existingEdgeCost * costScale
	let best = startRegion === endRegion ? 0 : Infinity
	let meeting = startRegion === endRegion ? startRegion : -1

	function next({ queue, settled }: NextNodeParams): number {
		while (queue.size) {
			const node = queue.pop()
			if (node < 0) break
			if (settled[node] !== stamp) return node
		}
		return -1
	}

	let forwardNode = next({ queue: forwardQueue, settled: workspace.settled })
	let backwardNode = next({ queue: backwardQueue, settled: back.settled })
	while (forwardNode >= 0 && backwardNode >= 0) {
		if (workspace.distance[forwardNode] + back.distance[backwardNode] >= best) {
			break
		}
		const forward =
			workspace.distance[forwardNode] <= back.distance[backwardNode]
		const current = forward ? forwardNode : backwardNode
		const active = forward ? workspace : back
		const other = forward ? back : workspace
		const queue = forward ? forwardQueue : backwardQueue
		active.settled[current] = stamp
		if (other.queued[current] === stamp) {
			const cost = active.distance[current] + other.distance[current]
			if (cost < best) {
				best = cost
				meeting = current
			}
		}
		for (
			let slot = regionAdjOffset[current];
			slot < regionAdjOffset[current + 1];
			slot++
		) {
			const neighbor = regionAdjList[slot]
			if (active.settled[neighbor] === stamp || !passable(neighbor)) continue
			const base = edgeUsed[slot] !== 0 ? existingEdgeCost : newEdgeCost
			const penalty = isLand
				? 0
				: (waterDepthPenalty[current] + waterDepthPenalty[neighbor]) *
					(costScale / 2)
			const distance = active.distance[current] + base + penalty
			if (
				active.queued[neighbor] !== stamp ||
				distance < active.distance[neighbor]
			) {
				active.distance[neighbor] = distance
				active.prev[neighbor] = current
				active.queued[neighbor] = stamp
				queue.push(neighbor)
				if (other.queued[neighbor] === stamp) {
					const cost = distance + other.distance[neighbor]
					if (cost < best) {
						best = cost
						meeting = neighbor
					}
				}
			}
		}
		if (forward) forwardNode = next({ queue, settled: active.settled })
		else backwardNode = next({ queue, settled: active.settled })
	}
	if (meeting < 0) return []
	const path: number[] = []
	for (
		let region = meeting;
		region !== startRegion;
		region = workspace.prev[region]
	) {
		path.push(region)
	}
	path.push(startRegion)
	path.reverse()
	for (let region = meeting; region !== endRegion; ) {
		region = back.prev[region]
		path.push(region)
	}
	return path
}

export const ROUTE_SEARCH = { findPath }
