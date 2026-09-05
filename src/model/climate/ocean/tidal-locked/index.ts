import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import type {
	ComputeLockedSSTParams,
	LockedSSTParams,
} from "@/model/climate/ocean/tidal-locked/types"
import { HEAT } from "@/model/climate/temperature/tidal-locked"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const CURRENT_EFFECT_MONTHS = 12

const RAD2DEG = 180 / Math.PI

const substellarBandC = (distDeg: number) =>
	MATH.piecewise({
		domain: [0, 30, 60, 90, 120, 150, 180],
		range: [6, 4, 1, -1, -3, -4, -4],
		x: distDeg,
	})

const MODELED_SST_SATURATION_C = 6

function computeMonthlySubstellarDirections(
	params: LockedSSTParams,
): Array<[number, number, number]> {
	const substellarLon = params?.substellarLon ?? UNITS.defaultSubstellarLon
	const obliquity = params?.obliquity ?? 0
	const eccentricity = params?.eccentricity ?? 0
	const perihelion = params?.perihelion ?? 102
	const monthlyLibration = HEAT.computeMonthlyLibration({
		eccentricity,
		perihelion,
	})
	const monthlyDeclination = HEAT.computeMonthlyLockedDeclination({
		obliquity,
		eccentricity,
		perihelion,
	})
	const directions: Array<[number, number, number]> = []
	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++)
		directions.push(
			HEAT.getSubstellarDirWithOffsetAndDeclination({
				substellarLon,
				lonOffsetRad: monthlyLibration[month],
				declinationRad: monthlyDeclination[month],
			}),
		)
	return directions
}

function computeLockedSST({
	mesh,
	isLand,
	distCoast,
	landmarks,
	params,
}: ComputeLockedSSTParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const avgEdgeKm = UNITS.meanEdgeLengthKm({
		mesh,
		planetRadiusKm: params?.planetRadiusKm,
	})
	const isLake = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		const landmark = landmarks.regionLandmark[r]
		if (landmark < 0 || isLand[r]) continue
		if (landmarks.type[landmark] === LANDMARKS.landmarkTypeLake) isLake[r] = 1
	}

	const monthlyDirs = computeMonthlySubstellarDirections(params)
	const r_xyz = mesh.r_xyz

	const sstMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const sst = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const decay = COASTAL_BLEED.decay(distCoast[r])
		if (decay <= 0) continue
		const offset = r * 3
		const x = r_xyz[offset]
		const y = r_xyz[offset + 1]
		const z = r_xyz[offset + 2]
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const dir = monthlyDirs[month]
			const ct = MATH.clamp({
				value: x * dir[0] + y * dir[1] + z * dir[2],
				lo: -1,
				hi: 1,
			})
			const distDeg = Math.acos(ct) * RAD2DEG
			const anomalyC = substellarBandC(distDeg) * decay
			const value = MATH.clamp({
				value: anomalyC / MODELED_SST_SATURATION_C,
				lo: -1,
				hi: 1,
			})
			sstMonthly[month * N + r] = value
			sst[r] += value / CURRENT_EFFECT_MONTHS
		}
	}

	const landBleed = COASTAL_BLEED.apply({
		mesh,
		isLand,
		isLake,
		oceanValue: sst,
		avgEdgeKm,
	})
	for (let r = 0; r < N; r++) if (isLand[r]) sst[r] = landBleed[r]

	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
		const monthOcean = sstMonthly.subarray(month * N, (month + 1) * N)
		const monthBleed = COASTAL_BLEED.apply({
			mesh,
			isLand,
			isLake,
			oceanValue: monthOcean,
			avgEdgeKm,
		})
		for (let r = 0; r < N; r++)
			if (isLand[r]) sstMonthly[month * N + r] = monthBleed[r]
	}

	return { sst, sstMonthly }
}

export const LOCKED_OCEAN_CURRENTS = { computeLockedSST }
