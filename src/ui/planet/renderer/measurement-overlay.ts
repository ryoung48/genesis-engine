import * as THREE from "three"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { createMapProjection } from "./map-projection"
import type { OrogenViewMode } from "./types"

const MEASURE_ARC_RADIUS = 1.02
const MEASURE_LINE_COLOR = 0x000000
const MEASURE_RENDER_ORDER = 999

type XYZ = [number, number, number]

interface LonLatPoint {
	lon: number
	lat: number
}

function createDotMaterial() {
	return new THREE.MeshBasicMaterial({
		color: MEASURE_LINE_COLOR,
		depthTest: false,
	})
}

function buildArcPositions(startXYZ: XYZ, endXYZ: XYZ, arcRadius: number) {
	const start = new THREE.Vector3(...startXYZ).normalize()
	const end = new THREE.Vector3(...endXYZ).normalize()
	const angle = start.angleTo(end)
	const numSegments = Math.max(2, Math.ceil(angle / 0.02))
	const positions: number[] = []

	for (let i = 0; i <= numSegments; i++) {
		const t = i / numSegments
		let point: THREE.Vector3
		if (angle < 0.001) {
			point = start.clone()
		} else {
			const sinAngle = Math.sin(angle)
			const startWeight = Math.sin((1 - t) * angle) / sinAngle
			const endWeight = Math.sin(t * angle) / sinAngle
			point = new THREE.Vector3(
				start.x * startWeight + end.x * endWeight,
				start.y * startWeight + end.y * endWeight,
				start.z * startWeight + end.z * endWeight,
			)
		}
		point.normalize().multiplyScalar(arcRadius)
		positions.push(point.x, point.y, point.z)
	}

	return positions
}

function unwrapLongitudeSequence(points: LonLatPoint[]): LonLatPoint[] {
	if (points.length === 0) return []
	const unwrapped: LonLatPoint[] = [points[0]!]
	for (let index = 1; index < points.length; index++) {
		const point = points[index]!
		let adjustedLon = point.lon
		const previousLon = unwrapped[index - 1]!.lon
		while (adjustedLon - previousLon > Math.PI) adjustedLon -= 2 * Math.PI
		while (adjustedLon - previousLon < -Math.PI) adjustedLon += 2 * Math.PI
		unwrapped.push({ lon: adjustedLon, lat: point.lat })
	}
	return unwrapped
}

function buildLine(
	positions: number[],
	canvasSize: [number, number],
	viewMode: OrogenViewMode,
	targetViewMode: OrogenViewMode,
) {
	const geometry = new LineGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: MEASURE_LINE_COLOR,
		linewidth: 2,
		resolution: new THREE.Vector2(...canvasSize),
		depthWrite: false,
		depthTest: false,
		dashed: true,
		dashSize: 0.008,
		gapSize: 0.006,
	})
	const line = new Line2(geometry, material)
	line.computeLineDistances()
	line.renderOrder = MEASURE_RENDER_ORDER
	line.visible = viewMode === targetViewMode
	return line as unknown as THREE.Line
}

function buildDotGroup(
	points: THREE.Vector3[],
	geometry: THREE.BufferGeometry,
	materialFactory: () => THREE.Material,
	viewMode: OrogenViewMode,
	targetViewMode: OrogenViewMode,
) {
	const group = new THREE.Group()
	for (const point of points) {
		const dot = new THREE.Mesh(geometry, materialFactory())
		dot.position.copy(point)
		dot.renderOrder = MEASURE_RENDER_ORDER
		group.add(dot)
	}
	group.visible = viewMode === targetViewMode
	return group
}

export function buildGlobeMeasurementOverlay(
	startXYZ: XYZ,
	endXYZ: XYZ | null,
	viewMode: OrogenViewMode,
	canvasSize: [number, number],
) {
	const start = new THREE.Vector3(...startXYZ).normalize()
	const end = endXYZ ? new THREE.Vector3(...endXYZ).normalize() : null
	const dotPoints = [start.clone().multiplyScalar(MEASURE_ARC_RADIUS)]
	if (end) {
		dotPoints.push(end.clone().multiplyScalar(MEASURE_ARC_RADIUS))
	}

	const dots = buildDotGroup(
		dotPoints,
		new THREE.SphereGeometry(1, 8, 8),
		createDotMaterial,
		viewMode,
		"globe",
	)

	return {
		line: end
			? buildLine(
					buildArcPositions(startXYZ, endXYZ!, MEASURE_ARC_RADIUS),
					canvasSize,
					viewMode,
					"globe",
				)
			: null,
		dots,
	}
}

export function buildMapMeasurementOverlay(
	startXYZ: XYZ,
	endXYZ: XYZ | null,
	viewMode: OrogenViewMode,
	canvasSize: [number, number],
	mapCenterLongitudeDeg: number,
	mapProjectionLatitudeDeg: number,
) {
	const projection = createMapProjection(
		mapCenterLongitudeDeg,
		mapProjectionLatitudeDeg,
	)
	const linePositions = endXYZ
		? buildArcPositions(startXYZ, endXYZ, MEASURE_ARC_RADIUS)
		: null
	const mapPositions: number[] | null = linePositions ? [] : null
	if (linePositions && mapPositions) {
		const sphericalPoints: LonLatPoint[] = []
		for (let index = 0; index < linePositions.length; index += 3) {
			const x = linePositions[index]!
			const y = linePositions[index + 1]!
			const z = linePositions[index + 2]!
			sphericalPoints.push(
				projection.projectCartesian(
					x / MEASURE_ARC_RADIUS,
					y / MEASURE_ARC_RADIUS,
					z / MEASURE_ARC_RADIUS,
				),
			)
		}
		for (const point of unwrapLongitudeSequence(sphericalPoints)) {
			const projected = projection.projectRadians(point.lon, point.lat, 0.003)
			mapPositions.push(projected[0], projected[1], projected[2])
		}
	}

	const projectDot = (xyz: XYZ) => {
		const normalized = new THREE.Vector3(...xyz).normalize()
		const projected = projection.projectCartesian(
			normalized.x,
			normalized.y,
			normalized.z,
		)
		const point = projection.projectRadians(projected.lon, projected.lat, 0.003)
		return new THREE.Vector3(point[0], point[1], point[2])
	}

	const dotPoints = [projectDot(startXYZ)]
	if (endXYZ) {
		dotPoints.push(projectDot(endXYZ))
	}

	const dots = buildDotGroup(
		dotPoints,
		new THREE.CircleGeometry(0.002, 12),
		() => createDotMaterial().clone(),
		viewMode,
		"map",
	)

	return {
		line:
			mapPositions === null
				? null
				: buildLine(mapPositions, canvasSize, viewMode, "map"),
		dots,
	}
}
