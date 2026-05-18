import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { createMapProjection, MAP_X_SCALE } from "./map-projection"
import type { OrogenViewMode, RiverData } from "./types"

const TERRAIN_ELEVATION_SCALE = 0.04
const MAP_RIVER_SEAM_THRESHOLD = 2

// Per-depth colors: depth 0 = gold, 1 = orange, 2 = teal, 3 = blue, 4+ = purple
const HIERARCHY_DEPTH_COLORS: ReadonlyArray<[number, number, number]> = [
	[1.0, 0.85, 0.2],
	[0.93, 0.52, 0.14],
	[0.2, 0.78, 0.55],
	[0.25, 0.55, 0.9],
	[0.68, 0.32, 0.88],
]

interface HierarchyNode {
	provinceId: number
	seedRegion: number
	depth: number
	parentProvinceId: number
	xyz: [number, number, number]
}

export function collectHierarchyNodes(
	world: SerializedOrogenWorld,
	selectedNationId: number,
): HierarchyNode[] | null {
	if (!world.nations || !world.provinces) return null
	const { assignment, depth, parent } = world.nations
	const { seeds } = world.provinces
	const { r_xyz } = world.mesh
	const provinceCount = assignment.length
	const nodes: HierarchyNode[] = []

	for (let p = 0; p < provinceCount; p++) {
		if (assignment[p] !== selectedNationId) continue
		const seedRegion = seeds[p]
		const len = Math.sqrt(
			r_xyz[3 * seedRegion] ** 2 +
				r_xyz[3 * seedRegion + 1] ** 2 +
				r_xyz[3 * seedRegion + 2] ** 2,
		)
		const scale = len > 0 ? 1 / len : 1
		nodes.push({
			provinceId: p,
			seedRegion,
			depth: depth[p],
			parentProvinceId: parent[p],
			xyz: [
				r_xyz[3 * seedRegion] * scale,
				r_xyz[3 * seedRegion + 1] * scale,
				r_xyz[3 * seedRegion + 2] * scale,
			],
		})
	}
	return nodes
}

function depthColor(d: number): [number, number, number] {
	return HIERARCHY_DEPTH_COLORS[Math.min(d, HIERARCHY_DEPTH_COLORS.length - 1)]
}

/** Rank-based color: counties (deepest) = gold, capitals = color by tier */
function rankColor(depth: number, maxDepth: number): [number, number, number] {
	return depthColor(maxDepth - depth)
}

function createCircleTexture(): THREE.CanvasTexture | null {
	if (typeof document === "undefined") return null
	const size = 64
	const cvs = document.createElement("canvas")
	cvs.width = size
	cvs.height = size
	const ctx = cvs.getContext("2d")!
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
	ctx.fillStyle = "white"
	ctx.fill()
	return new THREE.CanvasTexture(cvs)
}

interface NationBoundarySide {
	r0: number
	r1: number
	tInner: number
	tOuter: number
}

function forEachNationBoundarySide(
	world: SerializedOrogenWorld,
	nation: number,
	visit: (side: NationBoundarySide) => void,
) {
	if (!world.nations || !world.provinces) return
	const { mesh } = world
	const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t } = mesh
	const { regionProvince } = world.provinces

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite < 0 || side > opposite) continue
		const r0 = s_begin_r[side]
		const r1 = s_begin_r[opposite]
		const provinceA = regionProvince[r0]
		const provinceB = regionProvince[r1]
		const nationA = provinceA >= 0 ? world.nations.assignment[provinceA] : -1
		const nationB = provinceB >= 0 ? world.nations.assignment[provinceB] : -1
		if (nationA === nationB || (nationA !== nation && nationB !== nation))
			continue

		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		visit({ r0, r1, tInner, tOuter })
	}
}

function createLineSegments(
	positions: number[],
	color: number,
	opacity: number,
	visible: boolean,
) {
	if (positions.length === 0) return null
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
	)
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthWrite: false,
	})
	const lines = new THREE.LineSegments(geometry, material)
	lines.visible = visible
	return lines
}

