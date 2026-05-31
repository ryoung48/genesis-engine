/**
 * Province population initialization and prehistoric migration diffusion.
 *
 * computeProvinceHabitability: sums regional habitability scores into provinces.
 * Used both by computePopulation and as a pre-pass for computeMigration.
 *
 * computePopulation: computes province habitability and distributes initial
 * population proportionally. The distribution is additionally shaped by the
 * migration wave: each province's share is weighted by (1 - migrationWave)^
 * migrationFalloff, concentrating people near the cradles (strongly for early
 * eras, not at all for the information age). This only redistributes the era's
 * fixed total population — habitability itself is never modified. O(R + P)
 * time, typed arrays.
 *
 * computeMigration: runs multi-source Dijkstra on the region graph from
 * cradle provinces seeded on the most habitable landmass. Desolate provinces
 * are impassable barriers. Travel cost is inversely proportional to regional
 * habitability; ocean traversal is slow but passable. Returns a per-province
 * normalized arrival time (0 = cradle origin, 1 = latest frontier) and the
 * cradle province indices.
 *
 * Pipeline order: computeProvinceHabitability → computeMigration → mark
 * unreachable provinces desolate → computePopulation. This ensures that
 * migration-derived desolation affects population density.
 */

import type { OrogenProvinces } from ".."
import { createRng } from "../shared/rng"
import { DEFAULT_PLANET_RADIUS_KM } from "../shared/units"
import type { OrogenLandmarks } from "../terrain/landmarks"
import type { SphereMesh } from "../types/mesh"

// Habitability factors indexed by orogen codes

// climateZones: 0=ocean, 1=arctic, 2=subarctic, 3=boreal, 4=temperate, 5=subtropical, 6=tropical, 7=infernal, 8=chaotic
const HAB_CLIMATE = new Float32Array([
	0, 0.01, 0.1, 0.6, 1.25, 1.0, 0.8, 0.01, 0.01,
])

// vegetation: 0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle
const HAB_VEGETATION = new Float32Array([0, 0.1, 0.3, 0.8, 1.0, 0.8, 0.6])

// topography: 0=flat, 1=hills, 2=plateaus, 3=mountains, 4=marsh, 5=ocean, 6=lake
const HAB_TOPOGRAPHY = new Float32Array([1.0, 0.6, 0.8, 0.2, 0.6, 0, 0])
// Water access levels: 0=none, 1=river, 2=lake, 3=ocean
const HAB_COASTAL_OCEAN = 1.5
const HAB_COASTAL_LAKE = 1.2
const HAB_COASTAL_RIVER = 1.1
const HAB_COASTAL_FACTORS = new Float32Array([
	1.0,
	HAB_COASTAL_RIVER,
	HAB_COASTAL_LAKE,
	HAB_COASTAL_OCEAN,
])

export interface ProvincePopulation {
	/** Per-province habitability score */
	habitability: Float32Array
	/** Per-province rural population */
	population: Float32Array
	/** Aggregated global habitability score */
	habitabilityScore: number
	/** Total world population */
	totalPopulation: number
	/**
	 * Per-province normalized migration arrival time (0 = cradle origin,
	 * 1 = latest frontier reached). -1 for desolate/unreachable provinces.
	 */
	migrationWave?: Float32Array
	/** Province indices where prehistoric cradles were seeded */
	cradleProvinces?: Int32Array
	/**
	 * Era settlementWave threshold used during generation. Provinces with
	 * migrationWave > settlementWave are unsettled (pop=0). Stored here so
	 * the renderer can distinguish unsettled from settled-stateless provinces
	 * without re-importing era configs.
	 */
	settlementWave?: number
}

/**
 * Computes per-province habitability scores by summing regional factors.
 * Skips regions belonging to desolate provinces. The same seed produces the
 * same jitter values, so calling this twice with identical inputs is stable.
 */
