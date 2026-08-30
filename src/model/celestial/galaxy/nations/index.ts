import type {
	BuildGalaxyNationsParams,
	GalaxyNations,
} from "@/model/celestial/galaxy/nations/types"
import { RNG } from "@/model/shared/random/rng"

// Same size-tier weights/ranges as the province-based medieval nation
// distribution (see society/nations/index.ts's NATION_PERCENTAGES and
// eras/index.ts's nationBuckets) -- a galaxy's system count is the same
// rough order of magnitude as a planet's province count, so the same
// absolute bucket ranges produce the same "a few empires, many small
// realms" shape rather than needing a separate calibration.
const NATION_PERCENTAGES = [0.0, 0.11, 0.144, 0.194, 0.165, 0.251, 0.137]
const NATION_BUCKETS: [number, number][] = [
	[251, 600],
	[50, 250],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]

function normalize(weights: number[]): number[] {
	const total = weights.reduce((sum, w) => sum + w, 0)
	return total > 0 ? weights.map((w) => w / total) : weights
}

function integerMass(total: number, weights: number[]): number[] {
	const raw = weights.map((weight) => weight * total)
	const base = raw.map((value) => Math.floor(value))
	let remainder = total - base.reduce((sum, value) => sum + value, 0)
	const order = raw
		.map((value, idx) => ({ idx, remainder: value - base[idx] }))
		.sort((a, b) => b.remainder - a.remainder)
	for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
		base[order[i].idx] += 1
	}
	return base
}

function spreadBucketSizes(
	budget: number,
	minSize: number,
	maxSize: number,
	count: number,
): number[] {
	if (count <= 1) return [Math.max(minSize, Math.min(maxSize, budget))]
	const sizes: number[] = new Array(count)
	const span = maxSize - minSize
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1)
		sizes[i] = Math.round(minSize + span * t)
	}
	let remaining = budget - sizes.reduce((sum, value) => sum + value, 0)
	while (remaining !== 0) {
		let changed = false
		if (remaining > 0) {
			const order = Array.from({ length: count }, (_, idx) => idx).sort(
				(a, b) => sizes[a] - sizes[b] || a - b,
			)
			for (let i = 0; i < order.length && remaining > 0; i++) {
				const idx = order[i]
				if (sizes[idx] >= maxSize) continue
				sizes[idx]++
				remaining--
				changed = true
			}
		} else {
			const order = Array.from({ length: count }, (_, idx) => idx).sort(
				(a, b) => sizes[b] - sizes[a] || a - b,
			)
			for (let i = 0; i < order.length && remaining < 0; i++) {
				const idx = order[i]
				if (sizes[idx] <= minSize) continue
				sizes[idx]--
				remaining++
				changed = true
			}
		}
		if (!changed) break
	}
	return sizes
}

/** Same shape as society/nations' buildNationPlan: converts the bucket
 * percentages into a budget of systems per size tier, then spreads each
 * tier's budget across a count of nations sized within that tier's range. */
function buildNationTargets(total: number): number[] {
	const percentages = normalize(NATION_PERCENTAGES)
	const budgets = integerMass(total, percentages)
	const targets: number[] = []
	for (let i = 0; i < budgets.length; i++) {
		const budget = budgets[i]
		if (budget <= 0) continue
		const [minSize, maxSize] = NATION_BUCKETS[i]
		if (budget <= minSize) {
			targets.push(budget)
			continue
		}
		const avg = (minSize + maxSize) / 2
		const minCount = Math.max(1, Math.ceil(budget / maxSize))
		const maxCount = Math.max(1, Math.floor(budget / minSize))
		const count = Math.max(
			minCount,
			Math.min(maxCount, Math.round(budget / avg)),
		)
		for (const size of spreadBucketSizes(budget, minSize, maxSize, count)) {
			targets.push(size)
		}
	}
	return targets.sort((a, b) => b - a)
}

function hash01(n: number): number {
	const s = Math.sin(n * 12.9898) * 43758.5453
	return s - Math.floor(s)
}

function distance2D(a: number, b: number, r_xy: Float32Array): number {
	const dx = r_xy[2 * a]! - r_xy[2 * b]!
	const dy = r_xy[2 * a + 1]! - r_xy[2 * b + 1]!
	return Math.hypot(dx, dy)
}

function buildOpenComponents({
	numSystems,
	active,
	assignment,
	adjOffset,
	adjList,
}: {
	numSystems: number
	active: Uint8Array
	assignment: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
}): { componentId: Int32Array; sizes: number[] } {
	const componentId = new Int32Array(numSystems).fill(-1)
	const sizes: number[] = []
	for (let start = 0; start < numSystems; start++) {
		if (!active[start] || assignment[start] >= 0 || componentId[start] >= 0)
			continue
		const cid = sizes.length
		let size = 0
		const queue = [start]
		componentId[start] = cid
		let head = 0
		while (head < queue.length) {
			const curr = queue[head++]
			size++
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!active[nb] || assignment[nb] >= 0 || componentId[nb] >= 0) continue
				componentId[nb] = cid
				queue.push(nb)
			}
		}
		sizes.push(size)
	}
	return { componentId, sizes }
}

