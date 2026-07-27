import type { PlateVec, SphereMesh } from "@/model"
import type { ComputeMantleFieldParams } from "@/model/tectonics/types"
import { MATH } from "@/model/shared/math"
import { RNG } from "@/model/shared/rng"

const CONTINENTAL_DRAG_FACTOR = 0.35
const OCEAN_DRAG_FACTOR = 1.0
const SIZE_VEL_POWER = 0.5
const SIZE_VEL_MIN_FACTOR = 0.4
const SIZE_VEL_MAX_FACTOR = 2.5
const MANTLE_CELLS = 5
const MANTLE_ROTATION_STRENGTH = 0.6
const MANTLE_DOMINANT_STRENGTH = 2.0
const MANTLE_MINOR_STRENGTH = 0.7
const MIN_CELL_SEPARATION = 0.6

type Vec3 = [number, number, number]

interface MantleCell {
	pos: Vec3
	radialSign: number
	rotSign: number
	strength: number
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}

function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function length3(a: Vec3): number {
	return Math.sqrt(dot(a, a))
}

function normalize(a: Vec3): Vec3 {
	const len = length3(a)
	return len > 1e-12 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 1]
}

function angularDistance(a: Vec3, b: Vec3): number {
	return Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
}

function velocityAt(plate: PlateVec, pos: Vec3): Vec3 {
	return MATH.eulerVelocityAt({
		pole: plate.pole,
		omega: plate.omega,
		x: pos[0],
		y: pos[1],
		z: pos[2],
	})
}

export function normalizeMantleField(
	mantleField: Float32Array,
): Float32Array | null {
	let mantleMax = 0
	for (let r = 0; r < mantleField.length; r++) {
		const value = Math.abs(mantleField[r])
		if (value > mantleMax) mantleMax = value
	}
	if (mantleMax <= 1e-6) return null

	const normalized = new Float32Array(mantleField.length)
	const inv = 1 / mantleMax
	for (let r = 0; r < mantleField.length; r++)
		normalized[r] = mantleField[r] * inv
	return normalized
}

export function projectMantleFieldToRegions(
	coarseMantleField: Float32Array,
	coarseMesh: SphereMesh,
	mesh: SphereMesh,
): Float32Array {
	const projected = new Float32Array(mesh.numRegions)
	const { adjOffset, adjList, r_xyz: coarse_xyz } = coarseMesh
	const { r_xyz } = mesh
	const coarseRegionCount = coarseMesh.numRegions
	const maxWalk = Math.ceil(Math.sqrt(coarseRegionCount))
	let cur = 0

	for (let r = 0; r < mesh.numRegions; r++) {
		const px = r_xyz[3 * r]
		const py = r_xyz[3 * r + 1]
		const pz = r_xyz[3 * r + 2]

		let bestDot =
			px * coarse_xyz[3 * cur] +
			py * coarse_xyz[3 * cur + 1] +
			pz * coarse_xyz[3 * cur + 2]
		let improved = true
		let steps = 0
		while (improved && steps < maxWalk) {
			improved = false
			steps++
			for (let i = adjOffset[cur], iEnd = adjOffset[cur + 1]; i < iEnd; i++) {
				const nb = adjList[i]
				const dot =
					px * coarse_xyz[3 * nb] +
					py * coarse_xyz[3 * nb + 1] +
					pz * coarse_xyz[3 * nb + 2]
				if (dot > bestDot) {
					bestDot = dot
					cur = nb
					improved = true
				}
			}
		}

		if (steps >= maxWalk) {
			for (let c = 0; c < coarseRegionCount; c++) {
				const dot =
					px * coarse_xyz[3 * c] +
					py * coarse_xyz[3 * c + 1] +
					pz * coarse_xyz[3 * c + 2]
				if (dot > bestDot) {
					bestDot = dot
					cur = c
				}
			}
		}

		projected[r] = coarseMantleField[cur] ?? 0
	}
	return projected
}

