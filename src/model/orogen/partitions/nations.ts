import type { OrogenPartition, OrogenProvinces } from "../types"
import { generatePartitionColorsWithSeed } from "./shared"

const NATION_PERCENTAGES = normalize([0.025, 0.05, 0.1, 0.2, 0.3, 0.4])
const NATION_BUCKETS: [number, number][] = [
	[50, 100],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]
const COASTAL = 5

export function computeNations(params: {
	provinces: OrogenProvinces
	topography: Uint8Array
	r_xyz: Float32Array
	seed: number
}): OrogenPartition {
	const { provinces, topography, r_xyz, seed } = params
	const provinceCount = provinces.count
	if (provinceCount === 0) return emptyPartition(provinceCount)

	const active = new Uint8Array(provinceCount)
	const coastalScore = new Float32Array(provinceCount)
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		if (provinces.desolate[p]) continue
		active[p] = 1
		activeCount++
		coastalScore[p] = topography[provinces.seeds[p]] === COASTAL ? 2 : 1
	}
	if (activeCount === 0) return emptyPartition(provinceCount)

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
			let j = provinces.adjOffset[seedProvince], jEnd = provinces.adjOffset[seedProvince + 1];
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
					let j = provinces.adjOffset[province], jEnd = provinces.adjOffset[province + 1];
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

	return {
		assignment,
		seeds: new Int32Array(seeds),
		count: nationCount,
		adjOffset,
		adjList,
		size,
		colors: generatePartitionColorsWithSeed(nationCount, seed + 5201),
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

function buildNationPlan(total: number): {
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
		const count = Math.max(minCount, Math.min(maxCount, Math.round(budget / avg)))
		targetNationCount[i] = count
		const sizes = new Int32Array(count).fill(minSize)
		let remaining = budget - count * minSize
		let cursor = 0
		while (remaining > 0) {
			const idx = cursor % count
			if (sizes[idx] < maxSize) {
				sizes[idx]++
				remaining--
			}
			cursor++
		}
		for (let j = 0; j < count; j++) targets.push(sizes[j])
	}
	return {
		targetProvinceMass: budgets,
		targetNationCount,
		targets: targets.sort((a, b) => b - a),
	}
}

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
): number {
	let best = -1
	let bestScore = -Infinity
	for (const candidate of frontier) {
		if (!active[candidate] || assignment[candidate] >= 0) {
			frontier.delete(candidate)
			continue
		}
		let sharedBorder = 0
		for (let j = adjOffset[candidate], jEnd = adjOffset[candidate + 1]; j < jEnd; j++) {
			if (assignment[adjList[j]] === nation) sharedBorder++
		}
		const seedPenalty = candidate === seedProvince ? -1e6 : 0
		const d = provinceSeedDistance(seedProvince, candidate, provinceSeeds, r_xyz)
		const score = (1 / (d + 0.1)) * coastalScore[candidate] + sharedBorder * 0.05 + seedPenalty
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
	for (let j = adjOffset[province], jEnd = adjOffset[province + 1]; j < jEnd; j++) {
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
		const expansion = 1 + Math.min(openNeighbors, Math.max(1, Math.round(Math.sqrt(target))))
		const sizeFactor = Math.min(componentSize, target) / Math.max(1, target)
		const score = coastalScore[p] * blockedPenalty * expansion * (1 + sizeFactor)
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
		if (!active[start] || assignment[start] >= 0 || componentId[start] >= 0) continue
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

function emptyPartition(nodeCount: number): OrogenPartition {
	return {
		assignment: new Int32Array(nodeCount).fill(-1),
		seeds: new Int32Array(0),
		count: 0,
		adjOffset: new Int32Array(1),
		adjList: new Int32Array(0),
		size: new Int32Array(0),
		colors: new Float32Array(0),
	}
}