export function computeProvinceHabitability(
	provinces: OrogenProvinces,
	_landmarks: OrogenLandmarks,
	climateZones: Uint8Array,
	vegetation: Uint8Array,
	topography: Uint8Array,
	oceanCoastal: Uint8Array,
	lakeCoastal: Uint8Array,
	riverVisible: Uint8Array,
	seed: number,
): Float32Array {
	const { count, desolate, regionProvince } = provinces
	const rng = createRng(seed + 77777)

	const habitability = new Float32Array(count)
	// Track best water access per province: 0=none, 1=river, 2=lake, 3=ocean
	const waterAccess = new Uint8Array(count)

	for (let r = 0; r < regionProvince.length; r++) {
		const province = regionProvince[r]
		if (province < 0) continue
		if (oceanCoastal[r] && waterAccess[province] < 3) waterAccess[province] = 3
		else if (lakeCoastal[r] && waterAccess[province] < 2)
			waterAccess[province] = 2
		else if (riverVisible[r] && waterAccess[province] < 1)
			waterAccess[province] = 1
	}

	for (let r = 0; r < regionProvince.length; r++) {
		const province = regionProvince[r]
		if (province < 0 || desolate[province]) continue

		const cz = climateZones[r]
		const veg = vegetation[r]
		const topo = topography[r]
		const coastalFactor = HAB_COASTAL_FACTORS[waterAccess[province]]
		const score =
			(HAB_CLIMATE[cz] ?? 0) *
			(HAB_VEGETATION[veg] ?? 0) *
			(HAB_TOPOGRAPHY[topo] ?? 0) *
			coastalFactor *
			(0.8 + rng.random() * 0.4) // uniform(0.8, 1.2)

		habitability[province] += score
	}

	return habitability
}

export function computePopulation(
	provinces: OrogenProvinces,
	landmarks: OrogenLandmarks,
	climateZones: Uint8Array,
	vegetation: Uint8Array,
	topography: Uint8Array,
	oceanCoastal: Uint8Array,
	lakeCoastal: Uint8Array,
	riverVisible: Uint8Array,
	seed: number,
	planetRadiusKm?: number,
	numRegions?: number,
	eraTargetPopulation?: number,
	migrationWave?: Float32Array,
	settlementWave?: number,
	migrationFalloff?: number,
): ProvincePopulation {
	const { count } = provinces

	// Habitability is computed purely from terrain — migration never alters it.
	const habitability = computeProvinceHabitability(
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		riverVisible,
		seed,
	)

	const effectiveSettlementWave = settlementWave ?? 1.0

	// Compute global habitability score (mirrors WORLD.habitability)
	// = sum(province.land * cellArea * habitability) / 1e8
	const N = numRegions ?? 100000
	const sphereAreaKm2 = 4 * Math.PI * (planetRadiusKm ?? 6371) ** 2
	const cellAreaKm2 = sphereAreaKm2 / N

	let habitabilityScore = 0
	for (let i = 0; i < count; i++) {
		habitabilityScore += cellAreaKm2 * habitability[i]
	}
	habitabilityScore /= 81234131.618

	const targetPop = eraTargetPopulation ?? 215e6
	const totalPop = targetPop * habitabilityScore

	// Distribution weight = habitability shaped by distance from the cradles.
	// Province share ∝ habitability * (1 - migrationWave)^falloff, so people
	// concentrate near the cradles (strongly in early eras) while the frontier
	// trends toward zero. falloff = 0 leaves the distribution at pure
	// habitability. Renormalizing preserves the era's total population.
	const falloff = migrationFalloff ?? 0
	const weight = new Float32Array(count)
	let totalWeight = 0
	for (let i = 0; i < count; i++) {
		let w = habitability[i]
		if (w > 0 && migrationWave) {
			const wave = migrationWave[i]
			// wave < 0 marks desolate/unreachable provinces (habitability already 0).
			// Provinces beyond the era's settlement frontier are unsettled: no
			// population (their habitability is left intact for other consumers).
			if (wave < 0 || wave > effectiveSettlementWave) w = 0
			else if (falloff > 0) w *= (1 - Math.min(wave, 1)) ** falloff
		}
		weight[i] = w
		totalWeight += w
	}

	const population = new Float32Array(count)
	if (totalWeight > 0) {
		for (let i = 0; i < count; i++) {
			population[i] = (weight[i] / totalWeight) * totalPop
		}
	}

	return {
		habitability,
		population,
		habitabilityScore,
		totalPopulation: totalPop,
		settlementWave: effectiveSettlementWave,
	}
}

// ── Migration diffusion ─────────────────────────────────────────────────────

// Travel cost for ocean regions (no province): very slow but passable.
const OCEAN_TRAVEL_COST = 1.0
// Minimum per-region normalized habitability used as denominator, prevents
// cost from blowing up in arctic/desert provinces.
const MIN_HAB_FOR_COST = 0.1
// One cradle per this many km² of continent area (Eurasia ~54M → 3 cradles).
const KM2_PER_CRADLE = 18e6

/** Tiny binary min-heap for lazy Dijkstra. */
class MinHeap {
	private readonly keys: number[] = []
	private readonly vals: number[] = []

	get size(): number {
		return this.keys.length
	}