function selectSeed({
	numSystems,
	target,
	active,
	assignment,
	componentId,
	componentSizes,
	adjOffset,
	adjList,
	rng,
}: {
	numSystems: number
	target: number
	active: Uint8Array
	assignment: Int32Array
	componentId: Int32Array
	componentSizes: number[]
	adjOffset: Int32Array
	adjList: Int32Array
	rng: ReturnType<typeof RNG.createRng>
}): number {
	let best = -1
	let bestScore = -Infinity
	let fallback = -1
	let fallbackScore = -Infinity
	for (let s = 0; s < numSystems; s++) {
		if (!active[s] || assignment[s] >= 0) continue
		const cid = componentId[s]
		const componentSize = cid >= 0 ? componentSizes[cid] : 0
		if (componentSize <= 0) continue
		let openNeighbors = 0
		for (let j = adjOffset[s], jEnd = adjOffset[s + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (active[nb] && assignment[nb] < 0) openNeighbors++
		}
		const expansion =
			1 + Math.min(openNeighbors, Math.max(1, Math.round(Math.sqrt(target))))
		const sizeFactor = Math.min(componentSize, target) / Math.max(1, target)
		const score = expansion + sizeFactor + rng.random() * 0.5
		if (componentSize >= target && score > bestScore) {
			bestScore = score
			best = s
		}
		if (score > fallbackScore) {
			fallbackScore = score
			fallback = s
		}
	}
	return best >= 0 ? best : fallback
}

function bestClaim({
	nation,
	seedSystem,
	frontier,
	active,
	assignment,
	r_xy,
	adjOffset,
	adjList,
}: {
	nation: number
	seedSystem: number
	frontier: Set<number>
	active: Uint8Array
	assignment: Int32Array
	r_xy: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
}): number {
	let best = -1
	let bestScore = -Infinity
	for (const candidate of frontier) {
		if (!active[candidate] || assignment[candidate] >= 0) {
			frontier.delete(candidate)
			continue
		}
		let sharedBorder = 0
		for (
			let j = adjOffset[candidate], jEnd = adjOffset[candidate + 1];
			j < jEnd;
			j++
		) {
			if (assignment[adjList[j]] === nation) sharedBorder++
		}
		const d = distance2D(seedSystem, candidate, r_xy)
		const noise = hash01(candidate * 7.13 + nation * 91.7)
		const score = (1 / (d + 1)) * (1 + 0.4 * noise) + sharedBorder * 0.08
		if (score > bestScore) {
			bestScore = score
			best = candidate
		}
	}
	return best
}

function addNeighborsToFrontier(
	system: number,
	frontier: Set<number>,
	active: Uint8Array,
	assignment: Int32Array,
	adjOffset: Int32Array,
	adjList: Int32Array,
) {
	for (let j = adjOffset[system], jEnd = adjOffset[system + 1]; j < jEnd; j++) {
		const nb = adjList[j]
		if (active[nb] && assignment[nb] < 0) frontier.add(nb)
	}
}

function compactZeroSizeNations(
	seeds: number[],
	sizes: number[],
	assignment: Int32Array,
): void {
	const remap = new Int32Array(seeds.length).fill(-1)
	const newSeeds: number[] = []
	const newSizes: number[] = []
	for (let i = 0; i < seeds.length; i++) {
		if (sizes[i] <= 0) continue
		remap[i] = newSeeds.length
		newSeeds.push(seeds[i])
		newSizes.push(sizes[i])
	}
	if (newSeeds.length === seeds.length) return
	for (let s = 0; s < assignment.length; s++) {
		if (assignment[s] >= 0) assignment[s] = remap[assignment[s]]
	}
	seeds.length = 0
	seeds.push(...newSeeds)
	sizes.length = 0
	sizes.push(...newSizes)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
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

function buildNationColors(count: number, seed: number): Float32Array {
	const colors = new Float32Array(count * 3)
	const rng = RNG.createRng({ seed: seed ^ 0x5bd1e995 })
	const goldenRatio = 0.618033988749895
	let hue = rng.random()
	for (let i = 0; i < count; i++) {
		hue = (hue + goldenRatio) % 1
		const sat = 0.55 + rng.random() * 0.3
		const lit = 0.5 + rng.random() * 0.18
		const [r, g, b] = hslToRgb(hue * 360, sat, lit)
		colors[3 * i] = r
		colors[3 * i + 1] = g
		colors[3 * i + 2] = b
	}
	return colors
}

function emptyResult(numSystems: number): GalaxyNations {
	return {
		assignment: new Int32Array(numSystems).fill(-1),
		seeds: new Int32Array(0),
		size: new Int32Array(0),
		colors: new Float32Array(0),
		count: 0,
	}
}

/**
 * Partitions every non-edge system in a generated galaxy into nations, via
 * the same percentage-bucket/flood-fill shape as society/nations' province
 * partition (see this file's own bucket comment), but over the galaxy's
 * hyperlane graph (GalaxyTopology.laneAdjOffset/laneAdjList, passed in as
 * adjOffset/adjList) so realms grow along travel routes, plus r_xy
 * distance instead of provinces' spherical habitability-weighted claim
 * scoring -- there's no equivalent habitability/water/continent signal at
 * the galaxy scale, so claims are driven by proximity + shared-border
 * cohesion + a deterministic per-candidate hash (in place of the province
 * partition's simplex noise) instead.
 */
function build({
	numSystems,
	r_edge,
	r_xy,
	adjOffset,
	adjList,
	seed,
}: BuildGalaxyNationsParams): GalaxyNations {
	const active = new Uint8Array(numSystems)
	let activeCount = 0
	for (let s = 0; s < numSystems; s++) {
		if (r_edge[s]) continue
		active[s] = 1
		activeCount++
	}
	if (activeCount === 0) return emptyResult(numSystems)

	const rng = RNG.createRng({ seed: seed ^ 0xdeadbeef })
	const targets = buildNationTargets(activeCount)
	const assignment = new Int32Array(numSystems).fill(-1)
	const seeds: number[] = []
	const sizes: number[] = []

	for (const target of targets) {
		const components = buildOpenComponents({
			numSystems,
			active,
			assignment,
			adjOffset,
			adjList,
		})
		const seedSystem = selectSeed({
			numSystems,
			target,
			active,
			assignment,
			componentId: components.componentId,
			componentSizes: components.sizes,
			adjOffset,
			adjList,
			rng,
		})
		if (seedSystem < 0) continue

		const nation = seeds.length
		seeds.push(seedSystem)
		sizes.push(1)
		assignment[seedSystem] = nation

		const frontier = new Set<number>()
		addNeighborsToFrontier(
			seedSystem,
			frontier,
			active,
			assignment,
			adjOffset,
			adjList,
		)
		while (sizes[nation] < target) {
			const claim = bestClaim({
				nation,
				seedSystem,
				frontier,
				active,
				assignment,
				r_xy,
				adjOffset,
				adjList,
			})
			if (claim < 0) break
			assignment[claim] = nation
			sizes[nation]++
			frontier.delete(claim)
			addNeighborsToFrontier(
				claim,
				frontier,
				active,
				assignment,
				adjOffset,
				adjList,
			)
		}
	}

	// Every real system must end up claimed (see this module's own doc
	// comment) -- any active system the bucket targets above didn't reach
	// (small leftover pockets between claimed territories) is folded into
	// whichever neighboring nation borders it most, or seeds its own
	// single/multi-system nation if it borders none.
	let assignedCount = 0
	for (let s = 0; s < numSystems; s++) if (assignment[s] >= 0) assignedCount++
	if (assignedCount < activeCount) {
		const components = buildOpenComponents({
			numSystems,
			active,
			assignment,
			adjOffset,
			adjList,
		})
		const componentMembers: number[][] = Array.from(
			{ length: components.sizes.length },
			(): number[] => [],
		)
		for (let s = 0; s < numSystems; s++) {
			const cid = components.componentId[s]
			if (cid >= 0) componentMembers[cid].push(s)
		}
		for (const members of componentMembers) {
			if (members.length === 0) continue
			const borderCounts = new Map<number, number>()
			for (const system of members) {
				for (
					let j = adjOffset[system], jEnd = adjOffset[system + 1];
					j < jEnd;
					j++
				) {
					const nation = assignment[adjList[j]]
					if (nation < 0) continue
					borderCounts.set(nation, (borderCounts.get(nation) ?? 0) + 1)
				}
			}
			let bestNation = -1
			let bestCount = -1
			for (const [nation, count] of borderCounts) {
				if (count > bestCount) {
					bestCount = count
					bestNation = nation
				}
			}
			if (bestNation >= 0) {
				for (const system of members) assignment[system] = bestNation
				sizes[bestNation] += members.length
				continue
			}
			const nation = seeds.length
			seeds.push(members[0])
			sizes.push(members.length)
			for (const system of members) assignment[system] = nation
		}
	}

	compactZeroSizeNations(seeds, sizes, assignment)
	const colors = buildNationColors(seeds.length, seed)

	return {
		assignment,
		seeds: Int32Array.from(seeds),
		size: Int32Array.from(sizes),
		colors,
		count: seeds.length,
	}
}

export const GALAXY_NATIONS = { build }
