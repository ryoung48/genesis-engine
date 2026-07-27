import type {
	ComputeLocationsParams,
	GenesisLocations,
} from "@/model/geography/terrain/locations/types"
import { PROVINCES } from "@/model/geography/terrain/provinces"
import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"

const LOCATION_AREA_TARGET_KM2 = PROVINCES.provinceAreaTargetKm2 / 2

function computeLocations({
	provinces,
	mesh,
	seed,
	options,
}: ComputeLocationsParams): GenesisLocations {
	const { adjOffset, adjList } = mesh
	const N = mesh.numRegions
	const P = provinces.count

	const rng = RNG.createRng({ seed: seed ^ 0xba120035 })

	const avgEdgeKm = UNITS.meanEdgeLengthKm({
		mesh,
		planetRadiusKm: options?.planetRadiusKm,
	})
	const regionAreaKm2 = avgEdgeKm * avgEdgeKm * Math.sqrt(3) * 0.5

	// Collect regions per province
	const provinceRegions: number[][] = Array.from(
		{ length: P },
		(): number[] => [],
	)
	for (let r = 0; r < N; r++) {
		const p = provinces.regionProvince[r]
		if (p >= 0) provinceRegions[p].push(r)
	}

	const allSeeds: number[] = []
	const locProvince: number[] = []

	for (let p = 0; p < P; p++) {
		const regions = provinceRegions[p]
		if (regions.length === 0) continue

		const targetCount = Math.max(
			1,
			Math.round((regions.length * regionAreaKm2) / LOCATION_AREA_TARGET_KM2),
		)

		// Fisher-Yates shuffle within province
		for (let i = regions.length - 1; i > 0; i--) {
			const j = rng.randint(0, i)
			const tmp = regions[i]
			regions[i] = regions[j]
			regions[j] = tmp
		}

		// Pick seeds evenly spaced through the shuffled list
		const step = regions.length / targetCount
		for (let i = 0; i < targetCount; i++) {
			allSeeds.push(regions[Math.min(Math.floor(i * step), regions.length - 1)])
			locProvince.push(p)
		}
	}

	const locationCount = allSeeds.length
	const seedsArr = new Int32Array(allSeeds)
	const locationProvinceArr = new Int32Array(locProvince)

	// Competitive BFS — expand only within the same province
	const regionLocation = new Int32Array(N).fill(-1)
	for (let l = 0; l < locationCount; l++) regionLocation[seedsArr[l]] = l

	const queue = new Int32Array(N)
	let head = 0
	let tail = 0
	for (let l = 0; l < locationCount; l++) queue[tail++] = seedsArr[l]

	while (head < tail) {
		const r = queue[head++]
		const loc = regionLocation[r]
		const prov = provinces.regionProvince[r]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (regionLocation[nb] >= 0 || provinces.regionProvince[nb] !== prov)
				continue
			regionLocation[nb] = loc
			queue[tail++] = nb
		}
	}

	// Location sizes
	const size = new Int32Array(locationCount)
	for (let r = 0; r < N; r++) {
		const l = regionLocation[r]
		if (l >= 0) size[l]++
	}

	// Location adjacency (CSR)
	const locNeighborSets: Set<number>[] = Array.from(
		{ length: locationCount },
		() => new Set(),
	)
	for (let r = 0; r < N; r++) {
		const l1 = regionLocation[r]
		if (l1 < 0) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const l2 = regionLocation[adjList[j]]
			if (l2 >= 0 && l2 !== l1) locNeighborSets[l1].add(l2)
		}
	}

	let totalAdj = 0
	for (let l = 0; l < locationCount; l++) totalAdj += locNeighborSets[l].size
	const adjOffsetArr = new Int32Array(locationCount + 1)
	const adjListArr = new Int32Array(totalAdj)
	let idx = 0
	for (let l = 0; l < locationCount; l++) {
		adjOffsetArr[l] = idx
		for (const nb of locNeighborSets[l]) adjListArr[idx++] = nb
	}
	adjOffsetArr[locationCount] = idx

	return {
		regionLocation,
		locationProvince: locationProvinceArr,
		seeds: seedsArr,
		count: locationCount,
		adjOffset: adjOffsetArr,
		adjList: adjListArr,
		size,
		colors: new Float32Array(locationCount * 3),
	}
}

export const LOCATIONS = {
	computeLocations,
}
