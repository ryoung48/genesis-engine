import { createRng, DEFAULT_PLANET_RADIUS_KM } from "@/model/shared"
import type {
	PlaceCradlesParams,
	ComputeProvinceHabitabilityParams,
	ComputePopulationParams,
	ProvincePopulation,
} from "@/model/society/types"
import type {
	BfsUpdateMinHopsParams,
	ComputeMigrationParams,
} from "@/model/society/population/types"

const HAB_CLIMATE = new Float32Array([
	0, 0.01, 0.1, 0.6, 1.25, 1.0, 0.8, 0.01, 0.01,
])

const HAB_VEGETATION = new Float32Array([0, 0.1, 0.3, 0.8, 1.0, 0.8, 0.6])

const HAB_TOPOGRAPHY = new Float32Array([1.0, 0.6, 0.8, 0.2, 0.6, 0, 0])

const HAB_WATER_BONUS = new Float32Array([0, 0.1, 0.1, 0.1])

function computeProvinceHabitability({
	provinces,
	climateZones,
	vegetation,
	topography,
	oceanCoastal,
	lakeCoastal,
	riverVisible,
	seed,
}: ComputeProvinceHabitabilityParams): Float32Array {
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
		const score =
			((HAB_CLIMATE[cz] ?? 0) *
				(HAB_VEGETATION[veg] ?? 0) *
				(HAB_TOPOGRAPHY[topo] ?? 0) +
				HAB_WATER_BONUS[waterAccess[province]]) *
			(0.8 + rng.random() * 0.4) // uniform(0.8, 1.2)

		habitability[province] += score
	}

	return habitability
}

function computePopulation({
	provinces,
	landmarks,
	climateZones,
	vegetation,
	topography,
	oceanCoastal,
	lakeCoastal,
	riverVisible,
	seed,
	planetRadiusKm,
	numRegions,
	eraTargetPopulation,
	migrationWave,
	settlementWave,
	migrationFalloff,
}: ComputePopulationParams): ProvincePopulation {
	const { count } = provinces

	// Habitability is computed purely from terrain — migration never alters it.
	const habitability = computeProvinceHabitability({
		provinces,
		_landmarks: landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		riverVisible,
		seed,
	})

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
	// Province share âˆ habitability * (1 - migrationWave)^falloff, so people
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

const OCEAN_TRAVEL_COST = 1.0

const MIN_HAB_FOR_COST = 0.1

const KM2_PER_CRADLE = 18e6

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

function bfsUpdateMinHops({
	start,
	adjOffset,
	adjList,
	minHops,
}: BfsUpdateMinHopsParams): void {
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

function placeCradles({
	continentProvinces,
	normHab,
	adjOffset,
	adjList,
	totalProvinces,
	k,
}: PlaceCradlesParams): number[] {
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
	bfsUpdateMinHops({ start: first, adjOffset, adjList, minHops })

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
		bfsUpdateMinHops({ start: bestP, adjOffset, adjList, minHops })
	}

	return cradles
}

function computeMigration({
	provinces,
	habitability,
	mesh,
	planetRadiusKm = DEFAULT_PLANET_RADIUS_KM,
	numRegions,
}: ComputeMigrationParams): {
	migrationWave: Float32Array
	cradleProvinces: Int32Array
} {
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

	const cradleList = placeCradles({
		continentProvinces,
		normHab,
		adjOffset: pAdjOffset,
		adjList: pAdjList,
		totalProvinces: count,
		k: numCradles,
	})

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

export const POPULATION = {
	computeProvinceHabitability,
	computePopulation,
	computeMigration,
}
