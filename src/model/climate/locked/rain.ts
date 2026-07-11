import type { GenesisClimate, GenesisParams, SphereMesh } from "../.."
import { clamp } from "../../shared/math"
import { SimplexNoise } from "../../shared/simplex-noise"
import { DEFAULT_SUBSTELLAR_LON, meanEdgeLengthKm } from "../../shared/units"
import {
	buildRegionGraph,
	ceilingScale,
	computeRainBandWarpField,
	getPressureRainFactor,
} from "../rain"
import {
	computeMonthlyLibration,
	computeMonthlyLockedDeclination,
	getSubstellarDirWithOffsetAndDeclination,
} from "./heat"

const RAD2DEG = 180 / Math.PI

/**
 * Rainfall for a tidally locked planet. Convective uplift concentrates
 * near the substellar point; rain tapers smoothly toward the terminator
 * and is near-zero on the nightside. Uses temperature and moisture
 * availability (ocean proximity) rather than latitude-band circulation.
 */
export function computeTidalRain(
	mesh: SphereMesh,
	climate: GenesisClimate,
	isLand: Uint8Array,
	params?: Pick<
		GenesisParams,
		| "seed"
		| "substellarLon"
		| "obliquity"
		| "pressure"
		| "eccentricity"
		| "perihelion"
		| "planetRadiusKm"
	>,
	distCoast?: Float32Array,
): { monthly: Float32Array; annual: Float32Array } {
	const N = mesh.numRegions
	const pressure = clamp(params?.pressure ?? 1, 0.1, 10)
	const pressureRainFactor = getPressureRainFactor(params?.pressure)
	void meanEdgeLengthKm(mesh, params?.planetRadiusKm)
	const { landRegions, landNeighborOffset, landNeighborList } =
		buildRegionGraph(mesh, isLand)

	const ecc = params?.eccentricity ?? 0
	const monthlyLibration = computeMonthlyLibration(
		ecc,
		params?.perihelion ?? 102,
	)
	const monthlyDeclination = computeMonthlyLockedDeclination(
		params?.obliquity ?? 0,
		ecc,
		params?.perihelion ?? 102,
	)

	const logP = Math.log2(Math.max(0.1, pressure))
	const terminatorStrength = clamp(0.1 + logP * 0.12, 0.02, 0.55)
	const nightsideDrizzle = clamp((logP - 0.5) * 0.05, 0, 0.15)

	const seed = params?.seed ?? 0
	const sn1 = new SimplexNoise(seed + 4001)
	const sn2 = new SimplexNoise(seed + 4002)
	const FREQ1 = 3.0
	const FREQ2 = 7.0
	const AMP1 = 0.35
	const AMP2 = 0.15
	const boundaryWarpDeg = computeRainBandWarpField(mesh, seed, 8, landRegions)

	const monthly = new Float32Array(N * 12)
	for (const r of landRegions) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		const temp = climate.temperature_avg[r]
		const ceiling = ceilingScale(temp)
		// distCoast is already real km (computeCoastDistances), not a hop
		// count, so no further *avgEdgeKm conversion is needed here.
		const moistureAvail = distCoast ? clamp(1 - distCoast[r] / 2835, 0, 1) : 1

		const n =
			sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
			sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
		const noiseMul = Math.max(0, 1 + n)

		for (let month = 0; month < 12; month++) {
			const sub = getSubstellarDirWithOffsetAndDeclination(
				params?.substellarLon ?? DEFAULT_SUBSTELLAR_LON,
				monthlyLibration[month],
				monthlyDeclination[month],
			)
			const ct = Math.max(-1, Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]))
			const thetaDeg =
				Math.acos(clamp(ct, -1, 1)) * RAD2DEG + boundaryWarpDeg[r]

			const convection = ct > 0 ? 2 * ct ** 8 : 0
			const termDist = Math.abs(thetaDeg - 85)
			const terminator =
				Math.exp((-termDist * termDist) / (2 * 18 * 18)) * terminatorStrength
			const nightside =
				ct < 0.1 ? nightsideDrizzle * clamp(1 - (thetaDeg - 95) / 70, 0, 1) : 0

			const weight = convection + terminator + nightside
			monthly[month * N + r] =
				weight * ceiling * moistureAvail * noiseMul * pressureRainFactor
		}
	}

	const smoothBuf = new Float32Array(N)
	for (let pass = 0; pass < 3; pass++) {
		for (let month = 0; month < 12; month++) {
			const offset = month * N
			for (let i = 0; i < landRegions.length; i++) {
				const r = landRegions[i]
				let sum = 0
				const start = landNeighborOffset[i]
				const end = landNeighborOffset[i + 1]
				for (let j = start; j < end; j++) {
					sum += monthly[offset + landNeighborList[j]]
				}
				sum += monthly[offset + r]
				smoothBuf[r] = sum / (end - start + 1)
			}
			for (const r of landRegions) {
				monthly[offset + r] = smoothBuf[r]
			}
		}
	}

	const annual = new Float32Array(N)
	for (const r of landRegions) {
		let sum = 0
		for (let month = 0; month < 12; month++) {
			sum += monthly[month * N + r]
		}
		annual[r] = sum
	}

	return { monthly, annual }
}