function appendProjectedSegment(
	positions: number[],
	projection: ReturnType<typeof createMapProjection>,
	start: { lon: number; lat: number },
	end: { lon: number; lat: number },
	z: number,
) {
	let lon0 = start.lon
	let lon1 = end.lon
	if (Math.abs(lon1 - lon0) > Math.PI) {
		if (lon0 < lon1) lon0 += 2 * Math.PI
		else lon1 += 2 * Math.PI
		const a = projection.projectRadians(lon0, start.lat, z)
		const b = projection.projectRadians(lon1, end.lat, z)
		const c = projection.projectRadians(lon0 - 2 * Math.PI, start.lat, z)
		const d = projection.projectRadians(lon1 - 2 * Math.PI, end.lat, z)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
		positions.push(c[0], c[1], c[2], d[0], d[1], d[2])
		return
	}
	const a = projection.projectRadians(lon0, start.lat, z)
	const b = projection.projectRadians(lon1, end.lat, z)
	positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
}

export function buildHoveredNationBorderGlobe(
	world: SerializedOrogenWorld,
	nation: number,
	viewMode: OrogenViewMode,
	nationBordersVisible: boolean,
	opts?: { color?: number; radiusBoost?: number; opacity?: number },
) {
	const positions = collectNationBorderGlobePositions(
		world,
		nation,
		opts?.radiusBoost ?? 0,
	)
	return createLineSegments(
		positions,
		opts?.color ?? 0x020617,
		opts?.opacity ?? 0.95,
		viewMode === "globe" && nationBordersVisible,
	)
}

export function buildHoveredNationBorderMap(
	world: SerializedOrogenWorld,
	nation: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	viewMode: OrogenViewMode,
	nationBordersVisible: boolean,
	opts?: { color?: number; opacity?: number; zBoost?: number },
) {
	const positions = collectNationBorderMapPositions(
		world,
		nation,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		opts?.zBoost ?? 0,
	)
	return createLineSegments(
		positions,
		opts?.color ?? 0x020617,
		opts?.opacity ?? 0.95,
		viewMode === "map" && nationBordersVisible,
	)
}

export function collectNationBorderGlobePositions(
	world: SerializedOrogenWorld,
	nation: number,
	radiusBoost: number,
) {
	if (!world.nations || !world.provinces) return []
	const positions: number[] = []
	const { elevation, mesh } = world
	const { t_xyz } = mesh

	forEachNationBoundarySide(world, nation, ({ r0, r1, tInner, tOuter }) => {
		const averageElevation = (elevation[r0] + elevation[r1]) * 0.5
		const radius =
			1.006 +
			radiusBoost +
			(averageElevation > 0
				? averageElevation * TERRAIN_ELEVATION_SCALE
				: averageElevation * TERRAIN_ELEVATION_SCALE * 0.3)
		positions.push(
			t_xyz[3 * tInner] * radius,
			t_xyz[3 * tInner + 1] * radius,
			t_xyz[3 * tInner + 2] * radius,
			t_xyz[3 * tOuter] * radius,
			t_xyz[3 * tOuter + 1] * radius,
			t_xyz[3 * tOuter + 2] * radius,
		)
	})

	return positions
}

export function collectNationBorderMapPositions(
	world: SerializedOrogenWorld,
	nation: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	zBoost: number,
) {
	if (!world.nations || !world.provinces) return []
	const positions: number[] = []
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { t_xyz } = world.mesh
	const z = 0.003 + zBoost

	const writeSegment = (
		lon0: number,
		lat0: number,
		lon1: number,
		lat1: number,
	) => {
		appendProjectedSegment(
			positions,
			projection,
			{ lon: lon0, lat: lat0 },
			{ lon: lon1, lat: lat1 },
			z,
		)
	}

	forEachNationBoundarySide(world, nation, ({ tInner, tOuter }) => {
		const a = projection.projectCartesian(
			t_xyz[3 * tInner],
			t_xyz[3 * tInner + 1],
			t_xyz[3 * tInner + 2],
		)
		const b = projection.projectCartesian(
			t_xyz[3 * tOuter],
			t_xyz[3 * tOuter + 1],
			t_xyz[3 * tOuter + 2],
		)
		let lon0 = a.lon
		let lon1 = b.lon
		if (Math.abs(lon1 - lon0) > Math.PI) {
			if (lon0 < lon1) lon0 += 2 * Math.PI
			else lon1 += 2 * Math.PI
			writeSegment(lon0, a.lat, lon1, b.lat)
			writeSegment(lon0 - 2 * Math.PI, a.lat, lon1 - 2 * Math.PI, b.lat)
		} else {
			writeSegment(lon0, a.lat, lon1, b.lat)
		}
	})

	return positions
}

