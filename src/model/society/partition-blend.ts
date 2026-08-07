/** Fraction of eligible partition-border edges (visited once per pair, not
 * per directed adjacency entry) that get a visible blend. Lower than the old
 * culture-spread event's BLEED_INIT_PROBABILITY (0.35) -- that value grew
 * over time via per-tick diffusion in the old sim, whereas this is a single
 * static pass, so the same starting probability reads as too dense here. */
const BLEED_PROBABILITY = 0.15
/** Relative size difference within which two partitions are considered
 * "balanced" and neither bleeds into the other. Mirrors the old
 * culture-spread event's BALANCE_THRESHOLD (population there; node count,
 * i.e. partition.size, here since there is no simulated population). */
const BALANCE_THRESHOLD = 0.15
const MIN_BLEND_WEIGHT = 0.25
const MAX_BLEND_WEIGHT = 0.5

/** Deterministic [0, 1) hash for an unordered pair of node indices + seed, so
 * results are stable across runs and independent of adjacency iteration order. */
function hashEdge(a: number, b: number, seed: number): number {
	const lo = Math.min(a, b)
	const hi = Math.max(a, b)
	let h = ((((lo ^ seed) + hi) | 0) ^ 0x9e3779b9) >>> 0
	h ^= h >>> 16
	h = Math.imul(h, 0x45d9f3b) >>> 0
	h ^= h >>> 16
	h = Math.imul(h, 0x27d4eb2f) >>> 0
	h ^= h >>> 15
	return (h >>> 0) / 0xffffffff
}

/** Static, one-shot pass marking a deterministic subset of cross-partition
 * borders as "blended": each such node gets a secondary partition index and a
 * blend weight, which the map renders as diagonal border stripes. Replaces
 * the old per-tick culture-spread simulation (removed with the old history
 * sim) with a generation-time approximation of the same visual result --
 * same per-edge bleed probability and size-balance gating, minus the
 * diffusion/assimilation growth over time (there is no tick loop to grow
 * it in). */
export function computePartitionBorderBlend(params: {
	nodeCount: number
	adjOffset: Int32Array
	adjList: Int32Array
	assignment: Int32Array
	/** Per-partition node count, used as a population proxy for the balance gate. */
	partitionSize: Int32Array
	seed: number
}): { blendSecondary: Int32Array; blendWeight: Float32Array } {
	const { nodeCount, adjOffset, adjList, assignment, partitionSize, seed } =
		params
	const blendSecondary = new Int32Array(nodeCount).fill(-1)
	const blendWeight = new Float32Array(nodeCount)

	for (let node = 0; node < nodeCount; node++) {
		const partition = assignment[node]
		if (partition < 0) continue
		for (let i = adjOffset[node]; i < adjOffset[node + 1]; i++) {
			const neighbor = adjList[i]
			// Adjacency is symmetric, so only walk each undirected pair once
			// (from the lower-indexed side) -- otherwise the 35% roll below
			// would effectively double on nodes with multiple cross-partition
			// neighbors, since both directed entries would roll independently.
			if (neighbor <= node) continue
			const neighborPartition = assignment[neighbor]
			if (neighborPartition < 0 || neighborPartition === partition) continue

			const sizeA = partitionSize[partition] ?? 0
			const sizeB = partitionSize[neighborPartition] ?? 0
			const maxSize = Math.max(sizeA, sizeB)
			const ratio = maxSize === 0 ? 0 : Math.abs(sizeA - sizeB) / maxSize
			if (ratio < BALANCE_THRESHOLD) continue

			const h = hashEdge(node, neighbor, seed)
			if (h >= BLEED_PROBABILITY) continue

			// Only the smaller (weaker) side's province receives the blend.
			const receiver = sizeA < sizeB ? node : neighbor
			const spreader = sizeA < sizeB ? neighborPartition : partition
			if (blendSecondary[receiver] >= 0) continue
			blendSecondary[receiver] = spreader
			blendWeight[receiver] =
				MIN_BLEND_WEIGHT +
				(h / BLEED_PROBABILITY) * (MAX_BLEND_WEIGHT - MIN_BLEND_WEIGHT)
		}
	}

	return { blendSecondary, blendWeight }
}
