import { HEAT } from "@/model/climate/locked/heat"
import type { ComputeTidalRainParams } from "@/model/climate/locked/rain/types"
import { RAIN_SHARED } from "@/model/climate/rain-shared"
import { SimplexNoise } from "@/model/shared/simplex-noise"
import { MATH } from "@/model/shared/math"
import { UNITS } from "@/model/shared/units"

const RAD2DEG = 180 / Math.PI

function computeTidalRain({
	mesh,
	climate,
	isLand,
	params,
	distCoast,
}: ComputeTidalRainParams): { monthly: Float32Array; annual: Float32Array } {
	const N = mesh.numRegions
	const pressure = MATH.clamp({ value: params?.pressure ?? 1, lo: 0.1, hi: 10 })
	const pressureRainFactor = RAIN_SHARED.getPressureRainFactor(params?.pressure)
	void UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm: params?.planetRadiusKm })
	const { landRegions, landNeighborOffset, landNeighborList } =
		RAIN_SHARED.buildRegionGraph({ mesh, mask: isLand })

	const ecc = params?.eccentricity ?? 0
	const monthlyLibration = HEAT.computeMonthlyLibration({
		eccentricity: ecc,
		perihelion: params?.perihelion ?? 102,
	})
	const monthlyDeclination = HEAT.computeMonthlyLockedDeclination({
		obliquity: params?.obliquity ?? 0,
		eccentricity: ecc,
		perihelion: params?.perihelion ?? 102,
	})

	const logP = Math.log2(Math.max(0.1, pressure))
	const terminatorStrength = MATH.clamp({
		value: 0.1 + logP * 0.12,
		lo: 0.02,
		hi: 0.55,
	})
	const nightsideDrizzle = MATH.clamp({
		value: (logP - 0.5) * 0.05,
		lo: 0,
		hi: 0.15,
	})

	const seed = params?.seed ?? 0
	const sn1 = new SimplexNoise(seed + 4001)
	const sn2 = new SimplexNoise(seed + 4002)
	const FREQ1 = 3.0
	const FREQ2 = 7.0
	const AMP1 = 0.35
	const AMP2 = 0.15
	const boundaryWarpDeg = RAIN_SHARED.computeRainBandWarpField({
		mesh,
		seed,
		amplitudeDeg: 8,
		regions: landRegions,
	})

	const monthly = new Float32Array(N * 12)
	for (const r of landRegions) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		const temp = climate.temperature_avg[r]
		const ceiling = RAIN_SHARED.ceilingScale(temp)
		// distCoast is already real km (computeCoastDistances), not a hop
		// count, so no further *avgEdgeKm conversion is needed here.
		const moistureAvail = distCoast
			? MATH.clamp({ value: 1 - distCoast[r] / 2835, lo: 0, hi: 1 })
			: 1

		const n =
			sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
			sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
		const noiseMul = Math.max(0, 1 + n)

		for (let month = 0; month < 12; month++) {
			const sub = HEAT.getSubstellarDirWithOffsetAndDeclination({
				substellarLon: params?.substellarLon ?? UNITS.defaultSubstellarLon,
				lonOffsetRad: monthlyLibration[month],
				declinationRad: monthlyDeclination[month],
			})
			const ct = Math.max(-1, Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]))
			const thetaDeg =
				Math.acos(MATH.clamp({ value: ct, lo: -1, hi: 1 })) * RAD2DEG +
				boundaryWarpDeg[r]

			const convection = ct > 0 ? 2 * ct ** 8 : 0
			const termDist = Math.abs(thetaDeg - 85)
			const terminator =
				Math.exp((-termDist * termDist) / (2 * 18 * 18)) * terminatorStrength
			const nightside =
				ct < 0.1
					? nightsideDrizzle *
						MATH.clamp({ value: 1 - (thetaDeg - 95) / 70, lo: 0, hi: 1 })
					: 0

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

export const RAIN = {
	computeTidalRain,
}
