/**
 * Province partitioning for the orogen pipeline.
 * Competitive multi-source BFS on SphereMesh CSR adjacency.
 * O(N) time, all typed arrays, no object allocation in hot path.
 */
import type { SphereMesh, OrogenProvinces, OrogenRainfall } from "../types"
import { createRng } from "../rng"
import { meanEdgeLengthKm } from "../units"

export function computeProvinces(
	mesh: SphereMesh,
	isLand: Uint8Array,
	topography: Uint8Array,
	seed: number,
	options?: {
		climateZones?: Uint8Array
		rainfall?: OrogenRainfall
		targetCount?: number
		targetAreaKm2?: number
		planetRadiusKm?: number
	},
): OrogenProvinces {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const rng = createRng(seed + 31337)

	// Count land regions
	let landCount = 0
	for (let r = 0; r < N; r++) if (isLand[r]) landCount++
	if (landCount === 0) return emptyProvinces(N)

	// Determine target province count
	let targetCount: number
	if (options?.targetCount) {
		targetCount = options.targetCount
	} else {
		const areaTarget = options?.targetAreaKm2 ?? 45_000
		const avgEdgeKm = meanEdgeLengthKm(mesh, options?.planetRadiusKm)
		const regionAreaKm2 = avgEdgeKm * avgEdgeKm * Math.sqrt(3) * 0.5
		targetCount = Math.max(1, Math.round((landCount * regionAreaKm2) / areaTarget))
	}

	// Compute seed spacing in hops from target density
	const regionsPerProvince = Math.max(1, landCount / targetCount)
	const spacing = Math.max(2, Math.round(Math.sqrt(regionsPerProvince) * 0.85))

	// ── Phase 1: Seed placement via greedy BFS spacing ──────────────────

	// Collect and shuffle land regions (Fisher-Yates)
	const landRegions = new Int32Array(landCount)
	let idx = 0
	for (let r = 0; r < N; r++) if (isLand[r]) landRegions[idx++] = r
	for (let i = landCount - 1; i > 0; i--) {
		const j = rng.randint(0, i)
		const tmp = landRegions[i]
		landRegions[i] = landRegions[j]
		landRegions[j] = tmp
	}

	const seeds: number[] = []
	const claimed = new Uint8Array(N)
	const bfsQueue: number[] = []
	const bfsDist = new Int32Array(N) // reused per-seed, reset after each

	for (let li = 0; li < landCount; li++) {
		const r = landRegions[li]
		if (claimed[r]) continue
		seeds.push(r)

		// BFS from seed to mark nearby regions within spacing as claimed
		bfsQueue.length = 0
		bfsQueue.push(r)
		claimed[r] = 1
		bfsDist[r] = 0
		let head = 0
		while (head < bfsQueue.length) {
			const curr = bfsQueue[head++]
			if (bfsDist[curr] >= spacing) continue
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb] || claimed[nb]) continue
				bfsDist[nb] = bfsDist[curr] + 1
				claimed[nb] = 1
				bfsQueue.push(nb)
			}
		}
		// Reset bfsDist for reuse
		for (let i = 0; i < bfsQueue.length; i++) bfsDist[bfsQueue[i]] = 0
	}

	const provinceCount = seeds.length
	const seedsArr = new Int32Array(seeds)

	// ── Phase 2: Competitive BFS with mountain deferral ─────────────────
	// Normal edges processed first; mountain-to-mountain crossings deferred
	// to the next round, making ridges natural province boundaries.

	const regionProvince = new Int32Array(N).fill(-1)
	let active: number[] = []
	let deferred: number[] = []

	for (let i = 0; i < provinceCount; i++) {
		regionProvince[seeds[i]] = i
		active.push(seeds[i])
	}

	while (active.length > 0) {
		let head = 0
		// Process all entries including newly appended non-mountain expansions
		while (head < active.length) {
			const r = active[head++]
			const rMtn = topography[r] >= 2
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb] || regionProvince[nb] >= 0) continue
				regionProvince[nb] = regionProvince[r]
				if (rMtn && topography[nb] >= 2) deferred.push(nb)
				else active.push(nb)
			}
		}
		// Swap: deferred mountain crossings become the next active set
		active.length = 0
		const tmp = active
		active = deferred
		deferred = tmp
	}

	// ── Phase 3: Province sizes ─────────────────────────────────────────

	const size = new Int32Array(provinceCount)
	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p >= 0) size[p]++
	}

	// ── Phase 4: Desolate classification ────────────────────────────────
	// Check seed region climate: arctic/subarctic/infernal/chaotic or arid

	const desolate = new Uint8Array(provinceCount)
	const { climateZones, rainfall } = options ?? {}
	for (let i = 0; i < provinceCount; i++) {
		const r = seeds[i]
		if (climateZones) {
			const zone = climateZones[r]
			// 1=arctic, 2=subarctic, 7=infernal, 8=chaotic
			if (zone === 1 || zone === 2 || zone >= 7) {
				desolate[i] = 1
				continue
			}
		}
		if (rainfall && rainfall.annual[r] < 1) {
			desolate[i] = 1
		}
	}

	// ── Phase 5: Province adjacency (CSR) ───────────────────────────────

	const provNeighbors: Set<number>[] = new Array(provinceCount)
	for (let i = 0; i < provinceCount; i++) provNeighbors[i] = new Set()

	// 5a. Land-based adjacency: direct mesh neighbors
	for (let r = 0; r < N; r++) {
		const p1 = regionProvince[r]
		if (p1 < 0) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const p2 = regionProvince[adjList[j]]
			if (p2 >= 0 && p2 !== p1) provNeighbors[p1].add(p2)
		}
	}

	// 5b. Sea-crossing adjacency: competitive BFS from coastal cells into ocean.
	// When two province frontiers meet in the ocean, link them.
	{
		const oceanProv = new Int32Array(N).fill(-1)  // province that claimed each ocean cell
		const queue: number[] = []

		// Seed: every non-desolate land cell that has at least one ocean neighbor
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0 || desolate[p]) continue
			let coastal = false
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				if (!isLand[adjList[j]]) { coastal = true; break }
			}
			if (!coastal) continue
			// Seed adjacent ocean cells at distance 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb] || oceanProv[nb] >= 0) continue
				oceanProv[nb] = p
				queue.push(nb)
			}
		}

		// Expand ocean frontier
		let head = 0
		while (head < queue.length) {
			const r = queue[head++]
			const p1 = oceanProv[r]
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) {
					// Hit another province's land cell — link if non-desolate
					const p2 = regionProvince[nb]
					if (p2 >= 0 && p2 !== p1 && !desolate[p2]) {
						provNeighbors[p1].add(p2)
						provNeighbors[p2].add(p1)
					}
					continue
				}
				if (oceanProv[nb] >= 0) {
					// Two frontiers meet in the ocean — link them
					const p2 = oceanProv[nb]
					if (p2 !== p1) {
						provNeighbors[p1].add(p2)
						provNeighbors[p2].add(p1)
					}
					continue
				}
				oceanProv[nb] = p1
				queue.push(nb)
			}
		}
	}

	const provAdjOffset = new Int32Array(provinceCount + 1)
	let totalAdj = 0
	for (let p = 0; p < provinceCount; p++) {
		totalAdj += provNeighbors[p].size
		provAdjOffset[p + 1] = totalAdj
	}
	const provAdjList = new Int32Array(totalAdj)
	for (let p = 0; p < provinceCount; p++) {
		let wi = provAdjOffset[p]
		for (const nb of provNeighbors[p]) provAdjList[wi++] = nb
	}

	// ── Phase 6: Province colors (golden-ratio hue spacing) ────────────

	const colors = generateProvinceColors(provinceCount, rng)

	return {
		regionProvince,
		seeds: seedsArr,
		count: provinceCount,
		desolate,
		adjOffset: provAdjOffset,
		adjList: provAdjList,
		size,
		colors,
	}
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = l - c / 2
	let r = 0, g = 0, b = 0
	if (h < 60) { r = c; g = x }
	else if (h < 120) { r = x; g = c }
	else if (h < 180) { g = c; b = x }
	else if (h < 240) { g = x; b = c }
	else if (h < 300) { r = x; b = c }
	else { r = c; b = x }
	return [r + m, g + m, b + m]
}

function generateProvinceColors(count: number, rng: { random(): number }): Float32Array {
	const colors = new Float32Array(count * 3)
	const GOLDEN_RATIO = 0.618033988749895
	let hue = rng.random()
	for (let i = 0; i < count; i++) {
		hue = (hue + GOLDEN_RATIO) % 1
		const sat = 0.45 + rng.random() * 0.3
		const lit = 0.40 + rng.random() * 0.25
		const [r, g, b] = hslToRgb(hue * 360, sat, lit)
		colors[3 * i] = r
		colors[3 * i + 1] = g
		colors[3 * i + 2] = b
	}
	return colors
}

function emptyProvinces(N: number): OrogenProvinces {
	return {
		regionProvince: new Int32Array(N).fill(-1),
		seeds: new Int32Array(0),
		count: 0,
		desolate: new Uint8Array(0),
		adjOffset: new Int32Array(1),
		adjList: new Int32Array(0),
		size: new Int32Array(0),
		colors: new Float32Array(0),
	}
}