export function buildGlobeGrid(
	spacingDeg: number,
	gridVisible: boolean,
	viewMode: OrogenViewMode,
): THREE.LineSegments {
	const spacing = Math.max(2.5, spacingDeg)
	const radius = 1.018
	const latStep = THREE.MathUtils.degToRad(3)
	const lonStep = THREE.MathUtils.degToRad(3)
	const positions: number[] = []

	for (let latDeg = -90 + spacing; latDeg < 90; latDeg += spacing) {
		const lat = THREE.MathUtils.degToRad(latDeg)
		let previous: [number, number, number] | null = null
		for (let lon = -Math.PI; lon <= Math.PI + 0.0001; lon += lonStep) {
			const cosLat = Math.cos(lat)
			const point: [number, number, number] = [
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			]
			if (previous) positions.push(...previous, ...point)
			previous = point
		}
	}

	for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
		const lon = THREE.MathUtils.degToRad(lonDeg)
		let previous: [number, number, number] | null = null
		for (let lat = -Math.PI / 2; lat <= Math.PI / 2 + 0.0001; lat += latStep) {
			const cosLat = Math.cos(lat)
			const point: [number, number, number] = [
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			]
			if (previous) positions.push(...previous, ...point)
			previous = point
		}
	}

	return createLineSegments(
		positions,
		0xe2e8f0,
		0.28,
		gridVisible && viewMode === "globe",
	)!
}

export function buildMapGrid(
	spacingDeg: number,
	projectionLatitudeDeg: number,
	gridVisible: boolean,
	viewMode: OrogenViewMode,
): THREE.LineSegments {
	const spacing = Math.max(2.5, spacingDeg)
	const lonStep = Math.max(2.5, spacing / 2)
	const latStep = Math.max(2.5, spacing / 2)
	const positions: number[] = []
	const projection = createMapProjection(0, projectionLatitudeDeg)

	for (let latDeg = -90 + spacing; latDeg < 90; latDeg += spacing) {
		let previous: { lon: number; lat: number } | null = null
		for (let lonDeg = -180; lonDeg <= 180 + 0.001; lonDeg += lonStep) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const current = projection.projectCartesian(
				cosLat * Math.cos(lon),
				cosLat * Math.sin(lon),
				Math.sin(lat),
			)
			if (previous)
				appendProjectedSegment(positions, projection, previous, current, 0.001)
			previous = current
		}
	}

	for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
		let previous: { lon: number; lat: number } | null = null
		for (let latDeg = -90; latDeg <= 90 + 0.001; latDeg += latStep) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const current = projection.projectCartesian(
				cosLat * Math.cos(lon),
				cosLat * Math.sin(lon),
				Math.sin(lat),
			)
			if (previous)
				appendProjectedSegment(positions, projection, previous, current, 0.001)
			previous = current
		}
	}

	return createLineSegments(
		positions,
		0xf8fafc,
		0.22,
		gridVisible && viewMode === "map",
	)!
}

function buildThermalEquatorLine(
	controlPoints: THREE.Vector3[],
	pointsCount: number,
	color: number,
	visible: boolean,
	adjustPoint?: (point: THREE.Vector3) => void,
) {
	const curve = new THREE.CatmullRomCurve3(
		controlPoints,
		false,
		"catmullrom",
		0.5,
	)
	const smoothPoints = curve.getPoints(pointsCount * 4)
	for (const point of smoothPoints) adjustPoint?.(point)
	const geometry = new THREE.BufferGeometry().setFromPoints(smoothPoints)
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
	})
	const line = new THREE.Line(geometry, material)
	line.visible = visible
	return line
}

