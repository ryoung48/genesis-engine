import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import { buildIdentitySeeds } from "../shared/identity-seeds"
import { SimplexNoise } from "../shared/simplex-noise"
import { DEFAULT_PLANET_RADIUS_KM } from "../shared/units"
import {
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
	fanoutRangesForSize,
	HEGEMON_FANOUT,
	rebalanceHierarchy,
} from "./hierarchy"

// Hard cap on how far a nation can spread from its capital, in km.
export const MAX_NATION_SPREAD_KM = 2000

// Province-mass weights per bucket — calibrated to CK3 1066.9.15 all-county-titles
// distribution, with ~4% carved from the empire bucket for hegemons.
const NATION_PERCENTAGES = normalize([
	0.04, 0.4154, 0.072, 0.102, 0.0746, 0.0786, 0.2174,
])
export const NATION_BUCKETS: [number, number][] = [
	[251, 600],
	[50, 250],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]
export function computeNations(params: {
	provinces: OrogenProvinces
	coastal: Uint8Array
	habitability: Float32Array
	r_xyz: Float32Array
	seed: number
	planetRadiusKm?: number
}): OrogenNationHierarchy {
	const { provinces, coastal, habitability, r_xyz } = params
	const maxSpreadRad =
		MAX_NATION_SPREAD_KM / (params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM)
	const provinceCount = provinces.count
	if (provinceCount === 0) return emptyPartition(provinceCount)

	const active = new Uint8Array(provinceCount)
	const coastalScore = new Float32Array(provinceCount)
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		if (provinces.desolate[p]) continue
		active[p] = 1
		activeCount++
		coastalScore[p] = coastal[provinces.seeds[p]] ? 2 : 1
	}
	if (activeCount === 0) return emptyPartition(provinceCount)

	const noise = new SimplexNoise(params.seed ^ 0xdeadbeef)
	const plan = buildNationPlan(activeCount)
	const assignment = new Int32Array(provinceCount).fill(-1)
	const blocked = new Uint8Array(provinceCount)
	const seeds: number[] = []
	const sizes: number[] = []
	let assigned = 0

	for (let targetIdx = 0; targetIdx < plan.targets.length; targetIdx++) {
		const target = plan.targets[targetIdx]
		const components = buildOpenComponents(
			active,
			assignment,
			provinces.adjOffset,
			provinces.adjList,
		)
		const seedProvince = selectSeed(
			target,
			active,
			assignment,
			blocked,
			coastalScore,
			components.componentId,
			components.sizes,
			provinces.adjOffset,
			provinces.adjList,
		)
		if (seedProvince < 0) continue

		const nation = seeds.length
		seeds.push(seedProvince)
		sizes.push(1)
		assignment[seedProvince] = nation
		assigned++

		const frontier = new Set<number>()
		for (
			let j = provinces.adjOffset[seedProvince],
				jEnd = provinces.adjOffset[seedProvince + 1];
			j < jEnd;
			j++
		) {
			const nb = provinces.adjList[j]
			if (active[nb] && assignment[nb] < 0) frontier.add(nb)
		}

		while (sizes[nation] < target) {
			const claim = bestClaim(
				nation,
				seedProvince,
				frontier,
				active,
				assignment,
				coastalScore,
				r_xyz,
				provinces.seeds,
				provinces.adjOffset,
				provinces.adjList,
				noise,
				maxSpreadRad,
			)
			if (claim < 0) break
			claimProvinceDynamic(
				nation,
				claim,
				active,
				assignment,
				sizes,
				frontier,
				provinces.adjOffset,
				provinces.adjList,
			)
			assigned++
		}

		const blockHops = Math.max(1, Math.round(Math.sqrt(target) * 0.5))
		markBlocked(
			seedProvince,
			blockHops,
			active,
			blocked,
			provinces.adjOffset,
			provinces.adjList,
		)
	}

	if (assigned < activeCount) {
		const components = buildOpenComponents(
			active,
			assignment,
			provinces.adjOffset,
			provinces.adjList,
		)
		const componentMembers: number[][] = new Array(components.sizes.length)
		for (let i = 0; i < componentMembers.length; i++) componentMembers[i] = []
		for (let p = 0; p < provinceCount; p++) {
			const cid = components.componentId[p]
			if (cid >= 0) componentMembers[cid].push(p)
		}

		for (let cid = 0; cid < componentMembers.length; cid++) {
			const members = componentMembers[cid]
			if (members.length === 0) continue

			let bestNation = -1
			let bestScore = -Infinity
			for (let i = 0; i < members.length; i++) {
				const province = members[i]
				for (
					let j = provinces.adjOffset[province],
						jEnd = provinces.adjOffset[province + 1];
					j < jEnd;
					j++
				) {
					const nation = assignment[provinces.adjList[j]]
					if (nation < 0) continue
					const score = coastalScore[province] - sizes[nation] * 0.02
					if (score > bestScore) {
						bestScore = score
						bestNation = nation
					}
				}
			}

			if (bestNation >= 0) {
				for (let i = 0; i < members.length; i++) {
					assignment[members[i]] = bestNation
				}
				sizes[bestNation] += members.length
				assigned += members.length
				continue
			}

			const nation = seeds.length
			let seedProvince = members[0]
			let seedScore = coastalScore[seedProvince]
			for (let i = 1; i < members.length; i++) {
				const province = members[i]
				if (coastalScore[province] > seedScore) {
					seedProvince = province
					seedScore = coastalScore[province]
				}
			}
			seeds.push(seedProvince)
			sizes.push(members.length)
			for (let i = 0; i < members.length; i++) {
				assignment[members[i]] = nation
			}
			assigned += members.length
		}
	}

	const nationCount = seeds.length
	const size = Int32Array.from(sizes)

	const adjSets: Set<number>[] = new Array(nationCount)
	for (let i = 0; i < nationCount; i++) adjSets[i] = new Set()
	for (let p = 0; p < provinceCount; p++) {
		const n1 = assignment[p]
		if (n1 < 0) continue
		for (
			let j = provinces.adjOffset[p], jEnd = provinces.adjOffset[p + 1];
			j < jEnd;
			j++
		) {
			const n2 = assignment[provinces.adjList[j]]
			if (n2 >= 0 && n2 !== n1) adjSets[n1].add(n2)
		}
	}

	const adjOffset = new Int32Array(nationCount + 1)
	let totalAdj = 0
	for (let i = 0; i < nationCount; i++) {
		totalAdj += adjSets[i].size
		adjOffset[i + 1] = totalAdj
	}
	const adjList = new Int32Array(totalAdj)
	for (let i = 0; i < nationCount; i++) {
		let wi = adjOffset[i]
		for (const nb of adjSets[i]) adjList[wi++] = nb
	}

	printNationDistribution({
		actualSizes: size,
		targetProvinceMass: plan.targetProvinceMass,
		targetNationCount: plan.targetNationCount,
	})

	const nationMembers = groupByNation(assignment, nationCount, provinceCount)
	const parent = new Int32Array(provinceCount).fill(-1)
	const depth = new Int32Array(provinceCount)
	const urbanPop = new Float32Array(provinceCount)
	for (let nation = 0; nation < nationCount; nation++) {
		const members = nationMembers[nation]
		const capital = seeds[nation]
		const subjects = members.filter((province) => province !== capital)
		if (subjects.length === 0) continue
		rebalanceHierarchy({
			capital,
			members: Int32Array.from(subjects),
			parent,
			depth,
			currentDepth: 0,
			fanoutRanges: fanoutRangesForSize(sizes[nation]),
			habitability,
			urbanPop,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
			provinceCount,
		})
	}

	const { childOffset, childList } = buildChildrenCSR(parent, provinceCount)
	const sovereign = buildSovereign(parent, provinceCount)
	for (let p = 0; p < provinceCount; p++) {
		if (assignment[p] < 0) sovereign[p] = -1
	}
	const gravity = computeGravity({
		habitability,
		childOffset,
		childList,
		depth,
		provinceCount,
		fanoutRanges: HEGEMON_FANOUT,
	})

	return {
		assignment,
		seeds: new Int32Array(seeds),
		languageSeeds: new Int32Array(0),
		nameSeeds: buildIdentitySeeds(nationCount, params.seed + 4103),
		count: nationCount,
		adjOffset,
		adjList,
		size,
		colors: nationColorsFromProvinces(nationCount, seeds, provinces.colors),
		parent,
		depth,
		childOffset,
		childList,
		sovereign,
		gravity,
	}
}