	push(key: number, val: number): void {
		const i = this.keys.length
		this.keys.push(key)
		this.vals.push(val)
		this._up(i)
	}

	pop(): [number, number] | undefined {
		const n = this.keys.length
		if (n === 0) return undefined
		const k = this.keys[0]
		const v = this.vals[0]
		const lastK = this.keys.pop()!
		const lastV = this.vals.pop()!
		if (this.keys.length > 0) {
			this.keys[0] = lastK
			this.vals[0] = lastV
			this._down(0)
		}
		return [k, v]
	}

	private _up(i: number): void {
		while (i > 0) {
			const p = (i - 1) >> 1
			if (this.keys[p] <= this.keys[i]) break
			this._swap(p, i)
			i = p
		}
	}

	private _down(i: number): void {
		const n = this.keys.length
		while (true) {
			let m = i
			const l = 2 * i + 1
			const r = l + 1
			if (l < n && this.keys[l] < this.keys[m]) m = l
			if (r < n && this.keys[r] < this.keys[m]) m = r
			if (m === i) break
			this._swap(m, i)
			i = m
		}
	}

	private _swap(a: number, b: number): void {
		const tk = this.keys[a]
		const tv = this.vals[a]
		this.keys[a] = this.keys[b]
		this.vals[a] = this.vals[b]
		this.keys[b] = tk
		this.vals[b] = tv
	}
}

/**
 * BFS from `start` through the province adjacency graph, setting
 * `minHops[p]` to the minimum hop distance from `start` (capped at any
 * pre-existing lower value so multi-source updates work correctly).
 */
