import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import type { GenesisViewMode } from "@/ui/planet/renderer/types"

const PATHFIND_ARC_RADIUS = 1.02
const PATHFIND_LINE_COLOR = 0x000000
const PATHFIND_RENDER_ORDER = 998

type XYZ = [number, number, number]

function createDotMaterial() {
	return new THREE.MeshBasicMaterial({
		color: PATHFIND_LINE_COLOR,
		depthTest: false,
	})
}

function smoothPathPoints(points: THREE.Vector3[]): THREE.Vector3[] {
	if (points.length <= 2) return points
	const curve = new THREE.CatmullRomCurve3(points, false, "centripetal")
	const segments = Math.max(points.length * 4, 16)
	return curve.getPoints(segments)
}

function appendSegmentPairs(positions: number[], points: THREE.Vector3[]) {
	if (points.length < 2) return
	const smoothed = smoothPathPoints(points)
	for (let i = 1; i < smoothed.length; i++) {
		const prev = smoothed[i - 1]
		const curr = smoothed[i]
		positions.push(prev.x, prev.y, prev.z, curr.x, curr.y, curr.z)
	}
}

function buildLine(
	positions: number[],
	canvasSize: [number, number],
	viewMode: GenesisViewMode,
	targetViewMode: GenesisViewMode,
) {
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: PATHFIND_LINE_COLOR,
		linewidth: 2,
		resolution: new THREE.Vector2(...canvasSize),
		depthWrite: false,
		depthTest: false,
		dashed: true,
		dashSize: 0.006,
		gapSize: 0.004,
	})
	const line = new LineSegments2(geometry, material)
	line.computeLineDistances()
	line.renderOrder = PATHFIND_RENDER_ORDER
	line.visible = viewMode === targetViewMode
	return line
}

function buildDotGroup(
	points: THREE.Vector3[],
	geometry: THREE.BufferGeometry,
	materialFactory: () => THREE.Material,
	viewMode: GenesisViewMode,
	targetViewMode: GenesisViewMode,
) {
	const group = new THREE.Group()
	for (const point of points) {
		const dot = new THREE.Mesh(geometry, materialFactory())
		dot.position.copy(point)
		dot.renderOrder = PATHFIND_RENDER_ORDER
		group.add(dot)
	}
	group.visible = viewMode === targetViewMode
	return group
}

interface PathfindingOverlayResult {
	line: THREE.Object3D | null
	dots: THREE.Group
}

export function buildGlobePathfindingOverlay(
	pathRegions: number[] | null,
	startXYZ: XYZ,
	endXYZ: XYZ | null,
	r_xyz: Float32Array,
	elevation: Float32Array | null,
	viewMode: GenesisViewMode,
	canvasSize: [number, number],
): PathfindingOverlayResult {
	const dotGeo = new THREE.SphereGeometry(0.002, 8, 8)
	const dotMat = createDotMaterial()

	// Build start/end dot points
	const startNorm = new THREE.Vector3(...startXYZ).normalize()
	const dotPoints = [startNorm.clone().multiplyScalar(PATHFIND_ARC_RADIUS)]
	if (endXYZ) {
		const endNorm = new THREE.Vector3(...endXYZ).normalize()
		dotPoints.push(endNorm.clone().multiplyScalar(PATHFIND_ARC_RADIUS))
	}

	const dots = buildDotGroup(
		dotPoints,
		dotGeo,
		() => dotMat.clone(),
		viewMode,
		"globe",
	)

	if (!pathRegions || pathRegions.length < 2) {
		return { line: null, dots }
	}

	// Build globe points from region positions
	const globePoints: THREE.Vector3[] = []
	for (const region of pathRegions) {
		const idx = region * 3
		const x = r_xyz[idx]
		const y = r_xyz[idx + 1]
		const z = r_xyz[idx + 2]
		const len = Math.sqrt(x * x + y * y + z * z) || 1
		const elev = elevation?.[region] ?? 0
		const adj = elev > 0 ? elev * 0.04 : elev * 0.04 * 0.3
		const radius = 1 + adj + 0.009
		globePoints.push(
			new THREE.Vector3(
				(x / len) * radius,
				(y / len) * radius,
				(z / len) * radius,
			),
		)
	}

	const positions: number[] = []
	appendSegmentPairs(positions, globePoints)

	// Replace dots with path endpoint dots
	const endpointDots = buildDotGroup(
		[globePoints[0]!.clone(), globePoints[globePoints.length - 1]!.clone()],
		dotGeo,
		() => dotMat.clone(),
		viewMode,
		"globe",
	)

	return {
		line:
			positions.length >= 6
				? buildLine(positions, canvasSize, viewMode, "globe")
				: null,
		dots: endpointDots,
	}
}

export function buildMapPathfindingOverlay(
	pathRegions: number[] | null,
	startXYZ: XYZ,
	endXYZ: XYZ | null,
	r_xyz: Float32Array,
	elevation: Float32Array | null,
	viewMode: GenesisViewMode,
	canvasSize: [number, number],
	mapCenterLongitudeDeg: number,
	mapProjectionLatitudeDeg: number,
): PathfindingOverlayResult {
	const projection = createMapProjection(
		mapCenterLongitudeDeg,
		mapProjectionLatitudeDeg,
	)
	const dotGeo = new THREE.CircleGeometry(0.002, 12)
	const dotMat = createDotMaterial()

	const projectDot = (xyz: XYZ) => {
		const norm = new THREE.Vector3(...xyz).normalize()
		const projected = projection.projectCartesian(norm.x, norm.y, norm.z)
		const point = projection.projectRadians(projected.lon, projected.lat, 0.003)
		return new THREE.Vector3(point[0], point[1], point[2])
	}

	const dotPoints = [projectDot(startXYZ)]
	if (endXYZ) {
		dotPoints.push(projectDot(endXYZ))
	}

	const dots = buildDotGroup(
		dotPoints,
		dotGeo,
		() => dotMat.clone(),
		viewMode,
		"map",
	)

	if (!pathRegions || pathRegions.length < 2) {
		return { line: null, dots }
	}

	const mapPoints: THREE.Vector3[] = []
	for (const region of pathRegions) {
		const idx = region * 3
		const x = r_xyz[idx]
		const y = r_xyz[idx + 1]
		const z = r_xyz[idx + 2]
		const len = Math.sqrt(x * x + y * y + z * z) || 1
		const projected = projection.projectCartesian(x / len, y / len, z / len)
		const elev = elevation?.[region] ?? 0
		const adj = elev > 0 ? elev * 0.04 : elev * 0.04 * 0.3
		const zLift = 0.012 + adj * 0.5
		const [mx, my] = projection.projectRadians(
			projected.lon,
			projected.lat,
			zLift,
		)
		mapPoints.push(new THREE.Vector3(mx, my, zLift))
	}

	const positions: number[] = []
	appendSegmentPairs(positions, mapPoints)

	// Replace dots with path endpoint dots
	const endpointDots = buildDotGroup(
		[mapPoints[0]!.clone(), mapPoints[mapPoints.length - 1]!.clone()],
		dotGeo,
		() => dotMat.clone(),
		viewMode,
		"map",
	)

	return {
		line:
			positions.length >= 6
				? buildLine(positions, canvasSize, viewMode, "map")
				: null,
		dots: endpointDots,
	}
}
