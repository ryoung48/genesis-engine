import type { GenesisOceanCurrents, SphereMesh } from "@/model"
import { HEAT } from "@/model/climate/locked/heat"
import type {
	ApplyLockedCurrentTemperatureEffectParams,
	BuildLockedOceanCurrentGridParams,
	ComputeLockedOceanCurrentsParams,
	LockedCurrentParams,
} from "@/model/climate/locked/ocean-currents/types"
import { OCEAN_CURRENTS_SHARED } from "@/model/climate/ocean-currents-shared"
import { WIND } from "@/model/climate/wind"
import type { FlowGrid } from "@/model/climate/wind/types"
import { DEFAULT_SUBSTELLAR_LON, meanEdgeLengthKm } from "@/model/shared/units"
import type { GenesisLandmarks } from "@/model/terrain/landmarks"

const CURRENT_EFFECT_MONTHS = 12

const LOCKED_WARMTH_SMOOTHING_PASSES = 6

const LOCKED_VECTOR_SMOOTHING_PASSES = 2

const TYPE_LAKE = 5

function clamp({
	value,
	min,
	max,
}: {
	value: number
	min: number
	max: number
}): number {
	return Math.max(min, Math.min(max, value))
}

function normalizeField({
	field,
	isBlocked,
}: {
	field: Float32Array
	isBlocked: Uint8Array
}): void {
	let maxAbs = 0
	for (let i = 0; i < field.length; i++) {
		if (isBlocked[i]) continue
		maxAbs = Math.max(maxAbs, Math.abs(field[i]))
	}
	if (maxAbs <= 1e-6) return
	for (let i = 0; i < field.length; i++) {
		if (isBlocked[i]) {
			field[i] = 0
			continue
		}
		field[i] = clamp({ value: field[i] / maxAbs, min: -1, max: 1 })
	}
}

function buildLakeMask({
	numRegions,
	isLand,
	landmarks,
}: {
	numRegions: number
	isLand: Uint8Array
	landmarks: GenesisLandmarks
}): Uint8Array {
	const isLake = new Uint8Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		const landmark = landmarks.regionLandmark[r]
		if (landmark < 0 || isLand[r]) continue
		if (landmarks.type[landmark] === TYPE_LAKE) isLake[r] = 1
	}
	return isLake
}

function computeMonthlySubstellarDirections(
	params?: LockedCurrentParams,
): Array<[number, number, number]> {
	const substellarLon = params?.substellarLon ?? DEFAULT_SUBSTELLAR_LON
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

function getAnnualMeanSubstellarDirection(
	monthlyDirs: Array<[number, number, number]>,
): [number, number, number] {
	let x = 0
	let y = 0
	let z = 0
	for (const dir of monthlyDirs) {
		x += dir[0]
		y += dir[1]
		z += dir[2]
	}
	const mag = Math.hypot(x, y, z)
	if (mag <= 1e-6) return [1, 0, 0]
	return [x / mag, y / mag, z / mag]
}

function computeCellCosines({
	mesh,
	substellarDir,
}: {
	mesh: SphereMesh
	substellarDir: [number, number, number]
}): Float32Array {
	const result = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const offset = r * 3
		result[r] =
			mesh.r_xyz[offset] * substellarDir[0] +
			mesh.r_xyz[offset + 1] * substellarDir[1] +
			mesh.r_xyz[offset + 2] * substellarDir[2]
	}
	return result
}

function computeLockedOceanWarmthField({
	mesh,
	isLand,
	isLake,
	substellarDir,
}: {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	substellarDir: [number, number, number]
}): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const source = computeCellCosines({ mesh, substellarDir })
	const state = new Float32Array(N)
	const next = new Float32Array(N)
	const blocked = new Uint8Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) {
			blocked[r] = 1
			continue
		}
		state[r] = source[r]
	}

	for (let pass = 0; pass < LOCKED_WARMTH_SMOOTHING_PASSES; pass++) {
		for (let r = 0; r < N; r++) {
			if (blocked[r]) {
				next[r] = 0
				continue
			}
			let sum = source[r] * 2
			let weight = 2
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (blocked[nb]) continue
				sum += state[nb]
				weight++
			}
			next[r] = sum / weight
		}
		state.set(next)
	}

	normalizeField({ field: state, isBlocked: blocked })
	return state
}

function computeLockedEffectLimit({
	cellCosTheta,
	isLandCell,
}: {
	cellCosTheta: number
	isLandCell: boolean
}): number {
	const exchangeFactor = 0.65 + 0.35 * (1 - Math.abs(cellCosTheta))
	return (isLandCell ? 4 : 6) * exchangeFactor
}