function printNationDistribution(params: {
	actualSizes: Int32Array
	targetProvinceMass: number[]
	targetNationCount: number[]
}) {
	const { actualSizes, targetProvinceMass, targetNationCount } = params
	const totalProvinceMass = actualSizes.reduce((sum, value) => sum + value, 0)
	const rows = NATION_BUCKETS.map(([min, max], idx) => {
		let nationCount = 0
		let provinceMass = 0
		for (let i = 0; i < actualSizes.length; i++) {
			const size = actualSizes[i]
			if (size >= min && size <= max) {
				nationCount++
				provinceMass += size
			}
		}
		return {
			bucket: `${min}-${max}`,
			targetProvinceMass: targetProvinceMass[idx] ?? 0,
			actualProvinceMass: provinceMass,
			actualProvincePct: `${((provinceMass / Math.max(1, totalProvinceMass)) * 100).toFixed(1)}%`,
			targetNationCount: targetNationCount[idx] ?? 0,
			actualNationCount: nationCount,
		}
	})

	console.table(rows)
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

export function buildNationPlan(total: number): {
	targetProvinceMass: number[]
	targetNationCount: number[]
	targets: number[]
} {
	const budgets = integerMass(total, NATION_PERCENTAGES)
	const targetNationCount = new Array<number>(NATION_BUCKETS.length).fill(0)
	const targets: number[] = []
	for (let i = 0; i < budgets.length; i++) {
		const budget = budgets[i]
		if (budget <= 0) continue
		const [minSize, maxSize] = NATION_BUCKETS[i]
		if (budget <= minSize) {
			targets.push(budget)
			targetNationCount[i] = 1
			continue
		}
		const avg = (minSize + maxSize) / 2
		const minCount = Math.max(1, Math.ceil(budget / maxSize))
		const maxCount = Math.max(1, Math.floor(budget / minSize))
		const count = Math.max(
			minCount,
			Math.min(maxCount, Math.round(budget / avg)),
		)
		targetNationCount[i] = count
		const sizes = spreadBucketSizes(budget, minSize, maxSize, count)
		for (let j = 0; j < count; j++) targets.push(sizes[j])
	}
	return {
		targetProvinceMass: budgets,
		targetNationCount,
		targets: targets.sort((a, b) => b - a),
	}
}

function spreadBucketSizes(
	budget: number,
	minSize: number,
	maxSize: number,
	count: number,
): Int32Array {
	if (count <= 1)
		return new Int32Array([Math.max(minSize, Math.min(maxSize, budget))])

	const sizes = new Int32Array(count)
	const span = maxSize - minSize
	for (let i = 0; i < count; i++) {
		const t = count === 1 ? 0.5 : i / (count - 1)
		sizes[i] = Math.round(minSize + span * t)
	}

	let remaining = budget - sizes.reduce((sum, value) => sum + value, 0)
	while (remaining !== 0) {
		let changed = false
		if (remaining > 0) {
			const order = Array.from({ length: count }, (_, idx) => idx).sort(
				(a, b) => {
					if (sizes[a] !== sizes[b]) return sizes[a] - sizes[b]
					return a - b
				},
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
				(a, b) => {
					if (sizes[a] !== sizes[b]) return sizes[b] - sizes[a]
					return a - b
				},
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

// Noise frequency on the unit sphere: ~4 rad⁻¹ gives features ~45° wide,
// broad enough to produce coherent irregular lobes rather than pixel noise.
const NOISE_FREQ = 4.0
// Fraction of the distance score that noise can shift up or down.
const NOISE_STRENGTH = 0.4
// Small additive bonus for claiming coastal provinces. Kept additive (not
// multiplicative) so that the 1/(d+0.1) distance gradient always dominates —
// preventing empires from snaking along coastlines across entire continents.
const COASTAL_CLAIM_BONUS = 0.15

function bestClaim(
	nation: number,
	seedProvince: number,
	frontier: Set<number>,
	active: Uint8Array,
	assignment: Int32Array,
	coastalScore: Float32Array,
	r_xyz: Float32Array,
	provinceSeeds: Int32Array,
	adjOffset: Int32Array,
	adjList: Int32Array,
	noise: SimplexNoise,
	maxSpreadRad: number,
): number {
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
		const seedPenalty = candidate === seedProvince ? -1e6 : 0
		const d = provinceSeedDistance(
			seedProvince,
			candidate,
			provinceSeeds,
			r_xyz,
		)
		if (d > maxSpreadRad) continue
		const s = provinceSeeds[candidate]
		const nx = r_xyz[3 * s] * NOISE_FREQ
		const ny = r_xyz[3 * s + 1] * NOISE_FREQ
		const nz = r_xyz[3 * s + 2] * NOISE_FREQ
		const noiseVal = noise.noise3D(nx, ny, nz)
		const score =
			(1 / (d + 0.1)) * (1 + NOISE_STRENGTH * noiseVal) +
			(coastalScore[candidate] - 1) * COASTAL_CLAIM_BONUS +
			sharedBorder * 0.05 +
			seedPenalty
		if (score > bestScore) {
			bestScore = score
			best = candidate
		}
	}
	return best
}

function claimProvinceDynamic(
	nation: number,
	province: number,
	active: Uint8Array,
	assignment: Int32Array,
	sizes: number[],
	frontier: Set<number>,
	adjOffset: Int32Array,
	adjList: Int32Array,
) {
	assignment[province] = nation
	sizes[nation]++
	frontier.delete(province)
	for (
		let j = adjOffset[province], jEnd = adjOffset[province + 1];
		j < jEnd;
		j++
	) {
		const nb = adjList[j]
		if (active[nb] && assignment[nb] < 0) frontier.add(nb)
	}
}

function selectSeed(
	target: number,
	active: Uint8Array,
	assignment: Int32Array,
	blocked: Uint8Array,
	coastalScore: Float32Array,
	componentId: Int32Array,
	componentSizes: number[],
	adjOffset: Int32Array,
	adjList: Int32Array,
): number {
	let best = -1
	let bestScore = -Infinity
	let fallback = -1
	let fallbackScore = -Infinity
	for (let p = 0; p < assignment.length; p++) {
		if (!active[p] || assignment[p] >= 0) continue
		const cid = componentId[p]
		const componentSize = cid >= 0 ? componentSizes[cid] : 0
		if (componentSize <= 0) continue
		const blockedPenalty = blocked[p] ? 0.35 : 1
		let openNeighbors = 0
		for (let j = adjOffset[p], jEnd = adjOffset[p + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (active[nb] && assignment[nb] < 0) openNeighbors++
		}
		const expansion =
			1 + Math.min(openNeighbors, Math.max(1, Math.round(Math.sqrt(target))))
		const sizeFactor = Math.min(componentSize, target) / Math.max(1, target)
		const score =
			coastalScore[p] * blockedPenalty * expansion * (1 + sizeFactor)
		if (componentSize >= target && score > bestScore) {
			bestScore = score
			best = p
		}
		if (score > fallbackScore) {
			fallbackScore = score
			fallback = p
		}
	}
	return best >= 0 ? best : fallback
}

function provinceSeedDistance(
	aProvince: number,
	bProvince: number,
	provinceSeeds: Int32Array,
	r_xyz: Float32Array,
): number {
	const a = provinceSeeds[aProvince]
	const b = provinceSeeds[bProvince]
	const ax = r_xyz[3 * a]
	const ay = r_xyz[3 * a + 1]
	const az = r_xyz[3 * a + 2]
	const bx = r_xyz[3 * b]
	const by = r_xyz[3 * b + 1]
	const bz = r_xyz[3 * b + 2]
	const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))
	return Math.acos(dot)
}

function buildOpenComponents(
	active: Uint8Array,
	assignment: Int32Array,
	adjOffset: Int32Array,
	adjList: Int32Array,
): {
	componentId: Int32Array
	sizes: number[]
} {
	const componentId = new Int32Array(assignment.length).fill(-1)
	const sizes: number[] = []
	for (let start = 0; start < assignment.length; start++) {
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

function markBlocked(
	start: number,
	hops: number,
	active: Uint8Array,
	blocked: Uint8Array,
	adjOffset: Int32Array,
	adjList: Int32Array,
) {
	const queue = [start]
	const dist = new Int32Array(blocked.length).fill(-1)
	dist[start] = 0
	blocked[start] = 1
	let head = 0
	while (head < queue.length) {
		const curr = queue[head++]
		if (dist[curr] >= hops) continue
		for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!active[nb] || dist[nb] >= 0) continue
			dist[nb] = dist[curr] + 1
			blocked[nb] = 1
			queue.push(nb)
		}
	}
}

function normalize(values: number[]): number[] {
	const sum = values.reduce((acc, value) => acc + value, 0) || 1
	return values.map((value) => value / sum)
}

function groupByNation(
	assignment: Int32Array,
	nationCount: number,
	provinceCount: number,
): number[][] {
	const members: number[][] = new Array(nationCount)
	for (let i = 0; i < nationCount; i++) members[i] = []
	for (let province = 0; province < provinceCount; province++) {
		const nation = assignment[province]
		if (nation >= 0) members[nation].push(province)
	}
	return members
}

function nationColorsFromProvinces(
	nationCount: number,
	seeds: number[],
	provinceColors: Float32Array,
): Float32Array {
	const colors = new Float32Array(nationCount * 3)
	for (let n = 0; n < nationCount; n++) {
		const p = seeds[n]
		colors[3 * n] = provinceColors[3 * p]
		colors[3 * n + 1] = provinceColors[3 * p + 1]
		colors[3 * n + 2] = provinceColors[3 * p + 2]
	}
	return colors
}

function emptyPartition(nodeCount: number): OrogenNationHierarchy {
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
		parent: new Int32Array(nodeCount).fill(-1),
		depth: new Int32Array(nodeCount),
		childOffset: new Int32Array(nodeCount + 1),
		childList: new Int32Array(0),
		sovereign: new Int32Array(nodeCount).fill(-1),
		gravity: new Float32Array(nodeCount),
	}
}
