import { RAIN } from "@/model/climate/precipitation/rain"
import type { ComputeLockedWindVectorsParams } from "@/model/climate/weather/tidal-locked/types"
import { ROUGHNESS } from "@/model/climate/weather/wind/roughness"

const SEA_LEVEL_HPA = 1013.25
const KELVIN = 273.15
const GAS_CONSTANT = 287
const LAPSE_C_PER_KM = 6.5
const COLUMN_WARMING_SHARE = 0.5
const FRICTION_EFFICIENCY = 0.1
const MAX_GRADIENT_RATIO = 3

function computeLockedWindVectors({
	mesh,
	climate,
	elevation_km,
	params,
	month,
	surface,
}: ComputeLockedWindVectorsParams): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { edgeEastward, edgeNorthward } = RAIN.getClimateGeometry(mesh)

	const temps =
		month !== undefined && month >= 0 && month < 12
			? climate.temperature_monthly.subarray(month * N, (month + 1) * N)
			: climate.temperature_avg

	const seaLevelC = new Float32Array(N)
	let areaSum = 0
	let tempSum = 0
	for (let r = 0; r < N; r++) {
		seaLevelC[r] = temps[r] + LAPSE_C_PER_KM * Math.max(0, elevation_km[r])
		areaSum += mesh.regionArea[r]
		tempSum += seaLevelC[r] * mesh.regionArea[r]
	}
	const meanC = tempSum / areaSum
	const meanK = meanC + KELVIN
	const surfaceHPa = SEA_LEVEL_HPA * Math.max(params?.pressure ?? 1, 0.01)

	// Thermal low: a warm column holds less mass, so surface pressure falls with the
	// column's warming, taken as COLUMN_WARMING_SHARE of the surface anomaly
	const pressure = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		pressure[r] =
			(-surfaceHPa * COLUMN_WARMING_SHARE * (seaLevelC[r] - meanC)) / meanK
	}

	// Smooth pressure (2 passes — stellar gradient is already smooth)
	const buf = new Float32Array(N)
	for (let pass = 0; pass < 2; pass++) {
		for (let r = 0; r < N; r++) {
			let sum = pressure[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				sum += pressure[adjList[j]]
				count++
			}
			buf[r] = sum / count
		}
		for (let r = 0; r < N; r++) pressure[r] = buf[r]
	}

	// Wind = pure ageostrophic (no Coriolis): flows directly toward low pressure
	const windU = new Float32Array(N)
	const windV = new Float32Array(N)
	const rawSpeed = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let gradPEast = 0
		let gradPNorth = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const dP = pressure[adjList[j]] - pressure[r]
			gradPEast += dP * edgeEastward[j]
			gradPNorth += dP * edgeNorthward[j]
			count++
		}
		if (count > 0) {
			gradPEast /= count
			gradPNorth /= count
		}

		const gradMag = Math.hypot(gradPEast, gradPNorth)

		rawSpeed[r] = gradMag

		const u = -gradPEast
		const v = -gradPNorth
		const mag = Math.hypot(u, v)
		if (mag > 1e-9) {
			windU[r] = u / mag
			windV[r] = v / mag
		}
	}

	// Winds are ageostrophic (no Coriolis): the day-night pressure drop (10th to 90th
	// percentile of the thermal low) accelerates air as sqrt(2Δp/ρ), of which friction
	// leaves FRICTION_EFFICIENCY; the mesh gradient only shapes the pattern around
	// that scale: a local drop of share x of it gives sqrt(x) of the speed (Bernoulli),
	// and a local gradient past MAX_GRADIENT_RATIO times the 90th percentile is capped.
	const sortedP = pressure.slice().sort()
	const dropHPa =
		(sortedP[Math.floor(0.9 * N)] ?? 0) - (sortedP[Math.floor(0.1 * N)] ?? 0)
	const density = (surfaceHPa * 100) / (GAS_CONSTANT * meanK)
	const referenceSpeed =
		FRICTION_EFFICIENCY * Math.sqrt((2 * dropHPa * 100) / density)
	const sorted = rawSpeed.slice().sort()
	const pct90 = sorted[Math.floor(0.9 * N)] ?? 1e-6
	const ref = Math.max(pct90, 1e-6)
	const roughnessField = surface
		? ROUGHNESS.surfaceFactorField({ N, surface })
		: undefined
	const windSpeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const base =
			Math.sqrt(Math.min(rawSpeed[r] / ref, MAX_GRADIENT_RATIO)) *
			referenceSpeed
		windSpeed[r] = roughnessField ? base * roughnessField[r] : base
	}

	return { windU, windV, pressure, windSpeed }
}

export const WIND = {
	computeLockedWindVectors,
}
