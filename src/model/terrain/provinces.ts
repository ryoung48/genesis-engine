/**
 * Province partitioning for the genesis pipeline.
 * Competitive multi-source BFS on SphereMesh CSR adjacency.
 * O(N) time, all typed arrays, no object allocation in hot path.
 */

import type { GenesisProvinces, GenesisRainfall, SphereMesh } from ".."
import { createRng } from "../shared/rng"
import { DEFAULT_PLANET_RADIUS_KM, meanEdgeLengthKm } from "../shared/units"

export const PROVINCE_AREA_TARGET_KM2 = 10_000
// How far a coastal province's frontier may expand across open ocean before
// giving up on finding a neighbor -- caps sea-crossing adjacency search, see
// assemblePartition's phase 5b.
const SEA_CROSSING_RANGE_KM = 500

export function computeProvinces(
	mesh: SphereMesh,
	isLand: Uint8Array,
	topography: Uint8Array,
	seed: number,
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	},
): GenesisProvinces {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const rng = createRng(seed + 31337)

	// Count land regions
	let landCount = 0
	for (let r = 0; r < N; r++) if (isLand[r]) landCount++
	if (landCount === 0) return emptyProvinces(N)

	// Target area only influences seed density approximately: the actual province
	// count comes from greedy seed placement below, not this estimate directly.
	const planetRadiusKm = options?.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM
	const avgEdgeKm = meanEdgeLengthKm(mesh, options?.planetRadiusKm)
	const regionAreaKm2 = avgEdgeKm * avgEdgeKm * Math.sqrt(3) * 0.5
	const targetCount = Math.max(
		1,
		Math.round((landCount * regionAreaKm2) / PROVINCE_AREA_TARGET_KM2),
	)

	// Compute a continuous seed-claim radius from target density instead of
	// quantizing through integer graph hops.
	const regionsPerProvince = Math.max(1, landCount / targetCount)
	const seedClaimRadiusKm = Math.max(
		avgEdgeKm,
		avgEdgeKm * Math.sqrt(regionsPerProvince) * 0.85,
	)

	// ── Phase 1: Seed placement via greedy distance-aware BFS ────────────

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

	for (let li = 0; li < landCount; li++) {
		const r = landRegions[li]
		if (claimed[r]) continue
		seeds.push(r)
		const seedX = mesh.r_xyz[3 * r]
		const seedY = mesh.r_xyz[3 * r + 1]
		const seedZ = mesh.r_xyz[3 * r + 2]

		// BFS from seed to mark nearby regions within the target claim radius.
		bfsQueue.length = 0
		bfsQueue.push(r)
		claimed[r] = 1
		let head = 0
		while (head < bfsQueue.length) {
			const curr = bfsQueue[head++]
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb] || claimed[nb]) continue
				const dx = seedX - mesh.r_xyz[3 * nb]
				const dy = seedY - mesh.r_xyz[3 * nb + 1]
				const dz = seedZ - mesh.r_xyz[3 * nb + 2]
				const seedDistanceKm =
					Math.sqrt(dx * dx + dy * dy + dz * dz) * planetRadiusKm
				if (seedDistanceKm > seedClaimRadiusKm) continue
				claimed[nb] = 1
				bfsQueue.push(nb)
			}
		}
	}

	const provinceCount = seeds.length
	const seedsArr = new Int32Array(seeds)

	// ── Phase 2: Competitive BFS with mountain deferral ─────────────────
	// Normal edges processed first; mountain-to-mountain crossings deferred
	// to the next round, making ridges natural province boundaries.

	const regionProvince = competitiveBfsAssign(
		mesh,
		isLand,
		topography,
		seedsArr,
	)

	return assemblePartition(
		mesh,
		isLand,
		regionProvince,
		seedsArr,
		provinceCount,
		rng,
		options,
	)
}

/**
 * Assigns every land region to whichever seed reaches it first via BFS
 * flood-fill from all seeds simultaneously, deferring mountain-to-mountain
 * crossings so ridges become natural province boundaries.
 */
function competitiveBfsAssign(
	mesh: SphereMesh,
	isLand: Uint8Array,
	topography: Uint8Array,
	seeds: Int32Array,
): Int32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const provinceCount = seeds.length
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

	return regionProvince
}

