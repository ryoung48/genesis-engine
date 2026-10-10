import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import type {
	BestClaimParams,
	BuildOpenComponentsParams,
	ClaimProvinceDynamicParams,
	ContinentPlacementBonusParams,
	MarkBlockedParams,
	MigrationWavePlacementMultiplierParams,
	NationPlacementScoreParams,
	ProvinceSeedDistanceParams,
	SelectSeedParams,
	TargetSizeBiasParams,
} from "@/model/history/sim/nations/placement/types"
import { WATER_ACCESS } from "@/model/society/water-access"

const NOISE_FREQ = 4.0

const NOISE_STRENGTH = 0.4

const HABITABILITY_CLAIM_WEIGHT = 0.01

const WATER_CLAIM_WEIGHT = 0.02

const LARGE_NATION_CONTINENT_BONUS = 3.5

const LARGE_NATION_CONTINENT_MIN_TARGET = 10

const LARGE_NATION_CONTINENT_FULL_TARGET = 50

const LARGE_NATION_WAVE_BIAS = 0.35

function largeNationSizeBias({ target }: TargetSizeBiasParams): number {
	return GRAPH_PARTITION.clamp01(
		(target - LARGE_NATION_CONTINENT_MIN_TARGET) /
			(LARGE_NATION_CONTINENT_FULL_TARGET - LARGE_NATION_CONTINENT_MIN_TARGET),
	)
}

function migrationWavePlacementMultiplier({
	province,
	target,
	migrationWave,
}: MigrationWavePlacementMultiplierParams): number {
	if (!migrationWave) return 1
	const wave = GRAPH_PARTITION.clamp01(migrationWave[province])
	return 1 - wave * largeNationSizeBias({ target }) * LARGE_NATION_WAVE_BIAS
}

function nationPlacementScore({
	province,
	habitability,
	waterAccess,
	provinceContinent,
	target,
}: NationPlacementScoreParams): number {
	return (
		habitability[province] +
		waterAccess[province] * WATER_ACCESS.waterAccessBonus +
		continentPlacementBonus({ province, provinceContinent, target })
	)
}

function continentPlacementBonus({
	province,
	provinceContinent,
	target,
}: ContinentPlacementBonusParams): number {
	if (!provinceContinent?.[province]) return 0
	const sizeBias = largeNationSizeBias({ target })
	return sizeBias * LARGE_NATION_CONTINENT_BONUS
}

function bestClaim({
	nation,
	seedProvince,
	frontier,
	active,
	assignment,
	habitability,
	waterAccess,
	r_xyz,
	provinceSeeds,
	adjOffset,
	adjList,
	noise,
	maxSpreadRad,
}: BestClaimParams): number {
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
		const d = provinceSeedDistance({
			aProvince: seedProvince,
			bProvince: candidate,
			provinceSeeds,
			r_xyz,
		})
		if (d > maxSpreadRad) continue
		const s = provinceSeeds[candidate]
		const nx = r_xyz[3 * s] * NOISE_FREQ
		const ny = r_xyz[3 * s + 1] * NOISE_FREQ
		const nz = r_xyz[3 * s + 2] * NOISE_FREQ
		const noiseVal = noise.noise3D(nx, ny, nz)
		const score =
			(1 / (d + 0.1)) * (1 + NOISE_STRENGTH * noiseVal) +
			habitability[candidate] * HABITABILITY_CLAIM_WEIGHT +
			waterAccess[candidate] *
				WATER_ACCESS.waterAccessBonus *
				WATER_CLAIM_WEIGHT +
			sharedBorder * 0.05 +
			seedPenalty
		if (score > bestScore) {
			bestScore = score
			best = candidate
		}
	}
	return best
}

function claimProvinceDynamic({
	nation,
	province,
	active,
	assignment,
	sizes,
	frontier,
	adjOffset,
	adjList,
}: ClaimProvinceDynamicParams) {
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

function selectSeed({
	target,
	active,
	assignment,
	blocked,
	habitability,
	waterAccess,
	migrationWave,
	provinceContinent,
	componentId,
	componentSizes,
	adjOffset,
	adjList,
}: SelectSeedParams): number {
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
			nationPlacementScore({
				province: p,
				habitability,
				waterAccess,
				provinceContinent,
				target,
			}) *
				migrationWavePlacementMultiplier({
					province: p,
					target,
					migrationWave,
				}) *
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

function provinceSeedDistance({
	aProvince,
	bProvince,
	provinceSeeds,
	r_xyz,
}: ProvinceSeedDistanceParams): number {
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

function buildOpenComponents({
	active,
	assignment,
	adjOffset,
	adjList,
}: BuildOpenComponentsParams): {
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

function markBlocked({
	start,
	hops,
	active,
	blocked,
	adjOffset,
	adjList,
}: MarkBlockedParams) {
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

export const PLACEMENT = {
	nationPlacementScore,
	bestClaim,
	claimProvinceDynamic,
	selectSeed,
	provinceSeedDistance,
	buildOpenComponents,
	markBlocked,
}
