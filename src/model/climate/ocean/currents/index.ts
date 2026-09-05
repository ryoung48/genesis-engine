import { OCEAN_CIRCULATION } from "@/model/climate/ocean/currents/circulation"
import { OCEAN_GRID } from "@/model/climate/ocean/currents/grid"
import { OCEAN_HEAT } from "@/model/climate/ocean/currents/heat"
import type {
	ApplySSTToClimateParams,
	BuildOceanCurrentGridParams,
	ComputeSSTParams,
	CurrentDisplayInput,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"

const SST_ANOMALY_SATURATION_C = 4

function computeSST(input: ComputeSSTParams): GenesisOceanCurrents {
	const { mesh, isLand, climate, landmarks, params, elevation_km } = input
	const N = mesh.numRegions
	const ocean = Uint8Array.from(isLand, (land, r) =>
		!land &&
		landmarks.type[landmarks.regionLandmark[r]] !== LANDMARKS.landmarkTypeLake
			? 1
			: 0,
	)
	const grid = OCEAN_GRID.build({
		mesh,
		ocean,
		climate,
		elevation: elevation_km,
		radius: params.planetRadiusKm * 1000,
	})
	const n = grid.mesh.numRegions
	const wind = { u: new Float32Array(n * 12), v: new Float32Array(n * 12) }
	for (let month = 0; month < 12; month++) {
		if (input.wind) {
			for (let r = 0; r < n; r++) {
				const source = month * N + grid.source[r]
				wind.u[month * n + r] = Number.isFinite(input.wind.u[source])
					? input.wind.u[source]
					: 0
				wind.v[month * n + r] = Number.isFinite(input.wind.v[source])
					? input.wind.v[source]
					: 0
			}
		} else {
			for (let r = 0; r < n; r++)
				if (
					!Number.isFinite(
						grid.climate.temperature_monthly[month * n + r] +
							grid.climate.temperature_monthly_nolapse[month * n + r] +
							grid.climate.temperature_avg[r] +
							grid.elevation[r],
					)
				)
					throw new Error(
						`Invalid downsample r=${r} source=${grid.source[r]} month=${month} temp=${grid.climate.temperature_monthly[month * n + r]} avg=${grid.climate.temperature_avg[r]} elev=${grid.elevation[r]}`,
					)
			const vectors = WIND.computeWindVectors({
				mesh: grid.mesh,
				climate: grid.climate,
				elevation_km: grid.elevation,
				params,
				month,
			})
			for (let r = 0; r < n; r++) {
				wind.u[month * n + r] = vectors.windU[r] * vectors.windSpeed[r]
				wind.v[month * n + r] = vectors.windV[r] * vectors.windSpeed[r]
			}
		}
	}
	const circulation = OCEAN_CIRCULATION.solve({ grid, params, wind })
	const heat = OCEAN_HEAT.solve({
		grid,
		circulation,
		yearSeconds: params.daysPerYear * params.hoursPerDay * 3600,
	})
	const { edgeEastward, edgeNorthward } = RAIN.getClimateGeometry(grid.mesh)
	const landDelta = new Float32Array(n * 12)
	let source = new Float64Array(n),
		target = new Float64Array(n)
	for (let month = 0; month < 12; month++) {
		source.fill(0)
		for (let r = 0; r < n; r++)
			if (grid.ocean[r]) source[r] = heat.delta[month * n + r]
		for (let pass = 0; pass < 40; pass++) {
			for (let r = 0; r < n; r++) {
				if (grid.ocean[r]) {
					target[r] = source[r]
					continue
				}
				const i = month * n + r
				let weighted = 0,
					total = 0
				for (
					let j = grid.mesh.adjOffset[r];
					j < grid.mesh.adjOffset[r + 1];
					j++
				) {
					const speed = Math.max(
						0,
						-wind.u[i] * edgeEastward[j] - wind.v[i] * edgeNorthward[j],
					)
					if (speed <= 0) continue
					const distance =
						grid.mesh.neighborDist[j] * params.planetRadiusKm * 1000
					weighted +=
						speed *
						source[grid.mesh.adjList[j]] *
						Math.exp(-distance / (speed * 2 * 86400))
					total += speed
				}
				target[r] = total > 0 ? weighted / total : 0
			}
			;[source, target] = [target, source]
		}
		landDelta.set(source, month * n)
	}
	const sst = new Float32Array(N),
		sstMonthly = new Float32Array(N * 12)
	const uMonthly = new Float32Array(N * 12),
		vMonthly = new Float32Array(N * 12)
	const temperatureDeltaMonthly = new Float32Array(N * 12)
	const { latDeg } = RAIN.getClimateGeometry(mesh)
	const bands = new Int32Array(N)
	for (let r = 0; r < N; r++)
		bands[r] = Math.max(0, Math.min(89, Math.floor((latDeg[r] + 90) / 2)))
	for (let month = 0; month < 12; month++) {
		const sums = new Float64Array(90),
			counts = new Float64Array(90)
		for (let r = 0; r < N; r++) {
			const cell = grid.region[r],
				i = month * N + r
			if (cell >= 0) {
				const ci = month * n + cell
				if (ocean[r] && grid.ocean[cell]) {
					uMonthly[i] = circulation.u[ci]
					vMonthly[i] = circulation.v[ci]
					temperatureDeltaMonthly[i] = heat.delta[ci]
				} else if (isLand[r]) temperatureDeltaMonthly[i] = landDelta[ci]
			}
			if (ocean[r]) {
				sums[bands[r]] +=
					climate.temperature_monthly[i] + temperatureDeltaMonthly[i]
				counts[bands[r]]++
			}
		}
		for (let r = 0; r < N; r++) {
			const i = month * N + r
			if (ocean[r])
				sstMonthly[i] =
					(climate.temperature_monthly[i] +
						temperatureDeltaMonthly[i] -
						sums[bands[r]] / counts[bands[r]]) /
					SST_ANOMALY_SATURATION_C
			sst[r] += sstMonthly[i] / 12
		}
	}
	return {
		sst,
		sstMonthly,
		uMonthly,
		vMonthly,
		temperatureDeltaMonthly,
		ocean,
		circulationCycleError: circulation.cycleError,
		heatCycleError: heat.cycleError,
	}
}

function applySSTToClimate({
	mesh,
	climate,
	isLand,
	oceanCurrents,
}: ApplySSTToClimateParams): void {
	const n = mesh.numRegions
	for (let r = 0; r < n; r++) {
		if (!isLand[r] && !oceanCurrents.ocean[r]) continue
		let total = 0
		for (let month = 0; month < 12; month++) {
			const i = month * n + r
			climate.temperature_monthly[i] += oceanCurrents.temperatureDeltaMonthly[i]
			climate.temperature_monthly_nolapse[i] +=
				oceanCurrents.temperatureDeltaMonthly[i]
			total += climate.temperature_monthly[i]
		}
		climate.temperature_avg[r] = total / 12
	}
}

function buildGrid({
	mesh,
	isLand,
	u,
	v,
	scalar,
	ocean,
	month,
}: CurrentDisplayInput) {
	const n = mesh.numRegions
	const currentU = new Float32Array(n),
		currentV = new Float32Array(n),
		speed = new Float32Array(n),
		warmth = new Float32Array(n)
	const first = month !== undefined && month >= 0 && month < 12 ? month : 0
	const end = month !== undefined && month >= 0 && month < 12 ? month + 1 : 12
	for (let r = 0; r < n; r++) {
		if (isLand[r] || (ocean && !ocean[r])) continue
		let count = 0,
			scalarCount = 0
		for (let m = first; m < end; m++) {
			const i = m * n + r
			if (u && v && Number.isFinite(u[i]) && Number.isFinite(v[i])) {
				currentU[r] += u[i]
				currentV[r] += v[i]
				count++
			}
			if (scalar && Number.isFinite(scalar[i])) {
				warmth[r] += scalar[i]
				scalarCount++
			}
		}
		if (count) {
			currentU[r] /= count
			currentV[r] /= count
		}
		if (scalarCount)
			warmth[r] = Math.max(-1, Math.min(1, warmth[r] / scalarCount))
		speed[r] = Math.hypot(currentU[r], currentV[r])
	}
	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: currentU,
		vectorV: currentV,
		vectorSpeed: speed,
		options: {
			scalar: warmth,
			allowCell: (r) => !isLand[r] && (!ocean || !!ocean[r]) && speed[r] > 0,
			isBlockedRegion: (r) => !!isLand[r] || !!(ocean && !ocean[r]),
		},
	})
}

function buildOceanCurrentGrid({
	mesh,
	isLand,
	oceanCurrents,
	month,
}: BuildOceanCurrentGridParams) {
	return buildGrid({
		mesh,
		isLand,
		u: oceanCurrents.uMonthly,
		v: oceanCurrents.vMonthly,
		scalar: oceanCurrents.sstMonthly,
		ocean: oceanCurrents.ocean,
		month,
	})
}

function observedOceanCurrentGridForMonth({
	mesh,
	isLand,
	observedCurrent,
	month,
}: ObservedOceanCurrentGridParams) {
	return buildGrid({
		mesh,
		isLand,
		u: observedCurrent?.real_u_monthly,
		v: observedCurrent?.real_v_monthly,
		scalar: observedCurrent?.real_sst_anomaly_monthly?.map(
			(value) => value / SST_ANOMALY_SATURATION_C,
		),
		ocean: undefined,
		month,
	})
}

export const OCEAN_CURRENTS = {
	computeSST,
	applySSTToClimate,
	buildOceanCurrentGrid,
	observedOceanCurrentGridForMonth,
	sstAnomalySaturationC: SST_ANOMALY_SATURATION_C,
}
