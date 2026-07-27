import { HEAT } from "@/model/climate/locked/heat"
import type { ComputeLockedWindVectorsParams } from "@/model/climate/locked/wind/types"
import { RAIN } from "@/model/climate/rain"
import type { WindSurface } from "@/model/climate/wind/types"
import { MATH } from "@/model/shared/math"
import { UNITS } from "@/model/shared/units"

function surfaceWindFactor({
	r,
	surface,
}: {
	r: number
	surface: WindSurface
}): number {
	const TOPO_OCEAN = 5
	const TOPO_LAKE = 6
	const topoCode = surface.topography?.[r]
	const isWater = topoCode === TOPO_OCEAN || topoCode === TOPO_LAKE
	const slope = surface.slopeScore?.[r] ?? 0

	let vegFactor = 1.0
	if (!isWater) {
		switch (surface.vegetation?.[r]) {
			case 1:
				vegFactor = 1.03
				break
			case 2:
				vegFactor = 1.0
				break
			case 3:
				vegFactor = 0.93
				break
			case 4:
				vegFactor = 0.84
				break
			case 5:
				vegFactor = 0.75
				break
			case 6:
				vegFactor = 0.66
				break
		}
	}

	let topoBase = 1.0
	switch (topoCode) {
		case 0:
			topoBase = 1.0
			break // FLAT
		case 4:
			topoBase = 0.93
			break // MARSH
		case 1:
			topoBase = 0.88
			break // HILL
		case 2:
			topoBase = 0.93
			break // PLATEAU
		case 3:
			topoBase = 0.58
			break // MOUNTAIN
		case TOPO_OCEAN:
			topoBase = 1.1
			break
		case TOPO_LAKE:
			topoBase = 1.08
			break
	}
	const topoFactor = topoBase * (1.0 - 0.12 * slope)
	const coastalFactor = isWater
		? 1.0
		: 1.0 + 0.12 * Math.exp(-(surface.oceanDist?.[r] ?? 0) / 800.0)

	return vegFactor * topoFactor * coastalFactor
}

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
	const { adjOffset, adjList, r_xyz } = mesh
	const { edgeEastward, edgeNorthward } = RAIN.getClimateGeometry(mesh)

	const substellarLon = params?.substellarLon ?? UNITS.defaultSubstellarLon
	const obliquity = params?.obliquity ?? 0
	const eccentricity = params?.eccentricity ?? 0
	const perihelion = params?.perihelion ?? 102

	// Monthly libration and declination — determine substellar position each month
	const monthlyLibration = HEAT.computeMonthlyLibration({
		eccentricity,
		perihelion,
	})
	const monthlyDeclination = HEAT.computeMonthlyLockedDeclination({
		obliquity,
		eccentricity,
		perihelion,
	})

	// Select which month's substellar point to use (undefined → annual mean ≈ 0,0)
	const libRad =
		month !== undefined && month >= 0 && month < 12
			? monthlyLibration[month]
			: 0
	const decRad =
		month !== undefined && month >= 0 && month < 12
			? monthlyDeclination[month]
			: 0

	const sub = HEAT.getSubstellarDirWithOffsetAndDeclination({
		substellarLon,
		lonOffsetRad: libRad,
		declinationRad: decRad,
	})

	// Primary pressure: minimum at substellar (hot), maximum at Substellar (cold)
	const pressure = new Float32Array(N)
	const temps =
		month !== undefined && month >= 0 && month < 12
			? climate.temperature_monthly.subarray(month * N, (month + 1) * N)
			: climate.temperature_avg

	// Compute per-cell stellar cosine (ct = cos θ, where θ = angular distance from
	// substellar point) so it can be reused for both pressure and bin lookup.
	const cellCt = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]
		cellCt[r] = MATH.clamp({
			value: x * sub[0] + y * sub[1] + z * sub[2],
			lo: -1,
			hi: 1,
		})
	}

	// Reference temperature binned by stellar angle (cos θ mapped to [0, BINS)).
	// Using stellar-angle bins — not latitude bins — ensures the mean at each
	// bin captures the expected temperature for that day/night distance, so the
	// thermal anomaly only reflects genuine local deviations (hot deserts, cold
	// uplands) rather than the entire day-night gradient.  Using latitude bins
	// instead would produce a systematic pressure-gradient peak at ~45–60° from
	// the substellar rather than at the terminator where it belongs.
	const STELLAR_BINS = 36
	const stellarBinSum = new Float64Array(STELLAR_BINS)
	const stellarBinCount = new Int32Array(STELLAR_BINS)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0.5) continue
		const bin = Math.max(
			0,
			Math.min(
				STELLAR_BINS - 1,
				Math.floor(((cellCt[r] + 1) / 2) * STELLAR_BINS),
			),
		)
		stellarBinSum[bin] += temps[r]
		stellarBinCount[bin]++
	}
	const stellarBinMean = new Float32Array(STELLAR_BINS)
	for (let i = 0; i < STELLAR_BINS; i++) {
		stellarBinMean[i] =
			stellarBinCount[i] > 0 ? stellarBinSum[i] / stellarBinCount[i] : 0
	}

	for (let r = 0; r < N; r++) {
		// Stellar pressure: -1 at substellar, +1 at Substellar
		const stellarPressure = -cellCt[r]

		if (elevation_km[r] > 0.5) {
			pressure[r] = stellarPressure
			continue
		}
		const bin = Math.max(
			0,
			Math.min(
				STELLAR_BINS - 1,
				Math.floor(((cellCt[r] + 1) / 2) * STELLAR_BINS),
			),
		)
		const thermalAnomaly = (-0.2 * (temps[r] - stellarBinMean[bin])) / 15

		pressure[r] = stellarPressure + thermalAnomaly
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

		// Terminator jet: convergence of night→day surface flow amplifies winds
		// near the terminator (ct≈0). Factor = 1 + k·sin⁴(θ) = 1 + k·(1−ct²)².
		// Applied before normalisation so the 90th-percentile calibration absorbs it,
		// keeping the absolute reference speed intact while sharpening the contrast.
		const ct = cellCt[r]
		const sin2 = 1.0 - ct * ct // sin²(θ): 1 at terminator, 0 at poles
		const terminatorFactor = 1.0 + 2.0 * sin2 * sin2 // peaks at 3× at terminator
		rawSpeed[r] = gradMag * terminatorFactor

		const u = -gradPEast
		const v = -gradPNorth
		const mag = Math.hypot(u, v)
		if (mag > 1e-9) {
			windU[r] = u / mag
			windV[r] = v / mag
		}
	}

	// No Coriolis rotation factor — circulation is purely ageostrophic.
	// 90th percentile → 10 m/s reference, matching the thermally-direct cap used
	// for slow rotators (same regime). Terminator jet factor handles spatial contrast.
	// Pressure factor: thin atmosphere → faster winds for same thermal gradient.
	const sorted = rawSpeed.slice().sort()
	const pct90 = sorted[Math.floor(0.9 * N)] ?? 1e-6
	const ref = Math.max(pct90, 1e-6)
	const pressureFactor =
		1.0 / Math.sqrt(Math.max(params?.pressure ?? 1.0, 0.01))
	const windSpeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const base = (rawSpeed[r] / ref) * 10 * pressureFactor
		windSpeed[r] = surface ? base * surfaceWindFactor({ r, surface }) : base
	}

	return { windU, windV, pressure, windSpeed }
}

export const WIND = {
	computeLockedWindVectors,
}
