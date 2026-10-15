import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"
import type {
	ComputePopulationParams,
	ComputeProvinceHabitabilityParams,
	ProvinceAreasKm2Params,
	ProvincePopulation,
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
	const rng = RNG.createRng({ seed: seed + 77777 })

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

function _provinceAreasKm2({
	mesh,
	regionProvince,
	provinceCount,
	planetRadiusKm,
}: ProvinceAreasKm2Params): Float64Array {
	const regionAreaKm2 = UNITS.regionAreasKm2({ mesh, planetRadiusKm })
	const out = new Float64Array(provinceCount)
	for (let r = 0; r < regionProvince.length; r++) {
		const p = regionProvince[r]
		if (p >= 0) out[p] += regionAreaKm2[r]
	}
	return out
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
	mesh,
	planetRadiusKm,
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

	// Global habitability score = sum over land of cellArea * habitability,
	// normalized. Per-province mean cell area (area / land-region count) so the
	// adaptive Earth import — which packs more, smaller cells onto land — no
	// longer inflates the score; identical to a uniform 4piR**2/N on an even mesh.
	const radiusKm = planetRadiusKm ?? UNITS.defaultPlanetRadiusKm
	const provinceAreaKm2 = _provinceAreasKm2({
		mesh,
		regionProvince: provinces.regionProvince,
		provinceCount: count,
		planetRadiusKm: radiusKm,
	})

	let habitabilityScore = 0
	for (let i = 0; i < count; i++) {
		const meanCellAreaKm2 = provinceAreaKm2[i] / Math.max(1, provinces.size[i])
		habitabilityScore += meanCellAreaKm2 * habitability[i]
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

export const POPULATION = {
	computeProvinceHabitability,
	computePopulation,
}