export function buildGlobeThermalEquator(
	points: [number, number][],
	viewMode: OrogenViewMode,
) {
	const radius = 1.05
	const controlPoints = points.map(([lonDeg, latDeg]) => {
		const lon = THREE.MathUtils.degToRad(lonDeg)
		const lat = THREE.MathUtils.degToRad(latDeg)
		const cosLat = Math.cos(lat)
		return new THREE.Vector3(
			radius * cosLat * Math.cos(lon),
			radius * cosLat * Math.sin(lon),
			radius * Math.sin(lat),
		)
	})

	return buildThermalEquatorLine(
		controlPoints,
		points.length,
		0xff3333,
		viewMode === "globe",
		(point) => point.normalize().multiplyScalar(radius),
	)
}

export function buildMapThermalEquator(
	points: [number, number][],
	projectionLatitudeDeg: number,
	viewMode: OrogenViewMode,
) {
	const projection = createMapProjection(0, projectionLatitudeDeg)
	const controlPoints = points.map(([lonDeg, latDeg]) => {
		const [x, y] = projection.projectDegrees(lonDeg, latDeg, 0.002)
		return new THREE.Vector3(x, y, 0.002)
	})

	return buildThermalEquatorLine(
		controlPoints,
		points.length,
		0xff3333,
		viewMode === "map",
		(point) => {
			point.z = 0.002
		},
	)
}

function buildRiverGroup(
	rivers: RiverData,
	canvas: HTMLCanvasElement,
	riverMaterials: LineMaterial[],
	toPosition: (
		lonDeg: number,
		latDeg: number,
		elev: number,
	) => [number, number, number],
) {
	const group = new THREE.Group()
	const width = canvas.clientWidth || 1
	const height = canvas.clientHeight || 1
	const minWidth = 0.15
	const maxWidth = 1.2
	const binStep = 0.3
	const logMin = Math.log(1 + rivers.minFlow)
	const logMax = Math.log(1 + rivers.maxFlow)
	const logRange = logMax - logMin || 1

	function flowToWidth(flow: number) {
		const t = Math.max(0, (Math.log(1 + flow) - logMin) / logRange)
		return minWidth + (maxWidth - minWidth) * t
	}

	const toBin = (lineWidth: number) =>
		Math.max(
			minWidth,
			Math.min(maxWidth, Math.round(lineWidth / binStep) * binStep),
		)

	const batchedPositions = new Map<number, number[]>()

	const appendSegments = (
		positions: [number, number, number][],
		flows: number[],
	) => {
		if (positions.length < 2) return
		const widths = flows.map((flow) => flowToWidth(flow))
		let segmentStart = 0
		let currentBin = toBin(widths[0])

		const flushSegment = (start: number, end: number, binnedWidth: number) => {
			if (end <= start) return
			let binPositions = batchedPositions.get(binnedWidth)
			if (!binPositions) {
				binPositions = []
				batchedPositions.set(binnedWidth, binPositions)
			}
			for (let index = start; index < end; index++) {
				const a = positions[index]
				const b = positions[index + 1]
				binPositions.push(a[0], a[1], a[2], b[0], b[1], b[2])
			}
		}

		for (let index = 1; index < positions.length; index++) {
			const nextBin = toBin(widths[index])
			if (nextBin !== currentBin) {
				flushSegment(segmentStart, index, currentBin)
				segmentStart = index
				currentBin = nextBin
			}
		}
		flushSegment(segmentStart, positions.length - 1, currentBin)
	}

	for (const polyline of rivers.lines) {
		if (polyline.length < 2) continue
		const flowValues = polyline.map(([, , flow]) => flow)
		let positions: [number, number, number][]
		let smoothFlows: number[]

		if (polyline.length >= 3) {
			const controlPoints = polyline.map(([lon, lat, , elev]) => {
				const [x, y, z] = toPosition(lon, lat, elev)
				return new THREE.Vector3(x, y, z)
			})
			const curve = new THREE.CatmullRomCurve3(
				controlPoints,
				false,
				"catmullrom",
				0.5,
			)
			const smoothPointCount = polyline.length * 3
			const smoothed = curve.getPoints(smoothPointCount)
			positions = smoothed.map((point) => [point.x, point.y, point.z])
			smoothFlows = smoothed.map((_, index) => {
				const t = index / smoothPointCount
				const step = t * (polyline.length - 1)
				const lower = Math.floor(step)
				const upper = Math.min(lower + 1, polyline.length - 1)
				return (
					flowValues[lower] +
					(flowValues[upper] - flowValues[lower]) * (step - lower)
				)
			})
		} else {
			positions = polyline.map(([lon, lat, , elev]) =>
				toPosition(lon, lat, elev),
			)
			smoothFlows = flowValues
		}

		appendSegments(positions, smoothFlows)
	}

	for (const [binnedWidth, positions] of batchedPositions) {
		if (positions.length < 6) continue
		const t = (binnedWidth - minWidth) / (maxWidth - minWidth)
		const material = new LineMaterial({
			color: 0x0978ab,
			opacity: 0.55 + t * 0.4,
			linewidth: binnedWidth,
			transparent: true,
			depthWrite: false,
			worldUnits: false,
		})
		material.resolution.set(width, height)
		riverMaterials.push(material)

		const geometry = new LineSegmentsGeometry()
		geometry.setPositions(positions)
		const line = new LineSegments2(geometry, material)
		line.computeLineDistances()
		group.add(line)
	}

	return group
}

