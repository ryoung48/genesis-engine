import type { OrogenPartition } from ".."
import { buildIdentitySeeds } from "../shared/identity-seeds"
import { createRng } from "../shared/rng"

type GraphPartitionParams = {
	nodeCount: number
	adjOffset: Int32Array
	adjList: Int32Array
	active: Uint8Array
	targetCount: number
	seed: number
}

export function computeGraphPartition({
	nodeCount,
	adjOffset,
	adjList,
	active,
	targetCount,
	seed,
}: GraphPartitionParams): OrogenPartition {
	let activeCount = 0
	for (let i = 0; i < nodeCount; i++) if (active[i]) activeCount++
	if (activeCount === 0) return emptyPartition(nodeCount)

	const rng = createRng(seed)
	const desiredCount = Math.max(1, Math.min(activeCount, targetCount))
	const nodesPerPartition = Math.max(1, activeCount / desiredCount)
	// Maximum spacing where the hex exclusion ball (1 + 3s(s+1) nodes) still
	// fits within nodesPerPartition, so seed placement can always reach targetCount.
	const spacing = Math.max(
		0,
		Math.floor((-3 + Math.sqrt(12 * nodesPerPartition - 3)) / 6),
	)

	const activeNodes = new Int32Array(activeCount)
	let wi = 0
	for (let i = 0; i < nodeCount; i++) if (active[i]) activeNodes[wi++] = i
	for (let i = activeCount - 1; i > 0; i--) {
		const j = rng.randint(0, i)
		const tmp = activeNodes[i]
		activeNodes[i] = activeNodes[j]
		activeNodes[j] = tmp
	}

	const claimed = new Uint8Array(nodeCount)
	const bfsDist = new Int32Array(nodeCount)
	const bfsQueue: number[] = []
	const seeds: number[] = []

	for (let i = 0; i < activeCount; i++) {
		const node = activeNodes[i]
		if (claimed[node]) continue
		seeds.push(node)
		if (seeds.length >= desiredCount) break

		bfsQueue.length = 0
		bfsQueue.push(node)
		claimed[node] = 1
		bfsDist[node] = 0
		let head = 0
		while (head < bfsQueue.length) {
			const curr = bfsQueue[head++]
			if (bfsDist[curr] >= spacing) continue
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!active[nb] || claimed[nb]) continue
				claimed[nb] = 1
				bfsDist[nb] = bfsDist[curr] + 1
				bfsQueue.push(nb)
			}
		}
		for (let j = 0; j < bfsQueue.length; j++) bfsDist[bfsQueue[j]] = 0
	}

	if (seeds.length === 0) {
		for (let i = 0; i < activeCount; i++) {
			seeds.push(activeNodes[i])
			break
		}
	}

	const count = seeds.length
	const assignment = new Int32Array(nodeCount).fill(-1)
	const queue: number[] = []
	for (let i = 0; i < count; i++) {
		const seedNode = seeds[i]
		assignment[seedNode] = i
		queue.push(seedNode)
	}

	let head = 0
	while (head < queue.length) {
		const curr = queue[head++]
		const group = assignment[curr]
		for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!active[nb] || assignment[nb] >= 0) continue
			assignment[nb] = group
			queue.push(nb)
		}
	}

	const size = new Int32Array(count)
	for (let i = 0; i < nodeCount; i++) {
		const group = assignment[i]
		if (group >= 0) size[group]++
	}

	const neighbors: Set<number>[] = new Array(count)
	for (let i = 0; i < count; i++) neighbors[i] = new Set()
	for (let i = 0; i < nodeCount; i++) {
		const a = assignment[i]
		if (a < 0) continue
		for (let j = adjOffset[i], jEnd = adjOffset[i + 1]; j < jEnd; j++) {
			const b = assignment[adjList[j]]
			if (b >= 0 && b !== a) neighbors[a].add(b)
		}
	}

	const groupAdjOffset = new Int32Array(count + 1)
	let totalAdj = 0
	for (let i = 0; i < count; i++) {
		totalAdj += neighbors[i].size
		groupAdjOffset[i + 1] = totalAdj
	}
	const groupAdjList = new Int32Array(totalAdj)
	for (let i = 0; i < count; i++) {
		let idx = groupAdjOffset[i]
		for (const nb of neighbors[i]) groupAdjList[idx++] = nb
	}

	return {
		assignment,
		seeds: new Int32Array(seeds),
		languageSeeds: buildIdentitySeeds(count, seed),
		nameSeeds: buildIdentitySeeds(count, seed + 3109),
		count,
		adjOffset: groupAdjOffset,
		adjList: groupAdjList,
		size,
		colors: generatePartitionColors(count, rng),
	}
}