function bfsUpdateMinHops(
	start: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	minHops: Int32Array,
): void {
	const queue: number[] = []
	if (minHops[start] > 0) {
		minHops[start] = 0
		queue.push(start)
	}
	let head = 0
	while (head < queue.length) {
		const p = queue[head++]
		const d = minHops[p]
		for (let j = adjOffset[p], jEnd = adjOffset[p + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (minHops[nb] > d + 1) {
				minHops[nb] = d + 1
				queue.push(nb)
			}
		}
	}
}

/**
 * Farthest-point sampling on province adjacency.
 * First cradle = most habitable province; subsequent cradles maximise
 * `minHops * (0.2 + normHab)` to spread geographically while favouring
 * habitable terrain.
 */
function placeCradles(
	continentProvinces: number[],
	normHab: Float32Array,
	adjOffset: Int32Array,
	adjList: Int32Array,
	totalProvinces: number,
	k: number,
): number[] {
	const capped = Math.min(k, continentProvinces.length)
	if (capped === 0) return []

	// First cradle: most habitable province in the continent.
	let first = continentProvinces[0]
	for (const p of continentProvinces) {
		if (normHab[p] > normHab[first]) first = p
	}

	const cradles: number[] = [first]
	if (capped === 1) return cradles

	const INF = 2 ** 30
	const minHops = new Int32Array(totalProvinces).fill(INF)
	bfsUpdateMinHops(first, adjOffset, adjList, minHops)

	for (let i = 1; i < capped; i++) {
		let bestP = continentProvinces[0]
		let bestScore = -1
		for (const p of continentProvinces) {
			if (minHops[p] >= INF) continue
			const score = minHops[p] * (0.2 + normHab[p])
			if (score > bestScore) {
				bestScore = score
				bestP = p
			}
		}
		cradles.push(bestP)
		bfsUpdateMinHops(bestP, adjOffset, adjList, minHops)
	}

	return cradles
}

/**
 * Compute prehistoric migration diffusion from cradle provinces seeded on
 * the most habitable landmass. Uses multi-source Dijkstra on the full
 * region graph so ocean traversal (very expensive) is included.
 *
 * Returns:
 * - `migrationWave`: per-province normalized arrival time, 0..1 for
 *   reachable non-desolate provinces, -1 otherwise.
 * - `cradleProvinces`: province indices of the seeded cradles.
 */
export function computeMigration(
	provinces: OrogenProvinces,
	habitability: Float32Array,
	mesh: SphereMesh,
	planetRadiusKm: number = DEFAULT_PLANET_RADIUS_KM,
	numRegions?: number,
): { migrationWave: Float32Array; cradleProvinces: Int32Array } {
	const {
		count,
		desolate,
		adjOffset: pAdjOffset,
		adjList: pAdjList,
		landmassId,
		size,
		seeds: provinceSeedRegions,
		regionProvince,
	} = provinces

	if (count === 0) {
		return {
			migrationWave: new Float32Array(0),
			cradleProvinces: new Int32Array(0),
		}
	}

	const N = numRegions ?? mesh.numRegions

	// Per-province normalized habitability (hab per region).
	const normHab = new Float32Array(count)
	for (let p = 0; p < count; p++) {
		if (!desolate[p]) {
			normHab[p] = habitability[p] / Math.max(1, size[p])
		}
	}

	// Find the most habitable non-desolate landmass.
	const landmassHab = new Map<number, number>()
	const landmassSize = new Map<number, number>()
	for (let p = 0; p < count; p++) {
		if (desolate[p]) continue
		const lm = landmassId[p]
		if (lm < 0) continue
		landmassHab.set(lm, (landmassHab.get(lm) ?? 0) + habitability[p])
		landmassSize.set(lm, (landmassSize.get(lm) ?? 0) + size[p])
	}

	let bestLandmass = -1
	let bestHab = -1
	for (const [lm, hab] of landmassHab) {
		if (hab > bestHab) {
			bestHab = hab
			bestLandmass = lm
		}
	}

	const continentProvinces: number[] = []
	for (let p = 0; p < count; p++) {
		if (!desolate[p] && landmassId[p] === bestLandmass) {
			continentProvinces.push(p)
		}
	}

	if (continentProvinces.length === 0) {
		return {
			migrationWave: new Float32Array(count).fill(-1),
			cradleProvinces: new Int32Array(0),
		}
	}

	// Number of cradles scales with continent area; cap at 5.
	const sphereAreaKm2 = 4 * Math.PI * planetRadiusKm ** 2
	const cellAreaKm2 = sphereAreaKm2 / N
	const continentAreaKm2 = (landmassSize.get(bestLandmass) ?? 1) * cellAreaKm2
	const numCradles = Math.max(
		1,
		Math.min(5, Math.round(continentAreaKm2 / KM2_PER_CRADLE)),
	)

	const cradleList = placeCradles(
		continentProvinces,
		normHab,
		pAdjOffset,
		pAdjList,
		count,
		numCradles,
	)

	// Multi-source Dijkstra on the region graph. Edge cost is the average of
	// the two endpoint travel costs; ocean regions use OCEAN_TRAVEL_COST.
	const { adjOffset: rAdjOffset, adjList: rAdjList } = mesh
	const INF = 1e15
	const dist = new Float64Array(N).fill(INF)

	function regionTravelCost(r: number): number {
		const p = regionProvince[r]
		if (p < 0) return OCEAN_TRAVEL_COST // ocean: slow but passable
		if (desolate[p]) return Infinity // desolate land: impassable barrier
		return 1.0 / Math.max(normHab[p], MIN_HAB_FOR_COST)
	}

	const heap = new MinHeap()
	for (const cradleP of cradleList) {
		const seedR = provinceSeedRegions[cradleP]
		if (seedR >= 0 && seedR < N && dist[seedR] > 0) {
			dist[seedR] = 0
			heap.push(0, seedR)
		}
	}

	while (heap.size > 0) {
		const [d, r] = heap.pop()!
		if (d > dist[r]) continue // stale lazy entry
		const costR = regionTravelCost(r)
		for (let j = rAdjOffset[r], jEnd = rAdjOffset[r + 1]; j < jEnd; j++) {
			const nb = rAdjList[j]
			const edgeCost = (costR + regionTravelCost(nb)) * 0.5
			const newDist = d + edgeCost
			if (newDist < dist[nb]) {
				dist[nb] = newDist
				heap.push(newDist, nb)
			}
		}
	}

	// Normalize arrival times to 0..1 using the farthest reachable
	// non-desolate province seed as the reference.
	let maxDist = 0
	for (let p = 0; p < count; p++) {
		if (desolate[p]) continue
		const seedR = provinceSeedRegions[p]
		if (seedR >= 0 && seedR < N && dist[seedR] < INF && dist[seedR] > maxDist) {
			maxDist = dist[seedR]
		}
	}

	const migrationWave = new Float32Array(count).fill(-1)
	if (maxDist > 0) {
		for (let p = 0; p < count; p++) {
			if (desolate[p]) continue
			const seedR = provinceSeedRegions[p]
			if (seedR >= 0 && seedR < N && dist[seedR] < INF) {
				migrationWave[p] = dist[seedR] / maxDist
			}
		}
	} else {
		// All seeds at distance 0 (or unreachable) — just mark cradles.
		for (const cradleP of cradleList) {
			if (!desolate[cradleP]) migrationWave[cradleP] = 0
		}
	}

	return {
		migrationWave,
		cradleProvinces: new Int32Array(cradleList),
	}
}
