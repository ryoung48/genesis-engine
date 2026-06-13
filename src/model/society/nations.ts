import type { GenesisNationHierarchy, GenesisProvinces } from ".."
import { buildIdentitySeeds } from "../shared/identity-seeds"
import { SimplexNoise } from "../shared/simplex-noise"
import { DEFAULT_PLANET_RADIUS_KM } from "../shared/units"
import type { GovernmentMix } from "./eras"
import {
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
	fanoutRangesForSize,
	HEGEMON_FANOUT,
	rebalanceHierarchy,
} from "./hierarchy"
import { clamp01, hslToRgb, rgbToHsl } from "./shared"
import { computeProvinceWaterAccess, WATER_ACCESS_BONUS } from "./water-access"

// Hard cap on how far a nation can spread from its capital, in km.
export const MAX_NATION_SPREAD_KM = 2000

// Province-mass weights per bucket — calibrated to EU4 extended-timeline 1350 AD data.
// Each era overrides this via EraConfig.nationPercentages.
const NATION_PERCENTAGES = normalize([
	0.0, 0.11, 0.144, 0.194, 0.165, 0.251, 0.137,
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
	provinces: GenesisProvinces
	coastal: Uint8Array
	riverVisible: Uint8Array
	waterAccess?: Uint8Array
	provinceContinent?: Uint8Array
	habitability: Float32Array
	r_xyz: Float32Array
	seed: number
	planetRadiusKm?: number
	/** When provided, only provinces where eraActiveMask[p] === 1 are eligible for nations */
	eraActiveMask?: Uint8Array
	/** Era-specific nation budget percentages (must align with nationBuckets) */
	nationPercentages?: number[]
	/** Era-specific province-size ranges for nation buckets */
	nationBuckets?: [number, number][]
	/** Government type mix for this era */
	governmentMix?: GovernmentMix
	/**
	 * 0–1: how much nation size drives government type vs. era ideology.
	 * 1.0 = size prior dominates (ancient). 0.0 = era mix dominates (modern).
	 * Also scales spatial modifier strength.
	 */
	governmentSizeWeight?: number
	/**
	 * Per-province migration wave (0 = settlement cradle, 1 = frontier).
	 * Frontier nations skew tribal; core nations skew toward established states.
	 */
	migrationWave?: Float32Array
	/**
	 * Era statehood fraction (0–1). The frontier→tribal skew represents proximity
	 * to stateless societies; as statehood approaches 1.0 (no stateless land left,
	 * e.g. information age) the skew fades to zero.
	 */
	statehoodFraction?: number
}): GenesisNationHierarchy {
	const {
		provinces,
		coastal,
		riverVisible,
		waterAccess: providedWaterAccess,
		provinceContinent,
		habitability,
		r_xyz,
	} = params
	const maxSpreadRad =
		MAX_NATION_SPREAD_KM / (params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM)
	const provinceCount = provinces.count
	if (provinceCount === 0) return emptyPartition(provinceCount)

	const active = new Uint8Array(provinceCount)
	const waterAccess =
		providedWaterAccess ??
		computeProvinceWaterAccess(
			provinces,
			coastal,
			new Uint8Array(provinceCount),
			riverVisible,
		).waterAccess
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		if (provinces.desolate[p]) continue
		if (params.eraActiveMask && !params.eraActiveMask[p]) continue
		active[p] = 1
		activeCount++
	}
	if (activeCount === 0) return emptyPartition(provinceCount)

	const noise = new SimplexNoise(params.seed ^ 0xdeadbeef)
	const plan = buildNationPlan(
		activeCount,
		params.nationPercentages,
		params.nationBuckets,
	)
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
			habitability,
			waterAccess,
			provinceContinent,
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
				habitability,
				waterAccess,
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
					const score =
						nationPlacementScore(
							province,
							habitability,
							waterAccess,
							provinceContinent,
							members.length,
						) -
						sizes[nation] * 0.02
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
			let seedScore = nationPlacementScore(
				seedProvince,
				habitability,
				waterAccess,
				provinceContinent,
				members.length,
			)
			for (let i = 1; i < members.length; i++) {
				const province = members[i]
				const score = nationPlacementScore(
					province,
					habitability,
					waterAccess,
					provinceContinent,
					members.length,
				)
				if (score > seedScore) {
					seedProvince = province
					seedScore = score
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
		buckets: params.nationBuckets,
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
			waterAccess,
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

	// Per-province government type — indexed by province like leaderDynasty.
	// Assign one government per nation using size + spatial biases, then expand.
	const governmentType = new Uint8Array(provinceCount)
	const nationColonizer = new Int32Array(nationCount).fill(-1)
	if (params.governmentMix && nationCount > 0) {
		const sizeWeight = params.governmentSizeWeight ?? 0.55
		const statehoodFraction = params.statehoodFraction ?? 0.75
		const nationGovType = new Uint8Array(nationCount)
		for (let i = 0; i < nationCount; i++) {
			nationGovType[i] = assignGovernmentType(
				i,
				seeds[i],
				sizes[i],
				params.governmentMix,
				sizeWeight,
				habitability,
				waterAccess,
				params.migrationWave,
				statehoodFraction,
				params.seed,
			)
		}
		if ((params.governmentMix.colonial ?? 0) > 0) {
			assignColonialRelations({
				nationCount,
				nationGovType,
				nationColonizer,
				assignment,
				seeds,
				size,
				colonialFraction: params.governmentMix.colonial!,
				waterAccess,
				habitability,
				provinceSeeds: provinces.seeds,
				r_xyz,
				sizeWeight,
				maxSpreadRad,
			})
		}
		for (let p = 0; p < provinceCount; p++) {
			const n = assignment[p]
			if (n >= 0) governmentType[p] = nationGovType[n]
		}
	}

	return {
		assignment,
		seeds: new Int32Array(seeds),
		languageSeeds: new Int32Array(0),
		nameSeeds: buildIdentitySeeds(nationCount, params.seed + 4103),
		count: nationCount,
		adjOffset,
		adjList,
		size,
		colors: nationColorsFromProvinces({
			nationCount,
			seeds,
			provinceColors: provinces.colors,
			adjOffset,
			adjList,
		}),
		parent,
		depth,
		childOffset,
		childList,
		sovereign,
		gravity,
		governmentType,
		nationColonizer,
	}
}

function printNationDistribution(params: {
	actualSizes: Int32Array
	targetProvinceMass: number[]
	targetNationCount: number[]
	buckets?: [number, number][]
}) {
	const { actualSizes, targetProvinceMass, targetNationCount } = params
	const buckets = params.buckets ?? NATION_BUCKETS
	const totalProvinceMass = actualSizes.reduce((sum, value) => sum + value, 0)
	const rows = buckets.map(([min, max], idx) => {
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

export function buildNationPlan(
	total: number,
	nationPercentages?: number[],
	nationBuckets?: [number, number][],
): {
	targetProvinceMass: number[]
	targetNationCount: number[]
	targets: number[]
} {
	const percentages = nationPercentages ?? NATION_PERCENTAGES
	const buckets = nationBuckets ?? NATION_BUCKETS
	const budgets = integerMass(total, percentages)
	const targetNationCount = new Array<number>(buckets.length).fill(0)
	const targets: number[] = []
	for (let i = 0; i < budgets.length; i++) {
		const budget = budgets[i]
		if (budget <= 0) continue
		const [minSize, maxSize] = buckets[i]
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
const HABITABILITY_CLAIM_WEIGHT = 0.01
const WATER_CLAIM_WEIGHT = 0.02
const LARGE_NATION_CONTINENT_BONUS = 3.5
const LARGE_NATION_CONTINENT_MIN_TARGET = 10
const LARGE_NATION_CONTINENT_FULL_TARGET = 50

function nationPlacementScore(
	province: number,
	habitability: Float32Array<ArrayBufferLike>,
	waterAccess: Uint8Array<ArrayBufferLike>,
	provinceContinent: Uint8Array<ArrayBufferLike> | undefined,
	target: number,
): number {
	return (
		habitability[province] +
		waterAccess[province] * WATER_ACCESS_BONUS +
		continentPlacementBonus(province, provinceContinent, target)
	)
}

function continentPlacementBonus(
	province: number,
	provinceContinent: Uint8Array<ArrayBufferLike> | undefined,
	target: number,
): number {
	if (!provinceContinent?.[province]) return 0
	const sizeBias = clamp01(
		(target - LARGE_NATION_CONTINENT_MIN_TARGET) /
			(LARGE_NATION_CONTINENT_FULL_TARGET - LARGE_NATION_CONTINENT_MIN_TARGET),
	)
	return sizeBias * LARGE_NATION_CONTINENT_BONUS
}

function bestClaim(
	nation: number,
	seedProvince: number,
	frontier: Set<number>,
	active: Uint8Array,
	assignment: Int32Array,
	habitability: Float32Array,
	waterAccess: Uint8Array,
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
			habitability[candidate] * HABITABILITY_CLAIM_WEIGHT +
			waterAccess[candidate] * WATER_ACCESS_BONUS * WATER_CLAIM_WEIGHT +
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
	habitability: Float32Array,
	waterAccess: Uint8Array,
	provinceContinent: Uint8Array | undefined,
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
			nationPlacementScore(
				p,
				habitability,
				waterAccess,
				provinceContinent,
				target,
			) *
				blockedPenalty +
			expansion +
			sizeFactor
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

function assignColonialRelations(params: {
	nationCount: number
	nationGovType: Uint8Array
	nationColonizer: Int32Array
	assignment: Int32Array
	seeds: number[]
	size: Int32Array
	colonialFraction: number
	waterAccess: Uint8Array
	habitability: Float32Array
	provinceSeeds: Int32Array
	r_xyz: Float32Array
	sizeWeight: number
	/** Already-scaled nation spread limit (rad) — used as minimum colonial distance */
	maxSpreadRad: number
}): void {
	const {
		nationCount,
		nationGovType,
		nationColonizer,
		assignment,
		seeds,
		size,
		colonialFraction,
		waterAccess,
		habitability,
		provinceSeeds,
		r_xyz,
		sizeWeight,
		maxSpreadRad,
	} = params

	const totalMass = size.reduce((s, v) => s + v, 0)
	let budgetRemaining = Math.round(totalMass * colonialFraction)
	if (budgetRemaining <= 0) return

	// Precompute which nations own at least one ocean-coastal province.
	const nationHasOceanCoastal = new Array(nationCount).fill(false)
	for (let p = 0; p < provinceSeeds.length; p++) {
		const n = assignment[p]
		if (n >= 0 && waterAccess[p] >= 2) nationHasOceanCoastal[n] = true
	}

	// Score colonizer candidates: non-tribal, coastal, large enough.
	const colonizers: Array<{ nation: number }> = []
	for (let n = 0; n < nationCount; n++) {
		if (nationGovType[n] < 4) continue // tribal cannot colonize
		if (nationColonizer[n] >= 0) continue
		if (waterAccess[seeds[n]] < 2) continue // must be ocean-coastal
		if (size[n] < 8) continue
		colonizers.push({ nation: n })
	}
	if (colonizers.length === 0) return

	// Collect targets: any non-republic nation that owns an ocean-coastal province.
	// Nations that already qualify as colonizers (non-tribal, size≥8, coastal capital)
	// are excluded — they're the colonizing powers, not targets.
	const targets: Array<{
		nation: number
		capital: number
		hab: number
	}> = []
	for (let n = 0; n < nationCount; n++) {
		if (nationColonizer[n] >= 0) continue
		if (
			(nationGovType[n] >= 8 && nationGovType[n] <= 12) ||
			nationGovType[n] >= 17
		)
			continue // skip republic types & colonial
		if (nationGovType[n] >= 4 && size[n] >= 8 && waterAccess[seeds[n]] >= 2)
			continue // matches colonizer criteria — skip
		if (!nationHasOceanCoastal[n]) continue
		targets.push({ nation: n, capital: seeds[n], hab: habitability[seeds[n]] })
	}
	if (targets.length === 0) return

	// Deterministic shuffle so colony type/size isn't ordered by habitability.
	for (let i = targets.length - 1; i > 0; i--) {
		const h = ((i * 2654435761) ^ (targets[i].capital * 31337)) >>> 0
		const j = (h >>> 0) % (i + 1)
		;[targets[i], targets[j]] = [targets[j], targets[i]]
	}

	// Minimum colonial distance: beyond the colonizer's natural spread radius so that
	// truly adjacent tribal nations get absorbed rather than colonised. Scales with
	// planet size since maxSpreadRad is already planet-relative. The 1.5x multiplier
	// provides extra buffer against accidental adjacency.
	const minColonialDistRad = maxSpreadRad * 1.5

	for (const target of targets) {
		if (budgetRemaining <= 0) break

		let bestColonizer = -1
		let bestDist = Infinity
		for (const col of colonizers) {
			if (nationColonizer[col.nation] >= 0) continue
			const d = provinceSeedDistance(
				seeds[col.nation],
				target.capital,
				provinceSeeds,
				r_xyz,
			)
			if (d < minColonialDistRad) continue
			if (d < bestDist) {
				bestDist = d
				bestColonizer = col.nation
			}
		}
		if (bestColonizer < 0) continue

		nationColonizer[target.nation] = bestColonizer
		budgetRemaining -= size[target.nation]

		const h = ((target.capital * 2654435761) ^ (target.nation * 31337)) >>> 0
		const r = (h >>> 0) / 0xffffffff
		const settlerChance =
			sizeWeight < 0.4 ? 0.15 + 0.6 * Math.min(1, size[target.nation] / 30) : 0
		const isSettler = target.hab >= 0.5 && r < settlerChance
		nationGovType[target.nation] = isSettler ? 20 : 19
	}
}

// Size-based government prior: larger nations tend toward monarchy/theocracy,
// tiny nations toward tribal. Republics peak at city-state sizes (1-4).
// These are universal priors blended with the era mix.
const SIZE_GOV_PRIORS: Array<{
	maxSize: number
	tribal: number
	monarchy: number
	republic: number
	theocracy: number
}> = [
	{ maxSize: 1, tribal: 0.72, monarchy: 0.12, republic: 0.12, theocracy: 0.04 },
	{ maxSize: 4, tribal: 0.55, monarchy: 0.26, republic: 0.12, theocracy: 0.07 },
	{ maxSize: 9, tribal: 0.28, monarchy: 0.52, republic: 0.1, theocracy: 0.1 },
	{ maxSize: 24, tribal: 0.1, monarchy: 0.64, republic: 0.1, theocracy: 0.16 },
	{
		maxSize: 49,
		tribal: 0.03,
		monarchy: 0.72,
		republic: 0.08,
		theocracy: 0.17,
	},
	{
		maxSize: 99,
		tribal: 0.01,
		monarchy: 0.77,
		republic: 0.07,
		theocracy: 0.15,
	},
	{
		maxSize: Infinity,
		tribal: 0.0,
		monarchy: 0.82,
		republic: 0.08,
		theocracy: 0.1,
	},
]

function assignGovernmentType(
	nationIndex: number,
	capitalProvince: number,
	nationSize: number,
	eraMix: import("./eras").GovernmentMix,
	sizeWeight: number,
	habitability: Float32Array,
	waterAccess: Uint8Array,
	migrationWave: Float32Array | undefined,
	statehoodFraction: number,
	seed: number,
): number {
	// Look up size prior
	const prior =
		SIZE_GOV_PRIORS.find((p) => nationSize <= p.maxSize) ??
		SIZE_GOV_PRIORS[SIZE_GOV_PRIORS.length - 1]

	// Tribal governments require stateless social organization to draw from.
	// As statehood becomes universal (statehoodFraction → 1, e.g. information age)
	// there is no stateless land left, so the tendency toward tribal — both from
	// era ideology and from small size — fades to zero. Ramps over the final 30%.
	const statelessScale = Math.max(0, Math.min(1, (1 - statehoodFraction) / 0.3))
	// Premodern eras can still sustain frontier/tribal polities even at nominal
	// full state coverage. This decays with political modernity and reaches zero
	// in the information age.
	const residualFrontierScale = Math.max(
		0,
		Math.min(1, (sizeWeight - 0.15) / (0.55 - 0.15)),
	)
	const frontierCompensationScale = Math.sqrt(residualFrontierScale)
	const tribalSizeScale = Math.max(
		statelessScale,
		frontierCompensationScale * 0.6,
	)
	const frontierTribalScale = Math.max(
		statelessScale,
		frontierCompensationScale,
	)

	// Blend era mix with size prior using era-dependent weight.
	// sizeWeight=1: size alone drives gov (ancient). sizeWeight=0: era ideology alone.
	// The size prior's tribal share is reduced in late eras, but premodern worlds
	// still retain some small-polity tribal bias even after stateless land vanishes.
	const eraWeight = 1 - sizeWeight
	let tribal =
		eraMix.tribal * eraWeight + prior.tribal * sizeWeight * tribalSizeScale
	let monarchy = eraMix.monarchy * eraWeight + prior.monarchy * sizeWeight
	let republic = eraMix.republic * eraWeight + prior.republic * sizeWeight
	let theocracy = eraMix.theocracy * eraWeight + prior.theocracy * sizeWeight

	// High water access (coastal + river trade nodes) → boost republic.
	// Scaled by sizeWeight: matters less in modern eras where ideology drives gov.
	const water = waterAccess[capitalProvince] ?? 0
	if (water > 0) {
		const boost = Math.min(water, 2) * 0.08 * sizeWeight
		republic += boost
		tribal -= boost * 0.6
		monarchy -= boost * 0.4
	}

	// Low habitability → boost tribal.
	// Scaled by sizeWeight: geography matters less in modern eras.
	const hab = habitability[capitalProvince] ?? 0.5
	if (hab < 0.35) {
		const boost = (0.35 - hab) * 0.6 * sizeWeight
		tribal += boost
		monarchy -= boost * 0.55
		republic -= boost * 0.25
		theocracy -= boost * 0.2
	}

	// Migration wave: the closer a nation is to the settlement frontier, the more
	// tribal it should be. Premodern eras preserve this skew even after every
	// settled province belongs to a state; modern eras largely suppress it.
	const wave = migrationWave?.[capitalProvince] ?? -1
	if (wave >= 0) {
		const frontierBoost = wave * wave * 2.0 * frontierTribalScale
		tribal += frontierBoost
		monarchy -= frontierBoost * 0.5
		republic -= frontierBoost * 0.35
		theocracy -= frontierBoost * 0.15

		// Core pull: ancient settlement entrenches state institutions
		const coreBoost = (1 - wave) * (1 - wave) * 0.35
		monarchy += coreBoost * 0.55
		republic += coreBoost * 0.3
		theocracy += coreBoost * 0.15
		tribal -= coreBoost
	}

	// Clamp negatives and renormalize
	tribal = Math.max(0, tribal)
	monarchy = Math.max(0, monarchy)
	republic = Math.max(0, republic)
	theocracy = Math.max(0, theocracy)
	const total = tribal + monarchy + republic + theocracy || 1
	tribal /= total
	monarchy /= total
	republic /= total
	theocracy /= total

	// Deterministic draw from the blended distribution
	let h = ((seed + 7919) ^ (nationIndex * 2654435761)) >>> 0
	h ^= h >>> 16
	h = Math.imul(h, 0x45d9f3b)
	h ^= h >>> 16
	const r = (h >>> 0) / 0xffffffff

	let mainType: number
	if (r < tribal) mainType = 0
	else if (r < tribal + monarchy) mainType = 1
	else if (r < tribal + monarchy + republic) mainType = 2
	else mainType = 3

	// Second hash — independent seed for subtype draw
	let h2 = ((seed + 31337) ^ (nationIndex * 1234577)) >>> 0
	h2 ^= h2 >>> 16
	h2 = Math.imul(h2, 0x45d9f3b)
	h2 ^= h2 >>> 16
	const r2 = (h2 >>> 0) / 0xffffffff

	return refineGovernmentSubtype(
		mainType,
		nationSize,
		wave,
		hab,
		water,
		sizeWeight,
		r2,
	)
}

function refineGovernmentSubtype(
	mainType: number,
	size: number,
	wave: number,
	hab: number,
	water: number,
	sizeWeight: number,
	r: number,
): number {
	switch (mainType) {
		case 0: {
			// tribal → 0=chiefdom, 1=tribal monarchy, 2=tribal federation, 3=native council
			if (size >= 10) return r < 0.55 ? 2 : 1 // federation or tribal monarchy
			if (size >= 5) return 1 // tribal monarchy
			// frontier/harsh → mostly native council; core → mostly chiefdom
			return r < (wave > 0.35 || hab < 0.35 ? 0.35 : 0.7) ? 0 : 3
		}

		case 1: {
			// monarchy → 4=feudal, 5=elective, 6=absolute, 7=constitutional
			// Information era (sizeWeight ~0.15): constitutional dominant, a few
			// absolute holdouts (Gulf-style states).
			if (sizeWeight < 0.22) {
				if (size >= 12 && r < 0.3) return 6 // absolute holdout
				return 7 // constitutional
			}
			// Industrial era (~0.30): constitutional rises, absolute for medium+,
			// no surviving feudalism.
			if (sizeWeight < 0.4) {
				if (r < 0.55) return 7 // constitutional
				if (size >= 6) return 6 // absolute: medium+
				return 7
			}
			// Early modern (~0.45): age of absolutism; elective and feudal persist;
			// constitutional begins to emerge.
			if (sizeWeight < 0.55) {
				if (size >= 8 && r < 0.45) return 6 // absolute: medium+
				if (size >= 8 && r < 0.65) return 5 // elective: medium+ (Poland, HRE)
				if (r < 0.88) return 4 // feudal still widespread
				return 7 // early constitutional
			}
			// Ancient & medieval (>=0.55): feudal default; elective for medium+
			// kingdoms; absolute for large autocratic empires.
			if (size >= 20 && r < 0.65) return 6 // absolute: large empires
			if (size >= 5 && r < 0.75) return 5 // elective: medium+ kingdoms
			return 4 // feudal: default
		}

		case 2: {
			// republic → 8=merchant, 9=noble, 10=confederation, 11=presidential, 12=parliamentary, 17=socialist, 18=junta
			// Modern republics (industrial & information): four-way mix of
			// parliamentary, presidential, one-party socialist, and military junta.
			if (sizeWeight < 0.4) {
				if (size >= 20 && r < 0.35) return 17 // socialist: favoured for large one-party states
				if (r < 0.18) return 17 // socialist: minority elsewhere
				if (r < 0.36) return 18 // military junta
				if (r < 0.68) return 12 // parliamentary
				return 11 // presidential
			}
			// Pre-modern republics
			if (water >= 2 && size <= 10 && wave >= 0 && wave < 0.35) return 8 // merchant: coastal core
			if (water >= 1 && size <= 6 && wave >= 0 && wave < 0.3 && r < 0.55)
				return 8
			if (size >= 10 && r < 0.4) return 10 // confederation: medium chance
			if (size >= 8 && wave >= 0 && wave < 0.28) return 9 // noble or confederation
			return 8 // merchant: default
		}

		case 3: {
			// theocracy → 13=theocracy, 14=monastic state, 15=prince-bishopric, 16=imperial cult
			// Imperial cult: large, early modern and earlier only (no industrial/information)
			if (size >= 20 && sizeWeight >= 0.4) return r < 0.45 ? 16 : 13
			if (size >= 10) return 13 // theocracy: medium+
			if (water >= 1 && r < 0.55) return 14 // monastic: coastal small
			if (sizeWeight > 0.4 && r < 0.55) return 15 // prince-bishopric: medieval small
			return 13 // default theocracy
		}
	}
	return 0
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

function nationColorsFromProvinces(params: {
	nationCount: number
	seeds: number[]
	provinceColors: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
}): Float32Array {
	const { nationCount, seeds, provinceColors, adjOffset, adjList } = params
	const colors = new Float32Array(nationCount * 3)
	if (nationCount === 0) return colors

	const baseColors = new Array<[number, number, number]>(nationCount)
	for (let nation = 0; nation < nationCount; nation++) {
		const province = seeds[nation]
		baseColors[nation] = [
			provinceColors[3 * province],
			provinceColors[3 * province + 1],
			provinceColors[3 * province + 2],
		]
	}

	const order = Array.from({ length: nationCount }, (_, nation) => nation).sort(
		(a, b) => {
			const degreeDelta =
				adjOffset[b + 1] - adjOffset[b] - (adjOffset[a + 1] - adjOffset[a])
			if (degreeDelta !== 0) return degreeDelta
			return a - b
		},
	)
	const assigned = new Uint8Array(nationCount)

	for (const nation of order) {
		const candidates = buildNationColorCandidates(baseColors[nation])
		let bestColor = baseColors[nation]
		let bestScore = -Infinity
		for (const candidate of candidates) {
			let neighborPenalty = 0
			let minNeighborDistance = Infinity
			for (
				let edge = adjOffset[nation], end = adjOffset[nation + 1];
				edge < end;
				edge++
			) {
				const neighbor = adjList[edge]
				if (!assigned[neighbor]) continue
				const nr = colors[3 * neighbor]
				const ng = colors[3 * neighbor + 1]
				const nb = colors[3 * neighbor + 2]
				const distance = colorDistance(candidate, [nr, ng, nb])
				minNeighborDistance = Math.min(minNeighborDistance, distance)
				if (distance < 0.32) neighborPenalty += (0.32 - distance) * 4
			}
			const baseDistance = colorDistance(candidate, baseColors[nation])
			const score =
				(minNeighborDistance === Infinity ? 0.6 : minNeighborDistance * 3) -
				baseDistance * 0.9 -
				neighborPenalty
			if (score > bestScore) {
				bestScore = score
				bestColor = candidate
			}
		}
		colors[3 * nation] = bestColor[0]
		colors[3 * nation + 1] = bestColor[1]
		colors[3 * nation + 2] = bestColor[2]
		const province = seeds[nation]
		provinceColors[3 * province] = bestColor[0]
		provinceColors[3 * province + 1] = bestColor[1]
		provinceColors[3 * province + 2] = bestColor[2]
		assigned[nation] = 1
	}

	return colors
}

function buildNationColorCandidates(
	baseColor: [number, number, number],
): [number, number, number][] {
	const [baseHue, baseSat, baseLight] = rgbToHsl(
		baseColor[0],
		baseColor[1],
		baseColor[2],
	)
	const hueOffsets = [0, -0.08, 0.08, -0.16, 0.16, 0.32, 0.5]
	const satOffsets = [0, 0.08, -0.06]
	const lightOffsets = [0, -0.08, 0.06]
	const candidates: [number, number, number][] = []
	for (const hueOffset of hueOffsets) {
		for (const satOffset of satOffsets) {
			for (const lightOffset of lightOffsets) {
				const hue = (baseHue + hueOffset + 1) % 1
				const sat = clamp01(baseSat + satOffset)
				const light = clamp01(baseLight + lightOffset)
				candidates.push(hslToRgb(hue * 360, sat, light))
			}
		}
	}
	return candidates
}

function colorDistance(
	a: [number, number, number],
	b: [number, number, number],
): number {
	const dr = a[0] - b[0]
	const dg = a[1] - b[1]
	const db = a[2] - b[2]
	return Math.sqrt(dr * dr + dg * dg + db * db)
}

function emptyPartition(nodeCount: number): GenesisNationHierarchy {
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
		governmentType: new Uint8Array(nodeCount),
		nationColonizer: new Int32Array(0),
	}
}