export function buildGlobeRivers(
	rivers: RiverData,
	canvas: HTMLCanvasElement,
	riverMaterials: LineMaterial[],
	riversVisible: boolean,
	viewMode: OrogenViewMode,
) {
	const lift = 0.003
	const group = buildRiverGroup(
		rivers,
		canvas,
		riverMaterials,
		(lonDeg, latDeg, elev) => {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const radius =
				1 +
				(elev > 0
					? elev * TERRAIN_ELEVATION_SCALE
					: elev * TERRAIN_ELEVATION_SCALE * 0.3) +
				lift
			return [
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			]
		},
	)
	group.visible = riversVisible && viewMode === "globe"
	return group
}

export function buildMapRivers(
	rivers: RiverData,
	canvas: HTMLCanvasElement,
	riverMaterials: LineMaterial[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	riversVisible: boolean,
	viewMode: OrogenViewMode,
) {
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const group = new THREE.Group()
	const width = canvas.clientWidth || 1
	const height = canvas.clientHeight || 1
	const minWidth = 0.15
	const maxWidth = 1.2
	const binStep = 0.3
	const logMin = Math.log(1 + rivers.minFlow)
	const logMax = Math.log(1 + rivers.maxFlow)
	const logRange = logMax - logMin || 1

	function flowToWidth(flow: number) {
		const t = Math.max(0, (Math.log(1 + flow) - logMin) / logRange)
		return minWidth + (maxWidth - minWidth) * t
	}

	const toBin = (lineWidth: number) =>
		Math.max(
			minWidth,
			Math.min(maxWidth, Math.round(lineWidth / binStep) * binStep),
		)

	const MAP_LON_SEAM_RAD = MAP_RIVER_SEAM_THRESHOLD / MAP_X_SCALE

	function splitLonLatPoints(
		points: [number, number, number][],
		flows: number[],
	): { points: [number, number, number][]; flows: number[] }[] {
		if (points.length < 2) return points.length === 0 ? [] : [{ points, flows }]
		const segments: { points: [number, number, number][]; flows: number[] }[] =
			[{ points: [points[0]], flows: [flows[0]] }]
		for (let i = 1; i < points.length; i++) {
			const current = points[i]
			const previous = points[i - 1]
			if (Math.abs(current[0] - previous[0]) > MAP_LON_SEAM_RAD) {
				segments.push({ points: [current], flows: [flows[i]] })
				continue
			}
			segments[segments.length - 1].points.push(current)
			segments[segments.length - 1].flows.push(flows[i])
		}
		return segments.filter((s) => s.points.length >= 2)
	}

	const batchedPositions = new Map<number, number[]>()

	const appendSegments = (
		points: [number, number, number][],
		flows: number[],
	) => {
		if (points.length < 2) return
		const widths = flows.map((flow) => flowToWidth(flow))
		let segmentStart = 0
		let currentBin = toBin(widths[0])

		const flushSegment = (start: number, end: number, binnedWidth: number) => {
			if (end <= start) return
			let binPositions = batchedPositions.get(binnedWidth)
			if (!binPositions) {
				binPositions = []
				batchedPositions.set(binnedWidth, binPositions)
			}
			for (let index = start; index < end; index++) {
				const a = points[index]
				const b = points[index + 1]
				binPositions.push(a[0], a[1], a[2], b[0], b[1], b[2])
			}
		}

		for (let index = 1; index < points.length; index++) {
			const nextBin = toBin(widths[index])
			if (nextBin !== currentBin) {
				flushSegment(segmentStart, index, currentBin)
				segmentStart = index
				currentBin = nextBin
			}
		}
		flushSegment(segmentStart, points.length - 1, currentBin)
	}

	for (const polyline of rivers.lines) {
		if (polyline.length < 2) continue
		const flowValues = polyline.map(([, , flow]) => flow)

		const lonLatPoints: [number, number, number][] = polyline.map(
			([lon, lat]) => {
				const lonRad = THREE.MathUtils.degToRad(lon)
				const latRad = THREE.MathUtils.degToRad(lat)
				return [lonRad, latRad, 0.003]
			},
		)

		const segments = splitLonLatPoints(lonLatPoints, flowValues)

		for (const segment of segments) {
			const projectedPoints = segment.points.map(([lon, lat, z]) => {
				const [x, y] = projection.projectRadians(lon, lat, z)
				return [x, y, z] as [number, number, number]
			})

			if (segment.points.length >= 3) {
				const controlPoints = projectedPoints.map(
					([x, y, z]) => new THREE.Vector3(x, y, z),
				)
				const curve = new THREE.CatmullRomCurve3(
					controlPoints,
					false,
					"catmullrom",
					0.5,
				)
				const smoothPointCount = segment.points.length * 3
				const smoothed = curve.getPoints(smoothPointCount)
				const smoothPositions = smoothed.map(
					(p) => [p.x, p.y, p.z] as [number, number, number],
				)
				const smoothFlows = smoothed.map((_, index) => {
					const t = index / smoothPointCount
					const step = t * (segment.points.length - 1)
					const lower = Math.floor(step)
					const upper = Math.min(lower + 1, segment.points.length - 1)
					return (
						segment.flows[lower] +
						(segment.flows[upper] - segment.flows[lower]) * (step - lower)
					)
				})
				appendSegments(smoothPositions, smoothFlows)
			} else {
				appendSegments(projectedPoints, segment.flows)
			}
		}
	}

	for (const [binnedWidth, positions] of batchedPositions) {
		if (positions.length < 6) continue
		const t = (binnedWidth - minWidth) / (maxWidth - minWidth)
		const material = new LineMaterial({
			color: 0x0978ab,
			opacity: 0.55 + t * 0.4,
			linewidth: binnedWidth,
			transparent: true,
			depthWrite: false,
			worldUnits: false,
		})
		material.resolution.set(width, height)
		riverMaterials.push(material)

		const geometry = new LineSegmentsGeometry()
		geometry.setPositions(positions)
		const line = new LineSegments2(geometry, material)
		line.computeLineDistances()
		group.add(line)
	}

	group.visible = riversVisible && viewMode === "map"
	return group
}

export function buildGlobeHierarchyOverlay(
	world: SerializedOrogenWorld,
	selectedNationId: number,
	viewMode: OrogenViewMode,
	canvas: HTMLCanvasElement,
): THREE.Group | null {
	const nodes = collectHierarchyNodes(world, selectedNationId)
	if (!nodes || nodes.length === 0) return null

	const provinceIndex = new Map<number, HierarchyNode>()
	for (const node of nodes) provinceIndex.set(node.provinceId, node)

	const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
	const uniformRadius = 1.025

	const dotPositions: number[] = []
	const dotColors: number[] = []
	const linePositions: number[] = []
	const lineColors: number[] = []

	for (const node of nodes) {
		const [r, g, b] = rankColor(node.depth, maxDepth)
		const x = node.xyz[0] * uniformRadius
		const y = node.xyz[1] * uniformRadius
		const z = node.xyz[2] * uniformRadius

		dotPositions.push(x, y, z)
		dotColors.push(r, g, b)

		if (node.parentProvinceId >= 0) {
			const parentNode = provinceIndex.get(node.parentProvinceId)
			if (parentNode) {
				linePositions.push(
					x,
					y,
					z,
					parentNode.xyz[0] * uniformRadius,
					parentNode.xyz[1] * uniformRadius,
					parentNode.xyz[2] * uniformRadius,
				)
				const [pr, pg, pb] = rankColor(parentNode.depth, maxDepth)
				lineColors.push(r, g, b, pr, pg, pb)
			}
		}
	}

	const group = new THREE.Group()
	const w = canvas.clientWidth || 1
	const h = canvas.clientHeight || 1

	if (dotPositions.length > 0) {
		const geo = new THREE.BufferGeometry()
		geo.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(dotPositions), 3),
		)
		geo.setAttribute(
			"color",
			new THREE.Float32BufferAttribute(new Float32Array(dotColors), 3),
		)
		const circleTex = createCircleTexture()
		const mat = new THREE.PointsMaterial({
			size: 0.012,
			sizeAttenuation: true,
			vertexColors: true,
			...(circleTex ? { map: circleTex, alphaTest: 0.5 } : {}),
			depthWrite: false,
			transparent: true,
			opacity: 0.95,
		})
		group.add(new THREE.Points(geo, mat))
	}

	if (linePositions.length > 0) {
		const geom = new LineSegmentsGeometry()
		geom.setPositions(linePositions)
		geom.setColors(lineColors)
		const mat = new LineMaterial({
			vertexColors: true,
			linewidth: 1.8,
			resolution: new THREE.Vector2(w, h),
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
		})
		const lines = new LineSegments2(geom, mat)
		lines.computeLineDistances()
		group.add(lines)
	}

	group.visible = viewMode === "globe"
	return group
}