/**
 * Phases 3-6 shared by both the procedural BFS partition (computeProvinces)
 * and the real-data weighted partition (computeWeightedProvinces): province
 * sizes, water access, desolate classification, adjacency, and colors.
 */
function assemblePartition(
	mesh: SphereMesh,
	isLand: Uint8Array,
	regionProvince: Int32Array,
	seedsArr: Int32Array,
	provinceCount: number,
	rng: ReturnType<typeof createRng>,
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	},
	skipDesolate = false,
): GenesisProvinces {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const seeds = Array.from(seedsArr)

	// ── Phase 3: Province sizes ─────────────────────────────────────────

	const size = new Int32Array(provinceCount)
	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p >= 0) size[p]++
	}

	// ── Phase 3b: Water access ──────────────────────────────────────────
	const { climateZones, rainfall, oceanCoastal, lakeCoastal, riverVisible } =
		options ?? {}
	const waterAccess = new Uint8Array(provinceCount)
	const riverAccess = new Uint8Array(provinceCount)
	const lakeAccess = new Uint8Array(provinceCount)
	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p < 0) continue
		if (oceanCoastal?.[r]) waterAccess[p] = 2
		else if ((lakeCoastal?.[r] || riverVisible?.[r]) && waterAccess[p] < 1)
			waterAccess[p] = 1
		if (riverVisible?.[r]) riverAccess[p] = 1
		if (lakeCoastal?.[r]) lakeAccess[p] = 1
	}

	// ── Phase 4: Desolate classification ────────────────────────────────
	// Climate-zone desolate: arctic/subarctic/infernal/chaotic regardless of rivers.
	// Rainfall desolate: < 5mm annual precipitation, exempted if province has river access.

	const desolate = new Uint8Array(provinceCount)
	if (!skipDesolate) {
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
			if (rainfall && rainfall.annual[r] < 5 && !riverAccess[i]) desolate[i] = 1
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

	// Snapshot land-only adjacency for landmass connected-component analysis
	// (must be captured before sea-crossing edges are added below).
	const landOnlyNeighbors: Set<number>[] = provNeighbors.map((s) => new Set(s))

	// 5b. Sea-crossing adjacency: competitive BFS from coastal cells into ocean.
	// When two province frontiers meet in the ocean, link them. Capped by
	// distance so an isolated province (e.g. a remote island with no other
	// land for thousands of km, like a force-placed Maldives/Rapa Nui --
	// see computeProvincesFromRaster) claims only a coastal buffer of ocean
	// instead of flooding the entire remaining basin before meeting anyone.
	{
		const planetRadiusKm = options?.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM
		const avgEdgeKm = meanEdgeLengthKm(mesh, planetRadiusKm)
		const maxSeaHops = Math.max(
			1,
			Math.round(SEA_CROSSING_RANGE_KM / avgEdgeKm),
		)

		const oceanProv = new Int32Array(N).fill(-1) // province that claimed each ocean cell
		const hopCount = new Int32Array(N)
		const queue: number[] = []

		// Seed: every non-desolate land cell that has at least one ocean neighbor
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0 || desolate[p]) continue
			let coastal = false
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				if (!isLand[adjList[j]]) {
					coastal = true
					break
				}
			}
			if (!coastal) continue
			// Seed adjacent ocean cells at distance 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb] || oceanProv[nb] >= 0) continue
				oceanProv[nb] = p
				hopCount[nb] = 1
				queue.push(nb)
			}
		}

		// Expand ocean frontier, capped at maxSeaHops from the coast
		let head = 0
		while (head < queue.length) {
			const r = queue[head++]
			const p1 = oceanProv[r]
			const hop = hopCount[r]
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
				if (hop >= maxSeaHops) continue
				oceanProv[nb] = p1
				hopCount[nb] = hop + 1
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

	const landmassId = new Int32Array(provinceCount).fill(-1)
	const componentId = new Int32Array(provinceCount).fill(-1)
	const componentArea: number[] = []
	const queue = new Int32Array(provinceCount)

	let componentCount = 0
	for (let start = 0; start < provinceCount; start++) {
		if (desolate[start] || componentId[start] >= 0) continue
		let head = 0
		let tail = 0
		let area = 0
		queue[tail++] = start
		componentId[start] = componentCount
		while (head < tail) {
			const p = queue[head++]
			area += size[p]
			for (const nb of landOnlyNeighbors[p]) {
				if (desolate[nb] || componentId[nb] >= 0) continue
				componentId[nb] = componentCount
				queue[tail++] = nb
			}
		}
		componentArea.push(area)
		componentCount++
	}

	for (let p = 0; p < provinceCount; p++) {
		if (desolate[p]) continue
		const component = componentId[p]
		if (component >= 0) landmassId[p] = component
	}

	const colors = generateProvinceColors(provinceCount, rng)

	return {
		regionProvince,
		seeds: seedsArr,
		count: provinceCount,
		desolate,
		waterAccess,
		riverAccess,
		lakeAccess,
		landmassId,
		adjOffset: provAdjOffset,
		adjList: provAdjList,
		size,
		colors,
	}
}

