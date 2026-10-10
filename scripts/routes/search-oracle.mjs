import assert from "node:assert/strict"

export function createOracle({ PriorityHeap, regionCount }) {
	const distance = new Float64Array(regionCount)
	const seen = new Int32Array(regionCount)
	let stamp = 0
	const result = { searches: 0, land: 0, sea: 0, nonoptimal: 0, missedPaths: 0, examples: [] }
	function verify(query) {
		const { kind, state, startRegion, endRegion, cluster, landmark, landPassable, provinceClusters, edgeUsed, path, waterLandmark, waterDepthPenalty } = query
		stamp++
		const heap = new PriorityHeap()
		const used = ({ slot, a, b }) => edgeUsed instanceof Set
			? edgeUsed.has(Math.min(a, b) * regionCount + Math.max(a, b))
			: edgeUsed[slot] !== 0
		const passable = b => kind === "land"
			? landPassable[b] && state.regionProvince[b] >= 0 && provinceClusters[state.regionProvince[b]] === cluster && state.landmarks.regionLandmark[b] === landmark
			: !state.regionIsLand[b] && state.landmarks.regionLandmark[b] === waterLandmark
		const edgeCost = ({ slot, a, b }) => (used({ slot, a, b }) ? 0.25 : 1) + (kind === "sea" ? (waterDepthPenalty[a] + waterDepthPenalty[b]) / 2 : 0)
		distance[startRegion] = 0
		seen[startRegion] = stamp
		heap.push(0, startRegion)
		let optimum = Infinity
		while (heap.size) {
			const { key, value: a } = heap.pop()
			if (key !== distance[a]) continue
			if (a === endRegion) { optimum = key; break }
			for (let slot = state.regionAdjOffset[a]; slot < state.regionAdjOffset[a + 1]; slot++) {
				const b = state.regionAdjList[slot]
				if (!passable(b)) continue
				const candidate = key + edgeCost({ slot, a, b })
				if (seen[b] !== stamp || candidate < distance[b]) {
					seen[b] = stamp
					distance[b] = candidate
					heap.push(candidate, b)
				}
			}
		}
		let cost = path.length ? 0 : Infinity
		if (path.length) {
			assert.equal(path[0], startRegion)
			assert.equal(path.at(-1), endRegion)
		}
		for (let i = 1; i < path.length; i++) {
			const a = path[i - 1], b = path[i]
			let slot = state.regionAdjOffset[a]
			while (slot < state.regionAdjOffset[a + 1] && state.regionAdjList[slot] !== b) slot++
			assert(slot < state.regionAdjOffset[a + 1])
			assert(passable(b))
			cost += edgeCost({ slot, a, b })
		}
		result.searches++
		result[kind]++
		assert(cost >= optimum, "A valid candidate cannot cost less than the independent optimum")
		if (cost !== optimum) {
			result.nonoptimal++
			if (!Number.isFinite(cost)) result.missedPaths++
			if (result.examples.length < 10) result.examples.push({ kind, startRegion, endRegion, cost, optimum })
		}
	}
	return { verify, result }
}