export function computeMantleField({
	plateVec,
	plateSeeds,
	plateIsOcean,
	r_plate,
	mesh,
	seed,
}: ComputeMantleFieldParams): Float32Array {
	const seedArr = Array.from(plateSeeds)
	const plateArea = new Map<number, number>()
	const plateCentroid = new Map<number, Vec3>()
	for (const pid of seedArr) {
		plateArea.set(pid, 0)
		plateCentroid.set(pid, [0, 0, 0])
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		const pid = r_plate[r]
		plateArea.set(pid, (plateArea.get(pid) ?? 0) + 1)
		const centroid = plateCentroid.get(pid) ?? [0, 0, 0]
		centroid[0] += mesh.r_xyz[3 * r]
		centroid[1] += mesh.r_xyz[3 * r + 1]
		centroid[2] += mesh.r_xyz[3 * r + 2]
		plateCentroid.set(pid, centroid)
	}

	for (const pid of seedArr) {
		const area = plateArea.get(pid) ?? 1
		const centroid = plateCentroid.get(pid) ?? [0, 0, 1]
		plateCentroid.set(
			pid,
			normalize([centroid[0] / area, centroid[1] / area, centroid[2] / area]),
		)
	}

	const landAreas: number[] = []
	for (const pid of seedArr) {
		if (!plateIsOcean.has(pid)) landAreas.push(plateArea.get(pid) ?? 0)
	}
	let landMean = 0
	let landStdDev = 1
	if (landAreas.length > 0) {
		landMean = landAreas.reduce((sum, area) => sum + area, 0) / landAreas.length
		const variance =
			landAreas.reduce((sum, area) => sum + (area - landMean) ** 2, 0) /
			landAreas.length
		landStdDev = Math.sqrt(variance) || 1
	}

	const avgArea = mesh.numRegions / Math.max(1, seedArr.length)
	const scaledPlateVec = new Map<number, PlateVec>()
	for (const pid of seedArr) {
		const source = plateVec.get(pid)
		if (!source) continue

		let dragFactor: number
		if (plateIsOcean.has(pid)) {
			dragFactor = OCEAN_DRAG_FACTOR
		} else {
			const sigmasBelow = Math.max(
				0,
				(landMean - (plateArea.get(pid) ?? 0)) / landStdDev,
			)
			const t = Math.min(1, sigmasBelow / 2)
			dragFactor =
				CONTINENTAL_DRAG_FACTOR +
				(OCEAN_DRAG_FACTOR - CONTINENTAL_DRAG_FACTOR) * t
		}
		const relArea = (plateArea.get(pid) ?? 0) / Math.max(avgArea, 1e-6)
		const sizeFactor = Math.min(
			SIZE_VEL_MAX_FACTOR,
			Math.max(SIZE_VEL_MIN_FACTOR, 1 / Math.pow(relArea || 1, SIZE_VEL_POWER)),
		)
		scaledPlateVec.set(pid, {
			pole: source.pole,
			omega: source.omega * dragFactor * sizeFactor,
		})
	}

	const boundaryPoints = new Map<string, Vec3[]>()
	for (let r = 0; r < mesh.numRegions; r++) {
		const pidA = r_plate[r]
		for (
			let ni = mesh.adjOffset[r], niEnd = mesh.adjOffset[r + 1];
			ni < niEnd;
			ni++
		) {
			const nb = mesh.adjList[ni]
			const pidB = r_plate[nb]
			if (pidA >= pidB || pidA === pidB) continue

			const key = `${pidA}:${pidB}`
			const points = boundaryPoints.get(key) ?? []
			points.push([
				(mesh.r_xyz[3 * r] + mesh.r_xyz[3 * nb]) * 0.5,
				(mesh.r_xyz[3 * r + 1] + mesh.r_xyz[3 * nb + 1]) * 0.5,
				(mesh.r_xyz[3 * r + 2] + mesh.r_xyz[3 * nb + 2]) * 0.5,
			])
			boundaryPoints.set(key, points)
		}
	}

	const convPoints: Vec3[] = []
	for (const [key, points] of boundaryPoints) {
		const [pidAStr, pidBStr] = key.split(":")
		const pidA = Number(pidAStr)
		const pidB = Number(pidBStr)
		const plateA = scaledPlateVec.get(pidA)
		const plateB = scaledPlateVec.get(pidB)
		const centroidA = plateCentroid.get(pidA)
		const centroidB = plateCentroid.get(pidB)
		if (!plateA || !plateB || !centroidA || !centroidB) continue

		let convCount = 0
		const normal = normalize(sub(centroidB, centroidA))
		for (const point of points) {
			const vA = velocityAt(plateA, point)
			const vB = velocityAt(plateB, point)
			const vRel = sub(vA, vB)
			if (-dot(vRel, normal) > 0.05) convCount++
		}
		if (convCount > points.length * 0.4) convPoints.push(...points)
	}

	const mantleRng = RNG.makeRng(seed + 9999)
	const mantleCenters: MantleCell[] = []
	const placedPositions: Vec3[] = []
	const isFarEnough = (candidate: Vec3) =>
		placedPositions.every(
			(placed) => 1 - dot(candidate, placed) >= MIN_CELL_SEPARATION,
		)

	const numDown = Math.min(Math.ceil(MANTLE_CELLS / 2), convPoints.length)
	const numUp = MANTLE_CELLS - numDown

	if (convPoints.length > 0) {
		const first = normalize(
			convPoints[Math.floor(mantleRng() * convPoints.length)] ?? [0, 0, 1],
		)
		placedPositions.push(first)

		for (let i = 1; i < numDown; i++) {
			let bestDistance = -1
			let bestPoint: Vec3 | null = null
			for (const point of convPoints) {
				const normalizedPoint = normalize(point)
				let minDistance = Infinity
				for (const placed of placedPositions) {
					minDistance = Math.min(minDistance, 1 - dot(normalizedPoint, placed))
				}
				if (
					minDistance >= MIN_CELL_SEPARATION &&
					minDistance > bestDistance &&
					isFarEnough(normalizedPoint)
				) {
					bestDistance = minDistance
					bestPoint = normalizedPoint
				}
			}
			if (bestPoint) placedPositions.push(bestPoint)
		}

		for (let i = 0; i < placedPositions.length; i++) {
			mantleCenters.push({
				pos: placedPositions[i],
				radialSign: -1,
				rotSign: mantleRng() < 0.5 ? 1 : -1,
				strength: i === 0 ? MANTLE_DOMINANT_STRENGTH : MANTLE_MINOR_STRENGTH,
			})
		}
	}

	const candidates: Vec3[] = []
	const stride = Math.max(1, Math.floor(mesh.numRegions / 400))
	for (let r = 0; r < mesh.numRegions; r += stride) {
		candidates.push(
			normalize([
				mesh.r_xyz[3 * r],
				mesh.r_xyz[3 * r + 1],
				mesh.r_xyz[3 * r + 2],
			]),
		)
	}

	for (let i = 0; i < numUp; i++) {
		let bestDistance = -1
		let bestPoint: Vec3 | null = null
		for (const point of candidates) {
			let minDistance = Infinity
			for (const placed of placedPositions) {
				minDistance = Math.min(minDistance, 1 - dot(point, placed))
			}
			if (minDistance >= MIN_CELL_SEPARATION && minDistance > bestDistance) {
				bestDistance = minDistance
				bestPoint = point
			}
		}
		if (!bestPoint) {
			for (const point of candidates) {
				let minDistance = Infinity
				for (const placed of placedPositions) {
					minDistance = Math.min(minDistance, 1 - dot(point, placed))
				}
				if (minDistance > bestDistance) {
					bestDistance = minDistance
					bestPoint = point
				}
			}
		}
		if (!bestPoint) continue
		placedPositions.push(bestPoint)
		mantleCenters.push({
			pos: bestPoint,
			radialSign: 1,
			rotSign: mantleRng() < 0.5 ? 1 : -1,
			strength: i === 0 ? MANTLE_DOMINANT_STRENGTH : MANTLE_MINOR_STRENGTH,
		})
	}

	if (mantleCenters.length === 0) {
		for (let i = 0; i < MANTLE_CELLS; i++) {
			const theta = mantleRng() * 2 * Math.PI
			const cosPhi = 2 * mantleRng() - 1
			const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
			mantleCenters.push({
				pos: [sinPhi * Math.cos(theta), sinPhi * Math.sin(theta), cosPhi],
				radialSign: i % 2 === 0 ? 1 : -1,
				rotSign: mantleRng() < 0.5 ? 1 : -1,
				strength: i < 2 ? MANTLE_DOMINANT_STRENGTH : MANTLE_MINOR_STRENGTH,
			})
		}
	}

	const mantleField = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const pos: Vec3 = [
			mesh.r_xyz[3 * r],
			mesh.r_xyz[3 * r + 1],
			mesh.r_xyz[3 * r + 2],
		]
		let flowX = 0
		let flowY = 0
		let flowZ = 0

		for (const cell of mantleCenters) {
			const radialBasis = cross(cross(pos, cell.pos), pos)
			const radialLength = length3(radialBasis)
			if (radialLength < 1e-10) continue

			const angle = angularDistance(pos, cell.pos)
			if (angle < 1e-6) continue

			const radialX = radialBasis[0] / radialLength
			const radialY = radialBasis[1] / radialLength
			const radialZ = radialBasis[2] / radialLength

			const tanX = pos[1] * radialZ - pos[2] * radialY
			const tanY = pos[2] * radialX - pos[0] * radialZ
			const tanZ = pos[0] * radialY - pos[1] * radialX
			const tanLength = Math.sqrt(tanX * tanX + tanY * tanY + tanZ * tanZ)
			if (tanLength < 1e-10) continue

			const strength = cell.strength / (0.5 + angle * angle)
			const radialStrength = cell.radialSign * strength
			const rotationalStrength =
				cell.rotSign * MANTLE_ROTATION_STRENGTH * strength

			flowX +=
				radialX * radialStrength + (tanX / tanLength) * rotationalStrength
			flowY +=
				radialY * radialStrength + (tanY / tanLength) * rotationalStrength
			flowZ +=
				radialZ * radialStrength + (tanZ / tanLength) * rotationalStrength
		}

		let radialSum = 0
		for (const cell of mantleCenters) {
			const angle = angularDistance(pos, cell.pos)
			if (angle < 1e-6) continue
			radialSum += (cell.radialSign * cell.strength) / (0.5 + angle * angle)
		}

		const flowMag = Math.sqrt(flowX * flowX + flowY * flowY + flowZ * flowZ)
		mantleField[r] = flowMag * Math.sign(radialSum)
	}

	return mantleField
}