/**
 * Assigns provinces from real-world seed data (e.g. imported Earth province
 * centers) instead of the procedural BFS in computeProvinces. Each seed
 * already has a fixed mesh region (resolved by the caller).
 *
 * Boundaries come from a multiplicatively-weighted multi-source Dijkstra on
 * geodesic distance -- every region joins whichever seed reaches it first,
 * where each seed's frontier expands at a rate proportional to its land-area
 * weight (a geodesic weighted Voronoi diagram). Higher-weight seeds (e.g.
 * larger real-world provinces) therefore claim more territory, while equal
 * weights degenerate to the plain unweighted case.
 */
export function computeWeightedProvinces(
	mesh: SphereMesh,
	isLand: Uint8Array,
	_topography: Uint8Array,
	seedRegions: Int32Array,
	seedNames: string[],
	seed: number,
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	},
	seedWeights?: Float32Array,
): GenesisProvinces {
	const N = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh
	const rng = createRng(seed + 31337)
	const provinceCount = seedRegions.length
	const planetRadiusKm = options?.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM

	if (provinceCount === 0 || !seedRegions.some((r) => isLand[r]))
		return emptyProvinces(N)

	// Normalize weights around a mean of 1 so an unweighted seed expands at
	// the same rate as the plain geodesic case.
	let weightFactor: Float64Array
	if (seedWeights && seedWeights.length === provinceCount) {
		let meanWeight = 0
		for (let i = 0; i < provinceCount; i++) meanWeight += seedWeights[i]
		meanWeight = meanWeight > 0 ? meanWeight / provinceCount : 1
		weightFactor = new Float64Array(provinceCount)
		for (let i = 0; i < provinceCount; i++)
			weightFactor[i] = (seedWeights[i] || meanWeight) / meanWeight
	} else {
		weightFactor = new Float64Array(provinceCount).fill(1)
	}

	const regionProvince = new Int32Array(N).fill(-1)
	const bestCost = new Float64Array(N).fill(Infinity)

	// Binary min-heap of [cost, region, province] triples, flattened into
	// parallel arrays to avoid per-node object allocation.
	const heapCost: number[] = []
	const heapRegion: number[] = []
	const heapProvince: number[] = []
	function heapPush(cost: number, region: number, province: number) {
		let i = heapCost.length
		heapCost.push(cost)
		heapRegion.push(region)
		heapProvince.push(province)
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (heapCost[parent] <= heapCost[i]) break
			;[heapCost[parent], heapCost[i]] = [heapCost[i], heapCost[parent]]
			;[heapRegion[parent], heapRegion[i]] = [heapRegion[i], heapRegion[parent]]
			;[heapProvince[parent], heapProvince[i]] = [
				heapProvince[i],
				heapProvince[parent],
			]
			i = parent
		}
	}
	function heapPop(): [number, number, number] | undefined {
		const n = heapCost.length
		if (n === 0) return undefined
		const top: [number, number, number] = [
			heapCost[0],
			heapRegion[0],
			heapProvince[0],
		]
		const last = n - 1
		heapCost[0] = heapCost[last]
		heapRegion[0] = heapRegion[last]
		heapProvince[0] = heapProvince[last]
		heapCost.pop()
		heapRegion.pop()
		heapProvince.pop()
		let i = 0
		const size = heapCost.length
		for (;;) {
			const left = 2 * i + 1
			const right = 2 * i + 2
			let smallest = i
			if (left < size && heapCost[left] < heapCost[smallest]) smallest = left
			if (right < size && heapCost[right] < heapCost[smallest]) smallest = right
			if (smallest === i) break
			;[heapCost[smallest], heapCost[i]] = [heapCost[i], heapCost[smallest]]
			;[heapRegion[smallest], heapRegion[i]] = [
				heapRegion[i],
				heapRegion[smallest],
			]
			;[heapProvince[smallest], heapProvince[i]] = [
				heapProvince[i],
				heapProvince[smallest],
			]
			i = smallest
		}
		return top
	}

	for (let i = 0; i < provinceCount; i++) {
		const r = seedRegions[i]
		if (!isLand[r] || regionProvince[r] >= 0) continue
		regionProvince[r] = i
		bestCost[r] = 0
		heapPush(0, r, i)
	}

	while (heapCost.length > 0) {
		const popped = heapPop()
		if (!popped) break
		const [cost, r, p] = popped
		if (cost > bestCost[r] || regionProvince[r] !== p) continue
		const rx = r_xyz[3 * r]
		const ry = r_xyz[3 * r + 1]
		const rz = r_xyz[3 * r + 2]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb]) continue
			const dx = rx - r_xyz[3 * nb]
			const dy = ry - r_xyz[3 * nb + 1]
			const dz = rz - r_xyz[3 * nb + 2]
			const stepKm = Math.sqrt(dx * dx + dy * dy + dz * dz) * planetRadiusKm
			const nextCost = cost + stepKm / weightFactor[p]
			if (nextCost < bestCost[nb]) {
				bestCost[nb] = nextCost
				regionProvince[nb] = p
				heapPush(nextCost, nb, p)
			}
		}
	}

	const result = assemblePartition(
		mesh,
		isLand,
		regionProvince,
		seedRegions,
		provinceCount,
		rng,
		options,
		/* skipDesolate */ true,
	)
	return { ...result, names: seedNames }
}