export function deriveChildColors(params: {
	childCount: number
	childToParent: Int32Array
	parentColors: Float32Array
	seed: number
}): Float32Array {
	const { childCount, childToParent, parentColors, seed } = params
	const colors = new Float32Array(childCount * 3)
	const groups = new Map<number, number[]>()
	for (let i = 0; i < childCount; i++) {
		const parent = childToParent[i]
		if (parent < 0) continue
		const siblings = groups.get(parent)
		if (siblings) siblings.push(i)
		else groups.set(parent, [i])
	}

	for (const [parent, siblings] of groups) {
		const rng = createRng(seed + parent * 8191)
		const [baseH, baseS, baseL] = rgbToHsl(
			parentColors[3 * parent],
			parentColors[3 * parent + 1],
			parentColors[3 * parent + 2],
		)
		const span = Math.min(0.05, 0.0125 * Math.max(1, siblings.length - 1))
		for (let i = 0; i < siblings.length; i++) {
			const child = siblings[i]
			const offset =
				siblings.length <= 1 ? 0 : (i / (siblings.length - 1) - 0.5) * 2 * span
			const hue = (baseH + offset + (rng.random() - 0.5) * 0.01 + 1) % 1
			const sat = clamp01(baseS + (rng.random() - 0.5) * 0.12)
			const lit = clamp01(baseL + (rng.random() - 0.5) * 0.14)
			const [r, g, b] = hslToRgb(hue * 360, sat, lit)
			colors[3 * child] = r
			colors[3 * child + 1] = g
			colors[3 * child + 2] = b
		}
	}

	return colors
}

export function hslToRgb(
	h: number,
	s: number,
	l: number,
): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = l - c / 2
	let r = 0
	let g = 0
	let b = 0
	if (h < 60) {
		r = c
		g = x
	} else if (h < 120) {
		r = x
		g = c
	} else if (h < 180) {
		g = c
		b = x
	} else if (h < 240) {
		g = x
		b = c
	} else if (h < 300) {
		r = x
		b = c
	} else {
		r = c
		b = x
	}
	return [r + m, g + m, b + m]
}

function generatePartitionColors(
	count: number,
	rng: { random(): number },
): Float32Array {
	const colors = new Float32Array(count * 3)
	const goldenRatio = 0.618033988749895
	let hue = rng.random()
	for (let i = 0; i < count; i++) {
		hue = (hue + goldenRatio) % 1
		const sat = 0.45 + rng.random() * 0.3
		const lit = 0.4 + rng.random() * 0.25
		const [r, g, b] = hslToRgb(hue * 360, sat, lit)
		colors[3 * i] = r
		colors[3 * i + 1] = g
		colors[3 * i + 2] = b
	}
	return colors
}

export function rgbToHsl(
	r: number,
	g: number,
	b: number,
): [number, number, number] {
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	if (max === min) return [0, 0, l]

	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
	let h = 0
	switch (max) {
		case r:
			h = (g - b) / d + (g < b ? 6 : 0)
			break
		case g:
			h = (b - r) / d + 2
			break
		default:
			h = (r - g) / d + 4
			break
	}
	return [h / 6, s, l]
}

export function clamp01(value: number) {
	return Math.max(0, Math.min(1, value))
}

function emptyPartition(nodeCount: number): OrogenPartition {
	return {
		assignment: new Int32Array(nodeCount).fill(-1),
		seeds: new Int32Array(0),
		languageSeeds: new Int32Array(0),
		nameSeeds: new Int32Array(0),
		count: 0,
		adjOffset: new Int32Array(1),
		adjList: new Int32Array(0),
		size: new Int32Array(0),
		colors: new Float32Array(0),
	}
}
