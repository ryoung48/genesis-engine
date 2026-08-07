import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { IDENTITY_SEEDS } from "@/model/shared/random/identity-seeds"
import { UNITS } from "@/model/shared/units"
import { ERAS } from "@/model/society/eras"
import { HIERARCHY } from "@/model/society/hierarchy"
import { COLONIAL } from "@/model/society/nations/colonial"
import { COLORING } from "@/model/society/nations/coloring"
import { GOVERNMENT } from "@/model/society/nations/government"
import { PLACEMENT } from "@/model/society/nations/placement"
import type {
	BuildNationPlanParams,
	ComputeNationsParams,
	IntegerMassParams,
	SpreadBucketSizesParams,
} from "@/model/society/nations/types"
import type { GenesisNationHierarchy } from "@/model/society/types"
import { WATER_ACCESS } from "@/model/society/water-access"

const MAX_NATION_SPREAD_KM = 2000

const NATION_PERCENTAGES = MATH.normalize([
	0.0, 0.11, 0.144, 0.194, 0.165, 0.251, 0.137,
])

function computeNations(params: ComputeNationsParams): GenesisNationHierarchy {
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
		MAX_NATION_SPREAD_KM /
		(params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm)
	const provinceCount = provinces.count
	if (provinceCount === 0) return emptyPartition(provinceCount)

	const active = new Uint8Array(provinceCount)
	const waterAccess =
		providedWaterAccess ??
		WATER_ACCESS.computeProvinceWaterAccess({
			provinces,
			oceanCoastal: coastal,
			lakeCoastal: new Uint8Array(provinceCount),
			riverVisible,
		}).waterAccess
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		if (provinces.desolate[p]) continue
		if (params.eraActiveMask && !params.eraActiveMask[p]) continue
		active[p] = 1
		activeCount++
	}
	if (activeCount === 0) return emptyPartition(provinceCount)

	const noise = new SimplexNoise(params.seed ^ 0xdeadbeef)
	const plan = buildNationPlan({
		total: activeCount,
		nationPercentages: params.nationPercentages,
		nationBuckets: params.nationBuckets,
	})
	const assignment = new Int32Array(provinceCount).fill(-1)
	const blocked = new Uint8Array(provinceCount)
	const seeds: number[] = []
	const sizes: number[] = []
	let assigned = 0

	for (let targetIdx = 0; targetIdx < plan.targets.length; targetIdx++) {
		const target = plan.targets[targetIdx]
		const components = PLACEMENT.buildOpenComponents({
			active,
			assignment,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		const seedProvince = PLACEMENT.selectSeed({
			target,
			active,
			assignment,
			blocked,
			habitability,
			waterAccess,
			migrationWave: params.migrationWave,
			provinceContinent,
			componentId: components.componentId,
			componentSizes: components.sizes,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
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
			const claim = PLACEMENT.bestClaim({
				nation,
				seedProvince,
				frontier,
				active,
				assignment,
				habitability,
				waterAccess,
				r_xyz,
				provinceSeeds: provinces.seeds,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
				noise,
				maxSpreadRad,
			})
			if (claim < 0) break
			PLACEMENT.claimProvinceDynamic({
				nation,
				province: claim,
				active,
				assignment,
				sizes,
				frontier,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
			})
			assigned++
		}

		const blockHops = Math.max(1, Math.round(Math.sqrt(target) * 0.5))
		PLACEMENT.markBlocked({
			start: seedProvince,
			hops: blockHops,
			active,
			blocked,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
	}

	if (assigned < activeCount) {
		const components = PLACEMENT.buildOpenComponents({
			active,
			assignment,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
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
						PLACEMENT.nationPlacementScore({
							province,
							habitability,
							waterAccess,
							provinceContinent,
							target: members.length,
						}) -
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
			let seedScore = PLACEMENT.nationPlacementScore({
				province: seedProvince,
				habitability,
				waterAccess,
				provinceContinent,
				target: members.length,
			})
			for (let i = 1; i < members.length; i++) {
				const province = members[i]
				const score = PLACEMENT.nationPlacementScore({
					province,
					habitability,
					waterAccess,
					provinceContinent,
					target: members.length,
				})
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

	const nationMembers = COLORING.groupByNation({
		assignment,
		nationCount,
		provinceCount,
	})
	const parent = new Int32Array(provinceCount).fill(-1)
	const depth = new Int32Array(provinceCount)
	const urbanPop = new Float32Array(provinceCount)
	for (let nation = 0; nation < nationCount; nation++) {
		const members = nationMembers[nation]
		const capital = seeds[nation]
		const subjects = members.filter((province) => province !== capital)
		if (subjects.length === 0) continue
		HIERARCHY.rebalanceHierarchy({
			capital,
			members: Int32Array.from(subjects),
			parent,
			depth,
			currentDepth: 0,
			fanoutRanges: HIERARCHY.fanoutRangesForSize(sizes[nation]),
			habitability,
			urbanPop,
			waterAccess,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
			provinceCount,
		})
	}

	const { childOffset, childList } = HIERARCHY.buildChildrenCSR({
		parent,
		provinceCount,
	})
	const sovereign = HIERARCHY.buildSovereign({ parent, provinceCount })
	for (let p = 0; p < provinceCount; p++) {
		if (assignment[p] < 0) sovereign[p] = -1
	}
	const gravity = HIERARCHY.computeGravity({
		habitability,
		childOffset,
		childList,
		depth,
		provinceCount,
		fanoutRanges: HIERARCHY.hegemonFanout,
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
			nationGovType[i] = GOVERNMENT.assignGovernmentType({
				nationIndex: i,
				capitalProvince: seeds[i],
				nationSize: sizes[i],
				eraMix: params.governmentMix,
				sizeWeight,
				habitability,
				waterAccess,
				migrationWave: params.migrationWave,
				statehoodFraction,
				seed: params.seed,
			})
		}
		if ((params.governmentMix.colonial ?? 0) > 0) {
			COLONIAL.assignColonialRelations({
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
		nameSeeds: IDENTITY_SEEDS.buildIdentitySeeds({
			count: nationCount,
			seed: params.seed + 4103,
		}),
		count: nationCount,
		adjOffset,
		adjList,
		size,
		colors: COLORING.nationColorsFromProvinces({
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
	const buckets = params.buckets ?? ERAS.nationBuckets
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

function integerMass({ total, weights }: IntegerMassParams): number[] {
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

function buildNationPlan({
	total,
	nationPercentages,
	nationBuckets,
}: BuildNationPlanParams): {
	targetProvinceMass: number[]
	targetNationCount: number[]
	targets: number[]
} {
	const percentages = nationPercentages ?? NATION_PERCENTAGES
	const buckets = nationBuckets ?? ERAS.nationBuckets
	const budgets = integerMass({ total, weights: percentages })
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
		const sizes = spreadBucketSizes({ budget, minSize, maxSize, count })
		for (let j = 0; j < count; j++) targets.push(sizes[j])
	}
	return {
		targetProvinceMass: budgets,
		targetNationCount,
		targets: targets.sort((a, b) => b - a),
	}
}

function spreadBucketSizes({
	budget,
	minSize,
	maxSize,
	count,
}: SpreadBucketSizesParams): Int32Array {
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

export const NATIONS = {
	computeNations,
}