export function buildMapHierarchyOverlay(
	world: SerializedOrogenWorld,
	selectedNationId: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	viewMode: OrogenViewMode,
	canvas: HTMLCanvasElement,
): THREE.Group | null {
	const nodes = collectHierarchyNodes(world, selectedNationId)
	if (!nodes || nodes.length === 0) return null

	const provinceIndex = new Map<number, HierarchyNode>()
	for (const node of nodes) provinceIndex.set(node.provinceId, node)

	const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const z = 0.02
	const CIRCLE_RADIUS = 0.0025
	const linePositions: number[] = []
	const lineColors: number[] = []

	const group = new THREE.Group()
	const w = canvas.clientWidth || 1
	const h = canvas.clientHeight || 1

	for (const node of nodes) {
		const [r, g, b] = rankColor(node.depth, maxDepth)
		const projected = projection.projectCartesian(
			node.xyz[0],
			node.xyz[1],
			node.xyz[2],
		)
		const pos = projection.projectRadians(projected.lon, projected.lat, z)
		const circleGeo = new THREE.CircleGeometry(CIRCLE_RADIUS, 16)
		const circleMat = new THREE.MeshBasicMaterial({
			color: new THREE.Color(r, g, b),
			depthWrite: false,
		})
		const circle = new THREE.Mesh(circleGeo, circleMat)
		circle.position.set(pos[0], pos[1], pos[2])
		group.add(circle)

		if (node.parentProvinceId >= 0) {
			const parentNode = provinceIndex.get(node.parentProvinceId)
			if (parentNode) {
				const parentProjected = projection.projectCartesian(
					parentNode.xyz[0],
					parentNode.xyz[1],
					parentNode.xyz[2],
				)
				const lonDiff = Math.abs(parentProjected.lon - projected.lon)
				appendProjectedSegment(
					linePositions,
					projection,
					{ lon: projected.lon, lat: projected.lat },
					{ lon: parentProjected.lon, lat: parentProjected.lat },
					z,
				)
				const [pr, pg, pb] = rankColor(parentNode.depth, maxDepth)
				lineColors.push(r, g, b, pr, pg, pb)
				if (lonDiff > Math.PI) {
					lineColors.push(r, g, b, pr, pg, pb)
				}
			}
		}
	}

	if (linePositions.length > 0) {
		const geom = new LineSegmentsGeometry()
		geom.setPositions(linePositions)
		geom.setColors(lineColors)
		const mat = new LineMaterial({
			vertexColors: true,
			linewidth: 1.8,
			resolution: new THREE.Vector2(w, h),
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
		})
		const lines = new LineSegments2(geom, mat)
		lines.computeLineDistances()
		group.add(lines)
	}

	group.visible = viewMode === "map"
	return group
}