function computeLockedOceanCurrents({
	mesh,
	isLand,
	landmarks,
	params,
}: ComputeLockedOceanCurrentsParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const avgEdgeKm = meanEdgeLengthKm(mesh, params?.planetRadiusKm)
	const isLake = buildLakeMask({ numRegions: N, isLand, landmarks })
	const monthlyDirs = computeMonthlySubstellarDirections(params)

	const oceanWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const coastalWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const oceanWarmth = new Float32Array(N)
	const coastalWarmth = new Float32Array(N)

	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
		const monthWarmth = computeLockedOceanWarmthField({
			mesh,
			isLand,
			isLake,
			substellarDir: monthlyDirs[month],
		})
		oceanWarmthMonthly.set(monthWarmth, month * N)
		const monthCoastalWarmth =
			OCEAN_CURRENTS_SHARED.computeCoastalWarmthFromOceanWarmth({
				mesh,
				isLand,
				isLake,
				oceanWarmth: monthWarmth,
				avgEdgeKm,
			})
		coastalWarmthMonthly.set(monthCoastalWarmth, month * N)
		for (let r = 0; r < N; r++) {
			oceanWarmth[r] += monthWarmth[r] / CURRENT_EFFECT_MONTHS
			coastalWarmth[r] += monthCoastalWarmth[r] / CURRENT_EFFECT_MONTHS
		}
	}

	return {
		oceanWarmth,
		coastalWarmth,
		oceanWarmthMonthly,
		coastalWarmthMonthly,
		temperatureDeltaMonthly: new Float32Array(N * CURRENT_EFFECT_MONTHS),
		temperatureDelta: new Float32Array(N),
	}
}

function applyLockedCurrentTemperatureEffect({
	mesh,
	climate,
	isLand,
	currents,
	params,
}: ApplyLockedCurrentTemperatureEffectParams): void {
	const N = mesh.numRegions
	const monthlyDirs = computeMonthlySubstellarDirections(params)
	const annualDir = getAnnualMeanSubstellarDirection(monthlyDirs)
	const annualCt = computeCellCosines({ mesh, substellarDir: annualDir })
	const temperatureDeltaMonthly =
		currents.temperatureDeltaMonthly ??
		(currents.temperatureDeltaMonthly = new Float32Array(
			N * CURRENT_EFFECT_MONTHS,
		))

	if (currents.oceanWarmthMonthly && currents.coastalWarmthMonthly) {
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const cellCt = computeCellCosines({
				mesh,
				substellarDir: monthlyDirs[month],
			})
			for (let r = 0; r < N; r++) {
				const warmth = isLand[r]
					? currents.coastalWarmthMonthly[month * N + r]
					: currents.oceanWarmthMonthly[month * N + r]
				if (Math.abs(warmth) <= 1e-4) continue
				const delta =
					warmth *
					computeLockedEffectLimit({
						cellCosTheta: cellCt[r],
						isLandCell: !!isLand[r],
					})
				temperatureDeltaMonthly[month * N + r] = delta
				climate.temperature_monthly[month * N + r] += delta
				currents.temperatureDelta[r] += delta / CURRENT_EFFECT_MONTHS
			}
		}
	} else {
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			for (let r = 0; r < N; r++) {
				const warmth = isLand[r]
					? currents.coastalWarmth[r]
					: currents.oceanWarmth[r]
				if (Math.abs(warmth) <= 1e-4) continue
				const delta =
					warmth *
					computeLockedEffectLimit({
						cellCosTheta: annualCt[r],
						isLandCell: !!isLand[r],
					})
				temperatureDeltaMonthly[month * N + r] = delta
				climate.temperature_monthly[month * N + r] += delta
				currents.temperatureDelta[r] = delta
			}
		}
	}

	for (let r = 0; r < N; r++) {
		climate.temperature_avg[r] += currents.temperatureDelta[r]
		// Use per-month deltas to correctly shift the seasonal extremes.
		let minDelta = 0
		let maxDelta = 0
		for (let m = 0; m < CURRENT_EFFECT_MONTHS; m++) {
			const d = temperatureDeltaMonthly[m * N + r]
			if (d < minDelta) minDelta = d
			if (d > maxDelta) maxDelta = d
		}
		climate.temperature_min[r] += minDelta
		climate.temperature_max[r] += maxDelta
	}
}