/**
 * Assigns provinces directly from a rasterized real-world province-id map
 * (e.g. a rasterized EU4 province GeoJSON) instead of Voronoi-partitioning
 * from seed points. Each mesh region's raw id (sampled from the raster by
 * the caller, -1 = no data) is remapped to a compact province index, so
 * boundaries exactly follow the source polygons rather than approximating
 * them from centroid seeds. Small gaps from rasterization seams are filled
 * from mesh-adjacent assigned regions; larger unmapped land areas (outside
 * the source data's coverage) are left unassigned and render like ocean.
 */
export function computeProvincesFromRaster(
	mesh: SphereMesh,
	isLand: Uint8Array,
	regionIds: Int16Array,
	seed: number,
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	},
	/** A guaranteed-inside-the-source-polygon point per province id (see
	 * scripts/build-eu4-provinces.py's representative_point output). Ids
	 * that the raster sampling above never placed on any mesh region --
	 * either too small to be any region's nearest sample, or sitting on
	 * land the mesh's own coastline data doesn't recognize -- are force-
	 * placed onto their nearest actual land region instead of silently
	 * disappearing. */
	fallbackSeeds?: { id: number; lon: number; lat: number }[],
): GenesisProvinces {
	const N = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh
	const rng = createRng(seed + 44771)

	const idToIndex = new Map<number, number>()
	const regionProvince = new Int32Array(N).fill(-1)
	const seedRegions: number[] = []
	const names: string[] = []
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		const id = regionIds[r]
		if (id < 0) continue
		let idx = idToIndex.get(id)
		if (idx === undefined) {
			idx = seedRegions.length
			idToIndex.set(id, idx)
			seedRegions.push(r)
			names.push(`Province ${id}`)
		}
		regionProvince[r] = idx
	}

	if (seedRegions.length === 0 && !fallbackSeeds?.length)
		return emptyProvinces(N)

	for (let round = 0; round < 6; round++) {
		let changed = false
		for (let r = 0; r < N; r++) {
			if (!isLand[r] || regionProvince[r] >= 0) continue
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (regionProvince[nb] >= 0) {
					regionProvince[r] = regionProvince[nb]
					changed = true
					break
				}
			}
		}
		if (!changed) break
	}

	if (fallbackSeeds?.length) {
		const planetRadiusKm = options?.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM
		// Beyond this, "nearest land" is a different landmass entirely (e.g. a
		// remote island nation like the Maldives or Rapa Nui with no land in
		// the mesh's own heightmap/coastline data at its true coordinates) --
		// silently teleporting the province onto that distant landmass would
		// be worse than a gap. Past this distance we instead carve a
		// single-region island at the true coordinates.
		const FAR_ISLAND_KM = 400

		const provinceSize: number[] = new Array(seedRegions.length).fill(0)
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p >= 0) provinceSize[p]++
		}
		for (const { id, lon, lat } of fallbackSeeds) {
			if (idToIndex.has(id)) continue
			const latR = (lat * Math.PI) / 180
			const lonR = (lon * Math.PI) / 180
			const cosLat = Math.cos(latR)
			const qx = cosLat * Math.cos(lonR)
			const qy = cosLat * Math.sin(lonR)
			const qz = Math.sin(latR)
			let best = -1
			let bestD = Infinity
			// Prefer a region whose current province has other regions left,
			// so force-placing a tiny province doesn't erase a different one.
			let bestSafe = -1
			let bestSafeD = Infinity
			let bestAny = -1
			let bestAnyD = Infinity
			for (let r = 0; r < N; r++) {
				const dx = r_xyz[3 * r] - qx
				const dy = r_xyz[3 * r + 1] - qy
				const dz = r_xyz[3 * r + 2] - qz
				const d = dx * dx + dy * dy + dz * dz
				if (d < bestAnyD) {
					bestAnyD = d
					bestAny = r
				}
				if (!isLand[r]) continue
				if (d < bestD) {
					bestD = d
					best = r
				}
				const p = regionProvince[r]
				if (d < bestSafeD && (p < 0 || provinceSize[p] > 1)) {
					bestSafeD = d
					bestSafe = r
				}
			}

			const nearestLandKm =
				best >= 0
					? 2 * Math.asin(Math.min(1, Math.sqrt(bestD) / 2)) * planetRadiusKm
					: Infinity
			let chosen: number
			if (nearestLandKm > FAR_ISLAND_KM && bestAny >= 0) {
				chosen = bestAny
				isLand[chosen] = 1
			} else {
				chosen = bestSafe >= 0 ? bestSafe : best
			}
			if (chosen < 0) continue

			const oldProvince = regionProvince[chosen]
			if (oldProvince >= 0) provinceSize[oldProvince]--
			const idx = seedRegions.length
			idToIndex.set(id, idx)
			seedRegions.push(chosen)
			names.push(`Province ${id}`)
			regionProvince[chosen] = idx
			provinceSize.push(1)
		}
	}

	if (seedRegions.length === 0) return emptyProvinces(N)

	const result = assemblePartition(
		mesh,
		isLand,
		regionProvince,
		Int32Array.from(seedRegions),
		seedRegions.length,
		rng,
		options,
		/* skipDesolate */ true,
	)
	return { ...result, names }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = l - c / 2
	let r = 0,
		g = 0,
		b = 0
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

function generateProvinceColors(
	count: number,
	rng: { random(): number },
): Float32Array {
	const colors = new Float32Array(count * 3)
	const GOLDEN_RATIO = 0.618033988749895
	let hue = rng.random()
	for (let i = 0; i < count; i++) {
		hue = (hue + GOLDEN_RATIO) % 1
		const sat = 0.45 + rng.random() * 0.3
		const lit = 0.4 + rng.random() * 0.25
		const [r, g, b] = hslToRgb(hue * 360, sat, lit)
		colors[3 * i] = r
		colors[3 * i + 1] = g
		colors[3 * i + 2] = b
	}
	return colors
}

function emptyProvinces(N: number): GenesisProvinces {
	return {
		regionProvince: new Int32Array(N).fill(-1),
		seeds: new Int32Array(0),
		count: 0,
		desolate: new Uint8Array(0),
		waterAccess: new Uint8Array(0),
		riverAccess: new Uint8Array(0),
		lakeAccess: new Uint8Array(0),
		landmassId: new Int32Array(0),
		adjOffset: new Int32Array(1),
		adjList: new Int32Array(0),
		size: new Int32Array(0),
		colors: new Float32Array(0),
	}
}
