import type {
	ContourSurface,
	ContourWorld,
	WriteContourControlsInput,
} from "@/ui/genesis/renderer/contours/surface/types"

const SMOOTHING_PASSES = 12
const SMOOTHING_SELF_WEIGHT = 0.5
const CONTROL_EDGES = [
	[0, 1, 4],
	[1, 0, 5],
	[1, 2, 6],
	[2, 1, 7],
	[2, 0, 8],
	[0, 2, 9],
]

const surfaces = new WeakMap<ContourWorld, ContourSurface>()

function create(world: ContourWorld): ContourSurface {
	const cached = surfaces.get(world)
	if (cached) return cached
	const { mesh, elevation_km } = world
	let regionElevationKm = elevation_km.slice()
	let nextElevationKm = new Float32Array(mesh.numRegions)
	for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
		for (let r = 0; r < mesh.numRegions; r++) {
			let sum = 0,
				weightSum = 0
			for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
				const neighbor = mesh.adjList[j]
				const weight = 1 / Math.max(mesh.neighborDist[j], 1e-6)
				sum += regionElevationKm[neighbor] * weight
				weightSum += weight
			}
			nextElevationKm[r] =
				weightSum > 0
					? SMOOTHING_SELF_WEIGHT * regionElevationKm[r] +
						((1 - SMOOTHING_SELF_WEIGHT) * sum) / weightSum
					: regionElevationKm[r]
		}
		const previous = regionElevationKm
		regionElevationKm = nextElevationKm
		nextElevationKm = previous
	}
	const regionSlopes = new Float32Array(mesh.numRegions * 3)
	for (let r = 0; r < mesh.numRegions; r++) {
		const x = mesh.r_xyz[3 * r],
			y = mesh.r_xyz[3 * r + 1],
			z = mesh.r_xyz[3 * r + 2]
		const length = Math.hypot(x, y)
		const ux = length > 0.000001 ? -y / length : 1
		const uy = length > 0.000001 ? x / length : 0
		const vx = -z * uy,
			vy = z * ux,
			vz = x * uy - y * ux
		let aa = 0,
			ab = 0,
			bb = 0,
			ah = 0,
			bh = 0
		for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
			const n = mesh.adjList[j]
			const dx = mesh.r_xyz[3 * n] - x,
				dy = mesh.r_xyz[3 * n + 1] - y,
				dz = mesh.r_xyz[3 * n + 2] - z
			const a = dx * ux + dy * uy,
				b = dx * vx + dy * vy + dz * vz
			const weight = 1 / Math.max(a * a + b * b, 1e-12)
			const h = regionElevationKm[n] - regionElevationKm[r]
			aa += weight * a * a
			ab += weight * a * b
			bb += weight * b * b
			ah += weight * a * h
			bh += weight * b * h
		}
		const determinant = aa * bb - ab * ab
		if (determinant <= 1e-12) continue
		const du = (ah * bb - bh * ab) / determinant,
			dv = (bh * aa - ah * ab) / determinant
		regionSlopes[3 * r] = du * ux + dv * vx
		regionSlopes[3 * r + 1] = du * uy + dv * vy
		regionSlopes[3 * r + 2] = dv * vz
	}
	const triangleElevationKm = new Float32Array(mesh.numTriangles)
	const contourTriangleElevationKm = new Float32Array(mesh.numTriangles)
	const triangleSlopes = new Float32Array(mesh.numTriangles * 3)
	for (let t = 0; t < mesh.numTriangles; t++) {
		const a = mesh.s_begin_r[3 * t],
			b = mesh.s_begin_r[3 * t + 1],
			c = mesh.s_begin_r[3 * t + 2]
		triangleElevationKm[t] =
			(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
		contourTriangleElevationKm[t] =
			(regionElevationKm[a] + regionElevationKm[b] + regionElevationKm[c]) / 3
		for (let axis = 0; axis < 3; axis++)
			triangleSlopes[3 * t + axis] =
				(regionSlopes[3 * a + axis] +
					regionSlopes[3 * b + axis] +
					regionSlopes[3 * c + axis]) /
				3
	}
	const surface = {
		triangleElevationKm,
		contourTriangleElevationKm,
		regionElevationKm,
		regionSlopes,
		triangleSlopes,
	}
	surfaces.set(world, surface)
	return surface
}

function writeControls(input: WriteContourControlsInput) {
	const {
		world,
		surface,
		innerTriangle,
		outerTriangle,
		region,
		mapOrder,
		controls,
		face,
	} = input
	const { mesh } = world
	const vertices = [
		innerTriangle,
		mapOrder ? outerTriangle : region,
		mapOrder ? region : outerTriangle,
	]
	const heights = [
		surface.contourTriangleElevationKm[innerTriangle],
		mapOrder
			? surface.contourTriangleElevationKm[outerTriangle]
			: surface.regionElevationKm[region],
		mapOrder
			? surface.regionElevationKm[region]
			: surface.contourTriangleElevationKm[outerTriangle],
	]
	const values = [heights[0], heights[1], heights[2], 0, 0, 0, 0, 0, 0, 0]
	for (const [from, to, slot] of CONTROL_EDGES) {
		const fromRegion = from === (mapOrder ? 2 : 1),
			toRegion = to === (mapOrder ? 2 : 1)
		const fromPoints = fromRegion ? mesh.r_xyz : mesh.t_xyz,
			toPoints = toRegion ? mesh.r_xyz : mesh.t_xyz
		const slopes = fromRegion ? surface.regionSlopes : surface.triangleSlopes
		const a = vertices[from] * 3,
			b = vertices[to] * 3
		let delta = 0
		for (let axis = 0; axis < 3; axis++)
			delta += slopes[a + axis] * (toPoints[b + axis] - fromPoints[a + axis])
		const control = heights[from] + delta / 3
		// Bound edge controls by their endpoint elevations to avoid invented peaks and pits.
		values[slot] = Math.max(
			Math.min(heights[from], heights[to]),
			Math.min(Math.max(heights[from], heights[to]), control),
		)
	}
	values[3] =
		(values[4] + values[5] + values[6] + values[7] + values[8] + values[9]) / 6
	for (let vertex = 0; vertex < 3; vertex++)
		controls.set(values, face * 30 + vertex * 10)
}

export const CONTOUR_SURFACE = { create, writeControls }
