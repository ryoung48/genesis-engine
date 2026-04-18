/**
 * Province population initialization.
 * Computes per-province habitability and distributes population proportionally.
 * O(provinceCount) time, typed arrays.
 */

import type { OrogenLandmarks } from "../terrain/landmarks"
import type { OrogenProvinces } from "../types"
import { createRng } from "../util/rng"

// Habitability factors indexed by orogen codes

// climateZones: 0=ocean, 1=arctic, 2=subarctic, 3=boreal, 4=temperate, 5=subtropical, 6=tropical, 7=infernal, 8=chaotic
const HAB_CLIMATE = new Float32Array([
	0, 0.01, 0.1, 0.6, 1.25, 1.0, 0.8, 0.01, 0.01,
])

// vegetation: 0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle
const HAB_VEGETATION = new Float32Array([0, 0.1, 0.3, 0.8, 1.0, 0.8, 0.6])

// topography: 0=flat, 1=hills, 2=plateaus, 3=mountains, 4=marsh, 5=ocean, 6=lake
const HAB_TOPOGRAPHY = new Float32Array([1.0, 0.6, 0.8, 0.2, 0.6, 0, 0])
const HAB_COASTAL = 1.25

// landmark type: 0=continent, 1=island, 2=isle, 3=ocean, 4=sea, 5=lake
const HAB_LANDMARK = new Float32Array([1.0, 0.8, 0.5, 0, 0, 0])

export interface ProvincePopulation {
	/** Per-province habitability score */
	habitability: Float32Array
	/** Per-province rural population */
	population: Float32Array
	/** Aggregated global habitability score */
	habitabilityScore: number
	/** Total world population */
	totalPopulation: number
}

export function computePopulation(
	provinces: OrogenProvinces,
	landmarks: OrogenLandmarks,
	climateZones: Uint8Array,
	vegetation: Uint8Array,
	topography: Uint8Array,
	coastal: Uint8Array,
	riverVisible: Uint8Array,
	seed: number,
	planetRadiusKm?: number,
	numRegions?: number,
): ProvincePopulation {
	const { count, seeds, desolate, size, regionProvince } = provinces
	const rng = createRng(seed + 77777)

	const habitability = new Float32Array(count)
	const waterAccess = new Uint8Array(count)
	let totalHab = 0

	for (let r = 0; r < regionProvince.length; r++) {
		const province = regionProvince[r]
		if (province < 0) continue
		if (coastal[r] || riverVisible[r]) waterAccess[province] = 1
	}

	for (let i = 0; i < count; i++) {
		if (desolate[i]) continue

		const r = seeds[i]
		const cz = climateZones[r]
		const veg = vegetation[r]
		const topo = topography[r]
		const coastalFactor = waterAccess[i] ? HAB_COASTAL : 1
		const lm = landmarks.type[landmarks.regionLandmark[r]]

		const score =
			(HAB_CLIMATE[cz] ?? 0) *
			(HAB_VEGETATION[veg] ?? 0) *
			(HAB_TOPOGRAPHY[topo] ?? 0) *
			coastalFactor *
			(HAB_LANDMARK[lm] ?? 0) *
			size[i] *
			(0.8 + rng.random() * 0.4) // uniform(0.8, 1.2)

		habitability[i] = score
		totalHab += score
	}

	// Compute global habitability score (mirrors WORLD.habitability)
	// = sum(province.land * cellArea * habitability) / 1e8
	const N = numRegions ?? 100000
	const sphereAreaKm2 = 4 * Math.PI * (planetRadiusKm ?? 6371) ** 2
	const cellAreaKm2 = sphereAreaKm2 / N

	let habitabilityScore = 0
	for (let i = 0; i < count; i++) {
		habitabilityScore += size[i] * cellAreaKm2 * habitability[i]
	}
	habitabilityScore /= 1.698e9

	const totalPop = 215e6 * habitabilityScore

	const population = new Float32Array(count)
	if (totalHab > 0) {
		for (let i = 0; i < count; i++) {
			population[i] = (habitability[i] / totalHab) * totalPop
		}
	}

	return {
		habitability,
		population,
		habitabilityScore,
		totalPopulation: totalPop,
	}
}
