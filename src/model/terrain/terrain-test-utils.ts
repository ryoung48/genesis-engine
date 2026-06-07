import type {
	OrogenClimate,
	OrogenHydrology,
	OrogenRainfall,
	SphereMesh,
} from ".."

export function buildLineMesh(numRegions: number): SphereMesh {
	const adjOffset = new Int32Array(numRegions + 1)
	const adjEntries: number[] = []
	const coords: number[] = []
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r] = adjEntries.length
		if (r > 0) adjEntries.push(r - 1)
		if (r < numRegions - 1) adjEntries.push(r + 1)
		const angle = (Math.PI * r) / Math.max(1, numRegions - 1)
		coords.push(Math.cos(angle), 0, Math.sin(angle))
	}
	adjOffset[numRegions] = adjEntries.length
	return {
		numRegions,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: new Float32Array(coords),
	} as unknown as SphereMesh
}

export function buildMesh(adjacency: number[][]): SphereMesh {
	const numRegions = adjacency.length
	const adjOffset = new Int32Array(numRegions + 1)
	const adjEntries: number[] = []
	const coords: number[] = []
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r] = adjEntries.length
		adjEntries.push(...adjacency[r])
		const angle = (2 * Math.PI * r) / Math.max(1, numRegions)
		coords.push(Math.cos(angle), 0, Math.sin(angle))
	}
	adjOffset[numRegions] = adjEntries.length
	return {
		numRegions,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: new Float32Array(coords),
	} as unknown as SphereMesh
}

export function buildDrainageMesh(
	landCount: number,
	extraOceanCount: number,
): SphereMesh {
	const totalRegions = landCount + extraOceanCount + 1
	const adjacency = Array.from({ length: totalRegions }, (): number[] => [])
	for (let r = 0; r < landCount; r++) {
		adjacency[r]?.push(r + 1)
		adjacency[r + 1]?.push(r)
	}
	return buildMesh(adjacency)
}

export function buildStarDrainageMesh(
	landCount: number,
	extraOceanCount: number,
): SphereMesh {
	const totalRegions = landCount + extraOceanCount + 1
	const adjacency = Array.from({ length: totalRegions }, (): number[] => [])
	if (landCount >= 1) {
		adjacency[0]?.push(1)
		adjacency[1]?.push(0)
	}
	for (let r = 2; r <= landCount; r++) {
		adjacency[1]?.push(r)
		adjacency[r]?.push(1)
	}
	return buildMesh(adjacency)
}

export function buildUniformRiverInputs(
	numRegions: number,
	isLand: Uint8Array,
	{
		monthlyRain = 100,
		temperature = 20,
		pet = 0,
		aridity = 1,
		baseflow = 0,
	}: {
		monthlyRain?: number
		temperature?: number
		pet?: number
		aridity?: number
		baseflow?: number
	} = {},
): {
	rainfall: OrogenRainfall
	climate: OrogenClimate
	hydrology: OrogenHydrology
} {
	const monthly = new Float32Array(12 * numRegions)
	const annual = new Float32Array(numRegions)
	const temperature_monthly = new Float32Array(12 * numRegions).fill(
		temperature,
	)
	const pet_monthly = new Float32Array(12 * numRegions).fill(pet)
	const aet_monthly = new Float32Array(12 * numRegions)
	const aridity_monthly = new Float32Array(12 * numRegions).fill(aridity)
	const baseflow_monthly = new Float32Array(12 * numRegions).fill(baseflow)

	for (let month = 0; month < 12; month++) {
		for (let r = 0; r < numRegions; r++) {
			if (!isLand[r]) continue
			const idx = month * numRegions + r
			monthly[idx] = monthlyRain
			annual[r] += monthlyRain
		}
	}

	return {
		rainfall: {
			monthly,
			annual,
			east: new Float32Array(numRegions),
			west: new Float32Array(numRegions),
		},
		climate: {
			temperature_monthly,
			pet_monthly,
		} as OrogenClimate,
		hydrology: {
			aet_monthly,
			aridity_monthly,
			baseflow_monthly,
		} as OrogenHydrology,
	}
}