function smoothVectorField({
	mesh,
	isLand,
	srcX,
	srcY,
	passes,
}: {
	mesh: SphereMesh
	isLand: Uint8Array
	srcX: Float32Array
	srcY: Float32Array
	passes: number
}): { x: Float32Array; y: Float32Array } {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const tmpX = new Float32Array(N)
	const tmpY = new Float32Array(N)
	let currentX = srcX
	let currentY = srcY
	let nextX: Float32Array = tmpX
	let nextY: Float32Array = tmpY

	for (let pass = 0; pass < passes; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) {
				nextX[r] = 0
				nextY[r] = 0
				continue
			}
			let sumX = currentX[r]
			let sumY = currentY[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) continue
				sumX += currentX[nb]
				sumY += currentY[nb]
				count++
			}
			nextX[r] = sumX / count
			nextY[r] = sumY / count
		}
		;[currentX, nextX] = [nextX, currentX]
		;[currentY, nextY] = [nextY, currentY]
	}

	return { x: currentX, y: currentY }
}

function buildLockedOceanCurrentGrid({
	mesh,
	oceanWarmth,
	isLand,
	latDeg,
	lonDeg,
	params,
	currentMonth,
}: BuildLockedOceanCurrentGridParams): FlowGrid {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const monthlyDirs = computeMonthlySubstellarDirections(params)
	const substellarDir =
		currentMonth && currentMonth > 0 && currentMonth <= CURRENT_EFFECT_MONTHS
			? monthlyDirs[currentMonth - 1]
			: getAnnualMeanSubstellarDirection(monthlyDirs)
	const cellCt = computeCellCosines({ mesh, substellarDir })
	const gradX = new Float32Array(N)
	const gradY = new Float32Array(N)
	const coastX = new Float32Array(N)
	const coastY = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		let gx = 0
		let gy = 0
		let weightSum = 0
		let shoreX = 0
		let shoreY = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dx =
				(lonDeg[nb] - lonDeg[r] > 180
					? lonDeg[nb] - lonDeg[r] - 360
					: lonDeg[nb] - lonDeg[r] < -180
						? lonDeg[nb] - lonDeg[r] + 360
						: lonDeg[nb] - lonDeg[r]) *
				Math.cos((((latDeg[r] + latDeg[nb]) * 0.5) / 180) * Math.PI)
			const dy = latDeg[nb] - latDeg[r]
			const distSq = dx * dx + dy * dy
			if (distSq <= 1e-6) continue
			gx += ((cellCt[nb] - cellCt[r]) * dx) / distSq
			gy += ((cellCt[nb] - cellCt[r]) * dy) / distSq
			weightSum += 1
			if (isLand[nb]) {
				shoreX += dx / distSq
				shoreY += dy / distSq
			}
		}
		if (weightSum > 0) {
			gradX[r] = gx / weightSum
			gradY[r] = gy / weightSum
		}
		coastX[r] = shoreX
		coastY[r] = shoreY
	}

	const smoothed = smoothVectorField({
		mesh,
		isLand,
		srcX: gradX,
		srcY: gradY,
		passes: LOCKED_VECTOR_SMOOTHING_PASSES,
	})
	const currentU = new Float32Array(N)
	const currentV = new Float32Array(N)
	const currentSpeed = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		let flowEast = -smoothed.x[r]
		let flowNorth = -smoothed.y[r]
		const coastMag = Math.hypot(coastX[r], coastY[r])
		if (coastMag > 1e-6) {
			let tangentEast = -coastY[r] / coastMag
			let tangentNorth = coastX[r] / coastMag
			if (flowEast * tangentEast + flowNorth * tangentNorth < 0) {
				tangentEast = -tangentEast
				tangentNorth = -tangentNorth
			}
			flowEast = flowEast * 0.6 + tangentEast * 0.4
			flowNorth = flowNorth * 0.6 + tangentNorth * 0.4
		}
		const speedScale = 0.4 + 0.6 * Math.abs(oceanWarmth[r])
		currentU[r] = flowEast
		currentV[r] = flowNorth
		currentSpeed[r] = Math.hypot(flowEast, flowNorth) * speedScale
	}

	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: currentU,
		vectorV: currentV,
		vectorSpeed: currentSpeed,
		options: {
			scalar: oceanWarmth,
			allowCell: (region) => !isLand[region],
			isBlockedRegion: (region) => !!isLand[region],
		},
	})
}

export const OCEAN_CURRENTS = {
	computeLockedOceanCurrents,
	applyLockedCurrentTemperatureEffect,
	buildLockedOceanCurrentGrid,
}
